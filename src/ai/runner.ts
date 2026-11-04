import type { Command } from '../engine/commands.js';
import type { Event } from '../engine/events.js';
import type { Pack } from '../engine/pack.js';
import type { GameState } from '../engine/state.js';
import { isOut } from '../engine/wounds.js';
import type { Deps } from '../runtime/deps.js';
import type { LogLine } from '../runtime/log.js';
import { narrationLine } from '../runtime/replies.js';
import { createCaps, type CapMeter, type CapReason } from './caps.js';
import { buildPacket, estimateTokens } from './packet.js';
import type { TokenLog } from './tokenlog.js';
import type {
  Driver,
  DriverId,
  DriverResult,
  DriverSpec,
  SeatConfig,
  SeatMemory,
} from './types.js';

/** Put aside before the window ends, so a late answer never races the close. */
const SAFETY_MS = 1500;
/** What a reply is assumed to cost when asking a cap whether a call may go ahead. */
const EXPECTED_OUTPUT_TOKENS = 150;
const FAILOVER_AFTER = 2;
const KEEP_TABLE_LINES = 6;
const KEEP_HISTORY = 8;
const SEATS_FILE = 'ai-seats.json';

export interface SeatPanel {
  seat: number;
  label: string;
  driver: DriverId | 'human';
  model: string;
  onBackup: boolean;
  tokens: number;
  tokenCap: number;
  calls: number;
  swaps: number;
}

export interface RunnerOptions {
  deps: Pick<Deps, 'now' | 'setTimer' | 'fs' | 'log'>;
  pack: Pack;
  seats: SeatConfig[];
  /** Makes the driver for a spec; the bot driver and the keys are the caller's business. */
  makeDriver(spec: DriverSpec): Driver;
  state(): GameState | null;
  /** Hands a command to the session's queue. */
  submit(cmd: Command): Promise<void>;
  tokenLog: TokenLog;
  /** Where `ai-seats.json` is kept; null keeps nothing between runs. */
  dataDir: string | null;
  /** Called when a cap stops a call. */
  onCap?(seat: number, driver: DriverId, reason: CapReason): void;
  /** Called after a swap, with a line fit for the table feed. */
  onSwap?(line: string): void;
  /** Called after any change to a seat panel. */
  onChange?(): void;
  /**
   * Waits this long (never past the window's end) before submitting an answer, so a table of
   * quick drivers still takes a full round. Zero for live play; a dry run sets it.
   */
  paceMs?: number;
}

export interface SeatRunner {
  start(): Promise<void>;
  /** Call after every applied command, with its log lines and the new state. */
  onState(lines: LogLine[], state: GameState): void;
  /** Moves a seat to one of its configured drivers (or the bot) and says why. */
  swap(seat: number, to: DriverId, reason: 'manual' | 'failover'): Promise<boolean>;
  panel(): SeatPanel[];
  /** Resolves when every turn started so far has finished. */
  idle(): Promise<void>;
}

interface Pending {
  round: number;
  label: string;
  result: string[];
}

interface SeatRuntime {
  config: SeatConfig;
  meter: CapMeter;
  memory: SeatMemory;
  active: 'primary' | 'backup' | 'human';
  failures: number;
  lastRound: number;
  swaps: number;
  pending: Pending | null;
}

interface Saved {
  version: 1;
  seats: { seat: number; active: SeatRuntime['active']; history: string[]; swaps: number }[];
}

const errMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export function createSeatRunner(opts: RunnerOptions): SeatRunner {
  const { deps, pack, tokenLog } = opts;
  const seats = new Map<number, SeatRuntime>();
  const drivers = new Map<string, Driver>();
  const turns = new Set<Promise<void>>();
  let tableLines: string[] = [];
  let saving: Promise<void> = Promise.resolve();

  for (const config of opts.seats) {
    seats.set(config.seat, {
      config,
      meter: createCaps(config.caps),
      memory: { history: [] },
      active: 'primary',
      failures: 0,
      lastRound: 0,
      swaps: 0,
      pending: null,
    });
  }

  const driverFor = (spec: DriverSpec): Driver => {
    const key = `${spec.id}:${spec.model}`;
    let d = drivers.get(key);
    if (!d) {
      d = opts.makeDriver(spec);
      drivers.set(key, d);
    }
    return d;
  };

  const currentSpec = (rt: SeatRuntime): DriverSpec | null =>
    rt.active === 'primary' ? rt.config.primary : rt.active === 'backup' ? rt.config.backup : null;

  function persist(): void {
    if (opts.dataDir === null) return;
    const dir = opts.dataDir;
    const snapshot: Saved = {
      version: 1,
      seats: [...seats.values()].map((rt) => ({
        seat: rt.config.seat,
        active: rt.active,
        history: rt.memory.history,
        swaps: rt.swaps,
      })),
    };
    saving = saving
      .then(async () => {
        await deps.fs.mkdir(dir);
        const tmp = `${dir}/${SEATS_FILE}.tmp`;
        await deps.fs.writeFile(tmp, JSON.stringify(snapshot));
        await deps.fs.rename(tmp, `${dir}/${SEATS_FILE}`);
      })
      .catch((err: unknown) => {
        deps.log('error', 'ai seats file write failed', { message: errMessage(err) });
      });
  }

  async function restore(): Promise<void> {
    if (opts.dataDir === null) return;
    const path = `${opts.dataDir}/${SEATS_FILE}`;
    try {
      if (!(await deps.fs.exists(path))) return;
      const saved = JSON.parse(await deps.fs.readFile(path)) as Saved;
      if (saved.version !== 1) return;
      for (const s of saved.seats) {
        const rt = seats.get(s.seat);
        if (!rt) continue;
        rt.active = s.active;
        rt.memory.history = s.history.slice(-KEEP_HISTORY);
        rt.swaps = s.swaps;
      }
    } catch (err) {
      deps.log('warn', 'ai seats file unreadable, starting fresh', { message: errMessage(err) });
    }
  }

  function noteSwap(
    rt: SeatRuntime,
    from: DriverId | 'human',
    to: DriverId,
    reason: 'manual' | 'failover' | 'human-left' | 'start',
    round: number
  ): void {
    if (reason !== 'start') rt.swaps += 1;
    tokenLog.swap({ seat: rt.config.seat, from, to, reason, round });
    if (reason !== 'start') {
      const name = opts.state()?.seats[rt.config.seat]?.character.name ?? `Seat ${rt.config.seat}`;
      opts.onSwap?.(`${name}: ${from} to ${to} (${reason})`);
    }
    persist();
    opts.onChange?.();
  }

  const spend = (rt: SeatRuntime): { tokens: number; calls: number } => rt.meter.spent();

  async function takeTurn(rt: SeatRuntime, round: number): Promise<void> {
    const state = opts.state();
    if (!state?.window || state.window.round !== round) return;
    const seat = state.seats[rt.config.seat];
    if (!seat || seat.holder.kind !== 'ai') return;
    if (state.phase === 'combat' && isOut(seat.character.wound)) return;

    const packet = buildPacket(state, pack, rt.config.seat, rt.memory, tableLines, deps.now());
    if (!packet) return;
    rt.meter.beginTurn();
    const deadlineAt = state.window.endsAt - SAFETY_MS;
    const estimate = estimateTokens(packet.system + packet.user) + EXPECTED_OUTPUT_TOKENS;

    const bot: DriverSpec = { id: 'bot', model: 'autopilot' };
    const chain: DriverSpec[] = [];
    if (rt.active === 'primary') chain.push(rt.config.primary, rt.config.backup);
    else if (rt.active === 'backup') chain.push(rt.config.backup);
    chain.push(bot);

    let primaryFailed = false;
    for (let i = 0; i < chain.length; i++) {
      const spec = chain[i]!;
      const driver = driverFor(spec);
      let result: DriverResult | null = null;
      if (spec.id !== 'bot') {
        if (deps.now() >= deadlineAt) {
          result = { decision: null, tokensIn: 0, tokensOut: 0, latencyMs: 0, outcome: 'timeout' };
        } else {
          const reason = rt.meter.check(estimate);
          if (reason !== null) {
            opts.onCap?.(rt.config.seat, spec.id, reason);
            result = { decision: null, tokensIn: 0, tokensOut: 0, latencyMs: 0, outcome: 'capped' };
          }
        }
      }
      if (result === null) {
        result = await driver.decide(packet, deadlineAt);
        if (spec.id !== 'bot') rt.meter.record(result.tokensIn, result.tokensOut);
      }
      tokenLog.call({
        seat: rt.config.seat,
        driver: spec.id,
        model: spec.model,
        round,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        latencyMs: result.latencyMs,
        outcome: result.outcome,
      });
      opts.onChange?.();
      if (i === 0 && result.decision === null) primaryFailed = true;
      if (result.decision === null) continue;

      const now = opts.state();
      if (
        !now?.window ||
        now.window.round !== round ||
        (now.phase !== 'scene' && now.phase !== 'combat')
      ) {
        break;
      }
      if (opts.paceMs !== undefined && opts.paceMs > 0) {
        const wait = Math.min(opts.paceMs, deadlineAt - deps.now());
        if (wait > 0) await new Promise<void>((resolve) => deps.setTimer(resolve, wait));
      }
      const label = packet.options.find((o) => o.n === result.decision?.option)?.label ?? '';
      rt.pending = { round, label, result: [] };
      await opts.submit({
        type: 'ai-declare',
        at: deps.now(),
        seat: rt.config.seat,
        option: result.decision.option,
        cp: result.decision.cp,
        fp: result.decision.fp,
        ...(result.decision.quote === undefined ? {} : { quote: result.decision.quote }),
      });
      break;
    }

    if (rt.active === 'primary' && chain.length > 1) {
      rt.failures = primaryFailed ? rt.failures + 1 : 0;
      if (rt.failures >= FAILOVER_AFTER && rt.config.primary.id !== 'bot') {
        doSwap(rt, 'backup', 'failover', round);
      }
    }
    persist();
  }

  function doSwap(
    rt: SeatRuntime,
    to: 'primary' | 'backup',
    reason: 'manual' | 'failover',
    round: number
  ): void {
    const from = currentSpec(rt)?.id ?? 'bot';
    rt.active = to;
    rt.failures = 0;
    noteSwap(rt, from, (to === 'primary' ? rt.config.primary : rt.config.backup).id, reason, round);
  }

  function flushHistory(rt: SeatRuntime, round: number): void {
    const p = rt.pending;
    if (!p || p.round >= round) return;
    const result = p.result.length > 0 ? p.result.join(', ') : 'nothing of note';
    rt.memory.history.push(`Round ${p.round}: you chose "${p.label}". Result: ${result}.`);
    rt.memory.history = rt.memory.history.slice(-KEEP_HISTORY);
    rt.pending = null;
  }

  function seatOfWho(who: string): SeatRuntime | undefined {
    const m = /^seat:(\d+)$/.exec(who);
    return m ? seats.get(Number(m[1])) : undefined;
  }

  /** Starts a turn for every ai seat that has not yet had one in the open window. */
  function startTurns(state: GameState): void {
    if (!state.window || (state.phase !== 'scene' && state.phase !== 'combat')) return;
    const round = state.window.round;
    for (const rt of seats.values()) {
      const holder = state.seats[rt.config.seat]?.holder;
      if (holder?.kind !== 'ai' || rt.lastRound >= round) continue;
      rt.lastRound = round;
      const turn = takeTurn(rt, round)
        .catch((err: unknown) => {
          deps.log('error', 'ai turn failed', { seat: rt.config.seat, message: errMessage(err) });
        })
        .finally(() => {
          turns.delete(turn);
        });
      turns.add(turn);
    }
  }

  const asEvent = (line: LogLine): Event => {
    const fields = Object.entries(line).filter(([k]) => k !== 'seq' && k !== 'at');
    return Object.fromEntries(fields) as unknown as Event;
  };

  return {
    async start() {
      await restore();
      const state = opts.state();
      for (const rt of seats.values()) {
        const spec = currentSpec(rt) ?? rt.config.backup;
        const holder = state?.seats[rt.config.seat]?.holder;
        if (holder?.kind === 'viewer') {
          rt.active = 'human';
        } else if (holder?.kind !== 'ai') {
          await opts.submit({
            type: 'assign',
            at: deps.now(),
            seat: rt.config.seat,
            holder: 'ai',
            label: rt.config.label,
          });
          noteSwap(rt, 'bot', spec.id, 'start', state?.round ?? 0);
        }
      }
      // A restart in the middle of a window: the open window gets its turns now.
      const after = opts.state();
      if (after) startTurns(after);
      opts.onChange?.();
    },

    onState(lines, state) {
      for (const line of lines) {
        const e = asEvent(line);
        switch (e.type) {
          case 'narrate':
            tableLines.push(narrationLine(e, pack));
            tableLines = tableLines.slice(-KEEP_TABLE_LINES);
            break;
          case 'started':
            for (const rt of seats.values()) rt.lastRound = 0;
            break;
          case 'check': {
            const rt = seatOfWho(e.who);
            rt?.pending?.result.push(e.success ? 'your check succeeded' : 'your check failed');
            break;
          }
          case 'wound': {
            const rt = seatOfWho(e.target);
            rt?.pending?.result.push(`you are now ${e.to}`);
            break;
          }
          case 'seat-released': {
            const rt = seats.get(e.seat);
            if (rt) {
              rt.active = 'human';
              rt.pending = null;
            }
            break;
          }
          case 'seat-claimed': {
            const rt = seats.get(e.seat);
            if (rt) rt.active = 'human';
            break;
          }
          case 'window-opened':
            for (const rt of seats.values()) flushHistory(rt, e.round);
            break;
          case 'ended':
            for (const rt of seats.values()) {
              flushHistory(rt, Number.MAX_SAFE_INTEGER);
              rt.lastRound = 0;
            }
            break;
          default:
            break;
        }
      }
      // A seat the human left is the bot's now; say so once, and keep it out of the runner.
      for (const line of lines) {
        if (line.type !== 'seat-released') continue;
        const rt = seats.get(Number(line['seat']));
        if (rt) noteSwap(rt, 'human', 'bot', 'human-left', state.round);
      }
      if (lines.some((l) => l.type === 'window-opened')) startTurns(state);
    },

    swap(seat, to, reason) {
      const rt = seats.get(seat);
      if (!rt) return Promise.resolve(false);
      const target =
        to === rt.config.primary.id ? 'primary' : to === rt.config.backup.id ? 'backup' : null;
      if (target === null || rt.active === target) return Promise.resolve(false);
      doSwap(rt, target, reason, opts.state()?.round ?? 0);
      return Promise.resolve(true);
    },

    panel() {
      return [...seats.values()].map((rt) => {
        const spec = currentSpec(rt);
        const s = spend(rt);
        return {
          seat: rt.config.seat,
          label: rt.config.label,
          driver: spec?.id ?? 'human',
          model: spec?.model ?? '',
          onBackup: rt.active === 'backup',
          tokens: s.tokens,
          tokenCap: rt.config.caps.tokensPerSession,
          calls: s.calls,
          swaps: rt.swaps,
        };
      });
    },

    async idle() {
      while (turns.size > 0) await Promise.all([...turns]);
      await saving;
      await tokenLog.idle();
    },
  };
}
