import type { Prompt } from '../deck'

export type Length = 'quick' | 'standard' | 'deep'

export type Phase = 'level' | 'handoff' | 'card' | 'closing' | 'summary'

export interface Player {
  readonly name: string
  readonly passes: number
  readonly askedAbout: number
}

/** Which pile a card came from: the level's own, the wildcards, or the obliques. */
export type Suit = 'level' | 'wild' | 'oblique'

export interface DrawnCard {
  /** Unique per draw, so a redraw renders as a fresh card. */
  readonly key: number
  readonly prompt: Prompt
  readonly suit: Suit
  readonly target: number | null
  /** Dealt as a pass, replacing the card the player just turned down. */
  readonly redraw: boolean
}

export interface Game {
  readonly phase: Phase
  readonly players: readonly Player[]
  readonly length: Length
  readonly level: number
  readonly turnsInLevel: number
  readonly current: number
  readonly card: DrawnCard | null
  readonly used: readonly string[]
  readonly draws: number
  readonly answered: number
  readonly passed: number
  readonly startedAt: number
  readonly endedAt?: number
}

export interface SetupState {
  readonly names: readonly string[]
  readonly length: Length
  /** Which name field the UI should focus; `nonce` changes on every request. */
  readonly focus: { readonly index: number; readonly nonce: number } | null
}

export interface UiState {
  readonly menuOpen: boolean
  readonly confirmingEnd: boolean
}

export interface State {
  /** False until persisted progress has been checked. */
  readonly booted: boolean
  readonly setup: SetupState
  readonly game: Game | null
  /** An unfinished game found in storage, offered for resume. */
  readonly saved: Game | null
  /** Snapshots of the game before each tap that moved it on, newest last, for undo. */
  readonly history: readonly Game[]
  readonly ui: UiState
}

export const initialState: State = {
  booted: false,
  setup: { names: ['', '', ''], length: 'standard', focus: null },
  game: null,
  saved: null,
  history: [],
  ui: { menuOpen: false, confirmingEnd: false },
}

export type Action =
  // Boot
  | { id: 'app/restored'; data: { saved: Game | null } }
  // Setup
  | { id: 'setup/name'; data: { index: number; value: string } }
  | { id: 'setup/add' }
  | { id: 'setup/remove'; data: { index: number } }
  | { id: 'setup/enter'; data: { index: number } }
  | { id: 'setup/length'; data: { length: Length } }
  // Game lifecycle (intents → processes → events)
  | { id: 'game/start' }
  | { id: 'game/rematch' }
  | { id: 'game/started'; data: { names: readonly string[]; length: Length; startedAt: number } }
  | { id: 'game/resume' }
  | { id: 'game/discard' }
  | { id: 'game/finish' }
  | { id: 'game/finished'; data: { endedAt: number } }
  | { id: 'game/new-players' }
  | { id: 'game/undo' }
  // Turns
  | { id: 'level/begin' }
  | { id: 'level/skip' }
  | { id: 'card/draw' }
  | { id: 'card/pass' }
  | { id: 'card/dealt'; data: { card: DrawnCard; used: string[]; isPass: boolean } }
  | { id: 'card/done' }
  // Menu
  | { id: 'menu/open' }
  | { id: 'menu/close' }
  | { id: 'menu/end-request' }
  | { id: 'menu/end-cancel' }
  | { id: 'menu/end-confirm' }
