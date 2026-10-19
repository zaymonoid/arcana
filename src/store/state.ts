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

/**
 * One card as it was dealt, in draw order. Besides the debug dump, the rules
 * read it to keep the spotlight even in a two-player game.
 */
export interface LogEntry {
  readonly level: number
  readonly drawer: number
  readonly card: DrawnCard
  /** How it left the table; null while it's still showing. */
  readonly outcome: 'answered' | 'passed' | 'skipped' | null
}

/** Prompt ids still in each pile, top first, keyed by `pileId`. Empty until a pile is first drawn from. */
export type Piles = Readonly<Record<string, readonly string[]>>

export interface Game {
  readonly phase: Phase
  readonly players: readonly Player[]
  readonly length: Length
  readonly level: number
  readonly turnsInLevel: number
  readonly current: number
  readonly card: DrawnCard | null
  /** What's left of each shuffled pile, top card first (see `pileId`). */
  readonly piles: Piles
  readonly draws: number
  readonly answered: number
  readonly passed: number
  /** Every card dealt this game, oldest first. */
  readonly log: readonly LogEntry[]
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
  /** A debug dump of the whole state, shown in the menu for copying. */
  readonly dump: { readonly text: string; readonly copied: boolean | null } | null
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
  ui: { menuOpen: false, confirmingEnd: false, dump: null },
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
  | { id: 'card/dealt'; data: { card: DrawnCard; piles: Piles; isPass: boolean } }
  | { id: 'card/done' }
  // Menu
  | { id: 'menu/open' }
  | { id: 'menu/close' }
  | { id: 'menu/end-request' }
  | { id: 'menu/end-cancel' }
  | { id: 'menu/end-confirm' }
  // Debug (intents → processes → events)
  | { id: 'debug/dump' }
  | { id: 'debug/dumped'; data: { text: string } }
  | { id: 'debug/copy' }
  | { id: 'debug/copied'; data: { ok: boolean } }
  | { id: 'debug/close' }
