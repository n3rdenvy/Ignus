import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

const C = {
  panel: 'var(--panel)', panelDim: 'var(--panel-dim)', line: 'var(--line)', lineStrong: 'var(--line-strong)',
  accent: 'var(--accent)', bright: 'var(--accent-bright)', soft: 'var(--accent-soft)', accentLine: 'var(--accent-line)',
  silver: 'var(--silver)', text: 'var(--text)', text2: 'var(--text-2)', dim: 'var(--text-dim)', faint: 'var(--text-faint)', live: 'var(--live)', good: 'var(--good)', bad: 'var(--bad)', cold: 'var(--cold)', bg: 'var(--bg-solid)',
}
const DISPLAY = "'Satoshi', system-ui, sans-serif"
const CODE = "'Satoshi', system-ui, sans-serif"  // swap to the CLI font later
const glass = { backdropFilter: 'blur(12px) saturate(1.3)', WebkitBackdropFilter: 'blur(12px) saturate(1.3)' }

const SAMPLER_INFO = {
  euler: 'Clean, predictable, fast — reliable all-rounder; can look a touch flat.',
  euler_ancestral: 'Adds fresh detail each step — lively & creative, but less reproducible.',
  dpmpp_2m: 'Sharp & detailed at 20–30 steps — the best default for quality.',
  dpmpp_2m_sde: 'Richer texture & contrast than 2M — slower, and can over-cook.',
  dpmpp_sde: 'Very detailed, painterly — slow, needs more steps, not reproducible.',
  ddim: 'Fast at low steps, smooth — softer/less detail; good for drafts & img2img.',
  uni_pc: 'Converges fast at low steps — a speed pick; occasional artifacts.',
}
const SAMPLERS = Object.keys(SAMPLER_INFO)
const SCHEDULER_INFO = {
  normal: 'Even step spacing — safe default, works with most samplers.',
  karras: 'More steps where detail forms — crisper; pairs well with dpmpp.',
  exponential: 'Front-loads denoising — fast convergence, can lose fine detail.',
  sgm_uniform: 'Tuned for SDXL / turbo models — stable at low steps.',
  simple: 'Minimal schedule — the Flux default; leave as-is for Flux.',
  beta: 'Smooth gentle curve — good for soft / painterly looks.',
}
const SCHEDULERS = Object.keys(SCHEDULER_INFO)
// Plain-language help for the number knobs.
const PARAM_HELP = [
  ['steps', 'denoise iterations — more = more detail & longer (20–30 typical).'],
  ['cfg', 'prompt adherence — 4–7 typical (Flux likes ~1); higher = stricter, can over-saturate.'],
  ['denoise', 'how far from the start latent — 1.0 = fresh image; lower keeps more of a reference (img2img).'],
]
const SIZES = [
  { w: 832, h: 1216, ratio: '2:3', kind: 'shape' },
  { w: 1216, h: 832, ratio: '3:2', kind: 'shape' },
  { w: 1024, h: 1024, ratio: '1:1', kind: 'shape' },
  { w: 768, h: 1344, ratio: '9:16', kind: 'shape' },
  { w: 1080, h: 1080, ratio: '1:1', kind: 'ig', tag: 'Instagram' },
  { w: 1080, h: 1350, ratio: '4:5', kind: 'ig', tag: 'Instagram' },
]
const COUNTS = [1, 2, 3, 4, 6, 8]
const ALL_MODES = [['face', 'Face'], ['pose', 'Pose'], ['img2img', 'Img2img']]
const MODE_LABEL = { face: 'identity strength', pose: 'pose strength', img2img: 'how close to reference' }

function ShapeGlyph({ w, h }) {
  const max = 15, rw = w >= h ? max : max * w / h, rh = h >= w ? max : max * h / w
  return <svg width="18" height="18" viewBox="0 0 18 18" style={{ flexShrink: 0 }}><rect x={9 - rw / 2} y={9 - rh / 2} width={rw} height={rh} rx="1.5" fill="none" stroke="var(--accent)" strokeWidth="1.3" /></svg>
}
function IgGlyph() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" style={{ flexShrink: 0 }}><rect x="2" y="2" width="20" height="20" rx="5.5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1.1" fill="var(--accent)" stroke="none" /></svg>
}

