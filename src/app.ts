import { LitElement, html, nothing, type TemplateResult } from 'lit'
import { keyed } from 'lit/directives/keyed.js'
import { CLOSING, FINALE, LEVELS, WILD, type Arcanum, type Kind } from './deck'
import { cardBack, emblem } from './art'
import * as G from './game'

const STORAGE_KEY = 'arcana:v1'
const MAX_PLAYERS = 10

const LENGTHS: { id: G.Length; label: string; hint: string }[] = [
  { id: 'quick', label: 'Quick', hint: '~20 min' },
  { id: 'standard', label: 'Standard', hint: '~45 min' },
  { id: 'deep', label: 'Deep', hint: '~90 min' },
]

function load(): G.Game | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as G.Game) : null
  } catch {
    return null
  }
}

function save(game: G.Game | null) {
  try {
    if (game) localStorage.setItem(STORAGE_KEY, JSON.stringify(game))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage unavailable (private mode etc.) — the game still works, it just won't resume.
  }
}

const btn =
  'rounded-full px-6 py-3 font-display text-sm tracking-[0.18em] uppercase transition active:scale-[0.97] disabled:opacity-35 disabled:active:scale-100'
const btnGold = `${btn} bg-gold text-ink shadow-[0_0_2rem_-0.5rem_var(--color-gold)] hover:brightness-110`
const btnGhost = `${btn} border border-gold/50 text-gold hover:bg-gold/10`

export class ArcanaApp extends LitElement {
  static properties = {
    game: { state: true },
    saved: { state: true },
    names: { state: true },
    length: { state: true },
    menuOpen: { state: true },
  }

  declare game: G.Game | null
  declare saved: G.Game | null
  declare names: string[]
  declare length: G.Length
  declare menuOpen: boolean

  constructor() {
    super()
    const saved = load()
    this.game = null
    this.saved = saved && saved.phase !== 'summary' ? saved : null
    this.names = saved ? saved.players.map((p) => p.name) : ['', '', '']
    this.length = saved?.length ?? 'standard'
    this.menuOpen = false
  }

  // Light DOM so global Tailwind styles apply.
  createRenderRoot() {
    return this
  }

  private set(game: G.Game | null) {
    this.game = game
    this.menuOpen = false
    save(game)
    window.scrollTo({ top: 0 })
  }

  render() {
    const g = this.game
    return html`
      <main class="mx-auto flex min-h-dvh max-w-md flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        ${g ? this.renderGame(g) : this.renderSetup()}
      </main>
    `
  }

  // ---------- Setup ----------

  private get cleanNames() {
    return this.names.map((n) => n.trim()).filter(Boolean)
  }

  private get duplicate() {
    const seen = new Set<string>()
    return this.cleanNames.find((n) => {
      const k = n.toLowerCase()
      if (seen.has(k)) return true
      seen.add(k)
      return false
    })
  }

  private setName(i: number, value: string) {
    this.names = this.names.map((n, j) => (j === i ? value : n))
  }

  private addPlayer() {
    if (this.names.length >= MAX_PLAYERS) return
    this.names = [...this.names, '']
    this.updateComplete.then(() => {
      const inputs = this.querySelectorAll<HTMLInputElement>('input[data-name]')
      inputs[inputs.length - 1]?.focus()
    })
  }

  private removePlayer(i: number) {
    this.names = this.names.filter((_, j) => j !== i)
  }

  private start() {
    if (this.cleanNames.length < 2 || this.duplicate) return
    this.saved = null
    this.set(G.newGame(this.cleanNames, this.length))
  }

