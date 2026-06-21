import React, { useState, useEffect, useCallback } from 'react'

const C = {
  bg: 'var(--bg)', panel: 'var(--panel)', panelDim: 'var(--panel-dim)', line: 'var(--line)', lineStrong: 'var(--line-strong)',
  accent: 'var(--accent)', bright: 'var(--accent-bright)', soft: 'var(--accent-soft)', accentLine: 'var(--accent-line)', silver: 'var(--silver)',
  text: 'var(--text)', text2: 'var(--text-2)', dim: 'var(--text-dim)', faint: 'var(--text-faint)',
  live: 'var(--live)', launch: 'var(--launch)', close: 'var(--close)', good: 'var(--good)', bad: 'var(--bad)', cold: 'var(--cold)',
}
const DISPLAY = "'Satoshi', system-ui, sans-serif"
const CODE = "'Satoshi', system-ui, sans-serif"
const glass = { backdropFilter: 'blur(16px) saturate(1.3)', WebkitBackdropFilter: 'blur(16px) saturate(1.3)' }
const card = { ...glass, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 11, padding: 14 }

if (!window.api) {
  window.api = {
    machines_status: async () => ({ local: { ComfyUI: { running: false, url: 'http://localhost:8188' } }, agents: [{ id: 'pc-worker', label: 'PC Forge', host: '', port: 7785, enabled: false, online: false, health: null }] }),
    comfy_presets: async () => [], get_config: async () => ({ vaultRoot: '~/IgnusVault', idleMinutes: 45, agents: [] }), save_config: async () => ({ ok: true }),
    launch: async () => ({ ok: true }), stop_service: () => {}, open_url: () => {}, open_path: () => {},
  }
}

export default function Cockpit() {
  return (
    <div style={{ width: '100vw', height: '100vh', background: C.bg, color: C.text, fontFamily: DISPLAY, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '13px 16px', borderBottom: `1px solid ${C.line}`, flexShrink: 0 }}>
        <img src="./ignus_dark.png" alt="Ignus" style={{ width: 28, height: 28, borderRadius: 7, objectFit: 'cover', flexShrink: 0, border: `1px solid ${C.line}` }} />
        <span style={{ fontFamily: DISPLAY, fontSize: 17, fontWeight: 700, letterSpacing: 0.5 }}>Ignus <span style={{ color: C.accent }}>Toolbox</span></span>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Machines />
        <Inventory />
        <Settings />
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div>
      <div style={{ fontFamily: DISPLAY, fontSize: 11, fontWeight: 700, letterSpacing: 1.4, color: C.silver, textTransform: 'uppercase', marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  )
}

// ── Machines (two cards stacked) ──────────────────────────────────────────────
function Machines() {
  const [data, set_data] = useState(null)
  const [busy, set_busy] = useState({})
  const refresh = useCallback(() => { window.api.machines_status().then(set_data) }, [])
  useEffect(() => { refresh(); const t = setInterval(refresh, 4000); return () => clearInterval(t) }, [refresh])

  async function toggle(name, running) {
    set_busy(b => ({ ...b, [name]: true }))
    if (running) await window.api.stop_service(name); else await window.api.launch([name])
    setTimeout(() => { set_busy(b => ({ ...b, [name]: false })); refresh() }, 1500)
  }
  if (!data) return <Section title="Machines"><Muted>scanning…</Muted></Section>

  return (
    <Section title="Machines">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={card}>
          <Head title="Mac Mini" sub="cockpit · always on" dot={C.live} />
          {Object.entries(data.local).map(([name, s]) => (
            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
              <Dot color={s.running ? C.live : C.cold} glow={s.running} />
              <span style={{ flex: 1, fontSize: 13 }}>{name}</span>
              {s.running && <span onClick={() => window.api.open_url(s.url)} style={{ fontFamily: CODE, fontSize: 11, color: C.accent, cursor: 'pointer' }}>:8188</span>}
              <Btn color={s.running ? C.close : C.launch} busy={busy[name]} onClick={() => toggle(name, s.running)}>{s.running ? 'Close' : 'Launch'}</Btn>
            </div>
          ))}
        </div>
        {data.agents.map(a => <AgentCard key={a.id} agent={a} onSaved={refresh} />)}
      </div>
    </Section>
  )
}

function AgentCard({ agent, onSaved }) {
  const [host, set_host] = useState(agent.host || '')
  const [saving, set_saving] = useState(false)
  const h = agent.health
  async function save() {
    set_saving(true)
    const cfg = await window.api.get_config()
    const agents = (cfg.agents || []).map(x => x.id === agent.id ? { ...x, host: host.trim(), enabled: !!host.trim() } : x)
    await window.api.save_config({ agents }); set_saving(false); onSaved()
  }
  return (
    <div style={card}>
      <Head title={agent.label} sub={agent.online ? `${agent.host}:${agent.port}` : agent.host ? 'offline' : 'SF3D worker · not configured'} dot={agent.online ? C.live : C.cold} />
      {!agent.host ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input value={host} onChange={e => set_host(e.target.value)} placeholder="192.168.1.xx — the PC's LAN IP"
            style={{ flex: 1, ...glass, background: C.panelDim, border: `1px solid ${C.line}`, borderRadius: 7, color: C.text, fontFamily: CODE, fontSize: 12, padding: '6px 9px' }} />
          <Btn color={C.accent} busy={saving} onClick={() => host.trim() && save()}>Save</Btn>
        </div>
      ) : !agent.online ? (
        <Muted style={{ marginTop: 6 }}>no response on {agent.host}:{agent.port}</Muted>
      ) : (
        <div style={{ marginTop: 4 }}>
          <KV k="GPU" v={h?.gpu?.name || 'unknown'} />
          {h?.gpu?.vramMB ? <KV k="VRAM" v={`${Math.round(h.gpu.vramMB / 1024)} GB`} /> : null}
          <KV k="Load" v={h?.load != null ? `${Math.round(h.load * 100)}%` : '—'} />
        </div>
      )}
    </div>
  )
}

// ── Inventory (take stock of everything) ──────────────────────────────────────
function Inventory() {
  const [presets, set_presets] = useState([])
  useEffect(() => { window.api.comfy_presets().then(set_presets) }, [])
  const models = [...new Set(presets.map(p => p.model))]
  const loras = [...new Map(presets.flatMap(p => (p.loras || []).map(l => [l.name, l]))).values()]
  const caps = [
    ['Reference — Face', 'PuLID (SDXL)'], ['Reference — Pose', 'OpenPose ControlNet (SDXL)'], ['Reference — Img2img', 'SDXL + Flux'],
    ['Style Wizard', 'curated prompt styles'], ['Image → 3D', 'SF3D worker (PC) + STL export'],
    ['Asset vault + Library', 'verify GLBs'], ['Generation Queue', 'live ComfyUI status'], ['Vault sync', 'Syncthing + Drive'],
  ]
  return (
    <Section title="Inventory">
      <div style={card}>
        <Group label="Models">{models.map(m => <Pill key={m}>{m}</Pill>)}</Group>
        <Group label="LoRAs">{loras.map(l => <Pill key={l.name}>{l.name} <span style={{ color: C.dim }}>{l.def}</span></Pill>)}</Group>
        <div style={{ height: 1, background: C.line, margin: '10px 0' }} />
        {caps.map(([k, v]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '3px 0', fontSize: 12 }}>
            <span style={{ color: C.text, flexShrink: 0 }}>{k}</span>
            <span style={{ color: C.dim, fontSize: 11, marginLeft: 'auto', textAlign: 'right' }}>{v}</span>
          </div>
        ))}
      </div>
    </Section>
  )
}
function Group({ label, children }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontFamily: CODE, fontSize: 10, color: C.dim, marginBottom: 5 }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>{children}</div>
    </div>
  )
}
function Pill({ children }) {
  return <span style={{ ...glass, fontFamily: CODE, fontSize: 11, color: C.text2, background: C.panelDim, border: `1px solid ${C.line}`, borderRadius: 6, padding: '3px 8px' }}>{children}</span>
}

