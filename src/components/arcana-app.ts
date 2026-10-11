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
    return html`
      <header class="fade-in mt-6 mb-8 text-center">
        <div class="mx-auto mb-4 h-14 w-14 text-gold">${emblem('The Star')}</div>
        <h1 class="font-display text-5xl font-semibold tracking-[-0.01em] text-gold">Arcana</h1>
        <p class="mt-3 font-sans text-lg text-parchment/75">
          A deck of questions for getting to know each other. One phone, passed around the circle.
        </p>
      </header>

      ${v.saved
        ? html`
            <section class="fade-in mb-8 rounded-2xl border border-gold/40 bg-ink-2/70 p-5 text-center">
              <p class="font-sans text-lg">
                A reading is in progress — <span class="text-gold">${v.saved.levelTitle}</span>, ${v.saved.players} players.
              </p>
              <div class="mt-4 flex justify-center gap-3">
                <button class=${btnGold} @click=${() => put({ id: 'game/resume' })}>Resume</button>
                <button class=${btnGhost} @click=${() => put({ id: 'game/discard' })}>Discard</button>
              </div>
            </section>
          `
        : nothing}

      <section class="fade-in">
        <h2 class="mb-1 font-sans text-xs font-bold tracking-[0.22em] text-gold/80 uppercase">Players</h2>
        <p class="mb-4 font-sans text-parchment/60">Enter names in seating order, going clockwise.</p>
        <ol class="space-y-2">
          ${v.names.map(
            (name, index) => html`
              <li class="flex items-center gap-2">
                <span class="w-6 text-right font-display text-lg text-gold/60">${index + 1}</span>
                <input
                  data-name
                  class="min-w-0 flex-1 rounded-xl border border-gold/25 bg-ink-2/80 px-4 py-3 font-sans text-lg font-medium text-parchment placeholder:text-parchment/30 focus:border-gold focus:outline-none"
                  placeholder="Name"
                  autocomplete="off"
                  autocapitalize="words"
                  enterkeyhint=${index === v.names.length - 1 ? 'done' : 'next'}
                  maxlength="20"
                  .value=${name}
                  @input=${(e: InputEvent) => put({ id: 'setup/name', data: { index, value: (e.target as HTMLInputElement).value } })}
                  @keydown=${(e: KeyboardEvent) => e.key === 'Enter' && put({ id: 'setup/enter', data: { index } })}
                />
                <button
                  class="grid h-11 w-11 place-items-center rounded-full text-2xl text-parchment/40 hover:text-wine disabled:invisible"
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
          ? html`<button class="mt-3 ml-8 font-sans text-xs font-bold tracking-[0.22em] text-gold uppercase" @click=${() => put({ id: 'setup/add' })}>
              + Add player
            </button>`
          : nothing}
        ${v.duplicate
          ? html`<p class="mt-3 ml-8 font-sans text-rose-300">Two players are called “${v.duplicate}” — make them unique.</p>`
          : nothing}
      </section>

      <section class="fade-in mt-8">
        <h2 class="mb-3 font-sans text-xs font-bold tracking-[0.22em] text-gold/80 uppercase">Length</h2>
        <div class="grid grid-cols-3 gap-2">
          ${v.lengths.map(
            (l) => html`
              <button
                class="rounded-xl border px-2 py-3 text-center transition ${l.selected
                  ? 'border-gold bg-gold/15 text-gold'
                  : 'border-gold/20 text-parchment/70'}"
                @click=${() => put({ id: 'setup/length', data: { length: l.id } })}
              >
                <div class="font-sans text-sm font-bold">${l.label}</div>
                <div class="font-sans text-sm opacity-70">${l.hint}</div>
              </button>
            `,
          )}
        </div>
        <p class="mt-3 font-sans text-parchment/60">${v.summary}</p>
      </section>

      <div class="mt-auto pt-10">
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
      <header class="mb-4 flex items-center justify-between gap-3">
        <div>
          <div class="font-sans text-xs font-bold tracking-[0.22em] text-gold uppercase">Level ${h.levelNumber} · ${h.theme}</div>
          <div class="mt-1 flex items-center gap-1.5">
            ${h.progress.map(
              (p) => html`<span class="h-1 w-6 rounded-full ${p === 'done' ? 'bg-gold' : p === 'current' ? 'bg-gold/60' : 'bg-parchment/15'}"></span>`,
            )}
            <span class="ml-2 font-sans text-sm text-parchment/60">Round ${h.round} of ${h.rounds}</span>
          </div>
        </div>
        <button
          class="grid h-11 w-11 place-items-center rounded-full border border-gold/30 text-gold"
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
          ${h.confirmingEnd
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
      <div class="flex flex-1 flex-col items-center justify-center gap-6">
        <p class="fade-in font-sans text-parchment/70">${v.lead}</p>
        ${keyed(`level-${v.key}`, staticCard(v.arcanum, html`<p class="font-display text-[1.15em] leading-snug italic">${v.arcanum.blurb}</p>`))}
      </div>
      <button class="${btnGold} mt-6 w-full py-4" @click=${() => put({ id: 'level/begin' })}>Begin ${v.arcanum.theme}</button>
    `
  }

  private renderTurn() {
    const v = this.turn.value
    if (!v) return nothing
    const c = v.card
    const front = c
      ? cardFront(c.arcanum, html`<p class="font-display text-[1.35em] leading-snug font-medium">${parts(c.text, 'text-wine')}</p>`)
      : nothing
    const draw = () => put({ id: 'card/draw' })
    return html`
      ${this.renderTopBar()}
      <div class="text-center">
        <p class="font-display text-[1.65rem] leading-tight font-medium text-parchment">${parts(v.heading, 'text-gold')}</p>
        <div class="mt-2 flex items-center justify-center gap-2 text-sm text-parchment/55">${passTokens(v.passes)} ${v.passesLabel}</div>
      </div>
      <div class="flex flex-1 items-center justify-center py-4">
        ${keyed(
          v.key,
          html`<button
            class="tarot ${c ? 'is-flipped' : ''} ${c?.redraw ? 'deal-flip' : 'deal-in'}"
            aria-label=${c ? c.ariaLabel : 'Draw a card'}
            ?disabled=${!!c}
            @click=${draw}
          >
            <div class="tarot-inner">
              <div class="tarot-face">${cardBack()}<iridescent-shimmer ?active=${!c}></iridescent-shimmer></div>
              <div class="tarot-face tarot-front">${front}</div>
            </div>
          </button>`,
        )}
      </div>
      <div class="min-h-[7.5rem]">
        ${c
          ? html`
              <p class="fade-in mb-4 text-center text-base leading-snug text-parchment/80">${parts(c.instruction, 'text-gold')}</p>
              <div class="fade-in grid grid-cols-[auto_1fr] gap-3">
                <button class="${btnGhost} inline-flex items-center gap-2" ?disabled=${!c.canPass} @click=${() => put({ id: 'card/pass' })}>
                  Pass ${passTokens(v.passes)}
                </button>
                <button class="${btnGold} py-4" @click=${() => put({ id: 'card/done' })}>Done</button>
              </div>
            `
          : html`<div class="pt-[3.25rem]"><button class="${btnGold} w-full py-4" @click=${draw}>Draw a card</button></div>`}
      </div>
    `
  }

  private renderClosing() {
    const arcanum = S.selectClosing()
    return html`
      <div class="flex flex-1 flex-col items-center justify-center gap-6">
        <p class="fade-in font-sans text-parchment/70">The final card</p>
        ${staticCard(arcanum, html`<p class="font-display text-[1.15em] leading-snug italic">${arcanum.blurb}</p>`)}
      </div>
      <button class="${btnGold} mt-6 w-full py-4" @click=${() => put({ id: 'game/finish' })}>Finish the reading</button>
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
      <div class="flex flex-1 flex-col items-center justify-center gap-6">
        <p class="fade-in font-sans text-parchment/70">Thank you for playing</p>
        ${staticCard(v.arcanum, body)}
      </div>
      <div class="mt-6 grid gap-3">
        <button class="${btnGold} py-4" @click=${() => put({ id: 'game/rematch' })}>Play again</button>
        <button class=${btnGhost} @click=${() => put({ id: 'game/new-players' })}>New players</button>
      </div>
    `
  }
}

// ---------- Presentational helpers ----------

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

const cardFront = (arcanum: Arcanum, body: TemplateResult) => html`
  <div class="tarot-frame"></div>
  <div class="relative flex h-full flex-col items-center px-[1.6em] pt-[1.5em] pb-[1.3em] text-center">
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
