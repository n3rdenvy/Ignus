import React, { useState, useEffect } from 'react'
import GenerationPanel from './GenerationPanel'
import Library from './Library'

// Palette comes entirely from CSS variables (see index.css) so light/dark + the
// silver+blue recolor live in one place. Warm flame stays only in the background.
const C = {
  bg: 'var(--bg)', panel: 'var(--panel)', panelDim: 'var(--panel-dim)', glass: 'var(--panel-glass)',
  line: 'var(--line)', lineStrong: 'var(--line-strong)',
  accent: 'var(--accent)', bright: 'var(--accent-bright)', soft: 'var(--accent-soft)', accentLine: 'var(--accent-line)',
  silver: 'var(--silver)', text: 'var(--text)', text2: 'var(--text-2)', dim: 'var(--text-dim)', faint: 'var(--text-faint)',
  live: 'var(--live)', launch: 'var(--launch)', close: 'var(--close)',
  good: 'var(--good)', bad: 'var(--bad)', cold: 'var(--cold)',
}
const DISPLAY = "'Satoshi', system-ui, sans-serif"
// CODE = the telemetry/“terminal” font. Swap this one token when the CLI font is chosen.
const CODE = "'Satoshi', system-ui, sans-serif"
const glass = { background: C.panel, backdropFilter: 'blur(14px) saturate(1.3)', WebkitBackdropFilter: 'blur(14px) saturate(1.3)' }

if (!window.api) {
  const noop = () => {}
  window.api = {
    machines_status: async () => ({ local: { ComfyUI: { running: false, url: 'http://localhost:8188' } },
      agents: [{ id: 'pc-worker', label: 'PC Forge', host: '', port: 7785, enabled: false, online: false, health: null }] }),
    list_assets: async () => [], get_config: async () => ({ agents: [] }), save_config: async () => ({ ok: true }),
    comfy_presets: async () => [{ id: 'oneoff', label: 'One-off · SDXL', model: 'NoobAI-XL', loras: ['Wuthering Waves', 'Detail Tweaker XL'], promptStyle: 'danbooru tags', defaults: { steps: 28, cfg: 5, sampler: 'euler_ancestral', width: 832, height: 1216, batch: 1 } }],
    comfy_generate: async () => ({ ok: true, promptId: 'x', seed: 1 }),
    launch: async () => ({ ok: true }), stop_service: noop, open_url: noop, open_path: noop, open_cockpit: noop,
    asset_action: async () => ({ ok: true }), close: noop, send_tray_frames: noop, on_idle_reset: noop,
  }
}

const POLL_MS = 3000
const IDLE_MS = 45 * 60 * 1000
const fmt_bank = e => `idle in ${Math.max(0, Math.floor((IDLE_MS - e) / 60000))}m`

