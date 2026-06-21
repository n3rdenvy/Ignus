import React, { useState, useEffect, useCallback } from 'react'
import Library from './Library'

// Dev/browser-preview fallback so the cockpit renders without the Electron preload.
if (!window.api) {
  window.api = {
    machines_status: async () => ({
      local: { ComfyUI: { running: false, url: 'http://localhost:8188' } },
      agents: [{ id: 'pc-worker', label: 'PC Forge', host: '', port: 7785, enabled: false, online: false, health: null }],
    }),
    list_assets:  async () => [],
    asset_action: async () => ({ ok: true }),
    launch:       async () => ({ ok: true }),
    stop_service: async () => {},
    open_url:     () => {},
    open_path:    () => {},
    get_config:   async () => ({ vaultRoot: '~/IgnusVault', agents: [] }),
    save_config:  async () => ({ ok: true }),
  }
}

const ORANGE = 'var(--accent)'        // primary accent (azure) — name kept for churn
const GOLD   = 'var(--accent-bright)'
const GREEN  = 'var(--good)'
const PURPLE = 'var(--accent)'
const MUTED  = 'var(--text-dim)'
const DISPLAY = "'Satoshi', system-ui, sans-serif"

const card = {
  background: 'var(--panel)',
  backdropFilter: 'blur(16px) saturate(1.3)',
  WebkitBackdropFilter: 'blur(16px) saturate(1.3)',
  border: '1px solid var(--line)',
  borderRadius: 12,
  padding: 16,
}

