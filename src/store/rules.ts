/**
 * Game rules as pure, deterministic functions. Anything random or
 * time-based arrives as an argument (dice rolls, timestamps) — the
 * processes supply those, the reducer calls these.
 */
import { DECK, LEVELS, OBLIQUES, type Prompt, WILDCARDS } from '../deck'
import type { DrawnCard, Game, Length, LogEntry, Suit } from './state'

/** Rounds per level — a round is everyone taking one turn. */
export const ROUNDS: Record<Length, number> = { quick: 1, standard: 2, deep: 3 }
export const PASSES_PER_PLAYER = 3
export const WILDCARD_CHANCE = 1 / 8
export const OBLIQUE_CHANCE = 1 / 12
/** Oblique cards wait until the group has warmed up (The Lovers onward). */
export const OBLIQUE_FROM_LEVEL = 1
export const MAX_PLAYERS = 10
export const MIN_PLAYERS = 2
/** How many taps back the undo button can take you. */
export const UNDO_DEPTH = 12

/** Three uniform rolls in [0, 1): which pile, which prompt, which target. */
export type Rolls = readonly [number, number, number]

export function newGame(names: readonly string[], length: Length, startedAt: number): Game {
  return {
    phase: 'level',
    players: names.map((name) => ({ name, passes: PASSES_PER_PLAYER, askedAbout: 0 })),
    length,
    level: 0,
    turnsInLevel: 0,
    current: 0,
    card: null,
    used: [],
    draws: 0,
    answered: 0,
    passed: 0,
    log: [],
    startedAt,
  }
}

export const roundsInLevel = (g: Game) => ROUNDS[g.length]
export const currentRound = (g: Game) =>
  Math.min(Math.floor(g.turnsInLevel / g.players.length) + 1, roundsInLevel(g))

export const beginLevel = (g: Game): Game => (g.phase === 'level' ? { ...g, phase: 'handoff' } : g)

export const canDraw = (g: Game) => g.phase === 'handoff'
export const canPass = (g: Game) =>
  g.phase === 'card' && g.card !== null && g.players[g.current].passes > 0

/** Put a dealt card on the table. A pass spends the active player's token. */
export function deal(g: Game, card: DrawnCard, used: string[], isPass: boolean): Game {
  const players = isPass
    ? g.players.map((p, i) => (i === g.current ? { ...p, passes: p.passes - 1 } : p))
    : g.players
  return {
    ...g,
    phase: 'card',
    players,
    card,
    used,
    draws: g.draws + 1,
    passed: g.passed + (isPass ? 1 : 0),
    log: [...settle(g.log, 'passed'), { level: g.level, drawer: g.current, card, outcome: null }],
  }
}

/** Record how the card on the table left it. */
function settle(log: readonly LogEntry[], outcome: NonNullable<LogEntry['outcome']>): readonly LogEntry[] {
  const last = log.at(-1)
  return last && last.outcome === null ? [...log.slice(0, -1), { ...last, outcome }] : log
}

/**
 * A seed in [0, 1) for the face-down card's artwork. It holds steady across
 * the draw (so the design doesn't change as the card flips) and is fresh for
 * every turn and every card dealt as a pass.
 */
export function cardSeed(g: Game): number {
  const redraw = g.card?.redraw ? g.card.key : 0
  let h = (g.startedAt ^ (g.level * 0x9e3779b1) ^ (g.turnsInLevel * 0x85ebca6b) ^ (redraw * 0xc2b2ae35)) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0
  h = (h ^ (h >>> 16)) >>> 0
  return h / 0x100000000
}

/** Card answered → next player in seating order, or the next level. */
export function done(g: Game): Game {
  if (g.phase !== 'card' || !g.card) return g
  const target = g.card.target
  const players = g.players.map((p, i) => (i === target ? { ...p, askedAbout: p.askedAbout + 1 } : p))
  const next: Game = {
    ...g,
    players,
    card: null,
    log: settle(g.log, 'answered'),
    answered: g.answered + 1,
    turnsInLevel: g.turnsInLevel + 1,
    current: (g.current + 1) % g.players.length,
  }
  if (next.turnsInLevel >= roundsInLevel(g) * g.players.length) return goDeeper(next)
  return { ...next, phase: 'handoff' }
}

