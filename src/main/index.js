import { app, BrowserWindow, dialog, ipcMain, nativeImage, Notification, protocol, screen, shell, Tray, Menu, net as electronNet } from 'electron'
import os from 'os'
import { join, extname } from 'path'
import { spawn } from 'child_process'
import { createConnection } from 'net'
import http from 'http'
import { pathToFileURL } from 'url'
import {
  writeFileSync, readFileSync, existsSync, mkdirSync,
  readdirSync, statSync, renameSync, copyFileSync,
} from 'fs'
import { homedir } from 'os'

const HOME = homedir()

// ── Custom protocol for serving vault assets (GLB/images) to the renderer ─────
// Registered as privileged so <model-viewer> can fetch() asset:// URLs past CSP.
protocol.registerSchemesAsPrivileged([
  { scheme: 'asset', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true } },
])

// ── Config (vault location + remote worker agents) ────────────────────────────
const IGNUS_DIR   = join(HOME, '.ignus')
const CONFIG_FILE = join(IGNUS_DIR, 'config.json')

const DEFAULT_CONFIG = {
  idleMinutes: 45,   // auto-stop backends after this many idle minutes (Toolbox setting)
  // Canonical, Syncthing-replicated asset library (see ignus-revamp brief).
  vaultRoot: join(HOME, 'IgnusVault'),
  // Headless Ignus-Agent worker machines the cockpit polls over the LAN.
  // The PC laptop gets filled in (host) once its DHCP-reserved IP is known.
  agents: [
    { id: 'pc-worker', label: 'PC Worker (SF3D)', host: '', port: 7785, enabled: false },
  ],
}

function load_config() {
  try {
    if (!existsSync(IGNUS_DIR)) mkdirSync(IGNUS_DIR, { recursive: true })
    if (!existsSync(CONFIG_FILE)) {
      writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2))
      return { ...DEFAULT_CONFIG }
    }
    const parsed = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'))
    return { ...DEFAULT_CONFIG, ...parsed }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

let config = load_config()

function vault_path(...parts) { return join(config.vaultRoot, ...parts) }

// Local backends now carry an explicit host (cockpit is host-aware; remote
// backends live behind their machine's Ignus-Agent rather than in this map).
const SERVICES = {
  ComfyUI: {
    host: '127.0.0.1',
    port: 8188,
    cmd:  `${HOME}/ComfyUI/venv/bin/python3`,
    args: [`${HOME}/ComfyUI/main.py`],
    cwd:  `${HOME}/ComfyUI`,
    url:  'http://localhost:8188',
  },
}

const IDLE_MS        = 45 * 60 * 1000
const WATCHDOG_FILE  = join(homedir(), '.ignus_last_launch')
const WATCHDOG_SCRIPT = join(homedir(), '.ignus_watchdog.sh')
const WATCHDOG_PLIST = join(homedir(), 'Library/LaunchAgents/com.ignus.watchdog.plist')

let picker_win    = null
let idle_timer    = null
let tray          = null
let tray_frames   = []
let frame_idx     = 0
let anim_interval = null
let current_load  = 0
let cpu_snapshot  = null

function is_port_open(port) {
  return new Promise(resolve => {
    const sock = createConnection({ port, host: '127.0.0.1' })
    sock.once('connect', () => { sock.destroy(); resolve(true) })
    sock.once('error',   () => { sock.destroy(); resolve(false) })
    sock.setTimeout(800, () => { sock.destroy(); resolve(false) })
  })
}

function start_service(name) {
  const svc = SERVICES[name]
  const cmd = `nohup ${[svc.cmd, ...svc.args].join(' ')} > /dev/null 2>&1 &`
  spawn('sh', ['-c', cmd], {
    cwd:      svc.cwd,
    detached: true,
    stdio:    'ignore',
    env:      { ...process.env, HOME },
  }).unref()
}

function stop_service(name) {
  const svc = SERVICES[name]
  // Kill by full command line match; also try matching just the script path
  spawn('pkill', ['-f', svc.args[0] || svc.cmd], { stdio: 'ignore' }).unref()
}

async function wait_for_port(port, timeout_ms = 300000) {
  const start = Date.now()
  while (Date.now() - start < timeout_ms) {
    if (await is_port_open(port)) return true
    await new Promise(r => setTimeout(r, 1000))
  }
  return false
}

