import type { GmCtx } from '../../src/engine/ctx.js';
import type { Event } from '../../src/engine/events.js';
import type { Pack } from '../../src/engine/pack.js';
import type { Rng } from '../../src/engine/rng.js';
import type { GameState } from '../../src/engine/state.js';

export function ctxFor(
  s: GameState,
  pack: Pack,
  rng: Rng,
  at = 0
): GmCtx & { events: Event[] } {
  const events: Event[] = [];
  return {
    s,
    pack,
    rng,
    at,
    events,
    emit: (e) => {
      events.push(e);
    },
  };
}
