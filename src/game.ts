import { DECK, LEVELS, WILDCARDS, type Prompt } from './deck'

export type Length = 'quick' | 'standard' | 'deep'

/** Rounds per level — a round is everyone taking one turn. */
export const ROUNDS: Record<Length, number> = { quick: 1, standard: 2, deep: 3 }
export const PASSES_PER_PLAYER = 2
export const WILDCARD_CHANCE = 1 / 8

export type Phase = 'level' | 'handoff' | 'card' | 'closing' | 'summary'

export interface Player {
  name: string
  passes: number
  askedAbout: number
}

export interface DrawnCard {
  /** Unique per draw, so a redraw renders as a fresh card. */
  key: number
  prompt: Prompt
  wild: boolean
  target: number | null
  revealed: boolean
}

export interface Game {
  phase: Phase
  players: Player[]
  length: Length
  level: number
  turnsInLevel: number
  current: number
  card: DrawnCard | null
  used: string[]
  draws: number
  answered: number
  passed: number
  startedAt: number
  endedAt?: number
}

export function newGame(names: string[], length: Length): Game {
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
    startedAt: Date.now(),
  }
}

export const roundsInLevel = (g: Game) => ROUNDS[g.length]
export const currentRound = (g: Game) => Math.floor(g.turnsInLevel / g.players.length) + 1

/** Level intro → first handoff. */
export const beginLevel = (g: Game): Game => ({ ...g, phase: 'handoff' })

/** Handoff → the active player draws a face-down card. */
export const ready = (g: Game): Game => draw({ ...g, phase: 'card' })

export const reveal = (g: Game): Game =>
  g.card ? { ...g, card: { ...g.card, revealed: true } } : g

/** Spend a pass token and draw a replacement card for the same player. */
export function pass(g: Game): Game {
  const player = g.players[g.current]
  if (!g.card || player.passes <= 0) return g
  const players = g.players.map((p, i) => (i === g.current ? { ...p, passes: p.passes - 1 } : p))
  return draw({ ...g, players, passed: g.passed + 1 }, g.card.prompt.id)
}

/** Card answered → next player in seating order, or the next level. */
export function done(g: Game): Game {
  if (!g.card) return g
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
  const level = g.level + 1
  const base = { ...g, card: null, turnsInLevel: 0 }
  if (level >= LEVELS.length) return { ...base, phase: 'closing' }
  return { ...base, level, phase: 'level' }
}

export const finish = (g: Game): Game => ({ ...g, phase: 'summary', card: null, endedAt: Date.now() })

export const rematch = (g: Game): Game =>
  newGame(
    g.players.map((p) => p.name),
    g.length,
  )

function draw(g: Game, exclude?: string): Game {
  const wild = Math.random() < WILDCARD_CHANCE
  const pool = wild ? WILDCARDS : DECK[g.level]
  const poolIds = new Set(pool.map((p) => p.id))

  let used = g.used
  let available = pool.filter((p) => !used.includes(p.id) && p.id !== exclude)
  if (available.length === 0) {
    // This pool is exhausted — reshuffle it back in.
    used = used.filter((id) => !poolIds.has(id))
    available = pool.filter((p) => p.id !== exclude)
  }

  const prompt = pick(available)
  const target = prompt.text.includes('{name}') ? pickTarget(g.players, g.current) : null

  return {
    ...g,
    used: [...used, prompt.id],
    draws: g.draws + 1,
    card: { key: g.draws + 1, prompt, wild, target, revealed: false },
  }
}

/** Fair rotation: whoever has been asked about least (never the active player). */
function pickTarget(players: Player[], current: number): number {
  const others = players.map((_, i) => i).filter((i) => i !== current)
  const least = Math.min(...others.map((i) => players[i].askedAbout))
  return pick(others.filter((i) => players[i].askedAbout === least))
}

const pick = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)]
