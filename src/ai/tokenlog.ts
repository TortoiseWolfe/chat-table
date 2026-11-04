import type { Deps } from '../runtime/deps.js';
import type { DriverId, Outcome } from './types.js';

export interface CallRow {
  seat: number;
  driver: DriverId;
  model: string;
  round: number;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  outcome: Outcome;
}

export interface SwapRow {
  seat: number;
  from: DriverId | 'human';
  to: DriverId;
  reason: 'manual' | 'failover' | 'human-left' | 'start';
  round: number;
}

export interface TokenLog {
  call(row: CallRow): void;
  swap(row: SwapRow): void;
  /** Resolves when every line queued so far is written. */
  idle(): Promise<void>;
}

/**
 * One JSON line per model call and one per swap. A line holds numbers and names only: never a key,
 * never the packet and never viewer text.
 */
export function createTokenLog(deps: Pick<Deps, 'now' | 'fs' | 'log'>, path: string): TokenLog {
  let tail: Promise<void> = Promise.resolve();
  const write = (line: Record<string, unknown>): void => {
    const text = JSON.stringify({ t: deps.now(), ...line }) + '\n';
    tail = tail
      .then(() => deps.fs.appendFile(path, text))
      .catch((err: unknown) => {
        deps.log('error', 'token log write failed', {
          message: err instanceof Error ? err.message : String(err),
        });
      });
  };
  return {
    call: (r) =>
      write({
        kind: 'call',
        seat: r.seat,
        driver: r.driver,
        model: r.model,
        round: r.round,
        in: r.tokensIn,
        out: r.tokensOut,
        ms: r.latencyMs,
        outcome: r.outcome,
      }),
    swap: (r) =>
      write({
        kind: 'swap',
        seat: r.seat,
        from: r.from,
        to: r.to,
        reason: r.reason,
        round: r.round,
      }),
    idle: () => tail,
  };
}
