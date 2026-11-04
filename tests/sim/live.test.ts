import { describe, expect, it } from 'vitest';
import { CLAUDE_URL } from '../../src/ai/drivers/claude.js';
import { GEMINI_BASE } from '../../src/ai/drivers/gemini.js';
import { GROQ_URL } from '../../src/ai/drivers/groq.js';
import { DEFAULT_SETTINGS } from '../../src/engine/state.js';
import { loadPackSync } from '../../src/packs/load.js';
import type { Deps } from '../../src/runtime/deps.js';
import { FakeClock } from '../../src/sim/clock.js';
import { runLive, type LiveResult } from '../../src/sim/live.js';
import { memFs } from '../helpers/memfs.js';

const START = 1793000000000;
const MARKERS = { claude: 'MARKER-CLAUDE-KEY', gemini: 'MARKER-GEMINI-KEY', groq: 'MARKER-GROQ-KEY' };
const pack = loadPackSync('packs/frontier');

const SEATS = JSON.stringify({
  seats: [
    { seat: 1, label: 'Claude seat', primary: { id: 'claude', model: 'haiku-x' }, backup: { id: 'groq', model: 'oss-x' } },
    { seat: 2, label: 'Gemini seat', primary: { id: 'gemini', model: 'flash-x' }, backup: { id: 'groq', model: 'oss-x' } },
    { seat: 3, label: 'H-7CH (stand-in)', primary: { id: 'bot', model: '' }, backup: { id: 'bot', model: '' } },
  ],
  keyFiles: { claude: '/k/claude', gemini: '/k/gemini', groq: '/k/groq' },
});

const reply = (url: string): unknown => {
  const text = '{"option":1,"cp":0,"say":"Moving."}';
  if (url.startsWith(CLAUDE_URL)) {
    return { content: [{ type: 'text', text }], usage: { input_tokens: 700, output_tokens: 20 } };
  }
  if (url.startsWith(GEMINI_BASE)) {
    return {
      candidates: [{ content: { parts: [{ text }] } }],
      usageMetadata: { promptTokenCount: 700, candidatesTokenCount: 20 },
    };
  }
  return { choices: [{ message: { content: text } }], usage: { prompt_tokens: 700, completion_tokens: 20 } };
};

async function run(seed: number, opts: { stopOnCap?: boolean; seats?: string } = {}) {
  const fs = memFs();
  fs.files.set('/c/seats.json', opts.seats ?? SEATS);
  fs.files.set('/k/claude', MARKERS.claude);
  fs.files.set('/k/gemini', MARKERS.gemini);
  fs.files.set('/k/groq', MARKERS.groq);
  const clock = new FakeClock(START);
  const logs: string[] = [];
  const urls: string[] = [];
  const deps: Deps = {
    now: () => clock.now(),
    setTimer: (fn, ms) => clock.setTimer(fn, ms),
    clearTimer: (id) => clock.clearTimer(id as number),
    fs,
    fetch: ((url: string) => {
      urls.push(url);
      return Promise.resolve(
        new Response(JSON.stringify(reply(url)), { status: 200, headers: { 'content-type': 'application/json' } })
      );
    }) as unknown as typeof fetch,
    log: (l, m, f) => logs.push(`${l} ${m} ${JSON.stringify(f ?? {})}`),
    randomSeed: () => 1,
    randomBytes: (n) => new Uint8Array(n),
  };
  const out: string[] = [];
  const marks: string[] = [];
  let result: LiveResult | null = null;
  const done = runLive({
    deps,
    pack,
    seed,
    settings: { ...DEFAULT_SETTINGS, declareMs: 20_000 },
    dataDir: '/d',
    seatsFile: '/c/seats.json',
    paceMs: 5_000,
    maxMs: 3 * 60 * 60 * 1000,
    swap: { afterMs: 15_000, seat: 2, to: 'groq' },
    stopOnCap: opts.stopOnCap ?? false,
    sink: { publish: () => undefined, mark: (t) => marks.push(t), refresh: () => undefined },
    out: (l) => out.push(l),
  }).then((r) => {
    result = r;
  });
  const flush = async (): Promise<void> => {
    for (let i = 0; i < 6; i++) await new Promise<void>((r) => setImmediate(r));
  };
  for (let i = 0; i < 20_000 && result === null; i++) {
    await flush();
    clock.advanceTo(clock.now() + 1000);
  }
  await done;
  const tokens = (fs.files.get('/d/ai-tokens.jsonl') ?? '')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
  return { result: result as unknown as LiveResult, fs, logs, urls, out, marks, tokens };
}

