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
    expect(turn!.heading.map((p) => p.text).join('')).toBe('Your oblique card, A')
  })

  it('never has the drawer answer their own card', () => {
    for (let n = 2; n <= 4; n++) {
      const names = Array.from({ length: n }, (_, i) => `P${i}`)
      let s = reduce(started(names, 'deep'), { id: 'level/begin' })
      for (let turn = 0; turn < n * 3; turn++) {
        s = dealt(s, [0.9, Math.random(), Math.random()])
        const { card, current } = s.game!
        if (card!.prompt.kind !== 'group') {
          expect(card!.target).not.toBeNull()
          expect(card!.target).not.toBe(current)
        }
        s = reduce(s, { id: 'card/done' })
      }
    }
  })

  it('reads a question about "you" to someone else, who answers', () => {
    let s = reduce(started(['A', 'B', 'C']), { id: 'level/begin' })
    for (let t = 0; t < 3; t++) s = reduce(dealt(s), { id: 'card/done' })
    s = reduce(s, { id: 'level/begin' })
    s = dealt(s, [0.9, 0, 0.5])
    const card = s.game!.card!
    expect(card.prompt.kind).toBe('self')
    expect(card.target).not.toBe(s.game!.current)
    const turn = S.selectTurn(s)!
    const target = s.game!.players[card.target!].name
    expect(turn.card!.instruction.map((p) => p.text).join('')).toBe(`Read it to ${target} — they answer.`)
    s = reduce(s, { id: 'card/done' })
    expect(s.game!.players[card.target!].askedAbout).toBe(2)
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
    const { card, used } = R.draw(drawn.game!, [0.9, 0.5, 0], drawn.game!.card!.prompt.id)
    const passed = reduce(drawn, { id: 'card/dealt', data: { card, used, isPass: true } })
    expect(S.selectTurn(passed)!.card!.redraw).toBe(true)
    expect(S.selectTurn(passed)!.key).not.toBe(S.selectTurn(drawn)!.key)
  })

  it('seeds the card art once per turn, steady across the draw, fresh on a pass', () => {
    const waiting = reduce(started(), { id: 'level/begin' })
    const drawn = dealt(waiting)
    const seed = S.selectTurn(waiting)!.seed
    expect(seed).toBeGreaterThanOrEqual(0)
    expect(seed).toBeLessThan(1)
    expect(S.selectTurn(drawn)!.seed).toBe(seed)
    const { card, used } = R.draw(drawn.game!, [0.9, 0.5, 0], drawn.game!.card!.prompt.id)
    const passed = reduce(drawn, { id: 'card/dealt', data: { card, used, isPass: true } })
    expect(S.selectTurn(passed)!.seed).not.toBe(seed)
    const nextTurn = reduce(drawn, { id: 'card/done' })
    expect(S.selectTurn(nextTurn)!.seed).not.toBe(seed)
    expect(R.cardSeed({ ...nextTurn.game!, startedAt: 1 })).not.toBe(S.selectTurn(nextTurn)!.seed)
  })

  it('logs every card dealt, in order, with how it left the table', () => {
    let s = reduce(started(['A', 'B']), { id: 'level/begin' })
    s = reduce(dealt(s), { id: 'card/done' })
    s = dealt(s)
    const { card, used } = R.draw(s.game!, [0.9, 0.5, 0], s.game!.card!.prompt.id)
    s = reduce(s, { id: 'card/dealt', data: { card, used, isPass: true } })
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
