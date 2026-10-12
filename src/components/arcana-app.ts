/**
 * The whole UI. Hard rule: this component only reads view models from the
 * store (via `fromStore`) and dispatches actions (via `store.put`). No game
 * logic, no derivations, no side effects beyond the DOM.
 */
import { fromStore } from '@zaymonoid/katha/lit'
import { LitElement, html, nothing, type TemplateResult } from 'lit'
import { keyed } from 'lit/directives/keyed.js'
import type { Arcanum } from '../deck'
import { store } from '../store'
import * as S from '../store/selectors'
import { cardBack, emblem } from './art'
import './card-sigil'
import './iridescent-shimmer'

const btn =
  'rounded-xl px-6 py-3 font-sans text-sm font-extrabold tracking-[0.14em] uppercase transition active:scale-[0.97] disabled:opacity-35 disabled:active:scale-100'
const btnGold = `${btn} btn-gold text-ink`
const btnGhost = `${btn} border border-gold/45 bg-ink-2/40 text-gold hover:bg-gold/10`

const put = store.put

export class ArcanaApp extends LitElement {
  private screen = fromStore(this, store, S.selectScreen)
  private setup = fromStore(this, store, S.selectSetup)
  private hud = fromStore(this, store, S.selectHud)
  private levelIntro = fromStore(this, store, S.selectLevelIntro)
  private turn = fromStore(this, store, S.selectTurn)
  private summary = fromStore(this, store, S.selectSummary)

  // Light DOM so global Tailwind styles apply.
  createRenderRoot() {
    return this
  }

  /** Apply focus requests from the store (DOM-only reaction). */
  private lastFocusNonce = 0
  updated() {
    const focus = this.setup.value.focus
    if (focus && focus.nonce !== this.lastFocusNonce) {
      this.lastFocusNonce = focus.nonce
      this.querySelectorAll<HTMLInputElement>('input[data-name]')[focus.index]?.focus()
    }
  }

  render() {
    return html`
      <main class="mx-auto flex min-h-dvh max-w-md flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        ${this.renderScreen()}
      </main>
    `
  }

  private renderScreen() {
    switch (this.screen.value) {
      case 'boot':
        return nothing
      case 'setup':
        return this.renderSetup()
      case 'level':
        return this.renderLevelIntro()
      case 'turn':
        return this.renderTurn()
      case 'closing':
        return this.renderClosing()
      case 'summary':
        return this.renderSummary()
    }
  }

  // ---------- Setup ----------

