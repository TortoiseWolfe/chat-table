import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../src/sim/clock.js';
import { createOutbound } from '../../src/twitch/outbound.js';

interface Call {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

function setup(reply: (n: number) => Response | Promise<Response>, limit?: number) {
  const clock = new FakeClock(1_000_000);
  const calls: Call[] = [];
  const logs: { level: string; msg: string; data?: unknown }[] = [];
  const fetchFake = ((url: string, init: RequestInit) => {
    calls.push({
      url,
      headers: init.headers as Record<string, string>,
      body: JSON.parse(init.body as string) as Record<string, unknown>,
    });
    return Promise.resolve(reply(calls.length));
  }) as unknown as typeof fetch;
  const out = createOutbound({
    deps: {
      fetch: fetchFake,
      now: () => clock.now(),
      setTimer: (fn, ms) => clock.setTimer(fn, ms),
      clearTimer: (id) => clock.clearTimer(id as number),
      log: (level, msg, data) => logs.push({ level, msg, data }),
    },
    clientId: 'cid',
    token: () => 'TOKEN',
    broadcasterId: '100',
    senderId: '200',
    ...(limit === undefined ? {} : { limit }),
  });
  return { clock, calls, logs, out };
}

const ok = () =>
  new Response(JSON.stringify({ data: [{ message_id: 'm', is_sent: true }] }), { status: 200 });
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('createOutbound', () => {
  it('posts one line with the broadcaster, sender and message, and a Bearer token', async () => {
    const { calls, out } = setup(ok);
    await out.send('hello chat');
    await flush();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://api.twitch.tv/helix/chat/messages');
    expect(calls[0]?.body).toEqual({
      broadcaster_id: '100',
      sender_id: '200',
      message: 'hello chat',
    });
    expect(calls[0]?.headers['authorization']).toBe('Bearer TOKEN');
    expect(calls[0]?.headers['client-id']).toBe('cid');
    out.stop();
  });

  it('a refused post (429) is logged, never thrown', async () => {
    const { logs, out } = setup(() => new Response('{}', { status: 429 }));
    await expect(out.send('hi')).resolves.toBeUndefined();
    await flush();
    expect(logs.some((l) => l.level === 'error' && l.msg === 'twitch refused a chat message')).toBe(
      true
    );
    out.stop();
  });

  it('a failed fetch is logged, never thrown', async () => {
    const { logs, out } = setup(() => {
      throw new Error('socket hang up');
    });
    await expect(out.send('hi')).resolves.toBeUndefined();
    await flush();
    expect(logs.some((l) => l.msg === 'sending a chat message failed')).toBe(true);
    out.stop();
  });

  it('is_sent false is logged with the drop code', async () => {
    const { logs, out } = setup(
      () =>
        new Response(
          JSON.stringify({ data: [{ is_sent: false, drop_reason: { code: 'msg_duplicate' } }] }),
          { status: 200 }
        )
    );
    await out.send('hi');
    await flush();
    expect(logs).toContainEqual({
      level: 'warn',
      msg: 'twitch dropped a chat message',
      data: { code: 'msg_duplicate' },
    });
    out.stop();
  });

  it('keeps to the rate limit: 25 lines at once go out one a second, 20 per 30 s at most', async () => {
    const { clock, calls, out } = setup(ok);
    for (let i = 0; i < 25; i++) await out.send(`line ${String(i)}`, `u${String(i)}`);
    await flush();
    expect(calls).toHaveLength(1);
    clock.advanceTo(1_000_000 + 10_000);
    await flush();
    expect(calls.length).toBeGreaterThanOrEqual(10);
    expect(calls.length).toBeLessThanOrEqual(11);
    clock.advanceTo(1_000_000 + 29_000);
    await flush();
    expect(calls.length).toBeLessThanOrEqual(20);
    out.stop();
  });

  it('a moderator gets the larger allowance', async () => {
    const { clock, calls, out } = setup(ok);
    out.setModerator(true);
    for (let i = 0; i < 40; i++) await out.send(`line ${String(i)}`, `u${String(i)}`);
    clock.advanceTo(1_000_000 + 45_000);
    await flush();
    expect(calls.length).toBeGreaterThan(20);
    out.stop();
  });

  it('stop() ends the pump: nothing more is sent', async () => {
    const { clock, calls, out } = setup(ok);
    for (let i = 0; i < 5; i++) await out.send(`line ${String(i)}`, `u${String(i)}`);
    await flush();
    out.stop();
    clock.advanceTo(1_000_000 + 60_000);
    await flush();
    expect(calls).toHaveLength(1);
  });
});