export default function App() {
  const [view, set_view] = useState('forge')
  const [machines, set_machines] = useState(null)
  const [review, set_review] = useState(0)
  const [busy, set_busy] = useState({})
  const [idle_at, set_idle_at] = useState(null)
  const [now, set_now] = useState(Date.now())

  useEffect(() => { const t = setInterval(() => set_now(Date.now()), 1000); return () => clearInterval(t) }, [])

  function refresh() {
    window.api.machines_status().then(set_machines)
    window.api.list_assets().then(a => set_review(a.filter(x => x.state === '_inbox').length))
  }
  useEffect(() => { refresh(); const t = setInterval(refresh, POLL_MS); return () => clearInterval(t) }, [])
  useEffect(() => { window.api.on_idle_reset(ts => set_idle_at(ts)) }, [])
  useEffect(() => {
    function on_key(e) { if (e.key === 'Escape') window.api.close() }
    window.addEventListener('keydown', on_key); return () => window.removeEventListener('keydown', on_key)
  }, [])

  // Signature: the real blazing flame (extracted from flame_anim's full-fire window,
  // alpha-keyed) looped in the menu bar. Main cycles these, faster under load.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const urls = []
      for (let i = 1; ; i++) {
        const idx = String(i).padStart(2, '0')
        let res
        try { res = await fetch(`./tray/flame_${idx}.png`) } catch { break }
        if (!res.ok) break
        const blob = await res.blob()
        const url = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob) })
        urls.push(url)
      }
      if (!cancelled && urls.length) window.api.send_tray_frames(urls)
    })()
    return () => { cancelled = true }
  }, [])

  async function fire(name) { set_busy(b => ({ ...b, [name]: true })); await window.api.launch([name]); setTimeout(() => { set_busy(b => ({ ...b, [name]: false })); refresh() }, 1500) }
  async function quench(name) { set_busy(b => ({ ...b, [name]: true })); await window.api.stop_service(name); setTimeout(() => { set_busy(b => ({ ...b, [name]: false })); refresh() }, 1500) }

  const comfy = machines?.local?.ComfyUI
  const any_hot = !!comfy?.running

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', borderRadius: 14, background: C.bg, color: C.text, fontFamily: DISPLAY, display: 'flex', flexDirection: 'column', position: 'relative' }}>

      {/* Flame — entire background, centered with breathing room (not stretched). */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', opacity: 'var(--flame-opacity)', pointerEvents: 'none', zIndex: 0, WebkitAppRegion: 'drag' }}>
        <video autoPlay loop muted playsInline style={{ height: '88%', width: 'auto', maxWidth: '70%', objectFit: 'contain' }}>
          <source src="./flame_anim.webm" type="video/webm" /><source src="./flame_anim.mp4" type="video/mp4" />
        </video>
      </div>

      <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px 10px', WebkitAppRegion: 'drag' }}>
          <img src="./ignus_dark.png" alt="Ignus" style={{ width: 44, height: 44, borderRadius: 11, objectFit: 'cover', flexShrink: 0, border: `1px solid ${C.line}` }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 900, letterSpacing: 1.5 }}>IGNUS</div>
            <div style={{ fontSize: 11, fontWeight: 500, color: C.text2 }}>AI Image generation forge &amp; library</div>
          </div>
          <button onClick={() => window.api.open_cockpit()} title="Cockpit" style={iconBtn(C)}>⊞</button>
          <button onClick={() => window.api.close()} style={{ ...iconBtn(C), fontSize: 18 }}>×</button>
        </div>

        {/* Forge / Library toggle */}
        <div style={{ display: 'flex', gap: 6, padding: '6px 16px 8px', WebkitAppRegion: 'no-drag' }}>
          {[['forge', 'Forge'], ['library', 'Library']].map(([id, label]) => (
            <button key={id} onClick={() => set_view(id)} style={{
              ...glass, flex: 1, padding: '8px 0', borderRadius: 9, cursor: 'pointer',
              background: view === id ? C.soft : C.panel,
              border: `1px solid ${view === id ? C.accentLine : C.line}`,
              color: view === id ? C.accent : C.dim, fontFamily: DISPLAY, fontWeight: 700, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase',
            }}>{label}{id === 'library' && review ? ` · ${review}` : ''}</button>
          ))}
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '4px 16px 12px', WebkitAppRegion: 'no-drag' }}>
          {!machines ? (
            <div style={{ color: C.dim, fontSize: 12, textAlign: 'center', paddingTop: 24 }}>reading the burners…</div>
          ) : view === 'forge' ? (
            <>
              <SectionLabel C={C} dot={C.live} name="Mac Mini" note="cockpit · always on" />
              <BurnerRow C={C} name="ComfyUI" port={8188} running={any_hot} busy={busy.ComfyUI}
                onFire={() => fire('ComfyUI')} onQuench={() => quench('ComfyUI')} onOpen={() => window.api.open_url(comfy.url)} />
              <div style={{ height: 10 }} />
              {machines.agents.map(a => <ForgeRow key={a.id} C={C} agent={a} onSaved={refresh} />)}
              <div style={{ height: 12 }} />
              <GenerationPanel comfyRunning={any_hot} />
              {review > 0 && (
                <div onClick={() => set_view('library')} style={{ ...glass, marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 9, cursor: 'pointer', background: C.soft, border: `1px solid ${C.accentLine}` }}>
                  <span style={{ color: C.accent }}>◆</span>
                  <span style={{ fontSize: 13, flex: 1 }}><b style={{ color: C.accent }}>{review} model{review > 1 ? 's' : ''}</b> cooling — review</span>
                  <span style={{ color: C.accent }}>→</span>
                </div>
              )}
            </>
          ) : (
            <Library C={C} />
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 16px 10px' }}>
          <span style={{ fontFamily: CODE, fontSize: 10.5, color: C.faint }}>{view === 'forge' && any_hot && idle_at ? fmt_bank(now - idle_at) : ''}</span>
        </div>
      </div>
    </div>
  )
}

function iconBtn(C) { return { background: 'none', border: 'none', color: C.dim, cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: '2px 3px', WebkitAppRegion: 'no-drag' } }

function SectionLabel({ C, dot, name, note }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, margin: '4px 0 8px' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot }} />
      <span style={{ fontFamily: DISPLAY, fontSize: 11.5, fontWeight: 700, letterSpacing: 1.4, color: C.silver, textTransform: 'uppercase' }}>{name}</span>
      <span style={{ fontSize: 11, fontWeight: 500, color: C.dim }}>{note}</span>
    </div>
  )
}

