import type { Event } from './events.js';
import type { GameState } from './state.js';
import type { Pack } from './pack.js';
import type { Rng } from './rng.js';

export type Emit = (e: Event) => void;

export interface GmCtx {
  s: GameState;
  pack: Pack;
  rng: Rng;
  at: number;
  emit: Emit;
}
