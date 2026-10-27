import { describe, expect, it } from 'vitest';
import { lookupUserId, toChatMessage } from '../../src/twitch/adapter.js';
import type { ChatEvent } from '../../src/twitch/eventsub.js';

const ev = (over: Partial<ChatEvent> = {}): ChatEvent => ({
  messageId: 'm1',
  chatterId: '500',
  chatterLogin: 'Viewer1',
  text: '!join ana',
  badges: [],
  sourceChannelId: null,
  ...over,
});

describe('toChatMessage', () => {
  it('maps a plain message and lowercases the login', () => {
    expect(toChatMessage(ev(), 42, '100', '200')).toEqual({
      messageId: 'm1',
      userId: '500',
      login: 'viewer1',
      text: '!join ana',
      isMod: false,
      isBroadcaster: false,
      at: 42,
      sourceChannelId: null,
    });
  });

  it("drops the bot's own messages", () => {
    expect(toChatMessage(ev({ chatterId: '200' }), 1, '100', '200')).toBeNull();
  });

  it('drops a shared-chat message from another channel (SC-007), keeps one from ours', () => {
    expect(toChatMessage(ev({ sourceChannelId: '999' }), 1, '100', '200')).toBeNull();
    expect(toChatMessage(ev({ sourceChannelId: '100' }), 1, '100', '200')?.sourceChannelId).toBe(
      '100'
    );
  });

  it('reads the moderator and broadcaster badges, and the channel owner by id', () => {
    expect(toChatMessage(ev({ badges: ['moderator'] }), 1, '100', '200')).toMatchObject({
      isMod: true,
      isBroadcaster: false,
    });
    expect(toChatMessage(ev({ badges: ['broadcaster'] }), 1, '100', '200')).toMatchObject({
      isMod: true,
      isBroadcaster: true,
    });
    expect(toChatMessage(ev({ chatterId: '100' }), 1, '100', '200')?.isBroadcaster).toBe(true);
  });
});

describe('lookupUserId', () => {
  const reply = (status: number, body: unknown) => {
    const seen: { url: string; headers: unknown }[] = [];
    const fetchFake = ((url: string, init: RequestInit) => {
      seen.push({ url, headers: init.headers });
      return Promise.resolve(new Response(JSON.stringify(body), { status }));
    }) as unknown as typeof fetch;
    return { seen, deps: { fetch: fetchFake } };
  };

  it('returns the id for a login and sends the token and client id', async () => {
    const { seen, deps } = reply(200, { data: [{ id: '123' }] });
    await expect(lookupUserId(deps, 'cid', 'TOKEN', 'My Chan')).resolves.toBe('123');
    expect(seen[0]?.url).toBe('https://api.twitch.tv/helix/users?login=My%20Chan');
    expect(seen[0]?.headers).toEqual({ authorization: 'Bearer TOKEN', 'client-id': 'cid' });
  });

  it('names the login when Twitch has no such user', async () => {
    const { deps } = reply(200, { data: [] });
    await expect(lookupUserId(deps, 'cid', 'T', 'nobody')).rejects.toThrow('"nobody"');
  });

  it('names the status when Twitch refuses', async () => {
    const { deps } = reply(401, {});
    await expect(lookupUserId(deps, 'cid', 'T', 'x')).rejects.toThrow('401');
  });
});
