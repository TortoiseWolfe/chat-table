import type { Deps } from '../../runtime/deps.js';
import { parseAnswer } from '../answer.js';
import type { Driver, DriverId, DriverResult, TurnPacket } from '../types.js';

type DriverDeps = Pick<Deps, 'now' | 'setTimer' | 'clearTimer' | 'fetch' | 'log'>;

export interface Request {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

export interface Reply {
  text: string;
  tokensIn: number;
  tokensOut: number;
}

export interface HttpDriverSpec {
  id: DriverId;
  model: string;
  /** Null when the key file was missing or empty: the driver reports `no-key` and never calls. */
  key: string | null;
  deps: DriverDeps;
  request(packet: TurnPacket, key: string, model: string): Request;
  /** The reply's text and token counts, or null when the body is not the shape the vendor documents. */
  read(body: unknown): Reply | null;
}

const failure = (
  outcome: DriverResult['outcome'],
  started: number,
  now: () => number,
  tokensIn = 0,
  tokensOut = 0
): DriverResult => ({
  decision: null,
  tokensIn,
  tokensOut,
  latencyMs: now() - started,
  outcome,
});

/** A driver that POSTs the packet to a vendor's HTTP API and reads one JSON decision back. */
export function createHttpDriver(spec: HttpDriverSpec): Driver {
  const { deps } = spec;
  return {
    id: spec.id,
    model: spec.model,
    async decide(packet, deadlineAt) {
      const started = deps.now();
      if (spec.key === null) return failure('no-key', started, deps.now);
      const remaining = deadlineAt - started;
      if (remaining <= 0) return failure('timeout', started, deps.now);

      const controller = new AbortController();
      let timedOut = false;
      const timer = deps.setTimer(() => {
        timedOut = true;
        controller.abort();
      }, remaining);
      try {
        const req = spec.request(packet, spec.key, spec.model);
        const res = await deps.fetch(req.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...req.headers },
          body: JSON.stringify(req.body),
          signal: controller.signal,
        });
        if (!res.ok) {
          // The vendor's error body can echo request details: only the status is kept.
          deps.log('warn', 'driver http error', { driver: spec.id, status: res.status });
          return failure('http-error', started, deps.now);
        }
        const reply = spec.read(await res.json());
        if (reply === null) return failure('bad-answer', started, deps.now);
        const decision = parseAnswer(reply.text, packet);
        return {
          decision,
          tokensIn: reply.tokensIn,
          tokensOut: reply.tokensOut,
          latencyMs: deps.now() - started,
          outcome: decision === null ? 'bad-answer' : 'ok',
        };
      } catch (err) {
        if (timedOut) return failure('timeout', started, deps.now);
        deps.log('warn', 'driver call failed', {
          driver: spec.id,
          message: err instanceof Error ? err.name : 'error',
        });
        return failure('http-error', started, deps.now);
      } finally {
        deps.clearTimer(timer);
      }
    },
  };
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export const asRecord = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;

export const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export { num };