function write_watchdog() {
  writeFileSync(WATCHDOG_FILE, String(Math.floor(Date.now() / 1000)))
}

function install_watchdog() {
  const script = `#!/bin/sh
STAMP="$HOME/.ignus_last_launch"
[ -f "$STAMP" ] || exit 0
LAST=$(cat "$STAMP")
NOW=$(date +%s)
if [ $(( NOW - LAST )) -gt 2700 ]; then
  pkill -f "ComfyUI/main.py" 2>/dev/null
fi
`
  writeFileSync(WATCHDOG_SCRIPT, script, { mode: 0o755 })

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.ignus.watchdog</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>${WATCHDOG_SCRIPT}</string>
  </array>
  <key>StartInterval</key><integer>300</integer>
  <key>RunAtLoad</key><false/>
</dict>
</plist>`
  writeFileSync(WATCHDOG_PLIST, plist)
  spawn('launchctl', ['load', '-w', WATCHDOG_PLIST], { stdio: 'ignore' }).unref()
}

function reset_idle_timer() {
  clearTimeout(idle_timer)
  write_watchdog()
  if (picker_win && !picker_win.isDestroyed()) {
    picker_win.webContents.send('idle-reset', Date.now())
  }
  idle_timer = setTimeout(async () => {
    for (const name of Object.keys(SERVICES)) {
      if (await is_port_open(SERVICES[name].port)) stop_service(name)
    }
  }, (config.idleMinutes || 45) * 60 * 1000)
}

// ── CPU load ────────────────────────────────────────────────────────────────

function snapshot_cpu() {
  return os.cpus().map(c => ({ ...c.times }))
}

function calc_load(s1, s2) {
  let idle = 0, total = 0
  s1.forEach((c, i) => {
    Object.keys(c).forEach(k => {
      const d = s2[i][k] - c[k]
      total += d
      if (k === 'idle') idle += d
    })
  })
  return total === 0 ? 0 : Math.min(1, Math.max(0, 1 - idle / total))
}

function start_cpu_polling() {
  cpu_snapshot = snapshot_cpu()
  setInterval(() => {
    const next = snapshot_cpu()
    current_load = calc_load(cpu_snapshot, next)
    cpu_snapshot = next
    restart_tray_animation()
  }, 2000)
}

// ── Tray animation ───────────────────────────────────────────────────────────

function restart_tray_animation() {
  if (!tray || tray_frames.length === 0) return
  clearInterval(anim_interval)

  // 200ms at idle → 45ms at full load
  const interval_ms = Math.round(200 - current_load * 155)

  anim_interval = setInterval(() => {
    frame_idx = (frame_idx + 1) % tray_frames.length
    tray.setImage(tray_frames[frame_idx])
  }, interval_ms)
}

function init_tray(frames) {
  tray_frames = frames

  // Fallback single-frame image if frames aren't ready yet
  const placeholder = nativeImage.createEmpty()
  tray = new Tray(placeholder)
  tray.setToolTip('Ignus')
  tray.on('click', () => create_picker())

  if (frames.length > 0) {
    tray.setImage(frames[0])
    restart_tray_animation()
  }
}

// ── Tray frames (sent from renderer canvas) ──────────────────────────────────

ipcMain.on('tray-frames', (_e, data_urls) => {
  const frames = data_urls.map(url => nativeImage.createFromDataURL(url))
  if (!tray) {
    init_tray(frames)
  } else {
    tray_frames = frames
    restart_tray_animation()
  }
})

// ── Remote worker agents (Ignus-Agent HTTP protocol, see PROTOCOL.md) ─────────

function agent_request(agent, path, { method = 'GET', body = null, timeout = 2500 } = {}) {
  return new Promise(resolve => {
    if (!agent.host) return resolve(null)
    const payload = body ? JSON.stringify(body) : null
    const req = http.request(
      { host: agent.host, port: agent.port, path, method,
        headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {} },
      res => {
        let data = ''
        res.on('data', c => { data += c })
        res.on('end', () => { try { resolve(JSON.parse(data)) } catch { resolve(null) } })
      }
    )
    req.on('error', () => resolve(null))
    req.setTimeout(timeout, () => { req.destroy(); resolve(null) })
    if (payload) req.write(payload)
    req.end()
  })
}

// Cockpit "Machines" view: this Mac's local backends + each remote agent's health.
async function machines_status() {
  const local = {}
  for (const [name, svc] of Object.entries(SERVICES)) {
    local[name] = { running: await is_port_open(svc.port), url: svc.url, host: svc.host }
  }
  const agents = await Promise.all(
    config.agents.map(async a => {
      const health = a.enabled && a.host ? await agent_request(a, '/health') : null
      return { ...a, online: !!health, health }
    })
  )
  return { local, agents }
}

// ── Asset library (the vault the verify view reads) ───────────────────────────

const GLB_RE = /\.glb$/i
const STATES = ['_inbox', 'approved', 'rejected']

// Map an absolute path inside the vault to an asset:// URL the renderer can load.
function asset_url(absPath) {
  const root = config.vaultRoot.replace(/\/+$/, '')
  if (!absPath.startsWith(root)) return null
  const rel = absPath.slice(root.length).replace(/^\/+/, '')
  return 'asset://v/' + rel.split('/').map(encodeURIComponent).join('/')
}

function safe_readdir(dir) {
  try { return existsSync(dir) ? readdirSync(dir) : [] } catch { return [] }
}

// Each SKU is a folder: <sku>.glb + <sku>_source.<ext> (+ optional <sku>.job.json).
function scan_state(state) {
  const base = vault_path('inhabit', state)
  const out = []
  for (const sku of safe_readdir(base)) {
    const dir = join(base, sku)
    try { if (!statSync(dir).isDirectory()) continue } catch { continue }
    const files = safe_readdir(dir)
    const glb = files.find(f => GLB_RE.test(f))
    if (!glb) continue
    const source = files.find(f => /_source\.(png|jpe?g|webp)$/i.test(f)) || files.find(f => /\.(png|jpe?g|webp)$/i.test(f))
    let meta = null
    const metaFile = files.find(f => /\.job\.json$/i.test(f)) || files.find(f => /_meta\.json$/i.test(f))
    if (metaFile) { try { meta = JSON.parse(readFileSync(join(dir, metaFile), 'utf8')) } catch {} }
    let mtime = 0
    try { mtime = statSync(join(dir, glb)).mtimeMs } catch {}
    out.push({
      sku, state,
      glb: asset_url(join(dir, glb)),
      glbPath: join(dir, glb),
      source: source ? asset_url(join(dir, source)) : null,
      meta, mtime,
    })
  }
  return out
}

function list_assets() {
  const all = STATES.flatMap(scan_state)
  all.sort((a, b) => b.mtime - a.mtime)
  return all
}

// Approve/reject = move the SKU folder between states. Regenerate = re-enqueue on
// a worker agent if one is configured (otherwise reported back as unconfigured).
async function asset_action(sku, action) {
  const find_dir = () => {
    for (const state of STATES) {
      const dir = vault_path('inhabit', state, sku)
      if (existsSync(dir)) return { dir, state }
    }
    return null
  }
  const found = find_dir()
  if (!found) return { ok: false, reason: 'not found' }

  if (action === 'approve' || action === 'reject') {
    const target_state = action === 'approve' ? 'approved' : 'rejected'
    const dest = vault_path('inhabit', target_state, sku)
    try {
      mkdirSync(vault_path('inhabit', target_state), { recursive: true })
      renameSync(found.dir, dest)
      return { ok: true, state: target_state }
    } catch (e) { return { ok: false, reason: String(e) } }
  }

  if (action === 'regenerate') {
    const agent = config.agents.find(a => a.enabled && a.host)
    if (!agent) return { ok: false, reason: 'no worker configured' }
    const files = safe_readdir(found.dir)
    const source = files.find(f => /_source\.(png|jpe?g|webp)$/i.test(f))
    if (!source) return { ok: false, reason: 'no source image' }
    const res = await agent_request(agent, '/jobs', {
      method: 'POST',
      body: { type: 'image_to_3d', sku, inputPath: join(found.dir, source) },
    })
    return res ? { ok: true, jobId: res.jobId } : { ok: false, reason: 'agent unreachable' }
  }

  return { ok: false, reason: 'unknown action' }
}

// ── ComfyUI one-off generation (the forge image-gen panel) ────────────────────
// Presets map to the render-pipeline API workflows. Node IDs are stable in both:
// 20 = positive prompt · 21/22 = negative · 30 = latent (w/h/batch) · 40 = KSampler · 60 = SaveImage.
const COMFY = 'http://127.0.0.1:8188'
const WORKFLOW_DIR = join(HOME, 'Projects/render-pipeline/workflows')

const PRESETS = {
  oneoff: {
    label: 'One-off · SDXL', family: 'noobai', base: 'noobai_v15.api.json', neg: '21', prefix: 'oneoff/img',
    model: 'NoobAI-XL', promptStyle: 'danbooru tags', scaffold: '',
    loras: [{ id: '15', name: 'Wuthering Waves', clip: true, def: 0.75 }, { id: '16', name: 'Detail Tweaker', clip: true, def: 0.5 }],
    defaults: { steps: 28, cfg: 5.0, sampler: 'euler_ancestral', scheduler: 'normal', width: 832, height: 1216, batch: 1 },
  },
  dnd: {
    label: 'D&D Character', family: 'noobai', base: 'noobai_v15.api.json', neg: '21', prefix: 'dnd/img',
    model: 'NoobAI-XL', promptStyle: 'danbooru tags',
    scaffold: 'masterpiece, best quality, very aesthetic, 1character, dynamic pose, detailed background, ',
    loras: [{ id: '15', name: 'Wuthering Waves', clip: true, def: 0.75 }, { id: '16', name: 'Detail Tweaker', clip: true, def: 0.5 }],
    defaults: { steps: 28, cfg: 5.0, sampler: 'euler_ancestral', scheduler: 'normal', width: 832, height: 1216, batch: 1 },
  },
  kitoliver: {
    label: 'Kit / Oliver', family: 'flux', base: 'flux_kit_oliver.api.json', neg: '22', prefix: 'kit_oliver/img',
    model: 'Flux-dev Q8', promptStyle: 'natural language', scaffold: '',
    loras: [{ id: '13', name: 'Flux Realism', clip: false, def: 0.7 }, { id: '14', name: 'Skin Texture', clip: false, def: 0.4 }],
    defaults: { steps: 20, cfg: 1.0, sampler: 'euler', scheduler: 'simple', width: 832, height: 1216, batch: 1 },
  },
}

// Reference-image modes the user's ComfyUI actually has models for (verified via /object_info).
const REF_MODES = { noobai: ['face', 'pose', 'img2img'], flux: ['img2img'] }
const REF_FILE = {
  'noobai:face': 'noobai_face.api.json', 'noobai:pose': 'noobai_pose.api.json', 'noobai:img2img': 'noobai_img2img.api.json',
  'flux:img2img': 'flux_img2img.api.json',
}

function comfy_presets() {
  return Object.entries(PRESETS).map(([id, p]) => ({
    id, label: p.label, model: p.model, promptStyle: p.promptStyle, defaults: p.defaults,
    loras: p.loras, refModes: REF_MODES[p.family] || [],
  }))
}

function comfy_generate(preset, params = {}) {
  const p = PRESETS[preset]
  if (!p) return Promise.resolve({ ok: false, reason: 'unknown preset' })

  // Reference image → swap to the matching mode workflow + copy the file into ComfyUI's input dir.
  let file = p.base, refName = null
  if (params.reference && params.mode) {
    const key = `${p.family}:${params.mode}`
    if (!REF_FILE[key]) return Promise.resolve({ ok: false, reason: `${p.model} can't do ${params.mode} reference yet` })
    file = REF_FILE[key]
    try {
      refName = `ignus_ref_${Date.now()}${extname(params.reference) || '.png'}`
      copyFileSync(params.reference, join(HOME, 'ComfyUI', 'input', refName))
    } catch { return Promise.resolve({ ok: false, reason: 'could not read the reference image' }) }
  }

  let wf
  try { wf = JSON.parse(readFileSync(join(WORKFLOW_DIR, file), 'utf8')) }
  catch { return Promise.resolve({ ok: false, reason: `template ${file} not found` }) }

  wf['20'].inputs.text = (p.scaffold || '') + (params.prompt || '')
  if (params.negative != null && wf[p.neg]) wf[p.neg].inputs.text = params.negative
  const seed = params.seed !== undefined && params.seed !== '' ? Number(params.seed)
             : Math.floor(Math.random() * 1e15)
  Object.assign(wf['40'].inputs, {
    seed,
    steps: Number(params.steps ?? p.defaults.steps),
    cfg: Number(params.cfg ?? p.defaults.cfg),
    sampler_name: params.sampler || p.defaults.sampler,
    scheduler: params.scheduler || p.defaults.scheduler,
  })
  // denoise is baked per-workflow (1.0 txt2img, 0.6 img2img) — only override if the user set it.
  if (params.denoise !== undefined && params.denoise !== '') wf['40'].inputs.denoise = Number(params.denoise)
  if (wf['30']) Object.assign(wf['30'].inputs, {
    width: Number(params.width ?? p.defaults.width),
    height: Number(params.height ?? p.defaults.height),
    batch_size: Number(params.batch ?? p.defaults.batch),
  })
  if (wf['60']) wf['60'].inputs.filename_prefix = p.prefix

  // Per-LoRA strength overrides (advanced).
  if (params.loras) for (const l of p.loras) {
    const s = params.loras[l.id]
    if (s != null && s !== '' && wf[l.id]) { wf[l.id].inputs.strength_model = Number(s); if (l.clip) wf[l.id].inputs.strength_clip = Number(s) }
  }

  // Reference wiring: node 70 = LoadImage; mode-specific strength.
  if (refName && wf['70']) {
    wf['70'].inputs.image = refName
    const rs = Number(params.refStrength ?? 0.8)
    if (params.mode === 'face' && wf['83']) wf['83'].inputs.weight = rs
    if (params.mode === 'pose' && wf['74']) wf['74'].inputs.strength = rs
  }

  return new Promise(resolve => {
    const body = JSON.stringify({ prompt: wf })
    const req = http.request(COMFY + '/prompt',
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      res => {
        let d = ''
        res.on('data', c => { d += c })
        res.on('end', () => {
          try {
            const j = JSON.parse(d)
            resolve(j.prompt_id ? { ok: true, promptId: j.prompt_id, seed }
                                 : { ok: false, reason: (j.error?.message || JSON.stringify(j.node_errors || j)).slice(0, 220) })
          } catch { resolve({ ok: false, reason: 'bad response from ComfyUI' }) }
        })
      })
    req.on('error', () => resolve({ ok: false, reason: 'ComfyUI unreachable — fire it first' }))
    req.setTimeout(8000, () => { req.destroy(); resolve({ ok: false, reason: 'ComfyUI timed out' }) })
    req.write(body); req.end()
  })
}

