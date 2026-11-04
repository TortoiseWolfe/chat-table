import type { SeatRunner } from '../ai/runner.js';
import { createAiSeats } from '../ai/setup.js';
import type { DriverId } from '../ai/types.js';
import type { Pack } from '../engine/pack.js';
import type { GameState, Settings } from '../engine/state.js';
import type { Deps } from '../runtime/deps.js';
import type { LogLine } from '../runtime/log.js';
import { createSession, type Session } from '../runtime/session.js';
import { createStore } from '../runtime/store.js';

/** Where the table view is told about changes; the entry point swaps in a real overlay. */
export interface LiveSink {
  publish(lines: LogLine[], state: GameState): void;
  mark(text: string): void;
  refresh(): void;
}

export interface LiveOptions {
  deps: Deps;
  pack: Pack;
  seed: number;
  settings: Settings;
  dataDir: string;
  seatsFile: string;
  /** Holds each AI answer back so a table of quick drivers still takes a full round. */
  paceMs: number;
  /** Stops the run after this long even if the adventure is not over. */
  maxMs: number;
  /** One planned swap: `afterMs` into the run, move `seat` to `to`. */
  swap?: { afterMs: number; seat: number; to: DriverId };
  /** Ends the run the first time a cap stops a call. */
  stopOnCap: boolean;
  sink: LiveSink;
  /** Chat lines the bot would have sent. */
  out(line: string): void;
  /** Called once the runner has started, before the game does. */
  onReady?(ctx: { session: Session; runner: SeatRunner }): void;
}

export interface LiveResult {
  reason: 'ended' | 'time' | 'cap';
  state: GameState | null;
  rounds: number;
  capped: string[];
}

/**
 * An off-air run on real timers: the same session and AI seats as the live bot, with the chat
 * lines printed instead of sent. Nothing here touches Twitch.
 */
export async function runLive(opts: LiveOptions): Promise<LiveResult> {
  const { deps } = opts;
  const capped: string[] = [];
  let runner: SeatRunner | null = null;
  const session = createSession({
    deps,
    pack: opts.pack,
    settings: opts.settings,
    seed: opts.seed,
    store: createStore(deps.fs, opts.dataDir, (l, m, d) => deps.log(l, m, d)),
    send: (line) => {
      opts.out(line);
      return Promise.resolve();
    },
    botUserId: 'live-bot',
    channelId: 'live',
    onLog: (lines, state) => {
      opts.sink.publish(lines, state);
      runner?.onState(lines, state);
    },
  });
  await session.start();
  runner = await createAiSeats({
    deps,
    pack: opts.pack,
    seatsFile: opts.seatsFile,
    dataDir: opts.dataDir,
    session,
    overlay: { mark: (t) => opts.sink.mark(t), refresh: () => opts.sink.refresh() },
    paceMs: opts.paceMs,
    onCap: (seat, driver, reason) => {
      capped.push(`seat ${String(seat)} ${driver} ${reason}`);
    },
  });
  await runner.start();
  opts.onReady?.({ session, runner });

  const startedAt = deps.now();
  let swapTimer: unknown = null;
  if (opts.swap) {
    const { seat, to } = opts.swap;
    swapTimer = deps.setTimer(() => {
      void runner?.swap(seat, to, 'manual').then((moved) => {
        deps.log('info', moved ? 'planned swap done' : 'planned swap did nothing', { seat, to });
      });
    }, opts.swap.afterMs);
  }

  await session.host('start');
  const reason = await new Promise<LiveResult['reason']>((resolve) => {
    const look = (): void => {
      const s = session.state();
      if (s?.phase === 'ended') return resolve('ended');
      if (opts.stopOnCap && capped.length > 0) return resolve('cap');
      if (deps.now() - startedAt >= opts.maxMs) return resolve('time');
      deps.setTimer(look, 1000);
    };
    look();
  });
  if (swapTimer !== null) deps.clearTimer(swapTimer);
  if (reason !== 'ended') await session.host('stop');
  await session.idle();
  await runner.idle();
  const state = session.state();
  return { reason, state, rounds: state?.round ?? 0, capped };
}