describe('runLive with three fake-model seats', () => {
  it('plays to an ending, swaps the Gemini seat mid-run and keeps the character', async () => {
    const r = await run(11);
    expect(r.result.reason).toBe('ended');
    expect(r.result.state?.phase).toBe('ended');
    expect(r.result.capped).toEqual([]);
    const swaps = r.tokens.filter((t) => t['kind'] === 'swap' && t['reason'] === 'manual');
    expect(swaps).toEqual([expect.objectContaining({ seat: 2, from: 'gemini', to: 'groq' })]);
    expect(r.marks).toHaveLength(1);
    expect(r.marks[0]).toContain('gemini to groq (manual)');
    const rows = r.tokens.filter((t) => t['kind'] === 'call' && t['seat'] === 2);
    const swapAt = swaps[0]!['t'] as number;
    expect(rows.some((c) => c['driver'] === 'gemini' && (c['t'] as number) < swapAt)).toBe(true);
    expect(rows.some((c) => c['driver'] === 'groq' && (c['t'] as number) >= swapAt)).toBe(true);
    expect(rows.every((c) => c['driver'] !== 'gemini' || (c['t'] as number) < swapAt)).toBe(true);
    // The same character answers on both sides of the swap.
    const log = r.fs.files.get('/d/events.jsonl') ?? '';
    expect(log).toContain('"type":"seat-assigned","seat":2,"holder":"ai","label":"Gemini seat"');
    expect(log).toContain('"seat":2,"by":"ai"');
    expect(r.urls.some((u) => u.startsWith(CLAUDE_URL))).toBe(true);
    expect(r.urls.some((u) => u.startsWith(GROQ_URL))).toBe(true);
  });

  it('no key reaches the token log, the event log, the saved state or the logs', async () => {
    const r = await run(12);
    const everything = [...r.fs.files.entries()]
      .filter(([path]) => !path.startsWith('/k/'))
      .map(([, text]) => text)
      .concat(r.logs, r.out, r.marks)
      .join('\n');
    for (const marker of Object.values(MARKERS)) expect(everything).not.toContain(marker);
  });

  it('writes a token row for every call with driver, model and token counts', async () => {
    const r = await run(13);
    const calls = r.tokens.filter((t) => t['kind'] === 'call');
    expect(calls.length).toBeGreaterThan(20);
    const claude = calls.find((c) => c['driver'] === 'claude')!;
    expect(claude).toMatchObject({ seat: 1, model: 'haiku-x', in: 700, out: 20, outcome: 'ok' });
    expect(calls.filter((c) => c['driver'] === 'bot').every((c) => c['in'] === 0 && c['out'] === 0)).toBe(true);
  });

  it('the same seed gives the same event log', async () => {
    const a = await run(21);
    const b = await run(21);
    expect(b.fs.files.get('/d/events.jsonl')).toBe(a.fs.files.get('/d/events.jsonl'));
    const c = await run(22);
    expect(c.fs.files.get('/d/events.jsonl')).not.toBe(a.fs.files.get('/d/events.jsonl'));
  });

  it('stops at the first cap when asked to, and says which', async () => {
    const tight = JSON.stringify({
      seats: [
        {
          seat: 1,
          label: 'Tight',
          primary: { id: 'claude', model: 'haiku-x' },
          backup: { id: 'groq', model: 'oss-x' },
          caps: { callsPerSession: 2 },
        },
      ],
      keyFiles: { claude: '/k/claude', groq: '/k/groq' },
    });
    const r = await run(14, { stopOnCap: true, seats: tight });
    expect(r.result.reason).toBe('cap');
    expect(r.result.capped[0]).toBe('seat 1 claude session-calls');
    // Stopping the run stops the game: it does not play on without the capped seat.
    expect(r.result.state?.phase).toBe('ended');
    expect(r.result.rounds).toBeLessThan(6);
  });
});
