import { makeStore } from '@zaymonoid/katha'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { rootProcess } from '../src/store/processes'
import { reducer } from '../src/store/reducer'
import * as R from '../src/store/rules'
import * as S from '../src/store/selectors'
import { type Action, type Game, initialState, type State } from '../src/store/state'

const reduce = (state: State, ...actions: Action[]) => actions.reduce((s, a) => reducer(s, a) ?? s, state)
const started = (names = ['A', 'B', 'C'], length: Game['length'] = 'quick') =>
  reduce(initialState, { id: 'game/started', data: { names, length, startedAt: 0 } })
const dealt = (s: State, rolls: R.Rolls = [0.9, 0, 0]) => {
  const { card, used } = R.draw(s.game!, rolls)
  return reduce(s, { id: 'card/dealt', data: { card, used, isPass: false } })
}

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

  it('asks about everyone equally each round, whatever the dice', () => {
    for (let n = 2; n <= 10; n++) {
      for (let trial = 0; trial < 50; trial++) {
        const names = Array.from({ length: n }, (_, i) => `P${i}`)
        let s = reduce(started(names, 'deep'), { id: 'level/begin' })
        for (let turn = 1; turn <= n * 3; turn++) {
          s = dealt(s, [0.9, Math.random(), Math.random()])
          s = reduce(s, { id: 'card/done' })
          if (turn % n === 0) {
            const counts = s.game!.players.map((p) => p.askedAbout)
            expect(Math.max(...counts) - Math.min(...counts)).toBe(0)
          }
        }
      }
    }
  })

  it('advances levels after rounds × players turns, then closes', () => {
    let s = reduce(started(['A', 'B']), { id: 'level/begin' })
    for (let level = 0; level < 3; level++) {
      expect(s.game!.level).toBe(level)
      for (let t = 0; t < 2; t++) s = reduce(dealt(s), { id: 'card/done' })
      if (level < 2) s = reduce(s, { id: 'level/begin' })
    }
    expect(s.game!.phase).toBe('closing')
  })

  it('deals wildcards at any level, obliques only once warmed up', () => {
    const roll = R.WILDCARD_CHANCE + R.OBLIQUE_CHANCE / 2
    let s = reduce(started(['A', 'B']), { id: 'level/begin' })
    expect(R.draw(s.game!, [0, 0, 0]).card.suit).toBe('wild')
    expect(R.draw(s.game!, [roll, 0, 0]).card.suit).toBe('level')
    expect(R.draw(s.game!, [0.9, 0, 0]).card.suit).toBe('level')
    for (let t = 0; t < 2; t++) s = reduce(dealt(s), { id: 'card/done' })
    s = reduce(s, { id: 'level/begin' })
    const oblique = R.draw(s.game!, [roll, 0, 0]).card
    expect(oblique.suit).toBe('oblique')
    const turn = S.selectTurn(reduce(s, { id: 'card/dealt', data: { card: oblique, used: [], isPass: false } }))
    expect(turn!.card!.arcanum.title).toBe('The Hanged Man')
    expect(turn!.heading.map((p) => p.text).join('')).toBe('A draws an oblique card')
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
    const { card, used } = R.draw(drawn.game!, [0.9, 0.5, 0], drawn.game!.card!.prompt.id)
    const passed = reduce(drawn, { id: 'card/dealt', data: { card, used, isPass: true } })
    expect(S.selectTurn(passed)!.card!.redraw).toBe(true)
    expect(S.selectTurn(passed)!.key).not.toBe(S.selectTurn(drawn)!.key)
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
})
