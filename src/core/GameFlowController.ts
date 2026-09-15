export type GameFlowState =
  | 'class-select'
  | 'lobby'
  | 'loading-game'
  | 'playing'
  | 'dead'
  | 'victory';

export type GameFlowEvent =
  | { type: 'class-confirmed' }
  | { type: 'start-game' }
  | { type: 'game-ready' }
  | { type: 'open-inventory' }
  | { type: 'open-loot' }
  | { type: 'close-overlay' }
  | { type: 'player-died' }
  | { type: 'victory' }
  | { type: 'return-to-lobby' };

export interface RejectedGameFlowTransition {
  readonly state: GameFlowState;
  readonly event: GameFlowEvent['type'];
}

const TRANSITIONS: Readonly<
  Partial<Record<GameFlowState, Partial<Record<GameFlowEvent['type'], GameFlowState>>>>
> = {
  'class-select': { 'class-confirmed': 'lobby' },
  lobby: { 'start-game': 'loading-game' },
  'loading-game': { 'game-ready': 'playing', 'return-to-lobby': 'lobby' },
  playing: {
    'open-inventory': 'playing',
    'open-loot': 'playing',
    'close-overlay': 'playing',
    'player-died': 'dead',
    victory: 'victory',
    'return-to-lobby': 'lobby',
  },
  dead: { 'return-to-lobby': 'lobby' },
  victory: { 'return-to-lobby': 'lobby' },
};

export class GameFlowController {
  public lastRejection: RejectedGameFlowTransition | null = null;

  constructor(public state: GameFlowState) {}

  public get isSimulationPaused(): boolean {
    return false;
  }

  public get acceptsGameplayInput(): boolean {
    return this.state === 'playing';
  }

  public transition(event: GameFlowEvent): GameFlowState {
    const next = TRANSITIONS[this.state]?.[event.type];
    if (!next) {
      this.lastRejection = { state: this.state, event: event.type };
      return this.state;
    }
    this.state = next;
    this.lastRejection = null;
    return this.state;
  }
}
