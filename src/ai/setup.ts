import type { Command } from '../engine/commands.js';
import type { Pack } from '../engine/pack.js';
import type { GameState } from '../engine/state.js';
import type { Deps } from '../runtime/deps.js';
import { createDriverFactory, loadKeys, parseAiConfig } from './config.js';
import { createSeatRunner, type SeatRunner } from './runner.js';
import { createTokenLog } from './tokenlog.js';

export interface AiSeatsOptions {
  deps: Deps;
  pack: Pack;
  /** Path of the seats file (seats, drivers, caps and the key file paths). */
  seatsFile: string;
  dataDir: string;
  session: { state(): GameState | null; command(cmd: Command): Promise<void> };
  /** Where a swap is marked on the table, and where it asks for a repaint. */
  overlay?: { mark(text: string): void; refresh(): void };
  paceMs?: number;
  /** Called after a cap stops a call, as well as the warning it always logs. */
  onCap?(seat: number, driver: string, reason: string): void;
}

/**
 * Builds the seat runner from the seats file: reads the keys through `Deps.fs`, makes a driver
 * for each spec, and writes the per-seat token log to `<dataDir>/ai-tokens.jsonl`.
 */
export async function createAiSeats(opts: AiSeatsOptions): Promise<SeatRunner> {
  const { deps } = opts;
  const config = parseAiConfig(await deps.fs.readFile(opts.seatsFile));
  const keys = await loadKeys(deps.fs, config.keyFiles, (l, m, f) => {
    deps.log(l, m, f);
  });
  await deps.fs.mkdir(opts.dataDir);
  return createSeatRunner({
    deps,
    pack: opts.pack,
    seats: config.seats,
    makeDriver: createDriverFactory({
      keys,
      deps,
      pack: opts.pack,
      state: () => opts.session.state(),
    }),
    state: () => opts.session.state(),
    submit: (cmd) => opts.session.command(cmd),
    tokenLog: createTokenLog(deps, `${opts.dataDir}/ai-tokens.jsonl`),
    dataDir: opts.dataDir,
    onCap: (seat, driver, reason) => {
      deps.log('warn', 'ai seat capped', { seat, driver, reason });
      opts.onCap?.(seat, driver, reason);
    },
    ...(opts.overlay
      ? {
          onSwap: (line: string) => {
            opts.overlay?.mark(line);
          },
          onChange: () => {
            opts.overlay?.refresh();
          },
        }
      : {}),
    ...(opts.paceMs === undefined ? {} : { paceMs: opts.paceMs }),
  });
}
