import { LitElement, html } from 'lit'
import { cardBack } from './components/art'
import type { SigilDesign } from './components/card-sigil'
import './components/card-sigil'
import './components/iridescent-shimmer'

/**
 * A dev page (`/sigil-lab.html`) for comparing card-back sigils: pick a
 * design, see it on a few cards with different seeds, reshuffle the seeds.
 * Not part of the game, so it keeps its own throwaway state.
 */

const DESIGNS: { id: SigilDesign; name: string }[] = [
  { id: 'star', name: 'Star (current)' },
  { id: 'water', name: 'Still Water' },
  { id: 'moons', name: 'Lunar Wheel' },
  { id: 'mirror', name: 'Scrying Mirror' },
  { id: 'threads', name: 'Constellation' },
  { id: 'fool', name: 'Fool' },
  { id: 'lovers', name: 'Lovers' },
]

const params = new URLSearchParams(location.search)

class SigilLab extends LitElement {
  static properties = { design: { state: true }, seeds: { state: true } }
  declare design: SigilDesign
  declare seeds: number[]

  constructor() {
    super()
    this.design = (params.get('d') as SigilDesign) || 'water'
    const n = Number(params.get('n')) || 3
    this.seeds = params.get('seeds')?.split(',').map(Number) ?? Array.from({ length: n }, Math.random)
  }

  createRenderRoot() {
    return this
  }

  private pick(id: SigilDesign) {
    this.design = id
    const url = new URL(location.href)
    url.searchParams.set('d', id)
    history.replaceState(null, '', url)
  }

  render() {
    return html`
      <div class="mx-auto flex min-h-dvh max-w-5xl flex-col gap-4 p-4">
        <div class="flex flex-wrap gap-2">
          ${DESIGNS.map(
            (d) => html`<button
              class="rounded-full border px-3 py-1.5 font-sans text-xs font-bold tracking-[0.12em] uppercase ${d.id === this.design
                ? 'border-gold bg-gold/15 text-gold'
                : 'border-gold/30 text-parchment/70'}"
              @click=${() => this.pick(d.id)}
            >
              ${d.name}
            </button>`,
          )}
          <button class="rounded-full border border-gold/30 px-3 py-1.5 font-sans text-xs font-bold tracking-[0.12em] text-parchment/70 uppercase" @click=${() => (this.seeds = this.seeds.map(Math.random))}>
            Reshuffle
          </button>
        </div>
        <div class="grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-4">
          ${this.seeds.map(
            (seed) => html`<div class="tarot" style="--w: 100%; height: auto; aspect-ratio: 7 / 12">
              <div class="tarot-inner">
                <div class="tarot-face">
                  ${cardBack()}
                  <card-sigil sigil=${this.design} seed=${seed} active></card-sigil>
                  <iridescent-shimmer seed=${seed} active></iridescent-shimmer>
                  <div class="tarot-frame tarot-frame-back"></div>
                </div>
              </div>
            </div>`,
          )}
        </div>
      </div>
    `
  }
}

customElements.define('sigil-lab', SigilLab)
