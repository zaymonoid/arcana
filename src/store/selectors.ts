/**
 * View models. Components read these through `fromStore` and render them
 * as-is — every derivation lives here, not in the view.
 */
import { CLOSING, FINALE, LEVELS, OBLIQUE, WILD, type Arcanum, type Kind } from '../deck'
import * as R from './rules'
import type { Length, State, Suit } from './state'

export type Screen = 'boot' | 'setup' | 'level' | 'turn' | 'closing' | 'summary'

export function selectScreen(s: State): Screen {
  if (!s.booted) return 'boot'
  const phase = s.game?.phase ?? 'setup'
  // Waiting to draw and the drawn card are one screen: the card flips in place.
  return phase === 'handoff' || phase === 'card' ? 'turn' : phase
}

export const MAX_PASSES = R.PASSES_PER_PLAYER

const LENGTHS: { id: Length; label: string; hint: string }[] = [
  { id: 'quick', label: 'Quick', hint: '~20 min' },
  { id: 'standard', label: 'Standard', hint: '~45 min' },
  { id: 'deep', label: 'Deep', hint: '~90 min' },
]

const SEAT_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']

export const selectSetup = (s: State) => {
  const { names, length, focus } = s.setup
  const rounds = R.ROUNDS[length]
  return {
    names,
    focus,
    /** The circle as it's being filled in, clockwise from whoever draws first. */
    seats: names.map((n, i) => ({
      numeral: SEAT_NUMERALS[i],
      initial: n.trim().charAt(0).toUpperCase(),
      filled: n.trim() !== '',
      first: i === 0,
    })),
    canAdd: names.length < R.MAX_PLAYERS,
    canRemove: names.length > R.MIN_PLAYERS,
    duplicate: R.duplicateName(names),
    canStart: R.canStart(names),
    lengths: LENGTHS.map((l) => ({ ...l, rounds: R.ROUNDS[l.id], selected: l.id === length })),
    summary: `${rounds} ${rounds === 1 ? 'round' : 'rounds'} per level · three levels`,
    saved: s.saved
      ? { levelTitle: LEVELS[Math.min(s.saved.level, LEVELS.length - 1)].title, players: s.saved.players.length }
      : null,
  }
}

export const selectHud = (s: State) => {
  const g = s.game
  if (!g) return null
  const last = g.level >= LEVELS.length - 1
  return {
    levelNumber: g.level + 1,
    theme: LEVELS[Math.min(g.level, LEVELS.length - 1)].theme,
    progress: LEVELS.map((_, i) => (i < g.level ? 'done' : i === g.level ? 'current' : 'todo')),
    round: R.currentRound(g),
    rounds: R.roundsInLevel(g),
    menuOpen: s.ui.menuOpen,
    confirmingEnd: s.ui.confirmingEnd,
    dump: s.ui.dump && {
      text: s.ui.dump.text,
      copyLabel: s.ui.dump.copied === null ? 'Copy' : s.ui.dump.copied ? 'Copied ✓' : 'Copy failed — select the text',
    },
    canUndo: s.history.length > 0,
    players: g.players.map((p, i) => ({ name: p.name, passes: p.passes, current: i === g.current })),
    deeperLabel: last ? 'Go to the closing card' : `Go deeper → ${LEVELS[g.level + 1].theme}`,
  }
}

export const selectLevelIntro = (s: State) => {
  const g = s.game
  if (!g) return null
  const arcanum = LEVELS[g.level]
  return {
    key: g.level,
    arcanum,
    lead: g.level === 0 ? 'The reading begins with' : 'Going deeper —',
    hint: `Tap the card to begin ${arcanum.theme}`,
  }
}

/** A run of card text: plain words, or a highlighted player name. */
export type TextPart = { text: string; name: boolean }

