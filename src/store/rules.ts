/**
 * Game rules as pure, deterministic functions. Anything random or
 * time-based arrives as an argument (dice rolls, timestamps) — the
 * processes supply those, the reducer calls these.
 */
import { DECK, LEVELS, WILDCARDS } from '../deck'
import type { DrawnCard, Game, Length } from './state'

/** Rounds per level — a round is everyone taking one turn. */
export const ROUNDS: Record<Length, number> = { quick: 1, standard: 2, deep: 3 }
export const PASSES_PER_PLAYER = 2
export const WILDCARD_CHANCE = 1 / 8
export const MAX_PLAYERS = 10
export const MIN_PLAYERS = 2

/** Three uniform rolls in [0, 1): wildcard?, which prompt, which target. */
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
  }
}

export const reveal = (g: Game): Game =>
  g.phase === 'card' && g.card && !g.card.revealed ? { ...g, card: { ...g.card, revealed: true } } : g

/** Card answered → next player in seating order, or the next level. */
export function done(g: Game): Game {
  if (g.phase !== 'card' || !g.card?.revealed) return g
  const target = g.card.target
  const players = g.players.map((p, i) => (i === target ? { ...p, askedAbout: p.askedAbout + 1 } : p))
  const next: Game = {
    ...g,
    players,
    card: null,
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
  const base = { ...g, card: null, turnsInLevel: 0 }
  if (level >= LEVELS.length) return { ...base, phase: 'closing' }
  return { ...base, level, phase: 'level' }
}

export const finish = (g: Game, endedAt: number): Game =>
  g.phase === 'closing' ? { ...g, phase: 'summary', card: null, endedAt } : g

/** Choose the next card for the active player. Pure: randomness comes in as rolls. */
export function draw(g: Game, rolls: Rolls, exclude?: string): { card: DrawnCard; used: string[] } {
  const wild = rolls[0] < WILDCARD_CHANCE
  const pool = wild ? WILDCARDS : DECK[g.level]
  const poolIds = new Set(pool.map((p) => p.id))

  let used = g.used
  let available = pool.filter((p) => !used.includes(p.id) && p.id !== exclude)
  if (available.length === 0) {
    // This pool is exhausted — reshuffle it back in.
    used = used.filter((id) => !poolIds.has(id))
    available = pool.filter((p) => p.id !== exclude)
  }

  const prompt = pick(available, rolls[1])
  const target = prompt.text.includes('{name}') ? pickTarget(g, rolls[2]) : null

  return {
    used: [...used, prompt.id],
    card: { key: g.draws + 1, prompt, wild, target, revealed: false },
  }
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
