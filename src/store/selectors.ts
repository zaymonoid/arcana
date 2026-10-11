/**
 * View models. Components read these through `fromStore` and render them
 * as-is — every derivation lives here, not in the view.
 */
import { CLOSING, FINALE, LEVELS, WILD, type Arcanum, type Kind } from '../deck'
import * as R from './rules'
import type { Length, State } from './state'

export type Screen = 'boot' | 'setup' | 'level' | 'handoff' | 'card' | 'closing' | 'summary'

export const selectScreen = (s: State): Screen => (!s.booted ? 'boot' : (s.game?.phase ?? 'setup'))

export const MAX_PASSES = R.PASSES_PER_PLAYER

const LENGTHS: { id: Length; label: string; hint: string }[] = [
  { id: 'quick', label: 'Quick', hint: '~20 min' },
  { id: 'standard', label: 'Standard', hint: '~45 min' },
  { id: 'deep', label: 'Deep', hint: '~90 min' },
]

export const selectSetup = (s: State) => {
  const { names, length, focus } = s.setup
  const rounds = R.ROUNDS[length]
  return {
    names,
    focus,
    canAdd: names.length < R.MAX_PLAYERS,
    canRemove: names.length > R.MIN_PLAYERS,
    duplicate: R.duplicateName(names),
    canStart: R.canStart(names),
    lengths: LENGTHS.map((l) => ({ ...l, selected: l.id === length })),
    summary: `${rounds} ${rounds === 1 ? 'round' : 'rounds'} per level · three levels · ${R.PASSES_PER_PLAYER} passes each`,
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
    players: g.players.map((p, i) => ({ name: p.name, passes: p.passes, current: i === g.current })),
    deeperLabel: last ? 'Go to the closing card' : `Go deeper → ${LEVELS[g.level + 1].theme}`,
  }
}

export const selectLevelIntro = (s: State) => {
  const g = s.game
  if (!g) return null
  const arcanum = LEVELS[g.level]
  return { key: g.level, arcanum, lead: g.level === 0 ? 'The reading begins with' : 'Going deeper —' }
}

export const selectHandoff = (s: State) => {
  const g = s.game
  if (!g) return null
  const p = g.players[g.current]
  return {
    name: p.name,
    passes: p.passes,
    passesLabel: `${p.passes} ${p.passes === 1 ? 'pass' : 'passes'} left`,
  }
}

/** A run of card text: plain words, or a highlighted player name. */
export type TextPart = { text: string; name: boolean }

export const selectCard = (s: State) => {
  const g = s.game
  const card = g?.card
  if (!g || !card) return null
  const player = g.players[g.current]
  const target = card.target !== null ? g.players[card.target].name : null
  const arcanum: Arcanum = card.wild ? WILD : LEVELS[g.level]
  return {
    key: card.key,
    arcanum,
    wild: card.wild,
    revealed: card.revealed,
    /** Face-down cards shimmer until they're turned over. */
    shimmer: !card.revealed,
    player: player.name,
    target,
    passes: player.passes,
    canPass: R.canPass(g),
    ariaLabel: card.revealed ? card.prompt.text.replaceAll('{name}', target ?? 'someone') : 'Reveal card',
    text: fill(card.prompt.text, target),
    instruction: instruction(card.prompt.kind, player.name, target),
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

function fill(text: string, target: string | null): TextPart[] {
  const parts: TextPart[] = []
  text.split('{name}').forEach((chunk, i) => {
    if (i > 0) parts.push({ text: target ?? 'someone', name: true })
    if (chunk) parts.push({ text: chunk, name: false })
  })
  return parts
}

function instruction(kind: Kind, player: string, target: string | null): TextPart[] {
  const t = { text: target ?? 'someone', name: true }
  switch (kind) {
    case 'guess':
      return [{ text: `${player} guesses — then `, name: false }, t, { text: ' reveals how close they got.', name: false }]
    case 'self':
      return [{ text: `${player} answers.`, name: false }]
    case 'ask':
      return [{ text: `${player}, this one is for `, name: false }, t, { text: '.', name: false }]
    case 'group':
      return [{ text: 'Everyone plays.', name: false }]
  }
}