  private renderSetup() {
    const v = this.setup.value
    const n = v.seats.length
    return html`
      <header class="fade-in mt-2 flex flex-col items-center text-center">
        <div class="seat-ring" aria-hidden="true">
          <div class="seat-orbit"></div>
          <div class="seat-halo"></div>
          <div class="absolute inset-0 m-auto h-16 w-16 text-gold">${emblem('The Star')}</div>
          ${v.seats.map(
            (seat, i) => html`<div class="seat ${seat.filled ? 'is-filled' : ''}" style="--i:${i};--n:${n}">
              ${seat.filled ? seat.initial : seat.numeral}
            </div>`,
          )}
        </div>
        <h1 class="mt-1 font-display text-6xl font-semibold tracking-[-0.02em] text-gold">Arcana</h1>
        <p class="mt-2 max-w-[19rem] text-base leading-snug text-parchment/70">
          Questions for getting to know each other. One phone, passed around the circle.
        </p>
      </header>

      ${v.saved
        ? html`
            <section class="fade-in mt-8 rounded-2xl border border-gold/40 bg-ink-2/70 p-5 text-center">
              <p class="text-lg">
                A reading is in progress — <span class="text-gold">${v.saved.levelTitle}</span>, ${v.saved.players} players.
              </p>
              <div class="mt-4 flex justify-center gap-3">
                <button class=${btnGold} @click=${() => put({ id: 'game/resume' })}>Resume</button>
                <button class=${btnGhost} @click=${() => put({ id: 'game/discard' })}>Discard</button>
              </div>
            </section>
          `
        : nothing}

      <section class="fade-in mt-8">
        <h2 class="mb-3 font-display text-2xl font-semibold text-parchment">The circle</h2>
        <ol class="space-y-2">
          ${v.names.map(
            (name, index) => html`
              <li class="seat-row group flex items-center gap-3 rounded-2xl border border-gold/15 bg-ink-2/60 py-1.5 pr-1.5 pl-3 transition focus-within:border-gold/70 focus-within:bg-ink-2">
                <span
                  class="grid h-9 w-9 shrink-0 place-items-center rounded-full font-display text-sm font-semibold transition ${v.seats[index].filled
                    ? 'bg-gold text-ink'
                    : 'border border-dashed border-gold/40 text-gold/70'}"
                  >${v.seats[index].numeral}</span
                >
                <input
                  data-name
                  class="min-w-0 flex-1 bg-transparent py-2 text-lg font-semibold text-parchment placeholder:font-medium placeholder:text-parchment/30 focus:outline-none"
                  placeholder=${v.seats[index].first ? 'Who draws first?' : 'Name'}
                  autocomplete="off"
                  autocapitalize="words"
                  enterkeyhint=${index === v.names.length - 1 ? 'done' : 'next'}
                  maxlength="20"
                  .value=${name}
                  @input=${(e: InputEvent) => put({ id: 'setup/name', data: { index, value: (e.target as HTMLInputElement).value } })}
                  @keydown=${(e: KeyboardEvent) => e.key === 'Enter' && put({ id: 'setup/enter', data: { index } })}
                />
                ${v.seats[index].first && v.seats[index].filled
                  ? html`<span class="shrink-0 rounded-full bg-gold/15 px-2.5 py-1 text-[0.65rem] font-bold tracking-[0.15em] text-gold uppercase">Starts</span>`
                  : nothing}
                <button
                  class="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xl text-parchment/35 transition hover:bg-wine/30 hover:text-parchment disabled:hidden"
                  aria-label="Remove player"
                  ?disabled=${!v.canRemove}
                  @click=${() => put({ id: 'setup/remove', data: { index } })}
                >
                  ×
                </button>
              </li>
            `,
          )}
        </ol>
        ${v.canAdd
          ? html`<button
              class="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-gold/30 py-3.5 text-sm font-bold tracking-[0.15em] text-gold/80 uppercase transition hover:border-gold/60 hover:text-gold"
              @click=${() => put({ id: 'setup/add' })}
            >
              <span class="text-lg leading-none">+</span> Add a seat
            </button>`
          : nothing}
        ${v.duplicate ? html`<p class="mt-3 text-rose-300">Two players are called “${v.duplicate}” — make them unique.</p>` : nothing}
      </section>

      <section class="fade-in mt-9">
        <h2 class="mb-3 font-display text-2xl font-semibold text-parchment">How deep?</h2>
        <div class="grid grid-cols-3 gap-3">
          ${v.lengths.map(
            (l) => html`
              <button
                class="length-card ${l.selected ? 'is-selected' : ''}"
                aria-pressed=${l.selected}
                @click=${() => put({ id: 'setup/length', data: { length: l.id } })}
              >
                <span class="flex gap-1">
                  ${Array.from({ length: l.rounds }, () => html`<span class="h-2 w-2 rotate-45 bg-current"></span>`)}
                </span>
                <span class="mt-auto font-display text-xl font-semibold">${l.label}</span>
                <span class="text-sm opacity-70">${l.hint}</span>
              </button>
            `,
          )}
        </div>
        <p class="mt-3 text-sm text-parchment/55">${v.summary}</p>
      </section>

      <div class="sticky bottom-0 mt-auto -mx-4 bg-gradient-to-t from-ink via-ink/90 to-transparent px-4 pt-10 pb-1">
        <button class="${btnGold} w-full py-4" ?disabled=${!v.canStart} @click=${() => put({ id: 'game/start' })}>
          Begin the reading
        </button>
      </div>
    `
  }

  // ---------- In game ----------

  private renderTopBar() {
    const h = this.hud.value
    if (!h) return nothing
    return html`
      <header class="mb-3 flex items-center justify-between gap-3">
        <button
          class="grid h-11 w-11 shrink-0 place-items-center rounded-full text-gold/70 transition hover:text-gold disabled:invisible"
          aria-label="Undo the last tap"
          ?disabled=${!h.canUndo}
          @click=${() => put({ id: 'game/undo' })}
        >
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" />
          </svg>
        </button>
        <div class="min-w-0 flex-1 text-center">
          <div class="truncate font-sans text-xs font-bold tracking-[0.22em] text-gold uppercase">Level ${h.levelNumber} · ${h.theme}</div>
          <div class="mt-1 flex items-center justify-center gap-1.5">
            ${h.progress.map(
              (p) => html`<span class="h-1 w-6 rounded-full ${p === 'done' ? 'bg-gold' : p === 'current' ? 'bg-gold/60' : 'bg-parchment/15'}"></span>`,
            )}
            <span class="ml-2 font-sans text-sm text-parchment/60">Round ${h.round} of ${h.rounds}</span>
          </div>
        </div>
        <button
          class="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-gold/30 text-gold"
          aria-label="Menu"
          @click=${() => put({ id: 'menu/open' })}
        >
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="currentColor"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
        </button>
      </header>
      ${h.menuOpen ? this.renderMenu(h) : nothing}
    `
  }

  private renderMenu(h: NonNullable<ReturnType<typeof S.selectHud>>) {
    return html`
      <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" @click=${() => put({ id: 'menu/close' })}>
        <div
          class="fade-in w-full max-w-md rounded-t-3xl border-t border-gold/40 bg-ink-2 px-6 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
          @click=${(e: Event) => e.stopPropagation()}
        >
          ${h.dump
            ? html`
                <h3 class="mb-3 font-sans text-xs font-bold tracking-[0.22em] text-gold/80 uppercase">Debug dump</h3>
                <textarea
                  class="mb-4 h-64 w-full resize-none rounded-xl border border-gold/30 bg-ink/60 p-3 font-mono text-xs text-parchment/80"
                  readonly
                  .value=${h.dump.text}
                  @focus=${(e: Event) => (e.target as HTMLTextAreaElement).select()}
                ></textarea>
                <div class="grid gap-3">
                  <button class=${btnGold} @click=${() => put({ id: 'debug/copy' })}>${h.dump.copyLabel}</button>
                  <button class="py-2 font-sans text-parchment/60" @click=${() => put({ id: 'debug/close' })}>Back</button>
                </div>
              `
            : h.confirmingEnd
            ? html`
                <p class="mb-6 text-center font-sans text-xl">End this reading? Progress will be lost.</p>
                <div class="grid gap-3">
                  <button class="${btn} bg-wine text-parchment" @click=${() => put({ id: 'menu/end-confirm' })}>End game</button>
                  <button class=${btnGhost} @click=${() => put({ id: 'menu/end-cancel' })}>Keep playing</button>
                </div>
              `
            : html`
                <h3 class="mb-3 font-sans text-xs font-bold tracking-[0.22em] text-gold/80 uppercase">The circle</h3>
                <ul class="mb-6 space-y-1.5">
                  ${h.players.map(
                    (p) => html`
                      <li class="flex items-center justify-between font-sans text-lg ${p.current ? 'text-gold' : ''}">
                        <span>${p.name}${p.current ? html` <span class="text-sm opacity-70">— their turn</span>` : nothing}</span>
                        ${passTokens(p.passes)}
                      </li>
                    `,
                  )}
                </ul>
                <div class="grid gap-3">
                  <button class=${btnGold} @click=${() => put({ id: 'level/skip' })}>${h.deeperLabel}</button>
                  <button class=${btnGhost} @click=${() => put({ id: 'menu/end-request' })}>End game</button>
                  <button class="py-1 font-sans text-sm text-parchment/40" @click=${() => put({ id: 'debug/dump' })}>Dump game (debug)</button>
                  <button class="py-2 font-sans text-parchment/60" @click=${() => put({ id: 'menu/close' })}>Close</button>
                </div>
              `}
        </div>
      </div>
    `
  }

  private renderLevelIntro() {
    const v = this.levelIntro.value
    if (!v) return nothing
    return html`
      ${this.renderTopBar()}
      ${tapArea(
        `Begin ${v.arcanum.theme}`,
        () => put({ id: 'level/begin' }),
        html`
          <p class="fade-in font-sans text-parchment/70">${v.lead}</p>
          ${cardSlot(keyed(`level-${v.key}`, staticCard(v.arcanum, html`<p class="font-display text-[1.15em] leading-snug italic">${v.arcanum.blurb}</p>`)))}
        `,
      )}
      ${hint(v.hint)}
    `
  }

  /**
   * Ignore taps on the card while it is still turning over, so a double
   * tap can't draw and finish a turn in one go. Animation timing only.
   */
  private cardSettlesAt = 0
  private lastCardKey: number | null = null
  private noteCardChange() {
    const key = this.turn.value?.card?.key ?? null
    if (key !== this.lastCardKey) {
      this.lastCardKey = key
      if (key !== null) this.cardSettlesAt = performance.now() + FLIP_MS
    }
  }

  private renderTurn() {
    const v = this.turn.value
    if (!v) return nothing
    this.noteCardChange()
    const c = v.card
    const front = c
      ? cardFront(
          c.arcanum,
          html`<p class="font-display text-[1.35em] leading-snug font-medium">${parts(c.text, 'text-wine')}</p>`,
          html`<p class="font-sans text-[0.8em] leading-snug text-sepia/85">${parts(c.instruction, 'font-bold text-wine')}</p>`,
        )
      : nothing
    const advance = () => {
      if (!c) put({ id: 'card/draw' })
      else if (performance.now() >= this.cardSettlesAt) put({ id: 'card/done' })
    }
    return html`
      ${this.renderTopBar()}
      <p class="truncate text-center font-display text-[min(1.65rem,7vw)] leading-tight font-medium text-parchment">${parts(v.heading, 'text-gold')}</p>
      ${tapArea(
        c ? c.ariaLabel : 'Draw a card',
        advance,
        cardSlot(keyed(
          v.key,
          html`<div class="tarot ${c ? 'is-flipped' : ''} ${c?.redraw ? 'deal-flip' : 'deal-in'}">
            <div class="tarot-inner">
              <div class="tarot-face">
                ${cardBack()}
                <card-sigil sigil=${v.sigil} seed=${v.seed} ?active=${!c}></card-sigil>
                <iridescent-shimmer seed=${v.seed} ?active=${!c}></iridescent-shimmer>
                <div class="tarot-frame tarot-frame-back"></div>
              </div>
              <div class="tarot-face tarot-front">${front}</div>
            </div>
          </div>`,
        )),
      )}
      <div class="flex h-9 shrink-0 items-center justify-center gap-4">
        ${v.hint ? hint(v.hint) : nothing}
        ${c
          ? html`
              <button
                class="fade-in inline-flex items-center gap-2 rounded-full border border-gold/35 px-4 py-2 font-sans text-xs font-extrabold tracking-[0.14em] text-gold uppercase transition active:scale-[0.97] disabled:opacity-35"
                ?disabled=${!c.canPass}
                @click=${() => put({ id: 'card/pass' })}
              >
                Pass ${passTokens(v.passes)}
              </button>
            `
          : nothing}
      </div>
    `
  }

  private renderClosing() {
    const arcanum = S.selectClosing()
    return html`
      ${tapArea(
        'Finish the reading',
        () => put({ id: 'game/finish' }),
        html`
          <p class="fade-in font-sans text-parchment/70">The final card</p>
          ${cardSlot(staticCard(arcanum, html`<p class="font-display text-[1.15em] leading-snug italic">${arcanum.blurb}</p>`))}
        `,
      )}
      ${hint('Tap the card to finish')}
    `
  }

  private renderSummary() {
    const v = this.summary.value
    if (!v) return nothing
    const body = html`
      <div class="space-y-[0.6em] font-display text-[1.1em] leading-snug">
        <p><strong class="font-display text-[2em] font-semibold text-wine">${v.answered}</strong><br />cards answered together</p>
        <p class="italic opacity-80">${v.details}</p>
      </div>
    `
    return html`
      <div class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 py-3">
        <p class="fade-in font-sans text-parchment/70">Thank you for playing</p>
        ${cardSlot(staticCard(v.arcanum, body))}
      </div>
      <div class="mt-3 grid gap-3">
        <button class="${btnGold} py-4" @click=${() => put({ id: 'game/rematch' })}>Play again</button>
        <button class=${btnGhost} @click=${() => put({ id: 'game/new-players' })}>New players</button>
      </div>
    `
  }
}