// ── ComfyUI queue (for the Image Generation Queue window) ─────────────────────
function comfy_get(path) {
  return new Promise(resolve => {
    const req = http.request(COMFY + path, { method: 'GET' }, res => {
      let d = ''; res.on('data', c => { d += c }); res.on('end', () => { try { resolve(JSON.parse(d)) } catch { resolve(null) } })
    })
    req.on('error', () => resolve(null)); req.setTimeout(3000, () => { req.destroy(); resolve(null) }); req.end()
  })
}
async function comfy_queue() {
  const [q, hist] = await Promise.all([comfy_get('/queue'), comfy_get('/history?max_items=12')])
  if (!q && !hist) return { ok: false, running: [], pending: [], done: [] }
  const textOf = wf => { try { return wf?.['20']?.inputs?.text || '' } catch { return '' } }
  const running = (q?.queue_running || []).map(it => ({ id: it[1], prompt: textOf(it[2]), state: 'running' }))
  const pending = (q?.queue_pending || []).map((it, i) => ({ id: it[1], prompt: textOf(it[2]), state: 'pending', pos: i + 1 }))
  const done = []
  if (hist) {
    for (const id of Object.keys(hist).reverse().slice(0, 8)) {
      const h = hist[id]
      const imgs = []
      for (const nid of Object.keys(h?.outputs || {})) for (const im of (h.outputs[nid].images || []))
        imgs.push(`${COMFY}/view?filename=${encodeURIComponent(im.filename)}&subfolder=${encodeURIComponent(im.subfolder || '')}&type=${im.type || 'output'}`)
      done.push({ id, prompt: textOf(Array.isArray(h?.prompt) ? h.prompt[2] : h?.prompt), state: 'done', images: imgs })
    }
  }
  return { ok: true, running, pending, done }
}

