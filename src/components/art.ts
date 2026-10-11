import { html, svg } from 'lit'

const GOLD = '#d4b15f'

const polar = (cx: number, cy: number, r: number, a: number) =>
  [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const

function starPoints(cx: number, cy: number, outer: number, inner: number, points: number) {
  const out: string[] = []
  for (let i = 0; i < points * 2; i++) {
    const [x, y] = polar(cx, cy, i % 2 ? inner : outer, (Math.PI * i) / points - Math.PI / 2)
    out.push(`${x.toFixed(2)},${y.toFixed(2)}`)
  }
  return out.join(' ')
}

const rays = (cx: number, cy: number, r1: number, r2: number, n: number, offset = 0) =>
  Array.from({ length: n }, (_, i) => {
    const a = (Math.PI * 2 * i) / n + offset
    const [x1, y1] = polar(cx, cy, r1, a)
    const [x2, y2] = polar(cx, cy, r2, a)
    return svg`<line x1=${x1} y1=${y1} x2=${x2} y2=${y2} />`
  })

/** The face-down side: midnight navy and a gold frame. The sigil in the middle is `<card-sigil>`. */
export const cardBack = () => html`
  <svg viewBox="0 0 70 120" class="block h-full w-full" aria-hidden="true">
    <defs>
      <radialGradient id="back-bg" cx="50%" cy="50%" r="75%">
        <stop offset="0%" stop-color="#1e2747" />
        <stop offset="100%" stop-color="#0b0f1d" />
      </radialGradient>
      <pattern id="back-grid" width="7" height="7" patternUnits="userSpaceOnUse">
        <path d="M3.5 0 L7 3.5 L3.5 7 L0 3.5 Z" fill="none" stroke=${GOLD} stroke-opacity="0.08" stroke-width="0.3" />
      </pattern>
    </defs>
    <rect width="70" height="120" fill="url(#back-bg)" />
    <rect width="70" height="120" fill="url(#back-grid)" />
  </svg>
`

/** Small engraved emblem for each arcanum, drawn in currentColor. */
export function emblem(title: string) {
  const body = (() => {
    switch (title) {
      case 'The Fool':
        // An open eye — first impressions.
        return svg`
          <path d="M6 24 Q24 8 42 24 Q24 40 6 24 Z" />
          <circle cx="24" cy="24" r="6" />
          <circle cx="24" cy="24" r="2" fill="currentColor" />`
      case 'The Lovers':
        return svg`
          <circle cx="19" cy="24" r="10" />
          <circle cx="29" cy="24" r="10" />
          <polygon points=${starPoints(24, 24, 3, 1, 4)} fill="currentColor" stroke="none" />`
      case 'The Star':
        return svg`
          <polygon points=${starPoints(24, 24, 16, 6, 8)} />
          <circle cx="24" cy="24" r="2.5" fill="currentColor" />`
      case 'Wheel of Fortune':
        return svg`
          <circle cx="24" cy="24" r="15" />
          <circle cx="24" cy="24" r="4" />
          ${rays(24, 24, 4, 15, 8)}`
      case 'The Sun':
        return svg`
          <circle cx="24" cy="24" r="8" />
          ${rays(24, 24, 11, 18, 12)}
          ${rays(24, 24, 11, 15, 12, Math.PI / 12)}`
      default:
        // The World: a wreath around a star.
        return svg`
          <ellipse cx="24" cy="24" rx="12" ry="17" />
          <ellipse cx="24" cy="24" rx="9.5" ry="14.5" stroke-dasharray="1.2 1.6" />
          <polygon points=${starPoints(24, 24, 5, 2, 5)} fill="currentColor" stroke="none" />`
    }
  })()
  return html`<svg viewBox="0 0 48 48" class="h-full w-full" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true">${body}</svg>`
}
