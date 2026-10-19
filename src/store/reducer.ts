import type { Reducer } from '@zaymonoid/katha'
import * as R from './rules'
import type { Action, Game, SetupState, State } from './state'

const closedUi = { menuOpen: false, confirmingEnd: false, dump: null }

const focusOn = (setup: SetupState, index: number): SetupState['focus'] => ({
  index,
  nonce: (setup.focus?.nonce ?? 0) + 1,
})

function reduceSetup(setup: SetupState, action: Action): SetupState | undefined {
  switch (action.id) {
    case 'setup/name':
      return { ...setup, names: setup.names.map((n, i) => (i === action.data.index ? action.data.value : n)) }
    case 'setup/add':
      if (setup.names.length >= R.MAX_PLAYERS) return undefined
      return { ...setup, names: [...setup.names, ''], focus: focusOn(setup, setup.names.length) }
    case 'setup/remove':
      if (setup.names.length <= R.MIN_PLAYERS) return undefined
      return { ...setup, names: setup.names.filter((_, i) => i !== action.data.index), focus: null }
    case 'setup/enter': {
      const { index } = action.data
      if (index < setup.names.length - 1) return { ...setup, focus: focusOn(setup, index + 1) }
      if (!setup.names[index]?.trim() || setup.names.length >= R.MAX_PLAYERS) return undefined
      return { ...setup, names: [...setup.names, ''], focus: focusOn(setup, setup.names.length) }
    }
    case 'setup/length':
      return { ...setup, length: action.data.length }
    default:
      return undefined
  }
}

/**
 * Game transitions that only apply while a game is on the table. `undoable`
 * marks the taps that move the game on, which the undo button can take back.
 */
function reduceGame(game: Game, action: Action): { game: Game; undoable: boolean } | undefined {
  switch (action.id) {
    case 'level/begin':
      return { game: R.beginLevel(game), undoable: true }
    case 'level/skip':
      return { game: R.goDeeper(game), undoable: true }
    case 'card/dealt':
      return { game: R.deal(game, action.data.card, action.data.piles, action.data.isPass), undoable: true }
    case 'card/done':
      return { game: R.done(game), undoable: true }
    case 'game/finished':
      return { game: R.finish(game, action.data.endedAt), undoable: false }
    default:
      return undefined
  }
}

export const reducer: Reducer<State, Action> = (state, action) => {
  switch (action.id) {
    case 'app/restored': {
      const saved = action.data.saved
      return {
        ...state,
        booted: true,
        saved,
        setup: saved
          ? { ...state.setup, names: saved.players.map((p) => p.name), length: saved.length }
          : state.setup,
      }
    }

    case 'game/started':
      return {
        ...state,
        saved: null,
        history: [],
        ui: closedUi,
        setup: { ...state.setup, names: [...action.data.names], length: action.data.length, focus: null },
        game: R.newGame(action.data.names, action.data.length, action.data.startedAt),
      }
    case 'game/resume':
      return state.saved ? { ...state, game: state.saved, saved: null, history: [], ui: closedUi } : undefined
    case 'game/discard':
      return state.saved ? { ...state, saved: null } : undefined
    case 'game/new-players':
      return { ...state, game: null, history: [], ui: closedUi }
    case 'game/undo': {
      const previous = state.history.at(-1)
      return previous && state.game ? { ...state, game: previous, history: state.history.slice(0, -1) } : undefined
    }

    case 'menu/open':
      return { ...state, ui: { ...closedUi, menuOpen: true } }
    case 'menu/close':
    case 'menu/end-cancel':
      return { ...state, ui: action.id === 'menu/close' ? closedUi : { ...state.ui, confirmingEnd: false } }
    case 'menu/end-request':
      return { ...state, ui: { ...state.ui, confirmingEnd: true } }
    case 'menu/end-confirm':
      return { ...state, game: null, history: [], ui: closedUi }

    case 'debug/dumped':
      return { ...state, ui: { ...state.ui, dump: { text: action.data.text, copied: null } } }
    case 'debug/copied':
      return state.ui.dump ? { ...state, ui: { ...state.ui, dump: { ...state.ui.dump, copied: action.data.ok } } } : undefined
    case 'debug/close':
      return { ...state, ui: { ...state.ui, dump: null } }
  }

  const setup = reduceSetup(state.setup, action)
  if (setup) return { ...state, setup }

  if (state.game) {
    const next = reduceGame(state.game, action)
    if (next && next.game !== state.game) {
      const history = next.undoable ? [...state.history, state.game].slice(-R.UNDO_DEPTH) : state.history
      return { ...state, game: next.game, history, ui: action.id === 'level/skip' ? closedUi : state.ui }
    }
  }
  return undefined
}
