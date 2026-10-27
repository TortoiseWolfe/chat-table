import type { Deps } from '../runtime/deps.js';
import { cutLine } from '../runtime/replies.js';

export interface OutLine {
  text: string;
  /** Who the reply is for; replies to one user can be merged when the queue backs up. */
  user?: string;
}

export interface BucketOptions {
  /** Messages allowed per window: 20 for a plain bot, 100 when it is a moderator. */
  limit: number;
  windowMs?: number;
  minGapMs?: number;
  maxLen?: number;
  now: () => number;
  log?: Deps['log'];
}

export interface Bucket {
  offer(line: OutLine | string): void;
  drain(): string[];
  size(): number;
}

export function createBucket(opts: BucketOptions): Bucket {
  const { limit, now } = opts;
  const windowMs = opts.windowMs ?? 30000;
  const minGapMs = opts.minGapMs ?? 1000;
  const maxLen = opts.maxLen ?? 500;
  const log = opts.log ?? (() => undefined);
  const queue: OutLine[] = [];
  const sentAt: number[] = [];

  const clip = (text: string): string => (maxLen === 500 ? cutLine(text) : text.slice(0, maxLen));

  function shrink(): void {
    while (queue.length > limit) {
      const seen = new Map<string, number>();
      let first = -1;
      let second = -1;
      for (let i = 0; i < queue.length; i++) {
        const user = queue[i]?.user;
        if (user === undefined) continue;
        const at = seen.get(user);
        if (at === undefined) seen.set(user, i);
        else if (first < 0 || at < first) {
          first = at;
          second = i;
        }
      }
      if (first >= 0) {
        const a = queue[first];
        const b = queue[second];
        if (a && b) {
          const merged: OutLine = { text: clip(`${a.text} ${b.text}`) };
          if (a.user !== undefined) merged.user = a.user;
          queue.splice(second, 1);
          queue[first] = merged;
          log('info', 'bucket merged replies', { user: a.user });
        }
      } else {
        const dropped = queue.shift();
        log('warn', 'bucket dropped a reply', { reason: 'queue over limit', user: dropped?.user });
      }
    }
  }

  return {
    offer(line) {
      const l = typeof line === 'string' ? { text: line } : line;
      queue.push({ ...l, text: clip(l.text) });
      shrink();
    },

    drain() {
      const t = now();
      while (sentAt.length > 0 && t - (sentAt[0] ?? 0) >= windowMs) sentAt.shift();
      const out: string[] = [];
      while (queue.length > 0 && sentAt.length < limit) {
        const last = sentAt[sentAt.length - 1];
        if (last !== undefined && t - last < minGapMs) break;
        const next = queue.shift();
        if (!next) break;
        sentAt.push(t);
        out.push(next.text);
      }
      return out;
    },

    size: () => queue.length,
  };
}