// Portal-based dropdown so the list escapes the panel's overflow clipping.
function Menu({ trigger, items, minWidth = 190, dropUp = false, trigStyle }) {
  const [open, set_open] = useState(false)
  const [r, set_r] = useState(null)
  const ref = useRef()
  function toggle() { if (!open && ref.current) set_r(ref.current.getBoundingClientRect()); set_open(o => !o) }
  return (
    <div ref={ref} style={{ display: 'inline-flex' }}>
      <button onClick={toggle} style={trigStyle || { ...glass, display: 'inline-flex', alignItems: 'center', gap: 6, background: C.panelDim, border: `1px solid ${C.line}`, borderRadius: 6, color: C.text, fontFamily: CODE, fontSize: 11, padding: '5px 8px', cursor: 'pointer' }}>
        {trigger}<span style={{ color: C.dim, fontSize: 9 }}>▾</span>
      </button>
      {open && r && createPortal(
        <>
          <div onClick={() => set_open(false)} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
          <div style={{
            position: 'fixed', left: Math.min(r.left, window.innerWidth - minWidth - 8), minWidth, maxHeight: 260, overflowY: 'auto', zIndex: 9999,
            ...glass, background: 'rgba(10,13,20,0.96)', border: `1px solid ${C.lineStrong}`, borderRadius: 9, padding: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            ...(dropUp ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
          }}>
            {items.map(it => (
              <div key={it.key} className="ig-mi" onClick={() => { it.onSelect(); set_open(false) }}
                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 9px', borderRadius: 6, background: it.active ? C.soft : 'transparent' }}>
                {it.icon}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: it.active ? C.accent : C.text }}>{it.label}</div>
                  {it.sub && <div style={{ fontSize: 10, color: C.dim, lineHeight: 1.35 }}>{it.sub}</div>}
                </div>
              </div>
            ))}
          </div>
        </>, document.body)}
    </div>
  )
}