  private renderSetup() {
    const canStart = this.cleanNames.length >= 2 && !this.duplicate
    return html`
      <header class="fade-in mt-6 mb-8 text-center">
        <div class="mx-auto mb-4 h-14 w-14 text-gold">${emblem('The Star')}</div>
        <h1 class="font-display text-4xl tracking-[0.2em] text-gold">ARCANA</h1>
        <p class="mt-3 font-serif text-lg text-parchment/75 italic">
          A deck of questions for getting to know each other. One phone, passed around the circle.
        </p>
      </header>

      ${this.saved
        ? html`
            <section class="fade-in mb-8 rounded-2xl border border-gold/40 bg-ink-2/70 p-5 text-center">
              <p class="font-serif text-lg">
                A reading is in progress —
                <span class="text-gold">${LEVELS[Math.min(this.saved.level, 2)].title}</span>,
                ${this.saved.players.length} players.
              </p>
              <div class="mt-4 flex justify-center gap-3">
                <button class=${btnGold} @click=${() => this.set(this.saved)}>Resume</button>
                <button class=${btnGhost} @click=${() => { this.saved = null; save(null) }}>Discard</button>
              </div>
            </section>
          `
        : nothing}

      <section class="fade-in">
        <h2 class="mb-1 font-display text-xs tracking-[0.25em] text-gold/80 uppercase">Players</h2>
        <p class="mb-4 font-serif text-parchment/60 italic">Enter names in seating order, going clockwise.</p>
        <ol class="space-y-2">
          ${this.names.map(
            (name, i) => html`
              <li class="flex items-center gap-2">
                <span class="w-6 text-right font-display text-sm text-gold/60">${i + 1}</span>
                <input
                  data-name
                  class="min-w-0 flex-1 rounded-xl border border-gold/25 bg-ink-2/80 px-4 py-3 font-serif text-xl text-parchment placeholder:text-parchment/30 focus:border-gold focus:outline-none"
                  placeholder="Name"
                  autocomplete="off"
                  autocapitalize="words"
                  enterkeyhint=${i === this.names.length - 1 ? 'done' : 'next'}
                  maxlength="20"
                  .value=${name}
                  @input=${(e: InputEvent) => this.setName(i, (e.target as HTMLInputElement).value)}
                  @keydown=${(e: KeyboardEvent) => {
                    if (e.key !== 'Enter') return
                    const inputs = this.querySelectorAll<HTMLInputElement>('input[data-name]')
                    if (i < inputs.length - 1) inputs[i + 1].focus()
                    else if (name.trim()) this.addPlayer()
                  }}
                />
                <button
                  class="grid h-11 w-11 place-items-center rounded-full text-2xl text-parchment/40 hover:text-wine disabled:invisible"
                  aria-label="Remove player"
                  ?disabled=${this.names.length <= 2}
                  @click=${() => this.removePlayer(i)}
                >
                  ×
                </button>
              </li>
            `,
          )}
        </ol>
        ${this.names.length < MAX_PLAYERS
          ? html`<button class="mt-3 ml-8 font-display text-xs tracking-[0.2em] text-gold uppercase" @click=${this.addPlayer}>
              + Add player
            </button>`
          : nothing}
        ${this.duplicate
          ? html`<p class="mt-3 ml-8 font-serif text-rose-300 italic">Two players are called “${this.duplicate}” — make them unique.</p>`
          : nothing}
      </section>

      <section class="fade-in mt-8">
        <h2 class="mb-3 font-display text-xs tracking-[0.25em] text-gold/80 uppercase">Length</h2>
        <div class="grid grid-cols-3 gap-2">
          ${LENGTHS.map(
            (l) => html`
              <button
                class="rounded-xl border px-2 py-3 text-center transition ${this.length === l.id
                  ? 'border-gold bg-gold/15 text-gold'
                  : 'border-gold/20 text-parchment/70'}"
                @click=${() => (this.length = l.id)}
              >
                <div class="font-display text-sm tracking-widest">${l.label}</div>
                <div class="font-serif text-sm italic opacity-70">${l.hint}</div>
              </button>
            `,
          )}
        </div>
        <p class="mt-3 font-serif text-parchment/60 italic">
          ${G.ROUNDS[this.length]} ${G.ROUNDS[this.length] === 1 ? 'round' : 'rounds'} per level · three levels ·
          ${G.PASSES_PER_PLAYER} passes each
        </p>
      </section>

      <div class="mt-auto pt-10">
        <button class="${btnGold} w-full py-4" ?disabled=${!canStart} @click=${this.start}>Begin the reading</button>
      </div>
    `
  }

  // ---------- In game ----------

  private renderGame(g: G.Game) {
    switch (g.phase) {
      case 'level':
        return this.renderLevelIntro(g)
      case 'handoff':
        return this.renderHandoff(g)
      case 'card':
        return this.renderCard(g)
      case 'closing':
        return this.renderClosing(g)
      case 'summary':
        return this.renderSummary(g)
    }
  }

  private renderTopBar(g: G.Game) {
    const lvl = LEVELS[g.level]
    const rounds = G.roundsInLevel(g)
    const round = Math.min(G.currentRound(g), rounds)
    return html`
      <header class="mb-4 flex items-center justify-between gap-3">
        <div>
          <div class="font-display text-xs tracking-[0.25em] text-gold uppercase">Level ${g.level + 1} · ${lvl.theme}</div>
          <div class="mt-1 flex items-center gap-1.5">
            ${LEVELS.map(
              (_, i) => html`<span class="h-1 w-6 rounded-full ${i < g.level ? 'bg-gold' : i === g.level ? 'bg-gold/60' : 'bg-parchment/15'}"></span>`,
            )}
            <span class="ml-2 font-serif text-sm text-parchment/60 italic">Round ${round} of ${rounds}</span>
          </div>
        </div>
        <button
          class="grid h-11 w-11 place-items-center rounded-full border border-gold/30 text-gold"
          aria-label="Menu"
          @click=${() => (this.menuOpen = true)}
        >
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="currentColor"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
        </button>
      </header>
      ${this.menuOpen ? this.renderMenu(g) : nothing}
    `
  }

  private renderMenu(g: G.Game) {
    const last = g.level >= LEVELS.length - 1
    return html`
      <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" @click=${() => (this.menuOpen = false)}>
        <div
          class="fade-in w-full max-w-md rounded-t-3xl border-t border-gold/40 bg-ink-2 px-6 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
          @click=${(e: Event) => e.stopPropagation()}
        >
          <h3 class="mb-3 font-display text-xs tracking-[0.25em] text-gold/80 uppercase">The circle</h3>
          <ul class="mb-6 space-y-1.5">
            ${g.players.map(
              (p, i) => html`
                <li class="flex items-center justify-between font-serif text-lg ${i === g.current ? 'text-gold' : ''}">
                  <span>${p.name}${i === g.current ? html` <span class="text-sm italic opacity-70">— holding the phone</span>` : nothing}</span>
                  ${this.passTokens(p.passes)}
                </li>
              `,
            )}
          </ul>
          <div class="grid gap-3">
            <button class=${btnGold} @click=${() => this.set(G.goDeeper(g))}>
              ${last ? 'Go to the closing card' : `Go deeper → ${LEVELS[g.level + 1].theme}`}
            </button>
            <button
              class=${btnGhost}
              @click=${() => {
                if (confirm('End this reading? Progress will be lost.')) {
                  this.saved = null
                  this.set(null)
                }
              }}
            >
              End game
            </button>
            <button class="py-2 font-serif text-parchment/60 italic" @click=${() => (this.menuOpen = false)}>Close</button>
          </div>
        </div>
      </div>
    `
  }

  private passTokens(n: number) {
    return html`<span class="flex gap-1" aria-label="${n} passes left">
      ${Array.from({ length: G.PASSES_PER_PLAYER }, (_, i) =>
        html`<span class="h-2.5 w-2.5 rotate-45 border border-gold ${i < n ? 'bg-gold' : 'opacity-30'}"></span>`,
      )}
    </span>`
  }

  private renderLevelIntro(g: G.Game) {
    const lvl = LEVELS[g.level]
    return html`
      ${this.renderTopBar(g)}
      <div class="flex flex-1 flex-col items-center justify-center gap-6">
        <p class="fade-in font-serif text-parchment/70 italic">${g.level === 0 ? 'The reading begins with' : 'Going deeper —'}</p>
        ${keyed(`level-${g.level}`, this.staticCard(lvl, html`<p class="font-serif text-[1.15em] leading-snug italic">${lvl.blurb}</p>`))}
      </div>
      <button class="${btnGold} mt-6 w-full py-4" @click=${() => this.set(G.beginLevel(g))}>
        Begin ${lvl.theme}
      </button>
    `
  }

  private renderHandoff(g: G.Game) {
    const p = g.players[g.current]
    return html`
      ${this.renderTopBar(g)}
      <div class="fade-in flex flex-1 flex-col items-center justify-center text-center">
        <p class="font-display text-xs tracking-[0.3em] text-gold/70 uppercase">Pass the phone to</p>
        <h2 class="mt-4 font-display text-5xl break-words text-parchment">${p.name}</h2>
        <div class="mt-6 flex items-center gap-3 font-serif text-parchment/60 italic">
          ${this.passTokens(p.passes)} ${p.passes} ${p.passes === 1 ? 'pass' : 'passes'} left
        </div>
        <div class="shimmer mt-14 h-16 w-16 text-gold/70">${emblem(LEVELS[g.level].title)}</div>
      </div>
      <button class="${btnGold} w-full py-4" @click=${() => this.set(G.ready(g))}>I'm holding it — draw</button>
    `
  }

  private renderCard(g: G.Game) {
    const card = g.card!
    const player = g.players[g.current]
    const target = card.target !== null ? g.players[card.target].name : null
    const arcanum = card.wild ? WILD : LEVELS[g.level]

    const front = this.cardFront(
      arcanum,
      html`<p class="font-serif text-[1.3em] leading-snug font-medium">${fill(card.prompt.text, target)}</p>`,
    )

    return html`
      ${this.renderTopBar(g)}
      <p class="mb-3 text-center font-serif text-lg text-parchment/70 italic">
        <span class="text-gold not-italic">${player.name}</span> draws${card.wild ? html` <span class="text-gold">a wildcard</span>` : nothing}
      </p>
      <div class="flex flex-1 items-center justify-center">
        ${keyed(
          card.key,
          html`<button
            class="tarot deal-in ${card.revealed ? 'is-flipped' : ''}"
            aria-label=${card.revealed ? card.prompt.text : 'Reveal card'}
            @click=${() => !card.revealed && this.set(G.reveal(g))}
          >
            <div class="tarot-inner">
              <div class="tarot-face">${cardBack()}</div>
              <div class="tarot-face tarot-front">${front}</div>
            </div>
          </button>`,
        )}
      </div>
      <div class="mt-5 min-h-[7.5rem]">
        ${card.revealed
          ? html`
              <p class="fade-in mb-4 text-center font-serif text-lg text-parchment/85 italic">
                ${instruction(card.prompt.kind, player.name, target)}
              </p>
              <div class="fade-in grid grid-cols-[auto_1fr] gap-3">
                <button class="${btnGhost} inline-flex items-center gap-2" ?disabled=${player.passes <= 0} @click=${() => this.set(G.pass(g))}>
                  Pass ${this.passTokens(player.passes)}
                </button>
                <button class="${btnGold} py-4" @click=${() => this.set(G.done(g))}>Done</button>
              </div>
            `
          : html`<p class="shimmer pt-6 text-center font-display text-xs tracking-[0.3em] text-gold uppercase">Tap the card to reveal</p>`}
      </div>
    `
  }

  private renderClosing(g: G.Game) {
    return html`
      <div class="flex flex-1 flex-col items-center justify-center gap-6">
        <p class="fade-in font-serif text-parchment/70 italic">The final card</p>
        ${this.staticCard(CLOSING, html`<p class="font-serif text-[1.15em] leading-snug">${CLOSING.blurb}</p>`)}
      </div>
      <button class="${btnGold} mt-6 w-full py-4" @click=${() => this.set(G.finish(g))}>Finish the reading</button>
    `
  }

  private renderSummary(g: G.Game) {
    const minutes = Math.max(1, Math.round(((g.endedAt ?? Date.now()) - g.startedAt) / 60000))
    const body = html`
      <div class="space-y-[0.6em] font-serif text-[1.1em] leading-snug">
        <p><strong class="font-display text-[1.6em] text-wine">${g.answered}</strong><br />cards answered together</p>
        <p class="italic opacity-80">${g.passed} ${g.passed === 1 ? 'pass' : 'passes'} · ${minutes} min · ${g.players.length} players</p>
      </div>
    `
    return html`
      <div class="flex flex-1 flex-col items-center justify-center gap-6">
        <p class="fade-in font-serif text-parchment/70 italic">Thank you for playing</p>
        ${this.staticCard(FINALE, body)}
      </div>
      <div class="mt-6 grid gap-3">
        <button class="${btnGold} py-4" @click=${() => this.set(G.rematch(g))}>Play again</button>
        <button class=${btnGhost} @click=${() => this.set(null)}>New players</button>
      </div>
    `
  }

  // ---------- Card faces ----------

  private staticCard(arcanum: Arcanum, body: TemplateResult) {
    return html`
      <div class="tarot is-static deal-in">
        <div class="tarot-inner">
          <div class="tarot-face tarot-front">${this.cardFront(arcanum, body)}</div>
        </div>
      </div>
    `
  }

  private cardFront(arcanum: Arcanum, body: TemplateResult) {
    return html`
      <div class="tarot-frame"></div>
      <div class="relative flex h-full flex-col items-center px-[1.6em] pt-[1.5em] pb-[1.3em] text-center">
        <div class="font-display text-[1.1em] tracking-[0.2em] text-gold-dim">${arcanum.numeral}</div>
        <div class="mt-[0.5em] h-[3.2em] w-[3.2em] text-gold-dim">${emblem(arcanum.title)}</div>
        <div class="flex flex-1 items-center justify-center py-[0.8em]">${body}</div>
        <div class="w-full border-t border-gold-dim/50 pt-[0.6em]">
          <div class="font-display text-[1.05em] font-bold tracking-[0.18em] uppercase">${arcanum.title}</div>
          <div class="font-serif text-[0.95em] italic opacity-70">${arcanum.theme}</div>
        </div>
      </div>
    `
  }
}

/** Replace `{name}` with the target, highlighted. */
function fill(text: string, target: string | null) {
  const parts = text.split('{name}')
  return parts.map((part, i) =>
    i === 0 ? part : html`<span class="font-semibold text-wine">${target ?? 'someone'}</span>${part}`,
  )
}

function instruction(kind: Kind, player: string, target: string | null) {
  switch (kind) {
    case 'guess':
      return html`${player} guesses — then <span class="text-gold not-italic">${target}</span> reveals how close they got.`
    case 'self':
      return html`${player} answers.`
    case 'ask':
      return html`${player}, this one is for <span class="text-gold not-italic">${target}</span>.`
    case 'group':
      return html`Everyone plays.`
  }
}

customElements.define('arcana-app', ArcanaApp)