export default function Cockpit() {
  const [tab, set_tab] = useState('machines')
  return (
    <div style={{
      width: '100vw', height: '100vh', background: 'var(--bg)', color: 'var(--text)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      fontFamily: DISPLAY,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '14px 20px', borderBottom: '1px solid var(--line)', flexShrink: 0,
      }}>
        <img src="./ignus_dark.png" alt="Ignus" style={{ width: 28, height: 28, borderRadius: 7, objectFit: 'cover', flexShrink: 0, border: '1px solid var(--line)' }} />
        <span style={{ fontFamily: DISPLAY, fontSize: 17, fontWeight: 700, letterSpacing: '0.5px' }}>
          Ignus <span style={{ color: ORANGE }}>Cockpit</span>
        </span>
        <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
          {[['machines', 'Machines'], ['library', 'Library']].map(([id, label]) => (
            <button key={id} onClick={() => set_tab(id)} style={{
              background: tab === id ? 'var(--accent-soft)' : 'transparent',
              border: `1px solid ${tab === id ? 'var(--accent-line)' : 'transparent'}`,
              color: tab === id ? ORANGE : MUTED,
              fontFamily: DISPLAY, fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
              padding: '5px 14px', borderRadius: 8, cursor: 'pointer',
            }}>{label}</button>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
        {tab === 'machines' ? <MachinesTab /> : <Library />}
      </div>
    </div>
  )
}

// ── Machines ──────────────────────────────────────────────────────────────────

function MachinesTab() {
  const [data, set_data] = useState(null)
  const [busy, set_busy] = useState({})

  const refresh = useCallback(() => { window.api.machines_status().then(set_data) }, [])
  useEffect(() => { refresh(); const t = setInterval(refresh, 4000); return () => clearInterval(t) }, [refresh])

  async function toggle_local(name, running) {
    set_busy(b => ({ ...b, [name]: true }))
    if (running) await window.api.stop_service(name)
    else await window.api.launch([name])
    setTimeout(() => { set_busy(b => ({ ...b, [name]: false })); refresh() }, 1500)
  }

  if (!data) return <Muted>scanning machines…</Muted>

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
      {/* This Mac (cockpit) */}
      <div style={card}>
        <MachineHeader title="Mac Mini" subtitle="cockpit · always on" online dot={GREEN} />
        {Object.entries(data.local).map(([name, s]) => (
          <BackendRow
            key={name}
            label={name}
            color={name === 'ComfyUI' ? PURPLE : ORANGE}
            running={s.running}
            busy={busy[name]}
            onToggle={() => toggle_local(name, s.running)}
            onOpen={s.running ? () => window.api.open_url(s.url) : null}
          />
        ))}
      </div>

      {/* Remote worker agents */}
      {data.agents.map(a => <AgentCard key={a.id} agent={a} />)}
    </div>
  )
}

function AgentCard({ agent }) {
  const [host, set_host] = useState(agent.host || '')
  const [saving, set_saving] = useState(false)
  const h = agent.health

  async function save() {
    set_saving(true)
    const cfg = await window.api.get_config()
    const agents = (cfg.agents || []).map(x => x.id === agent.id ? { ...x, host: host.trim(), enabled: !!host.trim() } : x)
    await window.api.save_config({ agents })
    set_saving(false)
  }

  return (
    <div style={card}>
      <MachineHeader
        title={agent.label}
        subtitle={agent.host ? `${agent.host}:${agent.port}` : 'not configured'}
        online={agent.online}
        dot={agent.online ? GREEN : 'var(--cold)'}
      />
      {!agent.enabled || !agent.host ? (
        <div style={{ marginTop: 8 }}>
          <Muted>Set the PC's LAN IP once it's reachable (DHCP-reserved).</Muted>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <input
              value={host} onChange={e => set_host(e.target.value)} placeholder="192.168.1.xx"
              style={{
                flex: 1, background: 'var(--panel-dim)', border: '1px solid var(--line)',
                borderRadius: 8, color: 'var(--text)', fontSize: 13, padding: '7px 10px',
              }}
            />
            <button onClick={save} disabled={saving || !host.trim()} style={btn(ORANGE)}>
              {saving ? '…' : 'Save'}
            </button>
          </div>
        </div>
      ) : !agent.online ? (
        <Muted style={{ marginTop: 8 }}>offline — agent not responding on {agent.host}:{agent.port}</Muted>
      ) : (
        <div style={{ marginTop: 4 }}>
          <KV k="GPU" v={h?.gpu?.name || 'unknown'} />
          {h?.gpu?.vramMB ? <KV k="VRAM" v={`${Math.round(h.gpu.vramMB / 1024)} GB`} /> : null}
          <KV k="Load" v={h?.load != null ? `${Math.round(h.load * 100)}%` : '—'} />
          <div style={{ height: 1, background: 'var(--line)', margin: '10px 0' }} />
          {Object.entries(h?.backends || {}).map(([name, b]) => (
            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 12 }}>
              <Dot color={b.running ? GREEN : b.installed ? 'var(--cold)' : 'var(--bad)'} />
              <span style={{ flex: 1 }}>{name}</span>
              <span style={{ color: MUTED, fontSize: 11 }}>
                {b.running ? 'running' : b.installed ? 'idle' : 'not installed'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Small pieces ──────────────────────────────────────────────────────────────

function MachineHeader({ title, subtitle, dot }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
      <Dot color={dot} />
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 14, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>{title}</div>
        <div style={{ fontSize: 11, color: MUTED }}>{subtitle}</div>
      </div>
    </div>
  )
}

function BackendRow({ label, color, running, busy, onToggle, onOpen }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
      <Dot color={running ? GREEN : 'var(--cold)'} />
      <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{label}</span>
      {onOpen && (
        <span onClick={onOpen} style={{
          fontSize: 10, color: GREEN, cursor: 'pointer', padding: '2px 6px',
          border: '1px solid rgba(74,222,128,0.35)', borderRadius: 4,
        }}>open</span>
      )}
      <button onClick={onToggle} disabled={busy} style={{
        ...btn(running ? 'var(--bad)' : color),
        opacity: busy ? 0.5 : 1, minWidth: 64,
      }}>{busy ? '…' : running ? 'Stop' : 'Launch'}</button>
    </div>
  )
}

function Dot({ color }) {
  return <span style={{ width: 9, height: 9, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}`, flexShrink: 0 }} />
}

function KV({ k, v }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
      <span style={{ color: MUTED }}>{k}</span><span>{v}</span>
    </div>
  )
}


function Muted({ children, style }) {
  return <div style={{ color: MUTED, fontSize: 13, ...style }}>{children}</div>
}

function btn(color, filled) {
  return {
    background: filled ? color : 'transparent',
    border: `1px solid ${color}`,
    color: filled ? 'var(--bg-solid)' : color,
    fontSize: 12, fontWeight: 700, padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
  }
}
