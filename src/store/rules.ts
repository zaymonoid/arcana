/**
 * Game rules as pure, deterministic functions. Anything random or
 * time-based arrives as an argument (dice rolls, timestamps) — the
 * processes supply those, the reducer calls these.
 */
import { DECK, LEVELS, OBLIQUES, type Prompt, type Subject, WILDCARDS } from '../deck'
import type { DrawnCard, Game, Length, LogEntry, Piles, Suit } from './state'

/** Rounds per level — a round is everyone taking one turn. */
export const ROUNDS: Record<Length, number> = { quick: 1, standard: 2, deep: 3 }
export const PASSES_PER_PLAYER = 3
export const WILDCARD_CHANCE = 1 / 8
export const OBLIQUE_CHANCE = 1 / 12
/** Wildcards are light and playful, so they stay in the first level (The Fool). */
export const WILDCARD_UNTIL_LEVEL = 0
/** Oblique cards wait until the group has warmed up (The Lovers onward). */
export const OBLIQUE_FROM_LEVEL = 1
export const MAX_PLAYERS = 10
export const MIN_PLAYERS = 2
/** How many taps back the undo button can take you. */
export const UNDO_DEPTH = 12

/** Three uniform rolls in [0, 1): which pile, how to shuffle it if it needs it, which target. */
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
    piles: {},
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
export function deal(g: Game, card: DrawnCard, piles: Piles, isPass: boolean): Game {
  const players = isPass
    ? g.players.map((p, i) => (i === g.current ? { ...p, passes: p.passes - 1 } : p))
    : g.players
  return {
    ...g,
    phase: 'card',
    players,
    card,
    piles,
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

/**
 * Deal the next card for the active player. Pure: randomness comes in as rolls.
 *
 * Each pile is a shuffled deck held in state: cards come off the top and go
 * to the discards. In a two-player game the card must also keep the
 * spotlight even (see `fits`), so the first card from the top that does is
 * dealt. If none in the pile does — or the pile is empty — the discards are
 * shuffled back in underneath. If still none does, the level's own pile is
 * tried, then any other this level deals from (in level 1, a group wildcard
 * is the only way to hand the spotlight back to the drawer). A card being
 * passed goes to the very bottom and is never dealt straight back while
 * there's anything else to deal.
 */
export function draw(g: Game, rolls: Rolls): { card: DrawnCard; piles: Piles } {
  const passing = g.phase === 'card' ? g.card?.prompt.id : undefined
  // The target doesn't depend on the card, so it's chosen first and the card fitted to it.
  const target = pickTarget(g, rolls[2])
  const fit = fits(g, target)

  const fromPile = (suit: Suit) => {
    const pool = suit === 'wild' ? WILDCARDS : suit === 'oblique' ? OBLIQUES : DECK[g.level]
    const byId = new Map(pool.map((p) => [p.id, p]))
    const fitting = (pile: readonly string[]) =>
      pile.findIndex((pid) => pid !== passing && fit(byId.get(pid)!.subject))
    // Cards the deck no longer has (a game saved before an edit) drop out.
    let pile = (g.piles[pileId(g, suit)] ?? []).filter((pid) => byId.has(pid))
    if (fitting(pile) < 0) pile = refill(pile, pool, passing, rolls[1])
    return { suit, byId, pile, at: fitting(pile) }
  }

  const rolled = fromPile(suitFor(g, rolls[0]))
  const d =
    rolled.at >= 0
      ? rolled
      : (suitsAt(g)
          .filter((suit) => suit !== rolled.suit)
          .map(fromPile)
          .find((alt) => alt.at >= 0) ?? rolled)
  const at = d.at >= 0 ? d.at : Math.max(0, d.pile.findIndex((pid) => pid !== passing))
  const prompt = d.byId.get(d.pile[at])!

  return {
    piles: { ...g.piles, [pileId(g, d.suit)]: d.pile.filter((_, i) => i !== at) },
    card: {
      key: g.draws + 1,
      prompt,
      suit: d.suit,
      target: needsTarget(prompt) ? target : null,
      redraw: passing !== undefined,
    },
  }
}

/** Each level has its own pile; the wildcards and the obliques have one each. */
export const pileId = (g: Game, suit: Suit) => (suit === 'level' ? `level-${g.level}` : suit)

/** Shuffle the discards back in under what's left, with the card being passed (if any) at the very bottom. */
function refill(pile: readonly string[], pool: readonly Prompt[], passing: string | undefined, roll: number): string[] {
  const out = new Set(pile)
  const discards = pool.map((p) => p.id).filter((pid) => !out.has(pid) && pid !== passing)
  const bottom = passing !== undefined && pool.some((p) => p.id === passing) ? [passing] : []
  return [...pile, ...shuffle(discards, roll), ...bottom]
}

/** A seeded Fisher–Yates shuffle (mulberry32), so a single roll decides the whole order. */
export function shuffle<T>(xs: readonly T[], roll: number): T[] {
  let a = Math.floor(roll * 0x100000000) >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), a | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000
  }
  const out = [...xs]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Cards that name someone are about them; cards that ask about "you" are
 * read by the drawer to someone else, who answers. Every card but a group
 * card has a target, and it's never the drawer.
 */
export const needsTarget = (prompt: Prompt) => prompt.kind === 'read' || prompt.text.includes('{name}')

/** Who a card puts in the spotlight: the drawer, the target, or nobody in particular. */
export function spotlit(subject: Subject | undefined, drawer: number, target: number | null): number | null {
  return subject === 'self' ? drawer : subject === 'other' ? target : null
}

/** How many answered cards have put each player in the spotlight, from the log. */
export function spotlights(g: Game): number[] {
  const counts = g.players.map(() => 0)
  for (const e of g.log) {
    if (e.outcome !== 'answered') continue
    const who = spotlit(e.card.prompt.subject, e.drawer, e.card.target)
    if (who !== null) counts[who]++
  }
  return counts
}

/**
 * Which subjects can be dealt next. With two players the drawer and the
 * target are the same pair every turn, so the spotlight could otherwise sit
 * on one person for several cards running; instead it may only go to
 * whoever has had it least (either, when they're level). That keeps the
 * two counts within one of each other, so nobody is in it three times in a
 * row. With more players, fair target rotation already spreads it around.
 */
function fits(g: Game, target: number): (subject: Subject) => boolean {
  if (g.players.length !== 2) return () => true
  const counts = spotlights(g)
  return (subject) => {
    const who = spotlit(subject, g.current, target)
    return who === null || counts[who] <= counts[1 - who]
  }
}

/** Wildcards only in the shallow first level; obliques only once the group has warmed up. */
function suitFor(g: Game, roll: number): Suit {
  if (g.level <= WILDCARD_UNTIL_LEVEL && roll < WILDCARD_CHANCE) return 'wild'
  if (g.level >= OBLIQUE_FROM_LEVEL && roll < OBLIQUE_CHANCE) return 'oblique'
  return 'level'
}

/** The piles this level deals from, the level's own first. */
const suitsAt = (g: Game): Suit[] => [
  'level',
  ...(g.level <= WILDCARD_UNTIL_LEVEL ? (['wild'] as const) : []),
  ...(g.level >= OBLIQUE_FROM_LEVEL ? (['oblique'] as const) : []),
]

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
