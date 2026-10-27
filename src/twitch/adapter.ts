import type { Deps } from '../runtime/deps.js';
import type { ChatMessage } from '../runtime/parse.js';
import { createEventSub, type ChatEvent, type EventSub } from './eventsub.js';
import type { Outbound } from './outbound.js';

export interface AdapterSession {
  chat(msg: ChatMessage): Promise<void>;
  offline(): Promise<void>;
}

export interface AdapterOptions {
  deps: Pick<Deps, 'now' | 'log'>;
  clientId: string;
  token: () => string;
  botUserId: string;
  broadcasterId: string;
  session: AdapterSession;
  /** Told when the bot's own messages show it is, or is not, a moderator. */
  outbound?: Pick<Outbound, 'setModerator'>;
}

export interface Adapter {
  start(): void;
  stop(): void;
}

/**
 * Turns the bot's own messages into a moderator check, drops them and shared-chat messages from
 * other channels (SC-007), and maps the rest to `ChatMessage`.
 */
export function toChatMessage(
  e: ChatEvent,
  at: number,
  channelId: string,
  botUserId: string
): ChatMessage | null {
  if (e.chatterId === botUserId) return null;
  if (e.sourceChannelId !== null && e.sourceChannelId !== channelId) return null;
  return {
    messageId: e.messageId,
    userId: e.chatterId,
    login: e.chatterLogin.toLowerCase(),
    text: e.text,
    isMod: e.badges.includes('moderator') || e.badges.includes('broadcaster'),
    isBroadcaster: e.badges.includes('broadcaster') || e.chatterId === channelId,
    at,
    sourceChannelId: e.sourceChannelId,
  };
}

export function createAdapter(opts: AdapterOptions): Adapter {
  const { deps, botUserId, broadcasterId, session, outbound } = opts;
  const fail = (what: string) => (err: unknown) =>
    deps.log('error', what, { message: err instanceof Error ? err.message : String(err) });

  const eventSub: EventSub = createEventSub({
    deps,
    clientId: opts.clientId,
    token: opts.token,
    botUserId,
    broadcasterId,
    onChat(e) {
      if (e.chatterId === botUserId) {
        outbound?.setModerator(e.badges.includes('moderator') || e.badges.includes('broadcaster'));
        return;
      }
      const msg = toChatMessage(e, deps.now(), broadcasterId, botUserId);
      if (msg) session.chat(msg).catch(fail('handling a chat message failed'));
    },
    onOffline() {
      deps.log('info', 'stream went offline');
      session.offline().catch(fail('handling the offline event failed'));
    },
  });

  return {
    start: () => eventSub.start(),
    stop: () => eventSub.stop(),
  };
}

const USERS_URL = 'https://api.twitch.tv/helix/users';

/** The Twitch user id for a login, or an error naming the login. */
export async function lookupUserId(
  deps: Pick<Deps, 'fetch'>,
  clientId: string,
  token: string,
  login: string
): Promise<string> {
  const res = await deps.fetch(`${USERS_URL}?login=${encodeURIComponent(login)}`, {
    headers: { authorization: `Bearer ${token}`, 'client-id': clientId },
  });
  if (!res.ok) throw new Error(`Twitch refused the lookup of "${login}" (${String(res.status)})`);
  const body = (await res.json()) as { data?: { id: string }[] };
  const id = body.data?.[0]?.id;
  if (!id) throw new Error(`Twitch has no user called "${login}"`);
  return id;
}