function BurnerRow({ C, name, port, running, busy, onFire, onQuench, onOpen }) {
  return (
    <div style={{ ...glass, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', marginBottom: 6, borderRadius: 9, background: running ? C.panel : C.panelDim, border: `1px solid ${running ? C.lineStrong : C.line}` }}>
      <span style={{ width: 8, height: 8, borderRadius: 3, background: running ? C.live : C.cold, boxShadow: running ? '0 0 8px var(--live)' : 'none' }} />
      <span style={{ fontSize: 13, flex: 1, color: running ? C.text : C.text2 }}>{name}</span>
      {running ? (
        <>
          <span onClick={onOpen} title="open" style={{ fontFamily: CODE, fontSize: 11, color: C.accent, cursor: 'pointer' }}>:{port}</span>
          <span onClick={busy ? undefined : onQuench} style={{ fontSize: 11.5, fontWeight: 500, color: C.close, border: `1px solid ${C.close}`, borderRadius: 5, padding: '2px 9px', cursor: 'pointer', opacity: busy ? 0.5 : 1 }}>{busy ? '…' : 'close'}</span>
        </>
      ) : (
        <span onClick={busy ? undefined : onFire} style={{ fontSize: 12, fontWeight: 600, color: C.launch, border: `1px solid ${C.launch}`, borderRadius: 5, padding: '2px 9px', cursor: 'pointer', opacity: busy ? 0.5 : 1 }}>{busy ? 'launching…' : 'launch'}</span>
      )}
    </div>
  )
}

function ForgeRow({ C, agent, onSaved }) {
  const [host, set_host] = useState(agent.host || '')
  const [saving, set_saving] = useState(false)
  const online = agent.online, h = agent.health
  const state = !agent.host ? 'cold' : online ? 'live' : 'cold'
  async function save() {
    set_saving(true)
    const cfg = await window.api.get_config()
    const agents = (cfg.agents || []).map(x => x.id === agent.id ? { ...x, host: host.trim(), enabled: !!host.trim() } : x)
    await window.api.save_config({ agents }); set_saving(false); onSaved()
  }
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, margin: '4px 0 8px' }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: state === 'live' ? C.live : C.cold }} />
        <span style={{ fontFamily: DISPLAY, fontSize: 11.5, fontWeight: 700, letterSpacing: 1.4, color: C.silver, textTransform: 'uppercase' }}>{agent.label}</span>
        <span style={{ fontSize: 11, fontWeight: 500, color: C.dim }}>SF3D worker</span>
        <span style={{ marginLeft: 'auto', fontFamily: CODE, fontSize: 11, color: state === 'live' ? C.live : C.cold }}>{state}</span>
      </div>
      {online ? (
        <div style={{ ...glass, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 9, background: C.panel, border: `1px solid ${C.lineStrong}` }}>
          <span style={{ width: 8, height: 8, borderRadius: 3, background: C.live, boxShadow: '0 0 8px var(--live)' }} />
          <span style={{ fontSize: 12, flex: 1, color: C.text2 }}>{h?.gpu?.name || 'GPU'}</span>
          <span style={{ fontFamily: CODE, fontSize: 11, color: C.accent }}>{h?.load != null ? `${Math.round(h.load * 100)}%` : '—'}</span>
        </div>
      ) : !agent.host ? (
        <div style={{ ...glass, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 9, background: C.panelDim, border: `1px solid ${C.line}` }}>
          <span style={{ fontSize: 12, color: C.dim, flexShrink: 0 }}>offline —</span>
          <input value={host} onChange={e => set_host(e.target.value)} placeholder="192.168.1.xx" style={{ flex: 1, minWidth: 0, background: 'transparent', border: `1px solid ${C.line}`, borderRadius: 5, color: C.text, fontFamily: CODE, fontSize: 11, padding: '3px 8px' }} />
          <span onClick={saving || !host.trim() ? undefined : save} style={{ fontSize: 11, color: C.accent, cursor: 'pointer', opacity: saving || !host.trim() ? 0.4 : 1 }}>{saving ? '…' : 'save'}</span>
        </div>
      ) : (
        <div style={{ ...glass, padding: '8px 10px', borderRadius: 9, background: C.panelDim, border: `1px solid ${C.line}`, fontSize: 12, color: C.dim }}>offline — no response on {agent.host}:{agent.port}</div>
      )}
    </div>
  )
}
