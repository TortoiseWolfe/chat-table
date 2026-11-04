import { botDeclaration } from '../../seats/bot.js';
import type { Pack } from '../../engine/pack.js';
import type { GameState } from '../../engine/state.js';
import type { Driver } from '../types.js';

/**
 * The game master's autopilot as a driver: the bot script already in the engine picks for the seat.
 * It reads the live state, so it needs the same view of the game the engine has; it costs no tokens.
 */
export function createBotDriver(opts: { state: () => GameState | null; pack: Pack }): Driver {
  return {
    id: 'bot',
    model: 'autopilot',
    decide(packet) {
      const s = opts.state();
      const started = 0;
      const decl = s ? botDeclaration(s, packet.seat, opts.pack) : { kind: 'default' as const };
      if (decl.kind !== 'pick' || !packet.options.some((o) => o.n === decl.option)) {
        return Promise.resolve({
          decision: null,
          tokensIn: 0,
          tokensOut: 0,
          latencyMs: started,
          outcome: 'bad-answer',
        });
      }
      const cp = Math.min(decl.cp, packet.maxCp);
      return Promise.resolve({
        decision: { option: decl.option, cp, fp: decl.fp && cp === 0 && packet.hasFp },
        tokensIn: 0,
        tokensOut: 0,
        latencyMs: started,
        outcome: 'ok',
      });
    },
  };
}
