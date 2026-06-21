import React, { useState, useEffect, useCallback } from 'react'
import '@google/model-viewer'

const C = {
  panel: 'var(--panel)', panelDim: 'var(--panel-dim)', line: 'var(--line)', lineStrong: 'var(--line-strong)',
  accent: 'var(--accent)', soft: 'var(--accent-soft)', accentLine: 'var(--accent-line)', silver: 'var(--silver)',
  text: 'var(--text)', text2: 'var(--text-2)', dim: 'var(--text-dim)', faint: 'var(--text-faint)', good: 'var(--good)', bad: 'var(--bad)',
}
const DISPLAY = "'Satoshi', system-ui, sans-serif"
const glass = { backdropFilter: 'blur(12px) saturate(1.3)', WebkitBackdropFilter: 'blur(12px) saturate(1.3)' }
const STATE_LABEL = { _inbox: 'Needs review', approved: 'Approved', rejected: 'Rejected' }
const STATE_COLOR = { _inbox: 'var(--accent)', approved: 'var(--good)', rejected: 'var(--bad)' }

export default function Library() {
  const [assets, set_assets] = useState(null)
  const [sel, set_sel] = useState(null)
  const [filter, set_filter] = useState('_inbox')

  const refresh = useCallback(() => { window.api.list_assets().then(set_assets) }, [])
  useEffect(() => { refresh(); const t = setInterval(refresh, 5000); return () => clearInterval(t) }, [refresh])

  async function act(sku, action) {
    const res = await window.api.asset_action(sku, action)
    if (!res?.ok && action === 'regenerate') alert(`Regenerate: ${res?.reason || 'failed'}`)
    set_sel(null); refresh()
  }

  if (!assets) return <div style={{ color: C.dim, fontSize: 13 }}>reading library…</div>

  const counts = assets.reduce((m, a) => ({ ...m, [a.state]: (m[a.state] || 0) + 1 }), {})
  const shown = assets.filter(a => a.state === filter)
  const current = sel && assets.find(a => a.sku === sel.sku && a.state === sel.state)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {['_inbox', 'approved', 'rejected'].map(s => (
          <button key={s} onClick={() => { set_filter(s); set_sel(null) }} style={{
            ...glass, flex: 1, background: filter === s ? C.soft : C.panel, border: `1px solid ${filter === s ? STATE_COLOR[s] : C.line}`,
            color: filter === s ? STATE_COLOR[s] : C.dim, fontFamily: DISPLAY, fontWeight: 700, fontSize: 10.5, letterSpacing: 0.6, textTransform: 'uppercase',
            padding: '6px 4px', borderRadius: 7, cursor: 'pointer',
          }}>{STATE_LABEL[s]}{counts[s] ? ` ${counts[s]}` : ''}</button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div style={{ ...glass, background: C.panelDim, border: `1px solid ${C.line}`, borderRadius: 9, padding: 18, textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: C.dim, marginBottom: 5 }}>
            {filter === '_inbox' ? 'No models waiting' : `Nothing ${STATE_LABEL[filter].toLowerCase()}`}
          </div>
          {filter === '_inbox' && (
            <div style={{ fontSize: 11, color: C.faint, lineHeight: 1.5 }}>
              the forge drops GLBs into<br /><code style={{ color: C.accent }}>~/IgnusVault/inhabit/_inbox</code>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
          {shown.map(a => (
            <div key={a.sku + a.state} onClick={() => set_sel(a)} title={a.sku} style={{
              ...glass, flexShrink: 0, width: 88, cursor: 'pointer',
              border: `1px solid ${current?.sku === a.sku ? STATE_COLOR[a.state] : C.line}`, borderRadius: 8, padding: 6, background: C.panel,
            }}>
              {a.source
                ? <img src={a.source} style={{ width: '100%', height: 64, objectFit: 'cover', borderRadius: 5, background: '#000' }} />
                : <div style={{ width: '100%', height: 64, borderRadius: 5, background: C.panelDim }} />}
              <div style={{ fontSize: 10, color: C.text2, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.sku}</div>
            </div>
          ))}
        </div>
      )}

      {current && (
        <div style={{ ...glass, border: `1px solid ${C.lineStrong}`, borderRadius: 10, overflow: 'hidden', background: C.panel }}>
          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 180px', minWidth: 0, minHeight: 200, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              {current.source
                ? <img src={current.source} style={{ maxWidth: '100%', maxHeight: 240, objectFit: 'contain' }} />
                : <span style={{ color: '#999', fontSize: 12 }}>no source</span>}
              <Tag>source</Tag>
            </div>
            <div style={{ flex: '1 1 180px', minWidth: 0, minHeight: 200, background: 'rgba(10,14,20,0.6)', position: 'relative' }}>
              <model-viewer key={current.glb} src={current.glb} camera-controls="" auto-rotate="" shadow-intensity="1"
                style={{ width: '100%', height: '100%', minHeight: 200, background: 'transparent' }} />
              <Tag>generated</Tag>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderTop: `1px solid ${C.line}` }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: DISPLAY, fontSize: 13, fontWeight: 700 }}>{current.sku}</div>
              <div style={{ fontSize: 10.5, color: C.dim, cursor: 'pointer', textDecoration: 'underline' }} onClick={() => window.api.open_path(current.glbPath)}>reveal file</div>
            </div>
            <Btn color={C.dim} onClick={() => act(current.sku, 'regenerate')}>Regenerate</Btn>
            <Btn color={C.bad} onClick={() => act(current.sku, 'reject')}>Reject</Btn>
            <Btn color={C.good} filled onClick={() => act(current.sku, 'approve')}>Approve</Btn>
          </div>
        </div>
      )}
    </div>
  )
}

function Tag({ children }) {
  return <span style={{ position: 'absolute', top: 8, left: 8, fontSize: 9, letterSpacing: 0.4, textTransform: 'uppercase',
    background: 'rgba(0,0,0,0.55)', color: 'rgba(255,255,255,0.85)', padding: '2px 6px', borderRadius: 4 }}>{children}</span>
}
function Btn({ color, filled, onClick, children }) {
  return <button onClick={onClick} style={{ background: filled ? color : 'transparent', border: `1px solid ${color}`,
    color: filled ? 'var(--bg-solid)' : color, fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 7, cursor: 'pointer' }}>{children}</button>
}
