import { app, BrowserWindow, ipcMain, nativeImage, screen, shell } from 'electron'
import { join } from 'path'
import { spawn } from 'child_process'
import { createConnection } from 'net'
import { writeFileSync } from 'fs'
import { homedir } from 'os'

const SERVICES = {
  InvokeAI: {
    port: 9090,
    cmd:  '/Users/gay_villain/invokeai/venv/bin/invokeai-web',
    args: [],
    cwd:  '/Users/gay_villain/invokeai',
    url:  'http://localhost:9090',
  },
  ComfyUI: {
    port: 8188,
    cmd:  '/Users/gay_villain/ComfyUI/venv/bin/python3',
    args: ['/Users/gay_villain/ComfyUI/main.py'],
    cwd:  '/Users/gay_villain/ComfyUI',
    url:  'http://localhost:8188',
  },
}

const IDLE_MS        = 45 * 60 * 1000
const WATCHDOG_FILE  = join(homedir(), '.ignus_last_launch')
const WATCHDOG_SCRIPT = join(homedir(), '.ignus_watchdog.sh')
const WATCHDOG_PLIST = join(homedir(), 'Library/LaunchAgents/com.ignus.watchdog.plist')

let picker_win = null
let idle_timer = null

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
  // nohup + background shell: child is reparented to launchd, survives Ignus quit
  const cmd = `nohup ${[svc.cmd, ...svc.args].join(' ')} > /dev/null 2>&1 &`
  spawn('sh', ['-c', cmd], {
    cwd:      svc.cwd,
    detached: true,
    stdio:    'ignore',
    env:      { ...process.env, HOME: '/Users/gay_villain' },
  }).unref()
}

function stop_service(name) {
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
      const dock_icon = nativeImage.createFromPath(join(__dirname, '../../build/icon.png'))
      app.dock.setIcon(dock_icon)
    }
    install_watchdog()
    create_picker()
  })

  app.on('activate', () => create_picker())
  app.on('window-all-closed', () => {})
}
