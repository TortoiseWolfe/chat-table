import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer, type WebSocket } from 'ws';

export interface Subscription {
  id: string;
  type: string;
  sessionId: string;
}

/**
 * A stand-in for Twitch's EventSub server on one local port: `/ws` and `/ws2` are the sockets,
 * `POST /eventsub/subscriptions` records a subscription. Set `TWURPLE_MOCK_API_PORT` to `port`
 * and Twurple talks to it instead of Twitch.
 */
export interface FakeTwitch {
  port: number;
  /** Every socket ever opened, in order, with the path it used. */
  sockets: { path: string; ws: WebSocket; openedAt: number; closedAt: number | null }[];
  subs: Subscription[];
  /** Tells the chat socket (the bot's) to move to /ws2. */
  reconnect(): void;
  /** Cuts the chat socket without a close frame. */
  drop(): void;
  /** Sends a chat message on the chat socket, or on socket number `onSocket` of `sockets`. */
  chat(over?: Partial<ChatPayload>, onSocket?: number): void;
  offline(): void;
  close(): Promise<void>;
  tick(): number;
}

export interface ChatPayload {
  messageId: string;
  chatterId: string;
  chatterLogin: string;
  text: string;
  badges: string[];
  sourceBroadcasterId: string | null;
}

export async function startFakeTwitch(broadcasterId: string): Promise<FakeTwitch> {
  let clock = 0;
  let nextId = 0;
  const sockets: FakeTwitch['sockets'] = [];
  const subs: Subscription[] = [];
  const sessionOf = new Map<WebSocket, string>();
  /** The session a socket opened on /ws2 takes over. */
  let reconnecting: string | null = null;

  const http: Server = createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/eventsub/subscriptions') {
      let raw = '';
      req.on('data', (c: Buffer) => (raw += c.toString()));
      req.on('end', () => {
        const body = JSON.parse(raw) as { type: string; transport: { session_id: string } };
        const id = `sub${String(subs.length + 1)}`;
        subs.push({ id, type: body.type, sessionId: body.transport.session_id });
        // Twurple's rate limiter reads these; without them it queues every later call behind a reset that never comes.
        res.writeHead(202, {
          'content-type': 'application/json',
          'ratelimit-limit': '800',
          'ratelimit-remaining': '799',
          'ratelimit-reset': String(Math.floor(Date.now() / 1000) + 60),
        });
        res.end(
          JSON.stringify({
            data: [
              {
                id,
                status: 'enabled',
                type: body.type,
                version: '1',
                condition: {},
                created_at: '2026-10-27T00:00:00Z',
                transport: { method: 'websocket', session_id: body.transport.session_id },
                cost: 0,
              },
            ],
            total: subs.length,
            total_cost: 0,
            max_total_cost: 10,
          })
        );
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const wss = new WebSocketServer({ noServer: true });
  http.on('upgrade', (req: IncomingMessage, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => {
      const path = req.url ?? '/ws';
      const entry = { path, ws, openedAt: ++clock, closedAt: null as number | null };
      sockets.push(entry);
      ws.on('close', () => {
        entry.closedAt = ++clock;
      });
      ws.on('error', () => undefined);
      const session = path === '/ws2' && reconnecting ? reconnecting : `s${String(++nextId)}`;
      sessionOf.set(ws, session);
      ws.send(
        envelope('session_welcome', {
          session: {
            id: session,
            status: 'connected',
            keepalive_timeout_seconds: 30,
            reconnect_url: null,
            connected_at: '2026-10-27T00:00:00Z',
          },
        })
      );
    });
  });

  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const port = (http.address() as AddressInfo).port;

  function envelope(type: string, payload: unknown, subType?: string): string {
    return JSON.stringify({
      metadata: {
        message_id: `msg-${String(++clock)}-${type}`,
        message_type: type,
        // Twurple drops notifications stamped more than ten minutes ago.
        message_timestamp: new Date().toISOString(),
        ...(subType ? { subscription_type: subType, subscription_version: '1' } : {}),
      },
      payload,
    });
  }

  /** The newest socket on the session that holds the newest subscription of `type`. */
  const socketFor = (type: string): FakeTwitch['sockets'][number] => {
    const sub = [...subs].reverse().find((s) => s.type === type);
    const socket = [...sockets].reverse().find((s) => sessionOf.get(s.ws) === sub?.sessionId);
    if (!socket) throw new Error(`no socket for ${type}`);
    return socket;
  };

  function notify(type: string, event: unknown, socket: FakeTwitch['sockets'][number]): void {
    const found = [...subs].reverse().find((s) => s.type === type);
    if (!found) throw new Error(`no subscription for ${type}`);
    socket.ws.send(
      envelope(
        'notification',
        {
          subscription: {
            id: found.id,
            type,
            version: '1',
            status: 'enabled',
            cost: 0,
            condition: {},
            transport: { method: 'websocket', session_id: found.sessionId },
            created_at: '2026-10-27T00:00:00Z',
          },
          event,
        },
        type
      )
    );
  }

  return {
    port,
    sockets,
    subs,
    tick: () => ++clock,
    reconnect() {
      const socket = socketFor('channel.chat.message');
      reconnecting = sessionOf.get(socket.ws) ?? null;
      socket.ws.send(
        envelope('session_reconnect', {
          session: {
            id: reconnecting,
            status: 'reconnecting',
            keepalive_timeout_seconds: null,
            reconnect_url: `ws://127.0.0.1:${String(port)}/ws2`,
            connected_at: '2026-10-27T00:00:00Z',
          },
        })
      );
    },
    drop() {
      socketFor('channel.chat.message').ws.terminate();
    },
    chat(over = {}, onSocket) {
      const m: ChatPayload = {
        messageId: `chat-${String(++clock)}`,
        chatterId: '500',
        chatterLogin: 'Viewer1',
        text: '!join ana',
        badges: [],
        sourceBroadcasterId: null,
        ...over,
      };
      const socket = onSocket === undefined ? socketFor('channel.chat.message') : sockets[onSocket];
      if (!socket) throw new Error('no such socket');
      notify(
        'channel.chat.message',
        {
          broadcaster_user_id: broadcasterId,
          broadcaster_user_login: 'chan',
          broadcaster_user_name: 'Chan',
          chatter_user_id: m.chatterId,
          chatter_user_login: m.chatterLogin.toLowerCase(),
          chatter_user_name: m.chatterLogin,
          message_id: m.messageId,
          message: {
            text: m.text,
            fragments: [
              { type: 'text', text: m.text, cheermote: null, emote: null, mention: null },
            ],
          },
          color: '#ffffff',
          badges: m.badges.map((b) => ({ set_id: b, id: '1', info: '' })),
          message_type: 'text',
          cheer: null,
          reply: null,
          channel_points_custom_reward_id: null,
          source_broadcaster_user_id: m.sourceBroadcasterId,
          source_broadcaster_user_login: m.sourceBroadcasterId ? 'other' : null,
          source_broadcaster_user_name: m.sourceBroadcasterId ? 'Other' : null,
          source_message_id: m.sourceBroadcasterId ? m.messageId : null,
          source_badges: m.sourceBroadcasterId ? [] : null,
        },
        socket
      );
    },
    offline() {
      notify(
        'stream.offline',
        {
          broadcaster_user_id: broadcasterId,
          broadcaster_user_login: 'chan',
          broadcaster_user_name: 'Chan',
        },
        socketFor('stream.offline')
      );
    },
    close: async () => {
      for (const s of sockets) s.ws.terminate();
      wss.close();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}