// ---------- Presentational helpers ----------

/** How long the card takes to turn over (see `.tarot-inner` in style.css), plus the pass deal's delay. */
const FLIP_MS = 1100

/** The middle of the screen is one big tap target that moves the game on. */
const tapArea = (label: string, onTap: () => void, body: unknown) => html`
  <button class="tap-area flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-3 py-3" aria-label=${label} @click=${onTap}>
    ${body}
  </button>
`

/** Takes whatever room the screen has left; the card inside sizes itself to fill it. */
const cardSlot = (card: unknown) => html`<div class="card-slot">${card}</div>`

const hint = (text: string) => html`<p class="fade-in text-center font-sans text-xs tracking-[0.12em] text-parchment/40 uppercase">${text}</p>`

const parts = (runs: S.TextPart[], nameClass: string) =>
  runs.map((r) => (r.name ? html`<span class="font-semibold ${nameClass}">${r.text}</span>` : r.text))

const passTokens = (n: number) => html`<span class="flex gap-1" aria-label="${n} passes left">
  ${Array.from({ length: S.MAX_PASSES }, (_, i) =>
    html`<span class="h-2.5 w-2.5 rotate-45 border border-gold ${i < n ? 'bg-gold' : 'opacity-30'}"></span>`,
  )}
</span>`

