import { describe, expect, it } from 'vitest';
import { createDriverFactory, defaultCaps, loadKeys, parseAiConfig } from '../../src/ai/config.js';
import { loadPackSync } from '../../src/packs/load.js';
import { parseEnv } from '../../src/runtime/deps.js';
import { memFs } from '../helpers/memfs.js';

const seat = (n: number, extra: Record<string, unknown> = {}) => ({
  seat: n,
  label: `Seat ${String(n)}`,
  primary: { id: 'gemini', model: 'm1' },
  backup: { id: 'groq', model: 'm2' },
  ...extra,
});

describe('parseAiConfig', () => {
  it('reads seats, key file paths and fills caps from the primary driver', () => {
    const c = parseAiConfig(
      JSON.stringify({
        seats: [seat(1, { primary: { id: 'claude', model: 'h' } }), seat(2)],
        keyFiles: { claude: '/k/c', groq: '/k/g' },
      })
    );
    expect(c.seats.map((s) => s.seat)).toEqual([1, 2]);
    expect(c.seats[0]!.caps).toEqual(defaultCaps('claude'));
    expect(c.seats[1]!.caps).toEqual(defaultCaps('gemini'));
    expect(c.keyFiles).toEqual({ claude: '/k/c', groq: '/k/g' });
  });

  it('lets a seat override some caps and keeps the defaults for the rest', () => {
    const c = parseAiConfig(JSON.stringify({ seats: [seat(1, { caps: { callsPerSession: 7 } })] }));
    expect(c.seats[0]!.caps).toEqual({ ...defaultCaps('gemini'), callsPerSession: 7 });
  });

  it('refuses a repeated seat, a bad driver, a seat out of range and no seats', () => {
    expect(() => parseAiConfig(JSON.stringify({ seats: [seat(1), seat(1)] }))).toThrow('twice');
    expect(() =>
      parseAiConfig(JSON.stringify({ seats: [seat(1, { primary: { id: 'gpt', model: 'x' } })] }))
    ).toThrow();
    expect(() => parseAiConfig(JSON.stringify({ seats: [seat(4)] }))).toThrow();
    expect(() => parseAiConfig(JSON.stringify({ seats: [] }))).toThrow();
    expect(() => parseAiConfig('not json')).toThrow();
  });

  it('needs a model id for a model driver but not for the bot', () => {
    const bot = { id: 'bot' };
    expect(parseAiConfig(JSON.stringify({ seats: [seat(1, { primary: bot, backup: bot })] })).seats[0]!.primary).toEqual({ id: 'bot', model: '' });
    expect(() => parseAiConfig(JSON.stringify({ seats: [seat(1, { primary: { id: 'groq' } })] }))).toThrow('model');
  });

  it('refuses a cap that is not a positive whole number', () => {
    expect(() =>
      parseAiConfig(JSON.stringify({ seats: [seat(1, { caps: { tokensPerTurn: 0 } })] }))
    ).toThrow();
    expect(() =>
      parseAiConfig(JSON.stringify({ seats: [seat(1, { caps: { callsPerTurn: 1.5 } })] }))
    ).toThrow();
  });
});

describe('loadKeys', () => {
  it('reads and trims each file, and logs only driver names for a missing or empty one', async () => {
    const fs = memFs();
    fs.files.set('/k/c', '  MARKER-CLAUDE \n');
    fs.files.set('/k/g', '\n');
    const logs: string[] = [];
    const keys = await loadKeys(fs, { claude: '/k/c', gemini: '/k/missing', groq: '/k/g' }, (l, m, f) =>
      logs.push(`${l} ${m} ${JSON.stringify(f)}`)
    );
    expect(keys).toEqual({ claude: 'MARKER-CLAUDE', gemini: null, groq: null });
    const text = logs.join('\n');
    expect(text).toContain('gemini');
    expect(text).not.toContain('MARKER-CLAUDE');
    expect(text).not.toContain('/k/');
  });

  it('a driver with no key file configured is simply off', async () => {
    expect(await loadKeys(memFs(), {}, () => undefined)).toEqual({
      claude: null,
      gemini: null,
      groq: null,
    });
  });
});

describe('createDriverFactory', () => {
  it('makes the driver the spec names, the bot one reading the live state', () => {
    const f = createDriverFactory({
      keys: { claude: 'a', gemini: 'b', groq: null },
      deps: {
        now: () => 0,
        setTimer: () => 0,
        clearTimer: () => undefined,
        fetch: globalThis.fetch,
        log: () => undefined,
      },
      pack: loadPackSync('packs/frontier'),
      state: () => null,
    });
    expect(f({ id: 'claude', model: 'x' })).toMatchObject({ id: 'claude', model: 'x' });
    expect(f({ id: 'gemini', model: 'y' })).toMatchObject({ id: 'gemini', model: 'y' });
    expect(f({ id: 'groq', model: 'z' })).toMatchObject({ id: 'groq', model: 'z' });
    expect(f({ id: 'bot', model: '' })).toMatchObject({ id: 'bot', model: 'autopilot' });
  });
});

describe('parseEnv for AI seats', () => {
  it('has no seats file and no pace by default, and reads both when set', () => {
    const off = parseEnv({}, 'sim');
    expect(off.aiSeatsFile).toBeUndefined();
    expect(off.aiPaceMs).toBe(0);
    const on = parseEnv({ AI_SEATS_FILE: '/c/ai.json', AI_PACE_SECONDS: '40' }, 'sim');
    expect(on.aiSeatsFile).toBe('/c/ai.json');
    expect(on.aiPaceMs).toBe(40_000);
    expect(() => parseEnv({ AI_PACE_SECONDS: '-1' }, 'sim')).toThrow('AI_PACE_SECONDS');
  });
});
