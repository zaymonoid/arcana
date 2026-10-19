import { makeStore } from '@zaymonoid/katha'
import { Effect } from 'effect'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { DECK, OBLIQUES, type Prompt, SUBJECT, WILDCARDS } from '../src/deck'
import { rootProcess } from '../src/store/processes'
import { reducer } from '../src/store/reducer'
import * as R from '../src/store/rules'
import * as S from '../src/store/selectors'
import { type Action, type Game, initialState, type State } from '../src/store/state'

const reduce = (state: State, ...actions: Action[]) => actions.reduce((s, a) => reducer(s, a) ?? s, state)
const started = (names = ['A', 'B', 'C'], length: Game['length'] = 'quick') =>
  reduce(initialState, { id: 'game/started', data: { names, length, startedAt: 0 } })
const dealt = (s: State, rolls: R.Rolls = [0.9, 0, 0]) => {
  const { card, piles } = R.draw(s.game!, rolls)
  return reduce(s, { id: 'card/dealt', data: { card, piles, isPass: false } })
}
const passed = (s: State, rolls: R.Rolls = [0.9, 0.5, 0]) => {
  const { card, piles } = R.draw(s.game!, rolls)
  return reduce(s, { id: 'card/dealt', data: { card, piles, isPass: true } })
}
/** Put a particular prompt on the table, with the target the rules would pick. */
const dealtPrompt = (s: State, prompt: Prompt) => {
  const { card, piles } = R.draw(s.game!, [0.9, 0, 0])
  return reduce(s, { id: 'card/dealt', data: { card: { ...card, prompt }, piles, isPass: false } })
}
const names = (n: number) => Array.from({ length: n }, (_, i) => `P${i}`)

// ---------- fast-check arbitraries ----------

// `npm run test:soak` for 5000 cases per property; 100 otherwise.
fc.configureGlobal({ numRuns: Number(import.meta.env.FC_RUNS) || 100 })

/**
 * A die in [0, 1). fast-check leans towards edge values (0, tiny doubles),
 * which finds corner cases but makes nearly every suit roll a wildcard, so
 * half the rolls are uniform like real play.
 */
const roll = fc.oneof(
  fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true }),
  fc.noBias(fc.integer({ min: 0, max: 0xffffffff })).map((x) => x / 0x100000000),
)
const rolls = fc.tuple(roll, roll, roll)
const length = fc.constantFrom<Game['length']>('quick', 'standard', 'deep')
/** One tap's worth of choices: the dice for a deal, and whether to pass on the card. */
const step = fc.record({ rolls, pass: fc.boolean() })
/** Long enough to play a deep game through to the end; `size: 'max'` stops fast-check biasing towards short games. */
const steps = fc.array(step, { maxLength: 250, size: 'max' })
/** Dice that always deal from the level's own pile, never a wildcard or oblique. */
const levelRolls = fc.tuple(fc.double({ min: 0.5, max: 1, maxExcluded: true, noNaN: true }), roll, roll)

/**
 * Play a game through from the first level to the closing card (or until the
 * steps run out), passing whenever a step says to and the player can. Calls
 * `check` after every tap.
 */
function play(
  players: number,
  len: Game['length'],
  taps: readonly { rolls: R.Rolls; pass: boolean }[],
  check: (s: State) => void = () => {},
): State {
  let s = started(names(players), len)
  for (const t of taps) {
    const g = s.game!
    if (g.phase === 'closing') break
    if (g.phase === 'level') s = reduce(s, { id: 'level/begin' })
    else if (g.phase === 'handoff') s = dealt(s, t.rolls)
    else if (t.pass && R.canPass(g)) s = passed(s, t.rolls)
    else s = reduce(s, { id: 'card/done' })
    check(s)
  }
  return s
}

/** The pile a log entry was dealt from, and how many cards that pile holds. */
const poolSize = (pile: string) =>
  pile === 'wild' ? WILDCARDS.length : pile === 'oblique' ? OBLIQUES.length : DECK[Number(pile.slice(6))].length

describe('deck', () => {
  const all = [...DECK.flat(), ...WILDCARDS, ...OBLIQUES]

  it('gives every card a unique id and the subject its kind implies', () => {
    expect(new Set(all.map((p) => p.id)).size).toBe(all.length)
    for (const p of all) expect(p.subject, p.text).toBe(SUBJECT[p.kind])
  })

  it('names someone on every card that has a target, and only those', () => {
    for (const p of all) {
      if (p.kind === 'read' || p.kind === 'group') expect(p.text, p.text).not.toContain('{name}')
      else expect(p.text, p.text).toContain('{name}')
    }
  })
})

