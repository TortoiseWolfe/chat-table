import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createEventSub, type ChatEvent } from '../../src/twitch/eventsub.js';
import { startFakeTwitch, type FakeTwitch } from '../helpers/fakeTwitch.js';

const CHANNEL = '100';
const BOT = '200';

async function until(check: () => boolean, ms = 8000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe('createEventSub against a fake Twitch', () => {
  let twitch: FakeTwitch;
  let chats: ChatEvent[];
  let offlines: number;
  let logs: string[];
  let stop: () => void;

  beforeEach(async () => {
    twitch = await startFakeTwitch(CHANNEL);
    process.env['TWURPLE_MOCK_API_PORT'] = String(twitch.port);
    chats = [];
    offlines = 0;
    logs = [];
    const sub = createEventSub({
      deps: { log: (_l, msg) => logs.push(msg) },
      clientId: 'cid',
      token: () => 'TOKEN',
      botUserId: BOT,
      broadcasterId: CHANNEL,
      onChat: (e) => chats.push(e),
      onOffline: () => (offlines += 1),
    });
    sub.start();
    stop = () => sub.stop();
    await until(() => twitch.subs.length === 2);
    // Twurple files a subscription under its Twitch id when the reply arrives, just after the request.
    await new Promise((r) => setTimeout(r, 150));
  });

  afterEach(async () => {
    stop();
    delete process.env['TWURPLE_MOCK_API_PORT'];
    await twitch.close();
  });

  it('subscribes to chat messages and stream.offline as soon as the socket welcomes it', () => {
    expect(twitch.subs.map((s) => s.type).sort()).toEqual([
      'channel.chat.message',
      'stream.offline',
    ]);
    // One socket for the bot's chat subscription, one for the channel's stream.offline.
    expect(twitch.sockets).toHaveLength(2);
  });

  it('maps a chat message to the fields the game reads', async () => {
    twitch.chat({
      chatterId: '500',
      chatterLogin: 'Viewer1',
      text: '!join ana',
      badges: ['moderator'],
    });
    await until(() => chats.length === 1);
    expect(chats[0]).toMatchObject({
      chatterId: '500',
      chatterLogin: 'viewer1',
      text: '!join ana',
      badges: ['moderator'],
      sourceChannelId: null,
    });
  });

  it('passes the source channel of a shared-chat message through', async () => {
    twitch.chat({ sourceBroadcasterId: '999' });
    await until(() => chats.length === 1);
    expect(chats[0]?.sourceChannelId).toBe('999');
  });

  it('reports stream.offline once', async () => {
    twitch.offline();
    await until(() => offlines === 1);
    expect(offlines).toBe(1);
  });

  it('on session_reconnect opens the new socket before closing the old, and loses no message', async () => {
    twitch.reconnect();
    twitch.chat({ messageId: 'before-close', text: 'on the old socket' }, 0);
    await until(() => twitch.sockets.length === 3);
    await until(() => twitch.sockets[0]?.closedAt !== null);
    const oldSocket = twitch.sockets[0];
    const newSocket = twitch.sockets[2];
    expect(newSocket?.path).toBe('/ws2');
    expect((newSocket?.openedAt ?? 0) < (oldSocket?.closedAt ?? 0)).toBe(true);
    twitch.chat({ messageId: 'after-switch', text: 'on the new socket' });
    await until(() => chats.length === 2);
    expect(chats.map((c) => c.messageId).sort()).toEqual(['after-switch', 'before-close']);
    expect(twitch.subs).toHaveLength(2);
  });

  it('subscribes again after the socket drops, and keeps delivering', async () => {
    twitch.drop();
    await until(() => twitch.subs.length === 3, 15000);
    expect(twitch.sockets.length).toBeGreaterThanOrEqual(3);
    twitch.chat({ messageId: 'after-drop' });
    await until(() => chats.length === 1);
    expect(chats[0]?.messageId).toBe('after-drop');
  }, 20000);
});
