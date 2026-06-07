import React, { useState, useEffect, useRef } from 'react'
import MESH from './assets/white_mesh.png'

if (!window.api) {
  const noop = () => {}
  window.api = {
    get_status: async () => ({ InvokeAI: false, ComfyUI: false }),
    send_tray_frames: noop,
    launch: async () => ({ ok: true }),
    stop_service: async () => {},
    open_url: noop,
    close: noop,
  }
}

const SERVICES = [
  { name: 'InvokeAI', label: 'InvokeAI', port: 9090, color: '#f97316', url: 'http://localhost:9090' },
  { name: 'ComfyUI',  label: 'ComfyUI',  port: 8188, color: '#a78bfa', url: 'http://localhost:8188' },
]

const POLL_MS = 3000

function wait(ms) { return new Promise(r => setTimeout(r, ms)) }

export default function App() {
  const [status,    set_status]    = useState({})
  const [selected,  set_selected]  = useState({})
  const [loading,   set_loading]   = useState(true)
  const [launching, set_launching] = useState(false)
  const [launch_elapsed, set_elapsed] = useState(0)
  const [error,     set_error]     = useState(null)

  const elapsed_ref = useRef(null)

  function refresh_status() {
    window.api.get_status().then(set_status)
  }

  // Keyboard shortcuts
  useEffect(() => {
    function on_key(e) {
      if (e.key === 'Escape') window.api.close()
      if ((e.key === 'Enter' || e.key === ' ') && !launching) launch()
    }
    window.addEventListener('keydown', on_key)
    return () => window.removeEventListener('keydown', on_key)
  }, [launching, selected])

  // Tray icon frames
  useEffect(() => {
    const frames = []
    for (let i = 0; i < 8; i++) {
      const canvas  = document.createElement('canvas')
      canvas.width  = 44
      canvas.height = 44
      const ctx = canvas.getContext('2d')
      const t       = (i / 8) * Math.PI * 2
      const sway    = Math.sin(t) * 4.5
      const flicker = Math.sin(t * 1.7 + 0.8) * 2
      const cx     = 22
      const tip_x  = cx + sway
      const tip_y  = 7 + flicker
      const base_y = 40
      const grad = ctx.createRadialGradient(cx, base_y - 10, 1, cx, base_y - 12, 22)
      grad.addColorStop(0,    'rgba(255,243,180,0.98)')
      grad.addColorStop(0.28, 'rgba(249,115,22,0.94)')
      grad.addColorStop(0.62, 'rgba(220,38,38,0.88)')
      grad.addColorStop(1,    'rgba(120,10,10,0)')
      ctx.beginPath()
      ctx.moveTo(tip_x, tip_y)
      ctx.bezierCurveTo(tip_x + 6, tip_y + 9, cx + 16 + sway * 0.4, base_y - 16, cx + 13, base_y)
      ctx.bezierCurveTo(cx + 6,  base_y + 2, cx - 6,  base_y + 2, cx - 13, base_y)
      ctx.bezierCurveTo(cx - 16 - sway * 0.4, base_y - 16, tip_x - 6, tip_y + 9, tip_x, tip_y)
      ctx.fillStyle = grad
      ctx.fill()
      const wisp_x = cx + Math.sin(t + 1.2) * 3.5
      const wisp_y = base_y - 15 + Math.cos(t * 1.3) * 2.5
      const wg = ctx.createRadialGradient(wisp_x, wisp_y, 0, wisp_x, wisp_y, 6)
      wg.addColorStop(0, 'rgba(255,255,210,0.85)')
      wg.addColorStop(1, 'rgba(249,115,22,0)')
      ctx.beginPath()
      ctx.arc(wisp_x, wisp_y, 6, 0, Math.PI * 2)
      ctx.fillStyle = wg
      ctx.fill()
      frames.push(canvas.toDataURL('image/png'))
    }
    window.api.send_tray_frames(frames)
  }, [])

  useEffect(() => {
    window.api.get_status().then(s => {
      set_status(s)
      const pre = {}
      for (const [name] of Object.entries(s)) pre[name] = false
      set_selected(pre)
      set_loading(false)
    })
    const poll = setInterval(refresh_status, POLL_MS)
    return () => clearInterval(poll)
  }, [])

  function toggle(name) {
    set_selected(prev => ({ ...prev, [name]: !prev[name] }))
  }

  async function stop(name) {
    await window.api.stop_service(name)
    // Poll until the service is actually down (up to 8s)
    let attempts = 0
    const poll = setInterval(async () => {
      await refresh_status()
      attempts++
      if (attempts >= 8) clearInterval(poll)
    }, 1000)
  }

  function open_in_browser(url) {
    window.api.open_url(url)
  }

  async function launch() {
    const names = Object.entries(selected).filter(([, v]) => v).map(([k]) => k)
    if (!names.length) { window.api.close(); return }
    set_launching(true)
    set_error(null)
    set_elapsed(0)
    elapsed_ref.current = setInterval(() => set_elapsed(s => s + 1), 1000)
    const result = await window.api.launch(names)
    clearInterval(elapsed_ref.current)
    set_launching(false)
    set_elapsed(0)
    if (result && !result.ok) set_error(`Failed to start: ${result.failed.join(', ')}`)
  }

  const any_selected = Object.values(selected).some(Boolean)

  function boot_label() {
    if (launch_elapsed < 5)  return 'starting up…'
    if (launch_elapsed < 15) return `booting… ${launch_elapsed}s`
    if (launch_elapsed < 40) return `loading models… ${launch_elapsed}s`
    return `almost there… ${launch_elapsed}s`
  }

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden', borderRadius: 16, background: '#000' }}>

      {/* Video background */}
      <video
        autoPlay loop muted playsInline
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
      >
        <source src="./flame_anim.webm" type="video/webm" />
        <source src="./flame_anim.mp4"  type="video/mp4" />
      </video>

      {/* Dark overlay — keeps UI readable over the video */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(160deg, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.48) 55%, rgba(8,3,0,0.72) 100%)',
      }} />

      {/* Content */}
      <div style={{
        position: 'relative', zIndex: 2,
        width: '100%', height: '100%',
        display: 'flex', flexDirection: 'column',
        padding: '18px 18px 16px', gap: 10,
        WebkitAppRegion: 'drag',
        backdropFilter: 'blur(28px) saturate(1.5)',
        WebkitBackdropFilter: 'blur(28px) saturate(1.5)',
        background: 'linear-gradient(160deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 0 0 1px rgba(255,255,255,0.05)',
      }}>

        <button onClick={() => window.api.close()} style={{
          position: 'absolute', top: 12, right: 14,
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'rgba(255,255,255,0.3)', fontSize: 20, lineHeight: 1,
          padding: '0 2px', WebkitAppRegion: 'no-drag',
        }}>×</button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src={MESH} style={{ width: 20, height: 20, objectFit: 'contain', opacity: 0.9 }} alt="" />
          <span style={{ color: '#fff', fontSize: 15, fontWeight: 700, letterSpacing: '-0.3px' }}>Ignus</span>
          <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 1 }}>local AI, one click</span>
        </div>

        <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, WebkitAppRegion: 'no-drag' }}>
          {loading ? (
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center', paddingTop: 24 }}>checking services…</div>
          ) : SERVICES.map(svc => {
            const running = status[svc.name]
            const checked = selected[svc.name] ?? false
            return (
              <div key={svc.name} onClick={() => !running && toggle(svc.name)} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 10,
                background: checked ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.22)',
                border: `1px solid ${checked ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)'}`,
                cursor: running ? 'default' : 'pointer',
                backdropFilter: 'blur(16px) saturate(1.3)',
                WebkitBackdropFilter: 'blur(16px) saturate(1.3)',
                boxShadow: checked ? 'inset 0 1px 0 rgba(255,255,255,0.1)' : 'none',
                transition: 'background 0.15s, border-color 0.15s',
              }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: running ? '#4ade80' : '#3f3f46', boxShadow: running ? '0 0 6px #4ade8099' : 'none' }} />
                <span style={{ color: '#fff', fontSize: 13, fontWeight: 500, flex: 1 }}>{svc.label}</span>
                <span style={{ color: 'rgba(255,255,255,0.22)', fontSize: 10, background: 'rgba(0,0,0,0.3)', padding: '2px 5px', borderRadius: 4 }}>:{svc.port}</span>
                {running && (
                  <>
                    <button
                      onClick={e => { e.stopPropagation(); open_in_browser(svc.url) }}
                      style={{
                        background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                        color: 'rgba(255,255,255,0.6)', fontSize: 9, padding: '2px 6px', borderRadius: 4,
                        cursor: 'pointer', lineHeight: 1.4, flexShrink: 0,
                      }}
                    >open</button>
                    <span style={{ color: '#4ade80', fontSize: 10, background: 'rgba(74,222,128,0.12)', padding: '2px 6px', borderRadius: 4 }}>running</span>
                    <button
                      onClick={e => { e.stopPropagation(); stop(svc.name) }}
                      style={{
                        background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
                        color: '#f87171', fontSize: 9, padding: '2px 6px', borderRadius: 4,
                        cursor: 'pointer', lineHeight: 1.4, flexShrink: 0,
                      }}
                    >stop</button>
                  </>
                )}
                {!running && (
                  <div style={{
                    width: 17, height: 17, borderRadius: 5, flexShrink: 0,
                    border: `1.5px solid ${checked ? svc.color : 'rgba(255,255,255,0.2)'}`,
                    background: checked ? svc.color : 'rgba(0,0,0,0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'background 0.15s, border-color 0.15s',
                  }}>
                    {checked && <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><polyline points="1.5,5 4,7.5 8.5,2.5" stroke="#000" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {error && (
          <div style={{ color: '#f87171', fontSize: 11, textAlign: 'center', padding: '4px 8px', background: 'rgba(239,68,68,0.1)', borderRadius: 6, border: '1px solid rgba(239,68,68,0.2)' }}>
            {error}
          </div>
        )}

        <button onClick={launch} disabled={launching} style={{
          width: '100%', padding: '10px 0', borderRadius: 10, border: 'none', flexShrink: 0,
          background: any_selected && !launching ? 'linear-gradient(135deg, #f97316, #dc2626)' : 'rgba(255,255,255,0.07)',
          color: any_selected ? '#fff' : 'rgba(255,255,255,0.25)',
          fontSize: 13, fontWeight: 600,
          cursor: any_selected && !launching ? 'pointer' : 'default',
          letterSpacing: '-0.2px', transition: 'background 0.15s, color 0.15s',
          WebkitAppRegion: 'no-drag',
        }}>
          {launching ? boot_label() : any_selected ? 'Launch' : 'nothing selected'}
        </button>

      </div>
    </div>
  )
}
