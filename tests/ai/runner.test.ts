import { describe, expect, it } from 'vitest';
import { createSeatRunner, type SeatRunner } from '../../src/ai/runner.js';
import { createTokenLog } from '../../src/ai/tokenlog.js';
import type {
  Driver,
  DriverId,
  DriverResult,
  DriverSpec,
  SeatConfig,
  TurnPacket,
} from '../../src/ai/types.js';
import { DEFAULT_SETTINGS } from '../../src/engine/state.js';
import { loadPackSync } from '../../src/packs/load.js';
import type { Deps } from '../../src/runtime/deps.js';
import type { ChatMessage } from '../../src/runtime/parse.js';
import { createSession } from '../../src/runtime/session.js';
import { createStore } from '../../src/runtime/store.js';
import { FakeClock } from '../../src/sim/clock.js';
import { memFs } from '../helpers/memfs.js';

const START = 1793000000000;
const pack = loadPackSync('packs/frontier');

const ok = (option: number, extra: Partial<DriverResult> = {}): DriverResult => ({
  decision: { option, cp: 0, fp: false },
  tokensIn: 800,
  tokensOut: 20,
  latencyMs: 300,
  outcome: 'ok',
  ...extra,
});
const fail = (outcome: DriverResult['outcome'] = 'http-error'): DriverResult => ({
  decision: null,
  tokensIn: 0,
  tokensOut: 0,
  latencyMs: 10,
  outcome,
});

type Script = Partial<Record<DriverId, (p: TurnPacket) => DriverResult>>;

const config = (seat: 0 | 1 | 2 | 3, over: Partial<SeatConfig> = {}): SeatConfig => ({
  seat,
  label: `AI ${String(seat)}`,
  primary: { id: 'gemini', model: 'gem' },
  backup: { id: 'groq', model: 'oss' },
  caps: { tokensPerTurn: 3000, callsPerTurn: 2, tokensPerSession: 100000, callsPerSession: 100 },
  ...over,
});

function setup(seatConfigs: SeatConfig[], script: Script, fs = memFs(), paceMs = 0) {
  const clock = new FakeClock(START);
  const logs: string[] = [];
  const deps: Deps = {
    now: () => clock.now(),
    setTimer: (fn, ms) => clock.setTimer(fn, ms),
    clearTimer: (id) => clock.clearTimer(id as number),
    fs,
    fetch: () => {
      throw new Error('no network in tests');
    },
    log: (level, msg) => logs.push(`${level}: ${msg}`),
    randomSeed: () => 1,
    randomBytes: (n) => new Uint8Array(n),
  };
  const calls: { driver: DriverId; packet: TurnPacket }[] = [];
  let runner: SeatRunner | null = null;
  const swaps: string[] = [];
  const caps: string[] = [];
  const session = createSession({
    deps,
    pack,
    settings: DEFAULT_SETTINGS,
    seed: 7,
    store: createStore(fs, '/d', (l, m) => logs.push(`${l}: ${m}`)),
    send: () => Promise.resolve(),
    botUserId: 'bot',
    channelId: 'chan',
    onLog: (lines, state) => runner?.onState(lines, state),
  });
  const makeDriver = (spec: DriverSpec): Driver => ({
    id: spec.id,
    model: spec.model,
    decide(packet) {
      calls.push({ driver: spec.id, packet });
      const fn = script[spec.id];
      if (!fn && spec.id === 'bot') return Promise.resolve(ok(1, { tokensIn: 0, tokensOut: 0 }));
      return Promise.resolve(fn ? fn(packet) : fail());
    },
  });
  const tokenLog = createTokenLog({ now: () => clock.now(), fs, log: (l, m, f) => deps.log(l, m, f) }, '/d/tokens.jsonl');
  runner = createSeatRunner({
    deps,
    pack,
    seats: seatConfigs,
    makeDriver,
    state: () => session.state(),
    submit: (cmd) => session.command(cmd),
    tokenLog,
    dataDir: '/d',
    paceMs,
    onSwap: (l) => swaps.push(l),
    onCap: (seat, driver, reason) => caps.push(`${String(seat)} ${driver} ${reason}`),
  });
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 4; i++) {
      await runner?.idle();
      await session.idle();
    }
  };
  /** Runs rounds until the ending or `rounds` windows have closed. */
  const play = async (rounds: number): Promise<void> => {
    for (let i = 0; i < rounds; i++) {
      await settle();
      const s = session.state();
      if (!s || s.phase === 'ended' || !s.window) return;
      clock.advanceTo(s.window.endsAt);
      await settle();
    }
  };
  const tokenRows = (): Record<string, unknown>[] =>
    (fs.files.get('/d/tokens.jsonl') ?? '')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Record<string, unknown>);
  const chat = async (text: string, userId = 'u1', login = 'viewer1'): Promise<void> => {
    const msg: ChatMessage = {
      messageId: `m${String(Math.random())}`,
      userId,
      login,
      text,
      isMod: false,
      isBroadcaster: false,
      at: clock.now(),
      sourceChannelId: null,
    };
    await session.chat(msg);
  };
  /** An ai seat nobody drives, so a window only closes on its timer and each round is one step. */
  const begin = async (idle = true): Promise<void> => {
    await session.start();
    await runner?.start();
    if (idle) await session.command({ type: 'assign', at: clock.now(), seat: 3, holder: 'ai', label: 'idle' });
    await session.host('start');
    await settle();
  };
  return { begin, clock, session, runner, calls, swaps, caps, logs, fs, settle, play, tokenRows, chat };
}