// ── Toolbox + Queue windows ───────────────────────────────────────────────────

let cockpit_win = null   // the Toolbox
let queue_win = null     // the Image Generation Queue
const WIN_GAP = 8

function load_view(win, view) {
  const base = process.env.ELECTRON_RENDERER_URL || `file://${join(__dirname, '../renderer/index.html')}`
  win.loadURL(base + (base.includes('?') ? '&' : '?') + 'view=' + view)
}
function dock_on() { if (process.platform === 'darwin') app.setActivationPolicy('regular') }
function dock_off() { if (process.platform === 'darwin' && !cockpit_win && !queue_win) app.setActivationPolicy('accessory') }

// Autofit: tile Toolbox (left of the menu, full height) + Queue (below the menu)
// into one tidy cluster around the menu popup.
function place_tiled(win, where) {
  const p = (picker_win && !picker_win.isDestroyed()) ? picker_win.getBounds() : null
  if (!p) return
  const { workArea } = screen.getPrimaryDisplay()
  const b = win.getBounds()
  if (where === 'left') {
    let x = p.x - b.width - WIN_GAP
    if (x < workArea.x) x = Math.min(p.x + p.width + WIN_GAP, workArea.x + workArea.width - b.width)
    win.setBounds({ x, y: p.y, width: b.width, height: p.height })
  } else {
    let y = p.y + p.height + WIN_GAP
    if (y + b.height > workArea.y + workArea.height) y = Math.max(workArea.y, workArea.y + workArea.height - b.height)
    win.setBounds({ x: p.x, y, width: b.width, height: b.height })
  }
}