const staticCard = (arcanum: Arcanum, body: TemplateResult) => html`
  <div class="tarot is-static deal-in">
    <div class="tarot-inner">
      <div class="tarot-face tarot-front">${cardFront(arcanum, body)}</div>
    </div>
  </div>
`

/**
 * A card's face. `note`, if given, is a small line of play instructions at the
 * top, so who reads it to whom is clear before the question is read out.
 */
const cardFront = (arcanum: Arcanum, body: TemplateResult, note?: TemplateResult) => html`
  <div class="tarot-frame"></div>
  <div class="relative flex h-full flex-col items-center px-[1.6em] pt-[1.5em] pb-[1.3em] text-center">
    ${note ? html`<div class="mb-[0.7em] w-full border-b border-gold-dim/50 px-[0.4em] pb-[0.6em]">${note}</div>` : nothing}
    <div class="font-sans text-[0.8em] font-bold tracking-[0.3em] text-gold-dim">${arcanum.numeral}</div>
    <div class="mt-[0.5em] h-[3.2em] w-[3.2em] text-gold-dim">${emblem(arcanum.title)}</div>
    <div class="flex flex-1 items-center justify-center py-[0.8em]">${body}</div>
    <div class="w-full border-t border-gold-dim/50 pt-[0.6em]">
      <div class="font-display text-[1.25em] font-semibold tracking-[0.02em]">${arcanum.title}</div>
      <div class="font-display text-[0.95em] italic opacity-70">${arcanum.theme}</div>
    </div>
  </div>
`

customElements.define('arcana-app', ArcanaApp)
