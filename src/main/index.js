import { app, BrowserWindow, ipcMain, nativeImage, screen, shell, Tray, Menu } from 'electron'
import os from 'os'
import { join } from 'path'
import { spawn } from 'child_process'
import { createConnection } from 'net'
import { writeFileSync } from 'fs'
import { homedir } from 'os'

const HOME = homedir()

const SERVICES = {
  InvokeAI: {
    port: 9090,
    cmd:  `${HOME}/invokeai/venv/bin/invokeai-web`,
    args: [],
    cwd:  `${HOME}/invokeai`,
    url:  'http://localhost:9090',
  },
  ComfyUI: {
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
  if (name === 'InvokeAI') {
    // InvokeAI is managed by launchd (com.eris.invokeai) — kickstart instead of nohup
    spawn('launchctl', ['kickstart', '-k', `gui/${process.getuid()}/com.eris.invokeai`], {
      stdio: 'ignore',
    }).unref()
    return
  }
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
  if (name === 'InvokeAI') {
    // Stop via launchd — KeepAlive will restart after ThrottleInterval if needed
    spawn('launchctl', ['stop', 'com.eris.invokeai'], { stdio: 'ignore' }).unref()
    return
  }
  const svc = SERVICES[name]
  spawn('pkill', ['-f', svc.cmd], { stdio: 'ignore' }).unref()
}

async function wait_for_port(port, timeout_ms = 90000) {
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
  pkill -f "invokeai-web" 2>/dev/null
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
  idle_timer = setTimeout(async () => {
    for (const name of Object.keys(SERVICES)) {
      if (await is_port_open(SERVICES[name].port)) stop_service(name)
    }
  }, IDLE_MS)
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

// ── Picker ───────────────────────────────────────────────────────────────────

function create_picker() {
  if (picker_win && !picker_win.isDestroyed()) {
    picker_win.show()
    picker_win.focus()
    return
  }

  const { workArea } = screen.getPrimaryDisplay()

  picker_win = new BrowserWindow({
    width:           340,
    height:          280,
    resizable:       false,
    frame:           false,
    transparent:     true,
    alwaysOnTop:     true,
    backgroundColor: '#00000000',
    x: Math.round(workArea.x + workArea.width  / 2 - 170),
    y: Math.round(workArea.y + workArea.height / 2 - 140),
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
  const to_open  = []

  for (const name of names) {
    const alive = await is_port_open(SERVICES[name].port)
    if (!alive) { start_service(name); to_start.push(name) }
    to_open.push({ name, url: SERVICES[name].url })
  }

  picker_win?.hide()

  // wait for all newly started services in parallel
  const results = await Promise.all(
    to_start.map(async name => ({ name, ok: await wait_for_port(SERVICES[name].port) }))
  )

  const failed = results.filter(r => !r.ok).map(r => r.name)
  if (failed.length) return { ok: false, failed }

  for (const item of to_open) shell.openExternal(item.url)

  reset_idle_timer()
  return { ok: true }
})

ipcMain.handle('stop_service', (_e, name) => {
  stop_service(name)
})

ipcMain.on('close', () => picker_win?.hide())

const got_lock = app.requestSingleInstanceLock()
if (!got_lock) {
  app.quit()
} else {
  app.on('second-instance', () => create_picker())

  app.whenReady().then(() => {
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