function create_cockpit() {
  if (cockpit_win && !cockpit_win.isDestroyed()) { cockpit_win.show(); cockpit_win.focus(); return }
  cockpit_win = new BrowserWindow({
    width: 460, height: 760, minWidth: 380, minHeight: 480,
    title: 'Ignus Toolbox', backgroundColor: '#020202',
    webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false },
  })
  load_view(cockpit_win, 'cockpit')
  dock_on()
  cockpit_win.once('ready-to-show', () => place_tiled(cockpit_win, 'left'))
  cockpit_win.on('closed', () => { cockpit_win = null; dock_off() })
}

function create_queue() {
  if (queue_win && !queue_win.isDestroyed()) { queue_win.show(); queue_win.focus(); return }
  queue_win = new BrowserWindow({
    width: 440, height: 300, minWidth: 360, minHeight: 200,
    title: 'Image Generation Queue', backgroundColor: '#020202',
    webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false },
  })
  load_view(queue_win, 'queue')
  dock_on()
  queue_win.once('ready-to-show', () => place_tiled(queue_win, 'below'))
  queue_win.on('closed', () => { queue_win = null; dock_off() })
}

// ── Picker ───────────────────────────────────────────────────────────────────

function picker_position() {
  const WIN_W = 440
  const WIN_H = 720
  const { workArea } = screen.getPrimaryDisplay()

  if (tray) {
    const b  = tray.getBounds()
    let x = Math.round(b.x + b.width  / 2 - WIN_W / 2)
    let y = Math.round(b.y + b.height + 4)
    x = Math.min(Math.max(workArea.x, x), workArea.x + workArea.width  - WIN_W)
    y = Math.min(Math.max(workArea.y, y), workArea.y + workArea.height - WIN_H)
    return { x, y }
  }

  return {
    x: Math.round(workArea.x + workArea.width  / 2 - WIN_W / 2),
    y: Math.round(workArea.y + workArea.height / 2 - WIN_H / 2),
  }
}