describe('rules', () => {
  it('targets whoever has been asked about least, never the active player', () => {
    let s = reduce(started(), { id: 'level/begin' })
    const asked: (number | null)[] = []
    for (let i = 0; i < 3; i++) {
      s = dealt(s, [0.9, 0, 0])
      asked.push(s.game!.card!.target)
      expect(s.game!.card!.target).not.toBe(s.game!.current)
      s = reduce(s, { id: 'card/done' })
    }
    expect(new Set(asked).size).toBe(3)
  })

  // Group wildcards have no target, so this holds for the level's own cards.
  it('asks about everyone equally each round, whatever the dice', () =>
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 10 }), fc.array(levelRolls, { minLength: 30, maxLength: 30 }), (n, dice) => {
        let s = reduce(started(names(n), 'deep'), { id: 'level/begin' })
        for (const [turn, r] of dice.slice(0, n * 3).entries()) {
          s = reduce(dealt(s, r), { id: 'card/done' })
          if ((turn + 1) % n === 0) {
            const counts = s.game!.players.map((p) => p.askedAbout)
            expect(Math.max(...counts) - Math.min(...counts)).toBe(0)
          }
        }
      }),
    ))

  it('advances levels after rounds × players turns, then closes', () => {
    let s = reduce(started(['A', 'B']), { id: 'level/begin' })
    for (let level = 0; level < 3; level++) {
      expect(s.game!.level).toBe(level)
      for (let t = 0; t < 2; t++) s = reduce(dealt(s), { id: 'card/done' })
      if (level < 2) s = reduce(s, { id: 'level/begin' })
    }
    expect(s.game!.phase).toBe('closing')
  })

  it('deals wildcards only in the first level, obliques only once warmed up', () => {
    let s = reduce(started(['A', 'B']), { id: 'level/begin' })
    expect(R.draw(s.game!, [0, 0, 0]).card.suit).toBe('wild')
    expect(R.draw(s.game!, [R.WILDCARD_CHANCE, 0, 0]).card.suit).toBe('level')
    expect(R.draw(s.game!, [0.9, 0, 0]).card.suit).toBe('level')
    for (let t = 0; t < 2; t++) s = reduce(dealt(s), { id: 'card/done' })
    s = reduce(s, { id: 'level/begin' })
    const oblique = R.draw(s.game!, [0, 0, 0]).card
    expect(oblique.suit).toBe('oblique')
    expect(R.draw(s.game!, [R.OBLIQUE_CHANCE, 0, 0]).card.suit).toBe('level')
    for (let t = 0; t < 2; t++) s = reduce(dealt(s), { id: 'card/done' })
    s = reduce(s, { id: 'level/begin' })
    expect(s.game!.level).toBe(2)
    expect(R.draw(s.game!, [0, 0, 0]).card.suit).toBe('oblique')
    const turn = S.selectTurn(reduce(s, { id: 'card/dealt', data: { card: oblique, piles: {}, isPass: false } }))
    expect(turn!.card!.arcanum.title).toBe('The Hanged Man')
    expect(turn!.heading.map((p) => p.text).join('')).toBe('Your oblique card, A')
  })

  it('names someone other than the drawer on every card but a group card', () =>
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 10 }), length, steps, (n, len, taps) => {
        play(n, len, taps, (s) => {
          const { card, current } = s.game!
          if (!card) return
          if (card.prompt.kind === 'group') expect(card.target).toBeNull()
          else expect(card.target).not.toBe(current)
          expect(card.target === null || card.target < n).toBe(true)
        })
      }),
    ))

  it('keeps the spotlight even in a two-player game: nobody in it three times running', () =>
    fc.assert(
      fc.property(length, steps, (len, taps) => {
        const s = play(2, len, taps, (s) => {
          const [a, b] = R.spotlights(s.game!)
          expect(Math.abs(a - b)).toBeLessThanOrEqual(1)
        })
        const order = s.game!.log
          .filter((e) => e.outcome === 'answered')
          .map((e) => R.spotlit(e.card.prompt.subject, e.drawer, e.card.target))
          .filter((who) => who !== null)
        for (let i = 2; i < order.length; i++) expect(new Set(order.slice(i - 2, i + 1)).size).toBeGreaterThan(1)
      }),
    ))

  // Strict alternation would starve these: each one hands the spotlight back the same way.
  it('still deals cards the drawer answers in two-player games', () => {
    const games = fc.sample(steps.map((taps) => play(2, 'deep', taps).game!), { numRuns: 100, seed: 1 })
    const tells = games.flatMap((g) => g.log.filter((e) => e.outcome === 'answered' && e.card.prompt.subject === 'self'))
    expect(tells.length).toBeGreaterThan(0)
  })

  it('deals every card in a pile before any comes round again, with three or more players', () =>
    fc.assert(
      fc.property(fc.integer({ min: 3, max: 10 }), length, steps, (n, len, taps) => {
        const byPile = new Map<string, string[]>()
        for (const e of play(n, len, taps).game!.log) {
          const pile = e.card.suit === 'level' ? `level-${e.level}` : e.card.suit
          byPile.set(pile, [...(byPile.get(pile) ?? []), e.card.prompt.id])
        }
        for (const [pile, ids] of byPile) {
          const size = poolSize(pile)
          for (let i = 0; i < ids.length; i += size) {
            const run = ids.slice(i, i + size)
            expect(new Set(run).size).toBe(run.length)
          }
        }
      }),
    ))

  it('never deals the card being passed straight back', () =>
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 10 }), length, steps, (n, len, taps) => {
        play(n, len, taps, (s) => {
          const log = s.game!.log
          const last = log.at(-1)
          if (last?.card.redraw) expect(last.card.prompt.id).not.toBe(log.at(-2)!.card.prompt.id)
        })
      }),
    ))

  it('is a pure function of the dice', () =>
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 10 }), length, steps, (n, len, taps) => {
        expect(play(n, len, taps).game).toEqual(play(n, len, taps).game)
      }),
    ))

  it('shuffles every card into a pile exactly once', () =>
    fc.assert(
      fc.property(fc.array(fc.integer(), { maxLength: 50 }), roll, (xs, r) => {
        expect(R.shuffle(xs, r).sort()).toEqual([...xs].sort())
      }),
    ))

  it('reads a question about "you" to someone else, who answers', () => {
    let s = reduce(started(['A', 'B', 'C']), { id: 'level/begin' })
    for (let t = 0; t < 3; t++) s = reduce(dealt(s), { id: 'card/done' })
    s = reduce(s, { id: 'level/begin' })
    s = dealtPrompt(s, DECK[1].find((p) => p.kind === 'read')!)
    const card = s.game!.card!
    expect(card.target).not.toBe(s.game!.current)
    const target = s.game!.players[card.target!].name
    expect(S.selectTurn(s)!.card!.instruction.map((p) => p.text).join('')).toBe(`Read it to ${target} — they answer.`)
    s = reduce(s, { id: 'card/done' })
    expect(s.game!.players[card.target!].askedAbout).toBe(2)
  })

  it('tells the drawer when they are the one speaking', () => {
    let s = reduce(started(['A', 'B', 'C']), { id: 'level/skip' }, { id: 'level/begin' })
    s = dealtPrompt(s, DECK[1].find((p) => p.kind === 'tell')!)
    const target = s.game!.players[s.game!.card!.target!].name
    expect(S.selectTurn(s)!.card!.instruction.map((p) => p.text).join('')).toBe(`You speak — ${target} listens.`)
  })

  it('undoes the taps that move the game on, newest first', () => {
    const intro = started()
    expect(S.selectHud(intro)!.canUndo).toBe(false)
    expect(reduce(intro, { id: 'game/undo' })).toBe(intro)
    const waiting = reduce(intro, { id: 'level/begin' })
    const drawn = dealt(waiting)
    const next = reduce(drawn, { id: 'card/done' })
    expect(S.selectHud(next)!.canUndo).toBe(true)
    expect(next.history).toHaveLength(3)
    const undone = reduce(next, { id: 'game/undo' })
    expect(undone.game).toBe(drawn.game)
    expect(reduce(undone, { id: 'game/undo' }).game).toBe(waiting.game)
    expect(reduce(undone, { id: 'game/undo' }, { id: 'game/undo' }).game).toBe(intro.game)
    expect(reduce(undone, { id: 'game/undo' }, { id: 'game/undo' }, { id: 'game/undo' }).game).toBe(intro.game)
  })

  it('caps the undo history and clears it for a new game', () => {
    let s = reduce(started(['A', 'B'], 'deep'), { id: 'level/begin' })
    for (let t = 0; t < 2 * R.UNDO_DEPTH; t++) s = reduce(dealt(s), { id: 'card/done' })
    expect(s.history).toHaveLength(R.UNDO_DEPTH)
    expect(reduce(s, { id: 'game/started', data: { names: ['A', 'B'], length: 'quick', startedAt: 0 } }).history).toEqual([])
    expect(reduce(s, { id: 'menu/end-confirm' }).history).toEqual([])
  })

  it('ignores done before a card is drawn', () => {
    const s = reduce(started(), { id: 'level/begin' })
    expect(reduce(s, { id: 'card/done' })).toBe(s)
  })

  it('shows waiting-to-draw and the drawn card as one turn screen', () => {
    const waiting = reduce(started(), { id: 'app/restored', data: { saved: null } }, { id: 'level/begin' })
    const drawn = dealt(waiting)
    expect(S.selectScreen(waiting)).toBe('turn')
    expect(S.selectScreen(drawn)).toBe('turn')
    expect(S.selectTurn(waiting)!.card).toBeNull()
    expect(S.selectTurn(waiting)!.sigil).toBe('fool')
    expect(S.selectTurn(drawn)!.key).toBe(S.selectTurn(waiting)!.key)
    const redrawn = passed(drawn)
    expect(S.selectTurn(redrawn)!.card!.redraw).toBe(true)
    expect(S.selectTurn(redrawn)!.key).not.toBe(S.selectTurn(drawn)!.key)
  })

  it('seeds the card art once per turn, steady across the draw, fresh on a pass', () => {
    const waiting = reduce(started(), { id: 'level/begin' })
    const drawn = dealt(waiting)
    const seed = S.selectTurn(waiting)!.seed
    expect(seed).toBeGreaterThanOrEqual(0)
    expect(seed).toBeLessThan(1)
    expect(S.selectTurn(drawn)!.seed).toBe(seed)
    const redrawn = passed(drawn)
    expect(S.selectTurn(redrawn)!.seed).not.toBe(seed)
    const nextTurn = reduce(drawn, { id: 'card/done' })
    expect(S.selectTurn(nextTurn)!.seed).not.toBe(seed)
    expect(R.cardSeed({ ...nextTurn.game!, startedAt: 1 })).not.toBe(S.selectTurn(nextTurn)!.seed)
  })

  it('logs every card dealt, in order, with how it left the table', () => {
    let s = reduce(started(['A', 'B']), { id: 'level/begin' })
    s = reduce(dealt(s), { id: 'card/done' })
    s = dealt(s)
    s = passed(s)
    s = reduce(s, { id: 'level/skip' })
    s = dealt(reduce(s, { id: 'level/begin' }))
    expect(s.game!.log.map((e) => [e.level, e.drawer, e.outcome])).toEqual([
      [0, 0, 'answered'],
      [0, 1, 'passed'],
      [0, 1, 'skipped'],
      [1, 1, null],
    ])
    expect(s.game!.log[2].card.redraw).toBe(true)
  })

  it('validates names', () => {
    expect(R.canStart(['A', ' '])).toBe(false)
    expect(R.duplicateName(['Sam', 'sam '])).toBe('sam')
    expect(R.canStart(['Sam', 'Alex'])).toBe(true)
  })
})

