/**
 * Headless games through the real store: reducer and processes, with
 * Effect's `Random` seeded. A bot taps the way the UI does — it only puts
 * intents (`game/start`, `card/draw`, `card/pass`…) and waits for the state
 * to move, so the processes roll the dice exactly as in the app.
 */
import { makeStore, type Store } from '@zaymonoid/katha'
import { Effect, Random, Stream, SubscriptionRef } from 'effect'
import { rootProcess } from '../src/store/processes'
import { reducer } from '../src/store/reducer'
import * as R from '../src/store/rules'
import { type Action, type Game, initialState, type Length, type State } from '../src/store/state'

export interface Simulation {
  readonly players: number
  readonly length: Length
  /** Seeds every dice roll the processes make. */
  readonly seed: string
  /** Whether the player holding the phone passes on the nth card they see (0-based, whole game). */
  readonly passes?: (n: number) => boolean
}

/** Play a whole game through to the closing card and return it. */
export const simulate = ({ players, length, seed, passes = () => false }: Simulation): Promise<Game> =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const store = yield* makeStore({ initialState, reduce: reducer, process: rootProcess })
        yield* until(store, (s) => s.booted)

        // Fill in the circle the way someone would at the setup screen.
        const { names } = (yield* store.select()).setup
        for (let i = names.length; i < players; i++) yield* store.put({ id: 'setup/add' })
        for (let i = names.length - 1; i >= players; i--) yield* store.put({ id: 'setup/remove', data: { index: i } })
        for (let i = 0; i < players; i++) yield* store.put({ id: 'setup/name', data: { index: i, value: `P${i}` } })
        yield* store.put({ id: 'setup/length', data: { length } })
        yield* tap(store, { id: 'game/start' })

        let seen = 0
        for (;;) {
          const g = (yield* store.select()).game!
          if (g.phase === 'closing') return g
          if (g.phase === 'level') yield* tap(store, { id: 'level/begin' })
          else if (g.phase === 'handoff') yield* tap(store, { id: 'card/draw' })
          else yield* tap(store, passes(seen++) && R.canPass(g) ? { id: 'card/pass' } : { id: 'card/done' })
        }
      }),
    ).pipe(Random.withSeed(seed)),
  )

/** Put an intent, then wait until the game has moved (straight away, or once a process has answered it). */
function tap(store: Store<State, Action>, action: Action) {
  return Effect.gen(function* () {
    const before = (yield* store.select()).game
    yield* store.put(action)
    yield* until(store, (s) => s.game !== before)
  })
}

const until = (store: Store<State, Action>, ready: (s: State) => boolean) =>
  SubscriptionRef.changes(store.state).pipe(Stream.filter(ready), Stream.take(1), Stream.runDrain)

/** How far apart the most- and least-paired couples are: cards shared, either way round. */
export function pairSpread(g: Game): number {
  const counts = R.pairings(g).flatMap((row, i) => row.filter((_, j) => j > i))
  return Math.max(...counts) - Math.min(...counts)
}
