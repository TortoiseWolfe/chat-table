import { describe, expect, it } from 'vitest';
import { createBotDriver } from '../../src/ai/drivers/bot.js';
import { createClaudeDriver, CLAUDE_URL } from '../../src/ai/drivers/claude.js';
import { createGeminiDriver, GEMINI_BASE } from '../../src/ai/drivers/gemini.js';
import { createGroqDriver, GROQ_URL } from '../../src/ai/drivers/groq.js';
import type { Driver, TurnPacket } from '../../src/ai/types.js';
import { FakeClock } from '../../src/sim/clock.js';

// A made-up marker, not shaped like any vendor key.
const KEY = 'FAKE-MARKER-ONLY-0123456789';

const packet: TurnPacket = {
  seat: 1,
  round: 2,
  system: 'SYSTEM TEXT',
  user: 'USER TEXT',
  options: [
    { n: 1, label: 'A' },
    { n: 2, label: 'B' },
  ],
  maxCp: 2,
  hasFp: true,
};

interface Seen {
  url: string;
  init: RequestInit;
}

function rig(reply: () => Response | Promise<Response>) {
  const clock = new FakeClock(1000);
  const seen: Seen[] = [];
  const logs: string[] = [];
  const deps = {
    now: () => clock.now(),
    setTimer: (fn: () => void, ms: number): unknown => clock.setTimer(fn, ms),
    clearTimer: (h: unknown): void => clock.clearTimer(h as number),
    fetch: ((url: string, init: RequestInit) => {
      seen.push({ url, init });
      return Promise.resolve(reply());
    }) as unknown as typeof globalThis.fetch,
    log: (l: string, m: string, f?: unknown): void => {
      logs.push(`${l} ${m} ${JSON.stringify(f ?? {})}`);
    },
  };
  return { clock, seen, logs, deps };
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const ANSWER = '{"option":2,"cp":1,"say":"Go."}';

type Rig = ReturnType<typeof rig>;
const cases: {
  name: string;
  make: (r: Rig, key: string | null) => Driver;
  ok: unknown;
  usage: { in: number; out: number };
  url: string;
  authHeader: string;
}[] = [
  {
    name: 'claude',
    make: (r, key) => createClaudeDriver({ model: 'claude-test', key, deps: r.deps }),
    ok: { content: [{ type: 'text', text: ANSWER }], usage: { input_tokens: 800, output_tokens: 30 } },
    usage: { in: 800, out: 30 },
    url: CLAUDE_URL,
    authHeader: 'x-api-key',
  },
  {
    name: 'gemini',
    make: (r, key) => createGeminiDriver({ model: 'gem-test', key, deps: r.deps }),
    ok: {
      candidates: [{ content: { parts: [{ text: ANSWER }] } }],
      usageMetadata: { promptTokenCount: 700, candidatesTokenCount: 25, thoughtsTokenCount: 15 },
    },
    usage: { in: 700, out: 40 },
    url: `${GEMINI_BASE}/gem-test:generateContent`,
    authHeader: 'x-goog-api-key',
  },
  {
    name: 'groq',
    make: (r, key) => createGroqDriver({ model: 'oss-test', key, deps: r.deps }),
    ok: {
      choices: [{ message: { content: ANSWER } }],
      usage: { prompt_tokens: 650, completion_tokens: 60 },
    },
    usage: { in: 650, out: 60 },
    url: GROQ_URL,
    authHeader: 'authorization',
  },
];

const sentBody = (r: Rig): string => r.seen[0]?.init.body as string;

describe.each(cases)('$name driver', (c) => {
  it('posts the packet once and reads decision and token counts', async () => {
    const r = rig(() => json(c.ok));
    const res = await c.make(r, KEY).decide(packet, 61_000);
    expect(r.seen).toHaveLength(1);
    expect(r.seen[0]?.url).toBe(c.url);
    expect(r.seen[0]?.init.method).toBe('POST');
    const body = sentBody(r);
    expect(body).toContain('SYSTEM TEXT');
    expect(body).toContain('USER TEXT');
    const headers = r.seen[0]?.init.headers as Record<string, string>;
    expect(headers[c.authHeader]).toContain(KEY);
    expect(body).not.toContain(KEY);
    expect(res).toMatchObject({
      outcome: 'ok',
      tokensIn: c.usage.in,
      tokensOut: c.usage.out,
      decision: { option: 2, cp: 1, fp: false, quote: 'Go.' },
    });
  });

  it('with no key makes no call and says no-key', async () => {
    const r = rig(() => json(c.ok));
    const res = await c.make(r, null).decide(packet, 61_000);
    expect(r.seen).toHaveLength(0);
    expect(res.outcome).toBe('no-key');
    expect(res.decision).toBeNull();
  });

  it('a past deadline makes no call and times out', async () => {
    const r = rig(() => json(c.ok));
    const res = await c.make(r, KEY).decide(packet, 1000);
    expect(r.seen).toHaveLength(0);
    expect(res.outcome).toBe('timeout');
  });

  it('an http error keeps only the status, never the key or the body', async () => {
    const r = rig(() => new Response(`bad key ${KEY} and USER TEXT`, { status: 401 }));
    const res = await c.make(r, KEY).decide(packet, 61_000);
    expect(res.outcome).toBe('http-error');
    const logged = r.logs.join('\n');
    expect(logged).toContain('401');
    expect(logged).not.toContain(KEY);
    expect(logged).not.toContain('USER TEXT');
  });

  it('a thrown fetch is an http-error whose message is not logged', async () => {
    const r = rig(() => {
      throw new Error(`boom ${KEY}`);
    });
    const res = await c.make(r, KEY).decide(packet, 61_000);
    expect(res.outcome).toBe('http-error');
    expect(r.logs.join('\n')).not.toContain(KEY);
  });

  it('a body of the wrong shape is bad-answer', async () => {
    for (const body of [{}, [], 'x', { content: [], candidates: [], choices: [] }]) {
      const r = rig(() => json(body));
      expect((await c.make(r, KEY).decide(packet, 61_000)).outcome).toBe('bad-answer');
    }
  });

  it('an option that is not on offer is bad-answer but still counts the tokens', async () => {
    const off = JSON.parse(JSON.stringify(c.ok).replace('\\"option\\":2', '\\"option\\":7')) as unknown;
    const r = rig(() => json(off));
    const res = await c.make(r, KEY).decide(packet, 61_000);
    expect(res.outcome).toBe('bad-answer');
    expect(res.tokensIn).toBe(c.usage.in);
  });

  it('a call still pending at the deadline is aborted and times out', async () => {
    const r = rig(() => json({}));
    let aborted = false;
    r.deps.fetch = ((_url: string, init: RequestInit) =>
      new Promise<Response>((_res, rej) => {
        init.signal?.addEventListener('abort', () => {
          aborted = true;
          rej(new DOMException('aborted', 'AbortError'));
        });
      })) as unknown as typeof globalThis.fetch;
    const p = c.make(r, KEY).decide(packet, 6000);
    await Promise.resolve();
    r.clock.advanceTo(6000);
    const res = await p;
    expect(aborted).toBe(true);
    expect(res.outcome).toBe('timeout');
    expect(res.latencyMs).toBe(5000);
  });

  it('clears its timer after a normal answer', async () => {
    const r = rig(() => json(c.ok));
    const cleared: unknown[] = [];
    const clear = r.deps.clearTimer;
    r.deps.clearTimer = (h) => {
      cleared.push(h);
      clear(h);
    };
    await c.make(r, KEY).decide(packet, 61_000);
    expect(cleared).toHaveLength(1);
  });
});

describe('request shapes', () => {
  it('claude sends the version header, a token ceiling and the system text apart', async () => {
    const r = rig(() => json({}));
    await createClaudeDriver({ model: 'm', key: KEY, deps: r.deps }).decide(packet, 61_000);
    const h = r.seen[0]?.init.headers as Record<string, string>;
    expect(h['anthropic-version']).toBe('2023-06-01');
    const b = JSON.parse(sentBody(r)) as Record<string, unknown>;
    expect(b['system']).toBe('SYSTEM TEXT');
    expect(b['max_tokens']).toBeLessThanOrEqual(200);
    expect(b['messages']).toEqual([{ role: 'user', content: 'USER TEXT' }]);
  });

  it('gemini puts the key in a header, not the url, and asks for JSON', async () => {
    const r = rig(() => json({}));
    await createGeminiDriver({ model: 'm', key: KEY, deps: r.deps }).decide(packet, 61_000);
    expect(r.seen[0]?.url).not.toContain('key=');
    expect(r.seen[0]?.url).not.toContain(KEY);
    const b = JSON.parse(sentBody(r)) as { generationConfig: Record<string, unknown> };
    expect(b.generationConfig['responseMimeType']).toBe('application/json');
  });

  it('groq uses a bearer token and a JSON response format', async () => {
    const r = rig(() => json({}));
    await createGroqDriver({ model: 'm', key: KEY, deps: r.deps }).decide(packet, 61_000);
    const h = r.seen[0]?.init.headers as Record<string, string>;
    expect(h['authorization']).toBe(`Bearer ${KEY}`);
    const b = JSON.parse(sentBody(r)) as Record<string, unknown>;
    expect(b['response_format']).toEqual({ type: 'json_object' });
  });
});

describe('bot driver', () => {
  it('with no state it has no answer and costs nothing', async () => {
    const d = createBotDriver({ state: () => null, pack: null as never });
    const res = await d.decide(packet, 0);
    expect(res).toMatchObject({ decision: null, tokensIn: 0, tokensOut: 0, outcome: 'bad-answer' });
    expect(d.id).toBe('bot');
    expect(d.model).toBe('autopilot');
  });
});