function create_picker() {
  if (picker_win && !picker_win.isDestroyed()) {
    picker_win.show()
    picker_win.focus()
    return
  }

  const { x, y } = picker_position()

  picker_win = new BrowserWindow({
    width:           440,
    height:          720,
    resizable:       false,
    frame:           false,
    transparent:     true,
    alwaysOnTop:     true,
    backgroundColor: '#00000000',
    x,
    y,
    webPreferences: {
      preload:          join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  })

  picker_win.loadURL(
    process.env.ELECTRON_RENDERER_URL ||
    `file://${join(__dirname, '../renderer/index.html')}`
  )

}

ipcMain.handle('get_status', async () => {
  const result = {}
  for (const [name, svc] of Object.entries(SERVICES)) {
    result[name] = await is_port_open(svc.port)
  }
  return result
})

ipcMain.handle('launch', async (_e, names) => {
  const to_start = []

  for (const name of names) {
    const alive = await is_port_open(SERVICES[name].port)
    if (!alive) { start_service(name); to_start.push(name) }
  }

  // wait for all newly started services in parallel
  const results = await Promise.all(
    to_start.map(async name => ({ name, ok: await wait_for_port(SERVICES[name].port) }))
  )

  const failed = results.filter(r => !r.ok).map(r => r.name)
  if (failed.length) return { ok: false, failed }

  // only open browser for services that were just started (not already running)
  for (const name of to_start) shell.openExternal(SERVICES[name].url)

  if (to_start.length > 0 && Notification.isSupported()) {
    const label = to_start.length === 1 ? to_start[0] : to_start.join(' & ')
    new Notification({ title: 'Ignus', body: `${label} is ready` }).show()
  }

  reset_idle_timer()
  return { ok: true }
})

ipcMain.handle('stop_service', (_e, name) => {
  stop_service(name)
})

ipcMain.handle('open_url', (_e, url) => shell.openExternal(url))

// ── Cockpit IPC ───────────────────────────────────────────────────────────────
ipcMain.handle('open_cockpit',     () => create_cockpit())
ipcMain.handle('open_queue',       () => create_queue())
ipcMain.handle('comfy_queue',      () => comfy_queue())
ipcMain.handle('machines_status',  () => machines_status())
ipcMain.handle('list_assets',      () => list_assets())
ipcMain.handle('asset_action',     (_e, sku, action) => { reset_idle_timer(); return asset_action(sku, action) })
ipcMain.handle('open_path',        (_e, p) => shell.openPath(p))
ipcMain.handle('comfy_presets',    () => comfy_presets())
ipcMain.handle('comfy_generate',   (_e, preset, params) => { reset_idle_timer(); return comfy_generate(preset, params) })
ipcMain.handle('pick_image', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] })
  return r.canceled || !r.filePaths[0] ? null : r.filePaths[0]
})
ipcMain.handle('get_config',       () => ({ vaultRoot: config.vaultRoot, agents: config.agents }))
ipcMain.handle('save_config', (_e, partial) => {
  config = { ...config, ...partial }
  try { writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2)); return { ok: true } }
  catch (e) { return { ok: false, reason: String(e) } }
})