/** Advance to the next level (or the closing card after the last one). */
export function goDeeper(g: Game): Game {
  if (g.phase === 'closing' || g.phase === 'summary') return g
  const level = g.level + 1
  const base = { ...g, card: null, turnsInLevel: 0, log: g.card ? settle(g.log, 'skipped') : g.log }
  if (level >= LEVELS.length) return { ...base, phase: 'closing' }
  return { ...base, level, phase: 'level' }
}

export const finish = (g: Game, endedAt: number): Game =>
  g.phase === 'closing' ? { ...g, phase: 'summary', card: null, endedAt } : g

/** Choose the next card for the active player. Pure: randomness comes in as rolls. */
export function draw(g: Game, rolls: Rolls, exclude?: string): { card: DrawnCard; used: string[] } {
  const suit = suitFor(g, rolls[0])
  const pool = suit === 'wild' ? WILDCARDS : suit === 'oblique' ? OBLIQUES : DECK[g.level]
  const poolIds = new Set(pool.map((p) => p.id))

  let used = g.used
  let available = pool.filter((p) => !used.includes(p.id) && p.id !== exclude)
  if (available.length === 0) {
    // This pool is exhausted — reshuffle it back in.
    used = used.filter((id) => !poolIds.has(id))
    available = pool.filter((p) => p.id !== exclude)
  }

  const prompt = pick(available, rolls[1])
  const target = needsTarget(prompt) ? pickTarget(g, rolls[2]) : null

  return {
    used: [...used, prompt.id],
    card: { key: g.draws + 1, prompt, suit, target, redraw: exclude !== undefined },
  }
}

/**
 * Cards that name someone are about them; cards that ask about "you" are
 * read by the drawer to someone else, who answers. Nobody answers their own draw.
 */
export const needsTarget = (prompt: Prompt) => prompt.kind === 'self' || prompt.text.includes('{name}')

/** Wildcards at any level; obliques only once the group has warmed up. */
function suitFor(g: Game, roll: number): Suit {
  if (roll < WILDCARD_CHANCE) return 'wild'
  if (g.level >= OBLIQUE_FROM_LEVEL && roll < WILDCARD_CHANCE + OBLIQUE_CHANCE) return 'oblique'
  return 'level'
}

/**
 * Fair rotation: whoever has been asked about least (never the active
 * player). Ties go to players whose own turn is still to come this round —
 * they can't be asked on that turn, so they have fewer chances left.
 */
function pickTarget(g: Game, roll: number): number {
  const n = g.players.length
  const turnsLeft = n - 1 - (g.turnsInLevel % n)
  const upcoming = (i: number) => {
    const ahead = (i - g.current + n) % n
    return ahead >= 1 && ahead <= turnsLeft
  }
  const others = g.players.map((_, i) => i).filter((i) => i !== g.current)
  const least = Math.min(...others.map((i) => g.players[i].askedAbout))
  const fewest = others.filter((i) => g.players[i].askedAbout === least)
  const urgent = fewest.filter(upcoming)
  return pick(urgent.length ? urgent : fewest, roll)
}

const pick = <T>(xs: readonly T[], roll: number): T => xs[Math.min(Math.floor(roll * xs.length), xs.length - 1)]

// ---------- Setup ----------

export const cleanNames = (names: readonly string[]) => names.map((n) => n.trim()).filter(Boolean)

export function duplicateName(names: readonly string[]): string | null {
  const seen = new Set<string>()
  for (const n of cleanNames(names)) {
    const k = n.toLowerCase()
    if (seen.has(k)) return n
    seen.add(k)
  }
  return null
}

export const canStart = (names: readonly string[]) =>
  cleanNames(names).length >= MIN_PLAYERS && duplicateName(names) === null