const holderKinds = (s: ReturnType<typeof setup>): string[] =>
  s.session.state()!.seats.map((x) => x.holder.kind);

const seatCalls = (t: ReturnType<typeof setup>, seat: number, driver?: DriverId) =>
  t.calls.filter((c) => c.packet.seat === seat && (driver === undefined || c.driver === driver));

describe('seat runner', () => {
  it('start gives the configured seats the ai holder and the others stay bots', async () => {
    const t = setup([config(1), config(2)], { gemini: () => ok(1) });
    await t.session.start();
    await t.runner.start();
    expect(holderKinds(t)).toEqual(['bot', 'ai', 'ai', 'bot']);
    expect(t.runner.panel().map((p) => [p.seat, p.driver, p.model, p.onBackup])).toEqual([
      [1, 'gemini', 'gem', false],
      [2, 'gemini', 'gem', false],
    ]);
    expect(t.session.state()!.seats[1]!.holder).toMatchObject({ kind: 'ai', label: 'AI 1' });
  });

  it('a turn asks the primary once, submits its choice and logs the call', async () => {
    const t = setup([config(1), config(2)], { gemini: () => ok(1) });
    await t.begin();
    expect(t.calls.map((c) => [c.driver, c.packet.seat])).toEqual([
      ['gemini', 1],
      ['gemini', 2],
    ]);
    expect(t.tokenRows().filter((r) => r['kind'] === 'call')[0]).toMatchObject({
      seat: 1,
      driver: 'gemini',
      model: 'gem',
      in: 800,
      out: 20,
      outcome: 'ok',
    });
    expect(t.fs.files.get('/d/events.jsonl')).toContain('"type":"declared","seat":1,"by":"ai"');
    expect(t.runner.panel()[0]).toMatchObject({ tokens: 820, calls: 1 });
  });

  it('a failed primary falls back to the backup, which gets the same packet', async () => {
    const t = setup([config(1), config(2)], { gemini: () => fail(), groq: () => ok(1) });
    await t.begin();
    const mine = seatCalls(t, 1);
    expect(mine.map((c) => c.driver)).toEqual(['gemini', 'groq']);
    expect(mine[1]!.packet).toEqual(mine[0]!.packet);
    expect(t.fs.files.get('/d/events.jsonl')).toContain('"type":"declared","seat":1,"by":"ai"');
  });

  it('when every driver fails the seat is filled by the bot', async () => {
    const t = setup([config(1), config(2)], {});
    await t.begin();
    const log = t.fs.files.get('/d/events.jsonl') ?? '';
    expect(log).toContain('"type":"declared","seat":1,"by":"ai"');
    expect(t.tokenRows().some((r) => r['kind'] === 'call' && r['driver'] === 'bot' && r['outcome'] === 'ok')).toBe(true);
    await t.play(1);
    expect(t.session.state()!.round).toBeGreaterThan(1);
  });

  it('two failed rounds in a row move the seat to its backup and mark the swap', async () => {
    const t = setup([config(1), config(2)], { gemini: () => fail(), groq: () => ok(1) });
    await t.begin();
    expect(t.runner.panel()[0]).toMatchObject({ driver: 'gemini', swaps: 0 });
    await t.play(1);
    expect(t.runner.panel()[0]).toMatchObject({ driver: 'groq', onBackup: true, swaps: 1 });
    expect(t.swaps.filter((l) => l.endsWith('gemini to groq (failover)'))).toHaveLength(2);
    expect(t.tokenRows().filter((r) => r['kind'] === 'swap' && r['reason'] === 'failover')).toHaveLength(2);
    // Once on the backup, the failed primary is not asked again.
    await t.play(2);
    expect(seatCalls(t, 1, 'gemini')).toHaveLength(2);
    expect(seatCalls(t, 1, 'groq').length).toBeGreaterThanOrEqual(4);
  });

  it('a manual swap keeps the character, points and history, and the new driver gets the same packet shape', async () => {
    const t = setup([config(1), config(2)], { gemini: () => ok(1), groq: () => ok(1) });
    await t.begin();
    await t.play(2);
    const seat = t.session.state()!.seats[1]!;
    const name = seat.character.name;
    expect(await t.runner.swap(1, 'groq', 'manual')).toBe(true);
    expect(await t.runner.swap(1, 'groq', 'manual')).toBe(false);
    expect(await t.runner.swap(1, 'claude', 'manual')).toBe(false);
    expect(t.runner.panel()[0]).toMatchObject({ driver: 'groq', onBackup: true });
    await t.play(1);
    expect(t.session.state()!.seats[1]!.character.name).toBe(name);
    const viaGem = seatCalls(t, 1, 'gemini');
    const viaGroq = seatCalls(t, 1, 'groq');
    expect(viaGem).toHaveLength(3);
    expect(viaGroq).toHaveLength(1);
    const g = viaGroq[0]!.packet;
    expect(g.system).toBe(viaGem[0]!.packet.system);
    expect(g.options.length).toBeGreaterThan(0);
    expect(g.user).toContain(`You play ${name}`);
    expect(g.user).toContain('you chose');
    expect(t.swaps.some((l) => l.includes('gemini to groq (manual)'))).toBe(true);
  });

  it('a cap that would be passed stops the call, is reported, and the seat falls to the bot', async () => {
    const tight = config(1, {
      primary: { id: 'claude', model: 'haiku' },
      caps: { tokensPerTurn: 100, callsPerTurn: 1, tokensPerSession: 1000, callsPerSession: 5 },
    });
    const t = setup([tight, config(2)], { claude: () => ok(1), gemini: () => ok(1), groq: () => ok(1) });
    await t.begin();
    expect(seatCalls(t, 1, 'claude')).toHaveLength(0);
    expect(seatCalls(t, 1, 'groq')).toHaveLength(0);
    // The cap belongs to the seat, so the backup is held to it as well.
    expect(t.caps).toEqual(['1 claude turn-tokens', '1 groq turn-tokens']);
    const rows = t.tokenRows().filter((r) => r['seat'] === 1 && r['kind'] === 'call');
    expect(rows.map((r) => [r['driver'], r['outcome']])).toEqual([
      ['claude', 'capped'],
      ['groq', 'capped'],
      ['bot', 'ok'],
    ]);
    expect(t.runner.panel()[0]).toMatchObject({ tokens: 0, calls: 0 });
  });

  it('stops asking a driver once the session call cap is spent', async () => {
    const small = config(1, { caps: { tokensPerTurn: 9000, callsPerTurn: 1, tokensPerSession: 90000, callsPerSession: 2 } });
    const t = setup([small, config(2)], { gemini: () => ok(1), groq: () => ok(1) });
    await t.begin();
    await t.play(3);
    expect(seatCalls(t, 1, 'gemini')).toHaveLength(2);
    expect(seatCalls(t, 1, 'groq')).toHaveLength(0);
    expect(t.caps.every((c) => c === '1 gemini session-calls' || c === '1 groq session-calls')).toBe(true);
    expect(t.caps.length).toBeGreaterThan(0);
  });

  it('a human who holds a configured seat is left alone, and leaving hands it to the bot', async () => {
    const t = setup([config(1), config(3)], { gemini: () => ok(1) });
    await t.session.start();
    await t.chat('!join juniper', 'u9', 'human9');
    await t.runner.start();
    expect(holderKinds(t)).toEqual(['bot', 'ai', 'bot', 'viewer']);
    expect(t.runner.panel().find((p) => p.seat === 3)).toMatchObject({ driver: 'human' });
    await t.session.host('start');
    await t.play(1);
    expect(seatCalls(t, 3)).toHaveLength(0);
    await t.chat('!leave', 'u9', 'human9');
    await t.settle();
    expect(holderKinds(t)[3]).toBe('bot');
    const row = t.tokenRows().find((r) => r['kind'] === 'swap' && r['reason'] === 'human-left');
    expect(row).toMatchObject({ seat: 3, from: 'human', to: 'bot' });
    expect(t.swaps.some((l) => l.includes('human to bot (human-left)'))).toBe(true);
    await t.play(2);
    expect(seatCalls(t, 3)).toHaveLength(0);
  });

  it('keeps swap state and history across a restart, and the open window gets its turns', async () => {
    const fs = memFs();
    const a = setup([config(1), config(2)], { gemini: () => ok(1), groq: () => ok(1) }, fs);
    await a.begin();
    await a.play(2);
    await a.runner.swap(1, 'groq', 'manual');
    await a.settle();
    const b = setup([config(1), config(2)], { gemini: () => ok(1), groq: () => ok(1) }, fs);
    await b.session.start();
    await b.runner.start();
    await b.settle();
    expect(b.runner.panel()[0]).toMatchObject({ driver: 'groq', swaps: 1 });
    expect(b.session.state()!.seats[1]!.holder.kind).toBe('ai');
    const asked = seatCalls(b, 1)[0];
    expect(asked?.driver).toBe('groq');
    expect(asked?.packet.user).toContain('you chose');
  });

  it('survives a driver that throws', async () => {
    const t = setup([config(1), config(2)], {
      gemini: () => {
        throw new Error('driver blew up');
      },
    });
    await t.begin();
    expect(t.logs.some((l) => l.includes('ai turn failed'))).toBe(true);
    await t.play(1);
    expect(t.session.state()!.round).toBeGreaterThan(1);
  });

  it('with a pace, holds each answer back until the pace has passed', async () => {
    const t = setup([config(1), config(2)], { gemini: () => ok(1) }, memFs(), 5000);
    // Not `begin`: its settle waits for the held turns, and the clock is ours to move.
    const flush = async (): Promise<void> => {
      for (let i = 0; i < 6; i++) await new Promise<void>((r) => setImmediate(r));
    };
    await t.session.start();
    await t.runner.start();
    await t.session.command({ type: 'assign', at: START, seat: 3, holder: 'ai', label: 'idle' });
    await t.session.host('start');
    await flush();
    expect(t.calls).toHaveLength(2);
    const declared = (): number =>
      (t.fs.files.get('/d/events.jsonl')?.match(/"by":"ai"/g) ?? []).length;
    expect(declared()).toBe(0);
    t.clock.advanceTo(START + 4999);
    await flush();
    expect(declared()).toBe(0);
    t.clock.advanceTo(START + 5000);
    await flush();
    expect(declared()).toBe(2);
  });
});