ipcMain.on('close', async () => {
  const running = []
  for (const [name, svc] of Object.entries(SERVICES)) {
    if (await is_port_open(svc.port)) running.push(name)
  }
  if (running.length === 0) { app.quit(); return }

  const parent = picker_win && !picker_win.isDestroyed() ? picker_win : null
  const { response } = await dialog.showMessageBox(parent, {
    type:      'warning',
    buttons:   ['Quit', 'Cancel'],
    defaultId: 1,
    cancelId:  1,
    message:   'Services still running',
    detail:    `${running.join(' and ')} ${running.length === 1 ? 'is' : 'are'} still running. Quit anyway?`,
  })
  if (response === 0) app.quit()
})

const got_lock = app.requestSingleInstanceLock()
if (!got_lock) {
  app.quit()
} else {
  app.on('second-instance', () => create_picker())

  app.whenReady().then(() => {
    // Serve vault files (GLB/images) to the renderer via asset://v/<relpath>.
    protocol.handle('asset', req => {
      try {
        const u    = new URL(req.url)
        const rel  = decodeURIComponent(u.pathname).replace(/^\/+/, '')
        const root = config.vaultRoot.replace(/\/+$/, '')
        const abs  = join(root, rel)
        if (!abs.startsWith(root)) return new Response('forbidden', { status: 403 })
        return electronNet.fetch(pathToFileURL(abs).toString())
      } catch {
        return new Response('bad request', { status: 400 })
      }
    })

    if (process.platform === 'darwin') {
      app.setActivationPolicy('accessory') // menu bar only — no dock, no Cmd+Tab
    }
    install_watchdog()
    start_cpu_polling()
    init_tray([])      // tray exists immediately; frames arrive from renderer
    create_picker()
  })

  app.on('activate', () => create_picker())
  app.on('window-all-closed', () => {})
}
