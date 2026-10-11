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

// Deterministic scattering of tiny stars for the card back.
const BACK_STARS: [number, number, number][] = [
  [14, 18, 1.2], [56, 16, 1], [22, 31, 0.7], [49, 29, 0.8], [11, 47, 0.9], [60, 44, 1.1],
  [9, 76, 1], [61, 79, 0.8], [17, 92, 0.7], [53, 95, 1.2], [26, 104, 0.9], [45, 106, 0.7],
  [35, 14, 0.8], [35, 106, 0.8],
]

/** The face-down side: midnight navy, gold frame, sun and moon. */
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
    <rect x="5" y="5" width="60" height="110" fill="url(#back-grid)" />
    <g fill="none" stroke=${GOLD} stroke-width="0.6">
      <rect x="3.5" y="3.5" width="63" height="113" rx="3" />
      <rect x="5.5" y="5.5" width="59" height="109" rx="2" stroke-width="0.3" />
      <circle cx="35" cy="60" r="19" stroke-width="0.4" />
      <circle cx="35" cy="60" r="21.5" stroke-width="0.25" stroke-dasharray="0.6 1.2" />
      <g stroke-width="0.35">${rays(35, 60, 12.5, 17.5, 24)}</g>
      <circle cx="35" cy="60" r="10" />
      <path d="M38.5 53.8 A7 7 0 1 0 38.5 66.2 A5.6 5.6 0 1 1 38.5 53.8 Z" fill=${GOLD} fill-opacity="0.9" stroke="none" />
      <polygon points=${starPoints(35, 26, 4, 1.4, 4)} fill=${GOLD} stroke="none" />
      <polygon points=${starPoints(35, 94, 4, 1.4, 4)} fill=${GOLD} stroke="none" />
    </g>
    <g fill=${GOLD}>
      ${BACK_STARS.map(([x, y, r]) => svg`<circle cx=${x} cy=${y} r=${r * 0.45} opacity="0.75" />`)}
    </g>
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
      case 'The Hanged Man':
        // A figure hung by one foot from a beam, haloed — the world seen upside down.
        return svg`
          <path d="M10 9 H38" />
          <path d="M24 9 V19" />
          <polygon points="24,19 17,33 31,33" />
          <circle cx="24" cy="38" r="4" fill="currentColor" stroke="none" />`
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