// ── Settings ──────────────────────────────────────────────────────────────────
function Settings() {
  const [cfg, set_cfg] = useState(null)
  useEffect(() => { window.api.get_config().then(set_cfg) }, [])
  function save(patch) { const next = { ...cfg, ...patch }; set_cfg(next); window.api.save_config(patch) }
  if (!cfg) return null
  return (
    <Section title="Settings">
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
          <span style={{ fontSize: 12, flex: 1 }}>Auto-stop backends after idle</span>
          <input type="number" min="5" value={cfg.idleMinutes ?? 45} onChange={e => save({ idleMinutes: Math.max(5, +e.target.value || 45) })}
            style={{ width: 52, ...glass, background: C.panelDim, border: `1px solid ${C.line}`, borderRadius: 6, color: C.text, fontFamily: CODE, fontSize: 12, padding: '4px 6px', textAlign: 'right' }} />
          <span style={{ fontFamily: CODE, fontSize: 11, color: C.dim }}>min</span>
        </div>
        <Line />
        <Setting k="Asset vault" v={cfg.vaultRoot} onClick={() => window.api.open_path(cfg.vaultRoot)} action="open" />
        <Setting k="ComfyUI" v="localhost:8188" onClick={() => window.api.open_url('http://localhost:8188')} action="open ↗" />
        <Setting k="Output folder" v="~/ComfyUI/output" onClick={() => window.api.open_path((cfg.vaultRoot || '').replace(/IgnusVault.*/, '') + 'ComfyUI/output')} action="reveal" />
      </div>
    </Section>
  )
}
function Setting({ k, v, onClick, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
      <span style={{ fontSize: 12, flexShrink: 0 }}>{k}</span>
      <span style={{ fontFamily: CODE, fontSize: 11, color: C.dim, flex: 1, textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</span>
      <span onClick={onClick} style={{ fontSize: 11, color: C.accent, cursor: 'pointer', flexShrink: 0 }}>{action}</span>
    </div>
  )
}

// ── bits ──────────────────────────────────────────────────────────────────────
function Head({ title, sub, dot }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
      <Dot color={dot} glow={dot === C.live} />
      <div><div style={{ fontFamily: DISPLAY, fontSize: 13.5, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase' }}>{title}</div>
        <div style={{ fontSize: 11, color: C.dim }}>{sub}</div></div>
    </div>
  )
}
function Dot({ color, glow }) { return <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, boxShadow: glow ? `0 0 8px ${color}` : 'none', flexShrink: 0 }} /> }
function KV({ k, v }) { return <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}><span style={{ color: C.dim }}>{k}</span><span>{v}</span></div> }
function Line() { return <div style={{ height: 1, background: C.line, margin: '6px 0' }} /> }
function Muted({ children, style }) { return <div style={{ color: C.dim, fontSize: 12, ...style }}>{children}</div> }
function Btn({ color, busy, onClick, children }) {
  return <button onClick={busy ? undefined : onClick} style={{ background: 'transparent', border: `1px solid ${color}`, color, fontFamily: DISPLAY, fontSize: 11.5, fontWeight: 700, padding: '5px 13px', borderRadius: 7, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1, minWidth: 62 }}>{busy ? '…' : children}</button>
}