export default function GenerationPanel({ comfyRunning }) {
  const [presets, set_presets] = useState([])
  const [preset, set_preset] = useState('oneoff')
  const [prompt, set_prompt] = useState('')
  const [negative, set_negative] = useState('')
  const [adv, set_adv] = useState(false)
  const [p, set_p] = useState({ steps: 28, cfg: 5, sampler: 'euler_ancestral', scheduler: 'normal', width: 832, height: 1216, seed: '', denoise: '' })
  const [count, set_count] = useState(1)
  const [ref, set_ref] = useState({ path: null, mode: null, strength: 0.8 })
  const [loraStr, set_loraStr] = useState({})
  const [status, set_status] = useState(null)
  const [busy, set_busy] = useState(false)

  useEffect(() => { window.api.comfy_presets().then(ps => { set_presets(ps); seed_loras(ps.find(x => x.id === preset)) }) }, [])
  const cur = presets.find(x => x.id === preset)
  function seed_loras(pr) { if (pr) set_loraStr(Object.fromEntries(pr.loras.map(l => [l.id, l.def]))) }

  function pick(id) {
    set_preset(id)
    const pr = presets.find(x => x.id === id)
    if (!pr) return
    const d = pr.defaults
    set_p(v => ({ ...v, steps: d.steps, cfg: d.cfg, sampler: d.sampler, scheduler: d.scheduler, width: d.width, height: d.height }))
    seed_loras(pr)
    if (ref.mode && !pr.refModes.includes(ref.mode)) set_ref(r => ({ ...r, mode: null }))
  }

  async function load_ref() { const path = await window.api.pick_image(); if (path) set_ref(r => ({ ...r, path })) }

  async function generate() {
    if (!prompt.trim()) { set_status({ ok: false, reason: 'write a prompt first' }); return }
    set_busy(true); set_status(null)
    const refP = ref.path && ref.mode
      ? (ref.mode === 'img2img'
          ? { reference: ref.path, mode: 'img2img', denoise: Math.max(0.2, Math.min(0.85, +(1 - ref.strength).toFixed(2))) }
          : { reference: ref.path, mode: ref.mode, refStrength: ref.strength })
      : {}
    const res = await window.api.comfy_generate(preset, { prompt, negative, ...p, batch: count, loras: loraStr, ...refP })
    set_busy(false); set_status(res)
  }

  const ta = { ...glass, width: '100%', resize: 'vertical', background: C.panelDim, border: `1px solid ${C.line}`, borderRadius: 8, color: C.text, fontSize: 12, padding: '8px 10px', fontFamily: DISPLAY, lineHeight: 1.4 }
  const numStyle = { width: 46, background: C.panelDim, border: `1px solid ${C.line}`, borderRadius: 6, color: C.text, fontFamily: CODE, fontSize: 11, padding: '4px 6px' }
  const refFilename = ref.path ? ref.path.split(/[\\/]/).pop() : null

  const sizeItems = SIZES.map(s => ({
    key: `${s.w}x${s.h}`, active: p.width === s.w && p.height === s.h,
    icon: s.kind === 'ig' ? <IgGlyph /> : <ShapeGlyph w={s.w} h={s.h} />,
    label: `${s.w}×${s.h}`, sub: s.tag ? `${s.tag} · ${s.ratio}` : s.ratio,
    onSelect: () => set_p(v => ({ ...v, width: s.w, height: s.h })),
  }))

  return (
    <div style={{ marginTop: 4 }}>
      <SectionLabel dot={comfyRunning ? C.live : C.cold} name="Image Generation" note={comfyRunning ? 'ComfyUI' : 'launch ComfyUI to generate'} />

      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {presets.map(x => (
          <button key={x.id} onClick={() => pick(x.id)} style={{ ...glass, flex: 1, padding: '6px 4px', borderRadius: 8, cursor: 'pointer',
            background: preset === x.id ? C.soft : C.panel, border: `1px solid ${preset === x.id ? C.accentLine : C.line}`, color: preset === x.id ? C.accent : C.text2, fontSize: 11, fontWeight: 500 }}>{x.label}</button>
        ))}
      </div>

      {cur && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, fontFamily: CODE, fontSize: 10, color: C.dim, flexWrap: 'wrap' }}>
          <span style={{ color: C.accent }}>{cur.model}</span>
          {cur.loras.map(l => <span key={l.id}>+{l.name}</span>)}
          <span style={{ marginLeft: 'auto' }}>{cur.promptStyle}</span>
        </div>
      )}

      <textarea value={prompt} onChange={e => set_prompt(e.target.value)} rows={3} style={ta}
        placeholder={cur?.promptStyle === 'danbooru tags' ? '1girl, silver hair, armor, forest…' : 'a weathered ranger at dusk, cinematic…'} />
      <textarea value={negative} onChange={e => set_negative(e.target.value)} rows={2} style={{ ...ta, marginTop: 8, color: C.text2, fontSize: 11.5 }}
        placeholder="negative — what to avoid (blank uses the preset default)" />

      {/* Reference image + modes */}
      <div style={{ ...glass, marginTop: 10, padding: '9px 10px', borderRadius: 9, background: C.panelDim, border: `1px solid ${C.line}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: ref.path ? 8 : 0 }}>
          <span style={{ fontFamily: DISPLAY, fontSize: 11, fontWeight: 700, letterSpacing: 0.6, color: C.silver, textTransform: 'uppercase' }}>Reference</span>
          {refFilename
            ? <><span style={{ fontFamily: CODE, fontSize: 11, color: C.accent, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{refFilename}</span>
                <span onClick={() => set_ref(r => ({ ...r, path: null, mode: null }))} style={{ fontSize: 11, color: C.dim, cursor: 'pointer' }}>clear</span></>
            : <span onClick={load_ref} style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 500, color: C.accent, cursor: 'pointer' }}>load image ↗</span>}
        </div>
        {ref.path && (
          <>
            <div style={{ display: 'flex', gap: 6 }}>
              {ALL_MODES.map(([m, label]) => {
                const ok = !!cur?.refModes.includes(m), on = ref.mode === m
                return (
                  <button key={m} disabled={!ok} title={ok ? '' : `needs ${cur?.model} models`} onClick={() => set_ref(r => ({ ...r, mode: on ? null : m }))}
                    style={{ flex: 1, padding: '5px 2px', borderRadius: 7, fontSize: 11, cursor: ok ? 'pointer' : 'not-allowed',
                      background: on ? C.soft : 'transparent', border: `1px solid ${on ? C.accentLine : C.line}`, color: !ok ? C.faint : on ? C.accent : C.text2, opacity: ok ? 1 : 0.5 }}>{label}</button>
                )
              })}
            </div>
            {ref.mode && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <span style={{ fontFamily: CODE, fontSize: 10, color: C.dim, width: 120 }}>{MODE_LABEL[ref.mode]}</span>
                <input type="range" min="0.1" max="1" step="0.05" value={ref.strength} onChange={e => set_ref(r => ({ ...r, strength: +e.target.value }))} style={{ flex: 1, accentColor: '#5BB1FF' }} />
                <span style={{ fontFamily: CODE, fontSize: 10, color: C.text2, width: 30, textAlign: 'right' }}>{Math.round(ref.strength * 100)}%</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Core: resolution + steps + cfg + advanced toggle */}
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Menu minWidth={200}
          trigger={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{(SIZES.find(s => s.w === p.width && s.h === p.height)?.kind === 'ig') ? <IgGlyph /> : <ShapeGlyph w={p.width} h={p.height} />}<span style={{ fontFamily: CODE, fontSize: 11 }}>{p.width}×{p.height}</span></span>}
          items={sizeItems} />
        <NumF label="steps" val={p.steps} on={v => set_p(s => ({ ...s, steps: v }))} numStyle={numStyle} />
        <NumF label="cfg" val={p.cfg} step="0.5" on={v => set_p(s => ({ ...s, cfg: v }))} numStyle={numStyle} />
        <button onClick={() => set_adv(a => !a)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: C.dim, fontSize: 11, cursor: 'pointer' }}>{adv ? 'less ▴' : 'advanced ▾'}</button>
      </div>

      {adv && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 9 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: CODE, fontSize: 10, color: C.dim }}>sampler</span>
            <Menu minWidth={250}
              trigger={<span style={{ fontFamily: CODE, fontSize: 11 }}>{p.sampler}</span>}
              items={SAMPLERS.map(s => ({ key: s, active: p.sampler === s, label: s, sub: SAMPLER_INFO[s], onSelect: () => set_p(v => ({ ...v, sampler: s })) }))} />
            <span style={{ fontFamily: CODE, fontSize: 10, color: C.dim }}>scheduler</span>
            <Menu minWidth={230}
              trigger={<span style={{ fontFamily: CODE, fontSize: 11 }}>{p.scheduler}</span>}
              items={SCHEDULERS.map(s => ({ key: s, active: p.scheduler === s, label: s, sub: SCHEDULER_INFO[s], onSelect: () => set_p(v => ({ ...v, scheduler: s })) }))} />
          </div>
          <div style={{ fontSize: 10.5, fontWeight: 500, color: C.dim, lineHeight: 1.45, paddingLeft: 2 }}>
            <div><span style={{ color: C.silver }}>sampler</span> · {SAMPLER_INFO[p.sampler] || ''}</div>
            <div><span style={{ color: C.silver }}>scheduler</span> · {SCHEDULER_INFO[p.scheduler] || ''}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: CODE, fontSize: 10, color: C.dim }}>seed</span>
            <input value={p.seed} onChange={e => set_p(v => ({ ...v, seed: e.target.value }))} placeholder="random" style={{ ...numStyle, width: 100 }} />
            <span style={{ fontFamily: CODE, fontSize: 10, color: C.dim }}>denoise</span>
            <input value={p.denoise} onChange={e => set_p(v => ({ ...v, denoise: e.target.value }))} placeholder="auto" style={{ ...numStyle, width: 64 }} />
          </div>
          {(cur?.loras || []).map((l, i) => {
            const key = l.id ?? `lora${i}`
            const v = Number(loraStr[key] ?? l.def ?? 0)
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: CODE, fontSize: 10, color: C.dim, width: 120, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name}</span>
                <input type="range" min="0" max="1.5" step="0.05" value={v} onChange={e => { const nv = +e.target.value; set_loraStr(s => ({ ...s, [key]: nv })) }} style={{ flex: 1, accentColor: 'var(--accent)' }} />
                <span style={{ fontFamily: CODE, fontSize: 10, color: C.text2, width: 30, textAlign: 'right' }}>{v.toFixed(2)}</span>
              </div>
            )
          })}
          <div style={{ marginTop: 2, fontSize: 10, color: C.faint, lineHeight: 1.5 }}>
            {PARAM_HELP.map(([k, t]) => <div key={k}><span style={{ color: C.dim, fontWeight: 500 }}>{k}</span> — {t}</div>)}
          </div>
        </div>
      )}

      {/* Generate, with the image-count dropdown built into its left edge */}
      <div style={{ ...glass, display: 'flex', alignItems: 'stretch', marginTop: 10, borderRadius: 9, border: `1px solid ${C.accentLine}`, background: busy ? C.panel : C.soft, overflow: 'visible' }}>
        <Menu dropUp minWidth={130}
          trigStyle={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', borderRight: `1px solid ${C.accentLine}`, color: C.accent, fontFamily: CODE, fontSize: 12, fontWeight: 700, padding: '0 12px', cursor: 'pointer' }}
          trigger={<span>{count}×</span>}
          items={COUNTS.map(n => ({ key: n, active: count === n, label: `${n} image${n > 1 ? 's' : ''}`, onSelect: () => set_count(n) }))} />
        <button onClick={generate} disabled={busy} style={{ flex: 1, background: 'none', border: 'none', color: C.accent, fontFamily: DISPLAY, fontWeight: 700, fontSize: 13, letterSpacing: 0.5, textTransform: 'uppercase', cursor: busy ? 'default' : 'pointer', padding: '10px 0' }}>
          {busy ? 'forging…' : 'Generate ▸'}
        </button>
      </div>

      {status && (
        <div style={{ marginTop: 8, fontSize: 11, display: 'flex', alignItems: 'center', gap: 8, color: status.ok ? C.good : C.bad }}>
          {status.ok
            ? <><span>queued ✓ {count > 1 ? `${count} images · ` : ''}seed {status.seed}</span><span onClick={() => window.api.open_url('http://localhost:8188')} style={{ marginLeft: 'auto', color: C.accent, cursor: 'pointer' }}>watch in ComfyUI ↗</span></>
            : <span>{status.reason}</span>}
        </div>
      )}
    </div>
  )
}

function NumF({ label, val, on, step, numStyle }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <label style={{ fontFamily: CODE, fontSize: 10, color: C.dim }}>{label}</label>
      <input type="number" step={step} value={val} onChange={e => on(e.target.value)} style={numStyle} />
    </span>
  )
}
function SectionLabel({ dot, name, note }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, margin: '4px 0 8px' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot }} />
      <span style={{ fontFamily: DISPLAY, fontSize: 11.5, fontWeight: 700, letterSpacing: 1.4, color: C.silver, textTransform: 'uppercase' }}>{name}</span>
      <span style={{ fontSize: 11, fontWeight: 500, color: C.dim }}>{note}</span>
    </div>
  )
}
