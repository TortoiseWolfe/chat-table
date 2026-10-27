import type { Deps } from '../runtime/deps.js';
import { createBucket, type Bucket } from './bucket.js';

const CHAT_URL = 'https://api.twitch.tv/helix/chat/messages';
const PUMP_MS = 1000;

export type OutboundDeps = Pick<Deps, 'fetch' | 'now' | 'setTimer' | 'clearTimer' | 'log'>;

export interface OutboundOptions {
  deps: OutboundDeps;
  clientId: string;
  token: () => string;
  broadcasterId: string;
  senderId: string;
  /** Messages per 30 s: 20 for a plain bot (the default), 100 for a moderator. */
  limit?: number;
}

export interface Outbound {
  /** Queues one chat line; it goes out when the rate limit allows. Never throws. */
  send(line: string, user?: string): Promise<void>;
  /** 100 per 30 s once the bot is known to be a moderator. */
  setModerator(isMod: boolean): void;
  size(): number;
  stop(): void;
}

export function createOutbound(opts: OutboundOptions): Outbound {
  const { deps, clientId, broadcasterId, senderId } = opts;
  const bucket: Bucket = createBucket({
    limit: opts.limit ?? 20,
    now: () => deps.now(),
    log: deps.log,
  });
  let timer: unknown = null;
  let stopped = false;

  async function post(text: string): Promise<void> {
    try {
      const res = await deps.fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${opts.token()}`,
          'client-id': clientId,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ broadcaster_id: broadcasterId, sender_id: senderId, message: text }),
      });
      if (!res.ok) {
        deps.log('error', 'twitch refused a chat message', { status: res.status });
        return;
      }
      const body = (await res.json()) as {
        data?: { is_sent?: boolean; drop_reason?: { code?: string } | null }[];
      };
      const first = body.data?.[0];
      if (first && first.is_sent === false) {
        deps.log('warn', 'twitch dropped a chat message', { code: first.drop_reason?.code });
      }
    } catch (err) {
      deps.log('error', 'sending a chat message failed', {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function pump(): void {
    timer = null;
    if (stopped) return;
    for (const text of bucket.drain()) void post(text);
    if (bucket.size() > 0) timer = deps.setTimer(pump, PUMP_MS);
  }

  return {
    send(line, user) {
      bucket.offer(user === undefined ? { text: line } : { text: line, user });
      if (timer === null) pump();
      return Promise.resolve();
    },
    setModerator(isMod) {
      bucket.setLimit(isMod ? 100 : 20);
    },
    size: () => bucket.size(),
    stop() {
      stopped = true;
      if (timer !== null) deps.clearTimer(timer);
      timer = null;
    },
  };
}
