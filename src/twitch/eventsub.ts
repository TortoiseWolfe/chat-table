import { ApiClient } from '@twurple/api';
import type { AccessTokenWithUserId, AuthProvider } from '@twurple/auth';
import { EventSubWsListener } from '@twurple/eventsub-ws';
import type { Deps } from '../runtime/deps.js';

/** What this game reads from one chat message; nothing else of Twitch's shape leaks past here. */
export interface ChatEvent {
  messageId: string;
  chatterId: string;
  chatterLogin: string;
  text: string;
  /** The chatter's badge set names, such as `moderator` or `broadcaster`. */
  badges: string[];
  /** The channel the message came from; differs from ours in shared chat. */
  sourceChannelId: string | null;
}

export interface EventSubOptions {
  deps: Pick<Deps, 'log'>;
  clientId: string;
  /** The access token to use right now; asked again at every (re)subscribe. */
  token: () => string;
  /** The bot account: the user the sockets belong to. */
  botUserId: string;
  broadcasterId: string;
  onChat: (event: ChatEvent) => void;
  onOffline: () => void;
}

export interface EventSub {
  start(): void;
  stop(): void;
}

const SCOPES = ['user:read:chat', 'user:write:chat', 'user:bot'];

/** Hands Twurple our current token, whichever user it asks about: there is one bot account. */
function tokenProvider(clientId: string, token: () => string, userId: string): AuthProvider {
  const current = (): AccessTokenWithUserId => ({
    accessToken: token(),
    refreshToken: null,
    scope: SCOPES,
    expiresIn: null,
    obtainmentTimestamp: Date.now(),
    userId,
  });
  return {
    clientId,
    getCurrentScopesForUser: () => SCOPES,
    getAccessTokenForUser: () => Promise.resolve(current()),
    getAccessTokenForIntent: () => Promise.resolve(current()),
    getAnyAccessToken: () => Promise.resolve(current()),
  };
}

/**
 * Subscribes to `channel.chat.message` and `stream.offline` over Twitch's EventSub WebSocket.
 * Twurple owns the socket: it answers the welcome with the subscriptions, opens the new socket
 * before closing the old on `session_reconnect`, and subscribes again after a dropped socket.
 * Tests point it at a fake server with `TWURPLE_MOCK_API_PORT`, as for Twitch's own mock server.
 */
export function createEventSub(opts: EventSubOptions): EventSub {
  const { deps, clientId, botUserId, broadcasterId } = opts;
  const authProvider = tokenProvider(clientId, opts.token, botUserId);
  const apiClient = new ApiClient({ authProvider });
  const listener = new EventSubWsListener({ apiClient });

  listener.onUserSocketConnect(() => deps.log('info', 'twitch eventsub connected'));
  listener.onUserSocketDisconnect((_userId, error) =>
    deps.log('warn', 'twitch eventsub disconnected', { message: error?.message ?? 'closed' })
  );
  listener.onSubscriptionCreateFailure((sub, error) =>
    deps.log('error', 'twitch eventsub subscribe failed', { id: sub.id, message: error.message })
  );
  listener.onRevoke((_sub, status) => deps.log('error', 'twitch eventsub revoked', { status }));

  listener.onChannelChatMessage(broadcasterId, botUserId, (e) => {
    opts.onChat({
      messageId: e.messageId,
      chatterId: e.chatterId,
      chatterLogin: e.chatterName,
      text: e.messageText,
      badges: Object.keys(e.badges),
      sourceChannelId: e.sourceBroadcasterId,
    });
  });
  listener.onStreamOffline(broadcasterId, () => opts.onOffline());

  return {
    start: () => listener.start(),
    stop: () => listener.stop(),
  };
}
