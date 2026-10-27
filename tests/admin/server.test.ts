import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createAdmin } from '../../src/admin/server.js';
import { DEFAULT_SETTINGS } from '../../src/engine/state.js';
import type { Deps } from '../../src/runtime/deps.js';
import { createSession } from '../../src/runtime/session.js';
import { createStore } from '../../src/runtime/store.js';
import { FakeClock } from '../../src/sim/clock.js';
import { memFs } from '../helpers/memfs.js';
import { tinyPack } from '../helpers/tinyPack.js';

const KEY = 'k'.repeat(64);
const enc = new TextEncoder();
let server: Server | undefined;
afterEach(() => {
  server?.closeAllConnections();
  server?.close();
});

async function boot() {
  const fs = memFs();
  const clock = new FakeClock(1793000000000);
  const deps: Deps = {
    now: () => clock.now(),
    setTimer: (fn, ms) => clock.setTimer(fn, ms),
    clearTimer: (id) => clock.clearTimer(id as number),
    fs,
    fetch: () => {
      throw new Error('no network');
    },
    log: () => undefined,
    randomSeed: () => 1,
    randomBytes: (n) => new Uint8Array(n),
  };
  const session = createSession({
    deps,
    pack: tinyPack(),
    settings: DEFAULT_SETTINGS,
    seed: 1,
    store: createStore(fs, '/d', () => undefined),
    send: () => Promise.resolve(),
    botUserId: 'bot',
    channelId: 'chan',
  });
  await session.start();
  const admin = createAdmin({
    session,
    key: KEY,
    publicDir: '/pub',
    files: {
      read: (p) =>
        Promise.resolve(p === '/pub/index.html' ? enc.encode('<html>dock</html>') : null),
    },
  });
  server = createServer((req, res) => {
    if (!admin.handle(req, res)) {
      res.writeHead(418);
      res.end();
    }
  });
  await new Promise<void>((r) => server?.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${String((server?.address() as AddressInfo).port)}`;
  const call = (path: string, init: RequestInit & { key?: string | null } = {}) => {
    const { key = KEY, ...rest } = init;
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (key !== null) headers['authorization'] = `Bearer ${key}`;
    return fetch(`${base}${path}`, { ...rest, headers });
  };
  return { call, session, base };
}

describe('admin server', () => {
  it('serves the dock page with no key', async () => {
    const { base } = await boot();
    const res = await fetch(`${base}/admin`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('dock');
  });

  it('answers 401 with no or a wrong bearer key', async () => {
    const { call } = await boot();
    expect((await call('/admin/api/state', { key: null })).status).toBe(401);
    expect((await call('/admin/api/state', { key: 'wrong' })).status).toBe(401);
    expect((await call('/admin/api/start', { method: 'POST', key: 'x'.repeat(64) })).status).toBe(
      401
    );
  });

  it('start, pause, stop move the session as named', async () => {
    const { call, session } = await boot();
    expect((await call('/admin/api/start', { method: 'POST' })).status).toBe(202);
    expect(session.state()?.phase).toBe('scene');
    const state = (await (await call('/admin/api/state')).json()) as {
      phase: string;
      seats: { holder: string }[];
      waitlist: string[];
    };
    expect(state.phase).toBe('scene');
    expect(state.seats).toHaveLength(4);
    expect(state.waitlist).toEqual([]);
    expect((await call('/admin/api/pause', { method: 'POST' })).status).toBe(202);
    expect(session.state()?.phase).toBe('paused');
    expect((await call('/admin/api/stop', { method: 'POST' })).status).toBe(202);
    expect(session.state()?.phase).toBe('ended');
  });

  it('skip moves on to the next scene', async () => {
    const { call, session } = await boot();
    await call('/admin/api/start', { method: 'POST' });
    expect(session.state()?.sceneId).toBe('start');
    expect((await call('/admin/api/skip', { method: 'POST' })).status).toBe(202);
    expect(session.state()?.sceneId).toBe('fight');
  });

  it('kick without a login is 400; with a login it is 202', async () => {
    const { call } = await boot();
    await call('/admin/api/start', { method: 'POST' });
    expect((await call('/admin/api/kick', { method: 'POST', body: '{}' })).status).toBe(400);
    expect((await call('/admin/api/kick', { method: 'POST', body: 'not json' })).status).toBe(400);
    expect(
      (await call('/admin/api/kick', { method: 'POST', body: JSON.stringify({ login: 'nobody' }) }))
        .status
    ).toBe(202);
  });

  it('405 for a bad method, 404 for an unknown path, 413 for a big body', async () => {
    const { call } = await boot();
    expect((await call('/admin/api/start')).status).toBe(405);
    expect((await call('/admin/api/nope', { method: 'POST' })).status).toBe(404);
    const big = JSON.stringify({ login: 'x'.repeat(5000) });
    expect((await call('/admin/api/kick', { method: 'POST', body: big })).status).toBe(413);
  });
});
