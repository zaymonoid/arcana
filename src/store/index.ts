import { createStoreRef, makeStore } from '@zaymonoid/katha'
import { Context, Layer, ManagedRuntime } from 'effect'
import { rootProcess } from './processes'
import { reducer } from './reducer'
import { type Action, initialState, type State } from './state'

export type { Action, State } from './state'

class AppStore extends Context.Service<AppStore>()('AppStore', {
  make: makeStore({ initialState, reduce: reducer, process: rootProcess }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}

const { ref, attach } = createStoreRef<State, Action>(initialState)

/** The one store. Components read it with `fromStore` and write with `store.put`. */
export const store = ref

const runtime = ManagedRuntime.make(AppStore.layer)
runtime.runPromise(AppStore).then(attach)