export const selectTurn = (s: State) => {
  const g = s.game
  if (!g) return null
  const player = g.players[g.current]
  const card = g.card
  const name = { text: player.name, name: true }
  const base = {
    /** Stable across the draw, so the face-down card flips in place; a pass deals a new one. */
    key: card?.redraw ? `redraw-${card.key}` : `turn-${g.level}-${g.turnsInLevel}`,
    player: player.name,
    passes: player.passes,
    /** The level's design for the face-down card back. */
    sigil: LEVELS[g.level].sigil,
    /** Varies that design's details from card to card. */
    seed: R.cardSeed(g),
  }
  if (!card) {
    return {
      ...base,
      heading: [{ text: 'It’s ', name: false }, name, { text: '’s turn to draw', name: false }] as TextPart[],
      hint: 'Tap the card to draw',
      card: null,
    }
  }
  const target = card.target !== null ? g.players[card.target].name : null
  return {
    ...base,
    heading: [{ text: DRAWS[card.suit], name: false }, name] as TextPart[],
    hint: null,
    card: {
      /** Changes with every deal, so the view can tell a fresh card from a re-render. */
      key: card.key,
      arcanum: card.suit === 'wild' ? WILD : card.suit === 'oblique' ? OBLIQUE : LEVELS[g.level],
      suit: card.suit,
      redraw: card.redraw,
      canPass: R.canPass(g),
      ariaLabel: `${card.prompt.text.replaceAll('{name}', target ?? 'someone')} Tap when done.`,
      text: fill(card.prompt.text, target),
      instruction: instruction(card.prompt.kind, target),
    },
  }
}

export const selectClosing = (): Arcanum => CLOSING

export const selectSummary = (s: State) => {
  const g = s.game
  if (!g) return null
  const minutes = Math.max(1, Math.round(((g.endedAt ?? g.startedAt) - g.startedAt) / 60000))
  return {
    arcanum: FINALE,
    answered: g.answered,
    details: `${g.passed} ${g.passed === 1 ? 'pass' : 'passes'} · ${minutes} min · ${g.players.length} players`,
  }
}

/** Everything about the game for a bug report: players, every card in draw order, and the raw state. */
export const selectDebugDump = (s: State) => {
  const g = s.game ?? s.saved
  const name = (i: number | null) => (g && i !== null ? g.players[i]?.name ?? null : null)
  return {
    game: g && {
      phase: g.phase,
      length: g.length,
      level: LEVELS[g.level]?.theme ?? 'Closing',
      round: `${R.currentRound(g)} of ${R.roundsInLevel(g)}`,
      turn: name(g.current),
      startedAt: new Date(g.startedAt).toISOString(),
      endedAt: g.endedAt ? new Date(g.endedAt).toISOString() : null,
      counts: { draws: g.draws, answered: g.answered, passed: g.passed },
      players: g.players.map((p, i) => ({ seat: i + 1, name: p.name, passesLeft: p.passes, askedAbout: p.askedAbout })),
      cards: g.log.map((e, i) => ({
        n: i + 1,
        level: LEVELS[e.level]?.theme,
        drawer: name(e.drawer),
        target: name(e.card.target),
        suit: e.card.suit,
        kind: e.card.prompt.kind,
        id: e.card.prompt.id,
        text: e.card.prompt.text.replaceAll('{name}', name(e.card.target) ?? 'someone'),
        redraw: e.card.redraw,
        outcome: e.outcome ?? 'on the table',
      })),
    },
    resumable: s.game === null && s.saved !== null,
    undoDepth: s.history.length,
    raw: { booted: s.booted, setup: s.setup, game: s.game, saved: s.saved },
  }
}

/** The face-up heading speaks to whoever is holding the phone. */
const DRAWS: Record<Suit, string> = {
  level: 'Your card, ',
  wild: 'Your wildcard, ',
  oblique: 'Your oblique card, ',
}

function fill(text: string, target: string | null): TextPart[] {
  const parts: TextPart[] = []
  text.split('{name}').forEach((chunk, i) => {
    if (i > 0) parts.push({ text: target ?? 'someone', name: true })
    if (chunk) parts.push({ text: chunk, name: false })
  })
  return parts
}

/** Addressed to the drawer, who is holding the phone: "you". */
function instruction(kind: Kind, target: string | null): TextPart[] {
  const t = { text: target ?? 'someone', name: true }
  switch (kind) {
    case 'guess':
      return [{ text: 'You guess — then ', name: false }, t, { text: ' reveals how close you got.', name: false }]
    case 'self':
      return [{ text: 'Read it to ', name: false }, t, { text: ' — they answer.', name: false }]
    case 'ask':
      return [{ text: 'This one is between you and ', name: false }, t, { text: '.', name: false }]
    case 'group':
      return [{ text: 'Everyone plays.', name: false }]
  }
}
