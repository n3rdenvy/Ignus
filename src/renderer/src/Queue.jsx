import React, { useState, useEffect, useCallback } from 'react'

const C = {
  bg: 'var(--bg)', panel: 'var(--panel)', panelDim: 'var(--panel-dim)', line: 'var(--line)', lineStrong: 'var(--line-strong)',
  accent: 'var(--accent)', soft: 'var(--accent-soft)', accentLine: 'var(--accent-line)', silver: 'var(--silver)',
  text: 'var(--text)', text2: 'var(--text-2)', dim: 'var(--text-dim)', faint: 'var(--text-faint)', live: 'var(--live)', good: 'var(--good)',
}
const DISPLAY = "'Satoshi', system-ui, sans-serif"
const CODE = "'Satoshi', system-ui, sans-serif"
const glass = { backdropFilter: 'blur(14px) saturate(1.3)', WebkitBackdropFilter: 'blur(14px) saturate(1.3)' }
const clip = s => (s || '').replace(/\s+/g, ' ').trim().slice(0, 90)

if (!window.api) window.api = {
  comfy_queue: async () => ({ ok: true, running: [{ id: '1', prompt: 'a weathered ranger at dusk, cinematic', state: 'running' }],
    pending: [{ id: '2', prompt: '1girl, silver hair, ornate armor', state: 'pending', pos: 1 }],
    done: [{ id: '3', prompt: 'studio portrait, soft light', state: 'done', images: [] }] }),
  open_url: () => {},
}

export default function Queue() {
  const [q, set_q] = useState(null)
  const refresh = useCallback(() => { window.api.comfy_queue().then(set_q) }, [])
  useEffect(() => { refresh(); const t = setInterval(refresh, 1500); return () => clearInterval(t) }, [refresh])

  const running = q?.running || [], pending = q?.pending || [], done = q?.done || []
  const active = running.length + pending.length

  return (
    <div style={{ width: '100vw', height: '100vh', background: C.bg, color: C.text, fontFamily: DISPLAY, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '12px 14px 8px', borderBottom: `1px solid ${C.line}`, flexShrink: 0 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: running.length ? C.live : C.faint, boxShadow: running.length ? '0 0 8px var(--live)' : 'none' }} />
        <span style={{ fontFamily: DISPLAY, fontSize: 13, fontWeight: 700, letterSpacing: 0.4 }}>Generation Queue</span>
        <span style={{ marginLeft: 'auto', fontFamily: CODE, fontSize: 11, color: C.dim }}>
          {active ? `${running.length} running · ${pending.length} queued` : 'idle'}
        </span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '10px 14px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {!q ? <Muted>connecting to ComfyUI…</Muted> : q.ok === false ? <Muted>ComfyUI isn't running — launch it from the menu.</Muted> : (
          <>
            {(running.length > 0 || pending.length > 0) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {running.map(j => <Row key={j.id} C={C} accent={C.live} tag="running" pulse prompt={j.prompt} />)}
                {pending.map(j => <Row key={j.id} C={C} accent={C.accent} tag={`#${j.pos} queued`} prompt={j.prompt} />)}
              </div>
            )}

            <div>
              <div style={{ fontFamily: DISPLAY, fontSize: 11, fontWeight: 700, letterSpacing: 1.2, color: C.silver, textTransform: 'uppercase', marginBottom: 8 }}>Recent</div>
              {done.length === 0 ? <Muted>nothing yet — press Generate</Muted> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {done.map(j => (
                    <div key={j.id} style={{ ...glass, display: 'flex', alignItems: 'center', gap: 10, padding: 8, borderRadius: 9, background: C.panel, border: `1px solid ${C.line}` }}>
                      {j.images?.[0]
                        ? <img src={j.images[0]} onClick={() => window.api.open_url(j.images[0])} title="open" style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', background: '#000', cursor: 'pointer', flexShrink: 0 }} />
                        : <div style={{ width: 40, height: 40, borderRadius: 6, background: C.panelDim, flexShrink: 0 }} />}
                      <span style={{ fontSize: 11.5, color: C.text2, flex: 1, lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{clip(j.prompt) || '(no prompt)'}</span>
                      {j.images?.length > 1 && <span style={{ fontFamily: CODE, fontSize: 10, color: C.dim, flexShrink: 0 }}>×{j.images.length}</span>}
                      <span style={{ color: C.good, fontSize: 13, flexShrink: 0 }}>✓</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Row({ C, accent, tag, prompt, pulse }) {
  return (
    <div style={{ ...glass, display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 9, background: C.soft, border: `1px solid ${C.accentLine}` }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: accent, animation: pulse ? 'pulse 1.1s ease-in-out infinite' : 'none' }} />
      <span style={{ fontSize: 11.5, color: C.text, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{clip(prompt) || '(no prompt)'}</span>
      <span style={{ fontFamily: CODE, fontSize: 10, color: accent, flexShrink: 0 }}>{tag}</span>
    </div>
  )
}
function Muted({ children }) { return <div style={{ color: 'var(--text-dim)', fontSize: 12, padding: '8px 2px' }}>{children}</div> }
