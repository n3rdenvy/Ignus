import React, { useState } from 'react'
import { createPortal } from 'react-dom'

const C = {
  panel: 'var(--panel)', panelDim: 'var(--panel-dim)', line: 'var(--line)', lineStrong: 'var(--line-strong)',
  accent: 'var(--accent)', soft: 'var(--accent-soft)', accentLine: 'var(--accent-line)', silver: 'var(--silver)',
  text: 'var(--text)', text2: 'var(--text-2)', dim: 'var(--text-dim)', faint: 'var(--text-faint)',
}
const DISPLAY = "'Satoshi', system-ui, sans-serif"
const glass = { backdropFilter: 'blur(14px) saturate(1.3)', WebkitBackdropFilter: 'blur(14px) saturate(1.3)' }

// Style taxonomy distilled from the Perchance text-to-image style list.
const MEDIA = [
  { id: 'photo', label: 'Photographic', subs: [
    { label: 'Casual Photo', kw: 'casual photo, candid, natural light' },
    { label: 'Professional', kw: 'professional photography, sharp focus, studio lighting' },
    { label: 'Cinematic', kw: 'cinematic still, dramatic lighting, film grain, anamorphic' },
  ] },
  { id: 'painted', label: 'Painted', subs: [
    { label: 'Digital Painting', kw: 'digital painting, painterly' },
    { label: 'Oil Painting', kw: 'oil painting, visible brushstrokes, canvas texture' },
    { label: 'Concept Art', kw: 'concept art, trending on artstation, highly detailed' },
    { label: 'Fantasy', kw: 'fantasy painting, epic, intricate detail' },
    { label: 'Painterly', kw: 'painterly, loose expressive brushwork' },
  ] },
  { id: 'anime', label: 'Anime', subs: [
    { label: 'Anime', kw: 'anime style, clean lineart, cel shading' },
    { label: 'Screencap', kw: 'anime screencap, vivid cel shading' },
    { label: 'Soft Anime', kw: 'soft anime, pastel palette, gentle shading' },
    { label: 'Studio Ghibli', kw: 'studio ghibli style, watercolor backgrounds' },
  ] },
  { id: '3d', label: '3D / Stylized', subs: [
    { label: 'Disney / Pixar', kw: '3d pixar style character, subsurface scattering, soft lighting' },
    { label: 'Figurine', kw: 'cute collectible figurine, blender 3d render, miniature' },
    { label: '3D Emoji', kw: 'glossy 3d emoji style, rounded' },
  ] },
  { id: 'comic', label: 'Comic', subs: [
    { label: 'Vintage Comic', kw: 'vintage comic book, halftone dots, bold ink' },
    { label: 'Ligne Claire', kw: 'ligne claire, franco-belgian comic, flat color' },
    { label: 'Tintin', kw: 'tintin style, clean ink outlines' },
  ] },
  { id: 'retro', label: 'Retro / Other', subs: [
    { label: 'Pixel Art', kw: 'pixel art, 8-bit, limited palette' },
    { label: '50s Sign', kw: '50s enamel sign, retro advertising' },
    { label: 'Medieval', kw: 'medieval illuminated manuscript' },
  ] },
]
const MODS = [
  { label: 'Cinematic lighting', kw: 'dramatic cinematic lighting' },
  { label: 'Highly detailed', kw: 'highly detailed, intricate' },
  { label: 'Moody / dark', kw: 'moody, dark atmosphere, low key' },
  { label: 'Vibrant color', kw: 'vibrant saturated colors' },
  { label: 'Anthro / furry', kw: 'anthro, furry' },
]
const chip = (on) => ({ ...glass, padding: '6px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 11.5,
  background: on ? C.soft : C.panel, border: `1px solid ${on ? C.accentLine : C.line}`, color: on ? C.accent : C.text2 })

// Floating popup anchored near the "choose image style" button.
export default function StyleWizard({ anchor, onApply, onClose }) {
  const [step, set_step] = useState(1)
  const [medium, set_medium] = useState(null)
  const [sub, set_sub] = useState(null)
  const [mods, set_mods] = useState({})

  function compose() {
    const parts = []
    if (sub) parts.push(sub.kw)
    MODS.forEach(m => { if (mods[m.label]) parts.push(m.kw) })
    return parts.join(', ')
  }
  const summary = [sub?.label, ...MODS.filter(m => mods[m.label]).map(m => m.label)].filter(Boolean).join(' · ')

  const W = 290
  const left = anchor ? Math.max(8, Math.min(anchor.right - W, window.innerWidth - W - 8)) : 8
  const top = anchor ? Math.max(8, Math.min(anchor.bottom + 6, window.innerHeight - 330)) : 60

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
      <div style={{ position: 'fixed', left, top, width: W, zIndex: 9999, ...glass, background: 'rgba(7,10,16,0.97)', border: `1px solid ${C.lineStrong}`, borderRadius: 11, padding: 11, boxShadow: '0 12px 32px rgba(0,0,0,0.6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontFamily: DISPLAY, fontSize: 11, fontWeight: 700, letterSpacing: 1, color: C.silver, textTransform: 'uppercase' }}>Style Wizard</span>
          <span style={{ fontSize: 10, color: C.dim }}>{['Medium', 'Look', 'Modifiers'][step - 1]} · {step}/3</span>
          <span onClick={onClose} style={{ marginLeft: 'auto', fontSize: 11, color: C.dim, cursor: 'pointer' }}>✕</span>
        </div>

        {step === 1 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {MEDIA.map(m => <span key={m.id} style={chip(medium?.id === m.id)} onClick={() => { set_medium(m); set_sub(null); set_step(2) }}>{m.label}</span>)}
        </div>}

        {step === 2 && medium && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {medium.subs.map(s => <span key={s.label} style={chip(sub?.label === s.label)} onClick={() => { set_sub(s); set_step(3) }}>{s.label}</span>)}
        </div>}

        {step === 3 && <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {MODS.map(m => {
            const on = !!mods[m.label]
            return (
              <div key={m.label} onClick={() => set_mods(s => ({ ...s, [m.label]: !on }))} style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}>
                <span style={{ width: 15, height: 15, borderRadius: 4, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${on ? C.accent : C.line}`, background: on ? C.soft : 'transparent', color: C.accent, fontSize: 10 }}>{on ? '✓' : ''}</span>
                <span style={{ fontSize: 12, color: on ? C.text : C.text2 }}>{m.label}</span>
              </div>
            )
          })}
        </div>}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 11 }}>
          {step > 1 && <span onClick={() => set_step(step - 1)} style={{ fontSize: 11, color: C.dim, cursor: 'pointer' }}>← back</span>}
          {summary && <span style={{ fontSize: 10, color: C.dim, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{summary}</span>}
          <button onClick={() => { onApply(compose(), summary); onClose() }} disabled={!sub} style={{ marginLeft: summary ? 0 : 'auto', ...glass, background: sub ? C.soft : C.panel, border: `1px solid ${sub ? C.accentLine : C.line}`, color: sub ? C.accent : C.faint, fontFamily: DISPLAY, fontWeight: 700, fontSize: 11.5, padding: '6px 14px', borderRadius: 8, cursor: sub ? 'pointer' : 'default', textTransform: 'uppercase', letterSpacing: 0.4 }}>Apply</button>
        </div>
      </div>
    </>, document.body)
}
