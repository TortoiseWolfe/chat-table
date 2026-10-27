import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AdminAction } from '../engine/commands.js';
import type { GameState } from '../engine/state.js';
import type { FileReader } from '../overlay/server.js';

const MAX_BODY = 4096;

export interface AdminOptions {
  /** `session.host` and `session.state` from the running session. */
  session: {
    host(action: AdminAction, target?: string): Promise<void>;
    state(): GameState | null;
  };
  /** Bearer key, made fresh at every start. */
  key: string;
  publicDir: string;
  files: FileReader;
}

export interface Admin {
  /** Answers /admin requests; returns false for any other path. */
  handle(req: IncomingMessage, res: ServerResponse): boolean;
}

const ACTIONS = ['start', 'pause', 'stop', 'skip'] as const;

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

function sameKey(given: string, key: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readBody(req: IncomingMessage): Promise<string | null> {
  let size = 0;
  const parts: Buffer[] = [];
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > MAX_BODY) return null;
    parts.push(buf);
  }
  return Buffer.concat(parts).toString('utf8');
}

export function createAdmin(opts: AdminOptions): Admin {
  const { session, key, publicDir, files } = opts;

  async function api(req: IncomingMessage, res: ServerResponse, name: string): Promise<void> {
    const header = req.headers.authorization ?? '';
    if (!header.startsWith('Bearer ') || !sameKey(header.slice(7), key)) {
      return json(res, 401, {});
    }
    if (name === 'state') {
      if (req.method !== 'GET') return json(res, 405, {});
      const s = session.state();
      if (!s) return json(res, 503, {});
      return json(res, 200, {
        phase: s.phase,
        sceneId: s.sceneId,
        round: s.round,
        seats: s.seats.map((seat) => ({
          index: seat.index,
          character: seat.character.name,
          holder: seat.holder.kind === 'bot' ? 'bot' : seat.holder.login,
        })),
        waitlist: s.waitlist.map((w) => w.login),
      });
    }
    const action = ACTIONS.find((a) => a === name);
    if (action === undefined && name !== 'kick') return json(res, 404, {});
    if (req.method !== 'POST') return json(res, 405, {});
    const raw = await readBody(req);
    if (raw === null) return json(res, 413, {});
    if (action !== undefined) {
      await session.host(action);
      return json(res, 202, {});
    }
    let login: unknown;
    try {
      login = (JSON.parse(raw || '{}') as { login?: unknown }).login;
    } catch {
      return json(res, 400, {});
    }
    if (typeof login !== 'string' || login === '') return json(res, 400, {});
    await session.host('kick', login);
    return json(res, 202, {});
  }

  return {
    handle(req, res) {
      const path = new URL(req.url ?? '/', 'http://localhost').pathname;
      if (path !== '/admin' && !path.startsWith('/admin/')) return false;
      if (path === '/admin') {
        if (req.method !== 'GET') {
          json(res, 405, {});
          return true;
        }
        void files.read(`${publicDir}/index.html`).then((bytes) => {
          if (bytes === null) return json(res, 404, {});
          res.writeHead(200, {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-store',
          });
          res.end(bytes);
        });
        return true;
      }
      const m = /^\/admin\/api\/([a-z]+)$/.exec(path);
      if (!m) {
        json(res, 404, {});
        return true;
      }
      api(req, res, m[1] ?? '').catch(() => {
        if (!res.headersSent) json(res, 500, {});
        else res.end();
      });
      return true;
    },
  };
}
