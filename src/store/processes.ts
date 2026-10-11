/**
 * Side effects: randomness, the clock and persistence. Each process turns a
 * UI intent into a fully-formed event for the reducer.
 */
import { combinators, type Process } from '@zaymonoid/katha'
import { Clock, Effect, Random, Stream, SubscriptionRef } from 'effect'
import * as R from './rules'
import type { Action, Game, State } from './state'

const { takeLeading } = combinators<State, Action>()

const STORAGE_KEY = 'arcana:v1'

const rolls = Effect.all([Random.next, Random.next, Random.next])

// ---------- Game lifecycle ----------

const start = takeLeading(['game/start'], (_, ctx) =>
  Effect.gen(function* () {
    const { setup } = yield* ctx.select()
    if (!R.canStart(setup.names)) return
    const startedAt = yield* Clock.currentTimeMillis
    yield* ctx.put({
      id: 'game/started',
      data: { names: R.cleanNames(setup.names), length: setup.length, startedAt },
    })
  }),
)

const rematch = takeLeading(['game/rematch'], (_, ctx) =>
  Effect.gen(function* () {
    const { game } = yield* ctx.select()
    if (!game) return
    const startedAt = yield* Clock.currentTimeMillis
    yield* ctx.put({
      id: 'game/started',
      data: { names: game.players.map((p) => p.name), length: game.length, startedAt },
    })
  }),
)

const finish = takeLeading(['game/finish'], (_, ctx) =>
  Effect.gen(function* () {
    const { game } = yield* ctx.select()
    if (game?.phase !== 'closing') return
    yield* ctx.put({ id: 'game/finished', data: { endedAt: yield* Clock.currentTimeMillis } })
  }),
)

// ---------- Drawing ----------

const drawCard = takeLeading(['card/draw'], (_, ctx) =>
  Effect.gen(function* () {
    const { game } = yield* ctx.select()
    if (!game || !R.canDraw(game)) return
    const { card, used } = R.draw(game, yield* rolls)
    yield* ctx.put({ id: 'card/dealt', data: { card, used, isPass: false } })
  }),
)

const passCard = takeLeading(['card/pass'], (_, ctx) =>
  Effect.gen(function* () {
    const { game } = yield* ctx.select()
    if (!game || !R.canPass(game)) return
    const { card, used } = R.draw(game, yield* rolls, game.card?.prompt.id)
    yield* ctx.put({ id: 'card/dealt', data: { card, used, isPass: true } })
  }),
)

// ---------- Debug ----------

const environment = Effect.sync(() =>
  typeof window === 'undefined'
    ? null
    : {
        userAgent: navigator.userAgent,
        viewport: `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio}`,
        url: location.href,
      },
)

const dump = takeLeading(['debug/dump'], (_, ctx) =>
  Effect.gen(function* () {
    const { booted, setup, game, saved, history } = yield* ctx.select()
    const at = new Date(yield* Clock.currentTimeMillis).toISOString()
    const text = JSON.stringify({ at, env: yield* environment, booted, setup, game, saved, history }, null, 2)
    yield* ctx.put({ id: 'debug/dumped', data: { text } })
  }),
)

const copyDump = takeLeading(['debug/copy'], (_, ctx) =>
  Effect.gen(function* () {
    const text = (yield* ctx.select()).ui.dump?.text
    if (!text) return
    const ok = yield* Effect.tryPromise(() => navigator.clipboard.writeText(text)).pipe(
      Effect.as(true),
      Effect.orElseSucceed(() => false),
    )
    yield* ctx.put({ id: 'debug/copied', data: { ok } })
  }),
)

// ---------- Persistence ----------

const load = Effect.sync((): Game | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const game = raw ? (JSON.parse(raw) as Game) : null
    return game && game.phase !== 'summary' ? game : null
  } catch {
    return null
  }
})

const store = (game: Game | null) =>
  Effect.sync(() => {
    try {
      if (game && game.phase !== 'summary') localStorage.setItem(STORAGE_KEY, JSON.stringify(game))
      else localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Storage unavailable (private mode etc.) — the game still works, it just won't resume.
    }
  })

const persistence: Process<State, Action> = (ctx) =>
  Effect.gen(function* () {
    yield* ctx.put({ id: 'app/restored', data: { saved: yield* load } })
    // Whatever game is live (or still offered for resume) is what gets saved.
    yield* Effect.forkScoped(
      SubscriptionRef.changes(ctx.state).pipe(
        Stream.map((s) => s.game ?? s.saved),
        Stream.changes,
        Stream.runForEach(store),
      ),
    )
  })

export const rootProcess: Process<State, Action> = (ctx) =>
  Effect.gen(function* () {
    yield* start(ctx)
    yield* rematch(ctx)
    yield* finish(ctx)
    yield* drawCard(ctx)
    yield* passCard(ctx)
    yield* dump(ctx)
    yield* copyDump(ctx)
    yield* persistence(ctx)
  })