describe('store processes', () => {
  const run = (f: (put: (a: Action) => void, get: () => State) => Promise<void>) =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const store = yield* makeStore({ initialState, reduce: reducer, process: rootProcess })
          yield* Effect.promise(() => f(store.handle.put, store.handle.getState))
        }),
      ),
    )
  const tick = () => new Promise((r) => setTimeout(r, 10))

  it('boots, starts, draws and spends passes', () =>
    run(async (put, get) => {
      await tick()
      expect(get().booted).toBe(true)
      for (const [i, name] of ['Sam', 'Alex'].entries()) put({ id: 'setup/name', data: { index: i, value: name } })
      put({ id: 'setup/remove', data: { index: 2 } })
      put({ id: 'game/start' })
      await tick()
      expect(get().game?.players.map((p) => p.name)).toEqual(['Sam', 'Alex'])
      put({ id: 'level/begin' })
      put({ id: 'card/draw' })
      await tick()
      const first = get().game!.card!
      expect(get().game!.phase).toBe('card')
      put({ id: 'card/pass' })
      await tick()
      expect(get().game!.card!.prompt.id).not.toBe(first.prompt.id)
      expect(get().game!.players[0].passes).toBe(R.PASSES_PER_PLAYER - 1)
    }))

  it('dumps the game for debugging, and clears the dump with the menu', () =>
    run(async (put, get) => {
      await tick()
      put({ id: 'game/started', data: { names: ['Sam', 'Alex'], length: 'quick', startedAt: 0 } })
      put({ id: 'level/begin' })
      put({ id: 'card/draw' })
      await tick()
      put({ id: 'menu/open' })
      put({ id: 'debug/dump' })
      await tick()
      const dump = JSON.parse(get().ui.dump!.text)
      expect(dump.game.players.map((p: { name: string }) => p.name)).toEqual(['Sam', 'Alex'])
      expect(dump.game.cards).toHaveLength(1)
      expect(dump.game.cards[0]).toMatchObject({ n: 1, drawer: 'Sam', outcome: 'on the table' })
      expect(dump.game.cards[0].text).not.toContain('{name}')
      expect(S.selectHud(get())!.dump!.copyLabel).toBe('Copy')
      put({ id: 'menu/close' })
      await tick()
      expect(get().ui.dump).toBeNull()
    }))
})
