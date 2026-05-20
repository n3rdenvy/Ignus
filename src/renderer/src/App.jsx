import React, { useState, useEffect, useRef } from 'react'
import MESH from './assets/white_mesh.png'
import FLAME from './assets/full_flame.png'

const SERVICES = [
  { name: 'InvokeAI', label: 'InvokeAI', port: 9090, color: '#f97316' },
  { name: 'ComfyUI',  label: 'ComfyUI',  port: 8188, color: '#a78bfa' },
]

const TO_FLAME_MS = 6000
const LIVE_MS     = 3200
const TO_MESH_MS  = 6000
const PAUSE_MS    = 800

function wait(ms) { return new Promise(r => setTimeout(r, ms)) }

export default function App() {
  const [status,    set_status]    = useState({})
  const [selected,  set_selected]  = useState({})
  const [loading,   set_loading]   = useState(true)
  const [launching, set_launching] = useState(false)
  const [error,     set_error]     = useState(null)

  const [phase, set_phase] = useState('mesh')
  const loop_ref = useRef(true)

  function refresh_status() {
    window.api.get_status().then(set_status)
  }

  useEffect(() => {
    window.api.get_status().then(s => {
      set_status(s)
      const pre = {}
      for (const [name, running] of Object.entries(s)) pre[name] = !running
      set_selected(pre)
      set_loading(false)
    })

    // poll status every 10s
    const poll = setInterval(refresh_status, 10000)

    async function run_loop() {
      while (loop_ref.current) {
        set_phase('to_flame')
        await wait(TO_FLAME_MS)
        if (!loop_ref.current) break

        set_phase('flame_live')
        await wait(LIVE_MS)
        if (!loop_ref.current) break

        set_phase('to_mesh')
        await wait(TO_MESH_MS)
        if (!loop_ref.current) break

        set_phase('mesh')
        await wait(PAUSE_MS)
      }
    }

    const t = setTimeout(run_loop, 600)
    return () => { loop_ref.current = false; clearTimeout(t); clearInterval(poll) }
  }, [])

  function toggle(name) {
    set_selected(prev => ({ ...prev, [name]: !prev[name] }))
  }

  async function stop(name) {
    await window.api.stop_service(name)
    // give pkill a moment then refresh
    setTimeout(refresh_status, 800)
  }

  async function launch() {
    const names = Object.entries(selected).filter(([, v]) => v).map(([k]) => k)
    if (!names.length) { window.api.close(); return }
    set_launching(true)
    set_error(null)
    const result = await window.api.launch(names)
    set_launching(false)
    if (result && !result.ok) {
      set_error(`Failed to start: ${result.failed.join(', ')}`)
    }
  }

  const any_selected = Object.values(selected).some(Boolean)

  const mesh_opacity  = (phase === 'to_flame' || phase === 'flame_live') ? 0 : 1
  const flame_opacity = (phase === 'mesh' || phase === 'to_mesh') ? 0 : 1
  const xfade = (phase === 'to_flame' || phase === 'to_mesh') ? '6s' : '0.1s'

  const bg_shared = {
    position: 'absolute', inset: 0,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    width: '100%', height: '100%',
    willChange: 'opacity, transform',
  }

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden', borderRadius: 16, background: '#000' }}>

      {/* Mesh layer */}
      <div style={{
        ...bg_shared,
        backgroundImage: `url(${MESH})`,
        opacity: mesh_opacity,
        transition: `opacity ${xfade} ease-in-out`,
      }} />

      {/* Flame layer */}
      <div
        className={phase === 'flame_live' ? 'flame_live' : undefined}
        style={{
          ...bg_shared,
          backgroundImage: `url(${FLAME})`,
          opacity: flame_opacity,
          transition: `opacity ${xfade} ease-in-out`,
        }}
      />

      {/* Dark overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(160deg, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.58) 55%, rgba(8,3,0,0.74) 100%)',
      }} />

      {/* Content */}
      <div style={{
        position: 'relative', zIndex: 2,
        width: '100%', height: '100%',
        display: 'flex', flexDirection: 'column',
        padding: '18px 18px 16px', gap: 10,
        WebkitAppRegion: 'drag',
      }}>

        {/* Close — must live inside the drag container so no-drag override takes effect */}
        <button onClick={() => window.api.close()} style={{
          position: 'absolute', top: 12, right: 14,
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'rgba(255,255,255,0.3)', fontSize: 20, lineHeight: 1,
          padding: '0 2px', WebkitAppRegion: 'no-drag',
        }}>×</button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>🔥</span>
          <span style={{ color: '#fff', fontSize: 15, fontWeight: 700, letterSpacing: '-0.3px' }}>Ignus</span>
          <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 1 }}>local AI launcher</span>
        </div>

        <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, WebkitAppRegion: 'no-drag' }}>
          {loading ? (
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center', paddingTop: 24 }}>checking services...</div>
          ) : SERVICES.map(svc => {
            const running = status[svc.name]
            const checked = selected[svc.name] ?? false
            return (
              <div key={svc.name} onClick={() => toggle(svc.name)} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 10,
                background: checked ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.3)',
                border: `1px solid ${checked ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)'}`,
                cursor: 'pointer', backdropFilter: 'blur(6px)',
                transition: 'background 0.15s, border-color 0.15s',
              }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: running ? '#4ade80' : '#3f3f46', boxShadow: running ? '0 0 6px #4ade8099' : 'none' }} />
                <span style={{ color: '#fff', fontSize: 13, fontWeight: 500, flex: 1 }}>{svc.label}</span>
                <span style={{ color: 'rgba(255,255,255,0.22)', fontSize: 10, background: 'rgba(0,0,0,0.3)', padding: '2px 5px', borderRadius: 4 }}>:{svc.port}</span>
                {running && (
                  <>
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
                <div style={{
                  width: 17, height: 17, borderRadius: 5, flexShrink: 0,
                  border: `1.5px solid ${checked ? svc.color : 'rgba(255,255,255,0.2)'}`,
                  background: checked ? svc.color : 'rgba(0,0,0,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.15s, border-color 0.15s',
                }}>
                  {checked && <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><polyline points="1.5,5 4,7.5 8.5,2.5" stroke="#000" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </div>
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
          background: any_selected ? 'linear-gradient(135deg, #f97316, #dc2626)' : 'rgba(255,255,255,0.07)',
          color: any_selected ? '#fff' : 'rgba(255,255,255,0.25)',
          fontSize: 13, fontWeight: 600,
          cursor: any_selected && !launching ? 'pointer' : 'default',
          letterSpacing: '-0.2px', transition: 'background 0.15s, color 0.15s',
          WebkitAppRegion: 'no-drag',
        }}>
          {launching ? 'launching...' : any_selected ? 'Launch' : 'nothing selected'}
        </button>
      </div>
    </div>
  )
}
