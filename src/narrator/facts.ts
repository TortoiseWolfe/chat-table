import type { Event } from '../engine/events.js';
import type { Pack } from '../engine/pack.js';
import type { GameState } from '../engine/state.js';

type Narrate = Extract<Event, { type: 'narrate' }>;

/** Scene facts plus the event's own variables (the event wins), string values only. */
export function factsFor(event: Narrate, state: GameState, pack: Pack): Record<string, string> {
  const out: Record<string, string> = {};
  const scene = pack.adventure.scenes.find((s) => s.id === state.sceneId);
  for (const [k, v] of Object.entries(scene?.facts ?? {})) {
    if (typeof v === 'string') out[k] = v;
  }
  for (const [k, v] of Object.entries(event.vars)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}
