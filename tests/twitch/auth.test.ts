import { describe, expect, it } from 'vitest';
import { createAuth } from '../../src/twitch/auth.js';
import { FakeClock } from '../../src/sim/clock.js';
import { memFs } from '../helpers/memfs.js';

const START = 1793000000000;
const HOUR = 3600 * 1000;
const OLD = 'OLD-ACCESS-TOKEN-1234';
const NEW = 'NEW-ACCESS-TOKEN-5678';
const REFRESH = 'REFRESH-TOKEN-9999';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function setup(expiresInMs: number) {
  const fs = memFs();
  const clock = new FakeClock(START);
  const logs: string[] = [];
  const calls: string[] = [];
  let current = OLD;
  const fetchFn = ((url: string, init?: RequestInit) => {
    calls.push(url);
    if (url.endsWith('/validate')) {
      const sent = (init?.headers as Record<string, string>)['authorization'];
      if (sent !== `OAuth ${current}`) return Promise.resolve(json({}, 401));
      const left = current === OLD ? Math.max(0, expiresInMs - (clock.now() - START)) : 4 * HOUR;
      return Promise.resolve(json({ login: 'botty', user_id: '42', expires_in: left / 1000 }));
    }
    if (url.endsWith('/token')) {
      current = NEW;
      return Promise.resolve(
        json({ access_token: NEW, refresh_token: 'REFRESH-2', expires_in: 4 * 3600 })
      );
    }
    return Promise.resolve(json({}, 404));
  }) as unknown as typeof fetch;
  fs.files.set(
    '/d/token.json',
    JSON.stringify({
      accessToken: OLD,
      refreshToken: REFRESH,
      expiresAt: START + expiresInMs,
      login: 'botty',
      userId: '42',
    })
  );
  const auth = createAuth({
    clientId: 'cid',
    dataDir: '/d',
    deps: {
      fetch: fetchFn,
      fs,
      now: () => clock.now(),
      setTimer: (fn, ms) => clock.setTimer(fn, ms),
      clearTimer: (id) => clock.clearTimer(id as number),
      log: (level, msg, data) => logs.push(`${level}: ${msg} ${JSON.stringify(data ?? {})}`),
    },
  });
  return { auth, clock, logs, calls, fs };
}

describe('createAuth', () => {
  it('refreshes an expiring token at the hourly check, with no gap', async () => {
    const t = setup(90 * 60 * 1000);
    await t.auth.start();
    expect(t.auth.token()).toBe(OLD);
    expect(t.calls.filter((c) => c.endsWith('/token'))).toHaveLength(0);
    t.clock.advanceTo(START + HOUR);
    await new Promise((r) => setTimeout(r, 20));
    expect(t.calls.filter((c) => c.endsWith('/token'))).toHaveLength(1);
    expect(t.auth.token()).toBe(NEW);
    const saved = JSON.parse(t.fs.files.get('/d/token.json') ?? '{}') as { accessToken: string };
    expect(saved.accessToken).toBe(NEW);
    expect(t.fs.modes.get('/d/token.json')).toBe(0o600);
    t.auth.stop();
  });

  it('keeps a healthy token as it is', async () => {
    const t = setup(10 * HOUR);
    await t.auth.start();
    t.clock.advanceTo(START + HOUR);
    await new Promise((r) => setTimeout(r, 20));
    expect(t.calls.filter((c) => c.endsWith('/token'))).toHaveLength(0);
    expect(t.auth.token()).toBe(OLD);
    t.auth.stop();
  });

  it('never logs a token string', async () => {
    const t = setup(90 * 60 * 1000);
    await t.auth.start();
    t.clock.advanceTo(START + HOUR);
    await new Promise((r) => setTimeout(r, 20));
    const all = t.logs.join('\n');
    expect(all).toContain('twitch token refreshed');
    for (const secret of [OLD, NEW, REFRESH, 'REFRESH-2']) expect(all).not.toContain(secret);
    t.auth.stop();
  });

  it('refuses to start with no token file', async () => {
    const t = setup(HOUR);
    t.fs.files.delete('/d/token.json');
    await expect(t.auth.start()).rejects.toThrow();
  });

  it('says whose token it is', async () => {
    const { auth } = setup(8 * HOUR);
    await auth.start();
    expect(auth.who()).toEqual({ userId: '42', login: 'botty' });
    auth.stop();
  });
});
