import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Pack } from '../engine/pack.js';
import type { GameState } from '../engine/state.js';
import type { Deps } from '../runtime/deps.js';
import type { LogLine } from '../runtime/log.js';
import { toView } from './view.js';

const PING_MS = 15000;
const KEEP_LINES = 50;

export interface FileReader {
  /** The file's bytes, or null when it does not exist. */
  read(path: string): Promise<Uint8Array | null>;
}

export interface OverlayOptions {
  pack: Pack;
  /** The pack's folder; asset paths are resolved inside it. */
  packDir: string;
  /** Folder holding index.html, overlay.js and overlay.css. */
  publicDir: string;
  files: FileReader;
  getState: () => GameState | null;
  deps: Pick<Deps, 'setTimer' | 'clearTimer'>;
}

export interface Overlay {
  /** Answers /overlay requests; returns false for any other path. */
  handle(req: IncomingMessage, res: ServerResponse): boolean;
  /** Call after each applied command with the new log lines and the state. */
  publish(lines: LogLine[], state: GameState): void;
  close(): void;
}

const TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ogg: 'audio/ogg',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
};

const typeOf = (path: string): string =>
  TYPES[path.slice(path.lastIndexOf('.') + 1).toLowerCase()] ?? 'application/octet-stream';

/** A pack-relative path that stays inside the pack folder. */
function safeRelative(p: string): boolean {
  return p !== '' && !p.startsWith('/') && !p.includes('\\') && !p.split('/').includes('..');
}

export function createOverlay(opts: OverlayOptions): Overlay {
  const { pack, packDir, publicDir, files, getState, deps } = opts;
  const recent: LogLine[] = [];
  const clients = new Set<{ res: ServerResponse; timer: unknown }>();

  const send = (res: ServerResponse, event: string, data: unknown): void => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const notFound = (res: ServerResponse): void => {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  };

  async function serveFile(res: ServerResponse, path: string, noStore: boolean): Promise<void> {
    const bytes = await files.read(path);
    if (bytes === null) return notFound(res);
    const headers: Record<string, string> = { 'content-type': typeOf(path) };
    if (noStore) headers['cache-control'] = 'no-store';
    res.writeHead(200, headers);
    res.end(bytes);
  }

  function stream(req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      connection: 'keep-alive',
    });
    const state = getState();
    if (state) send(res, 'snapshot', { view: toView(state, pack, recent) });
    else res.write(': waiting\n\n');
    const client = { res, timer: null as unknown };
    const ping = (): void => {
      res.write(': ping\n\n');
      client.timer = deps.setTimer(ping, PING_MS);
    };
    client.timer = deps.setTimer(ping, PING_MS);
    clients.add(client);
    req.on('close', () => {
      deps.clearTimer(client.timer);
      clients.delete(client);
    });
  }

  return {
    handle(req, res) {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const path = url.pathname;
      if (path !== '/overlay' && !path.startsWith('/overlay/')) return false;
      if (req.method !== 'GET') {
        res.writeHead(405, { 'content-type': 'text/plain' });
        res.end('method not allowed');
        return true;
      }
      if (path === '/overlay') void serveFile(res, `${publicDir}/index.html`, false);
      else if (path === '/overlay/overlay.js') void serveFile(res, `${publicDir}/overlay.js`, true);
      else if (path === '/overlay/overlay.css')
        void serveFile(res, `${publicDir}/overlay.css`, true);
      else if (path === '/overlay/events') stream(req, res);
      else {
        const m = /^\/overlay\/assets\/(map|art|sounds)\/([^/]+)$/.exec(path);
        let key: string | null = null;
        try {
          key = m ? decodeURIComponent(m[2] ?? '') : null;
        } catch {
          key = null;
        }
        const kind = m?.[1] as 'map' | 'art' | 'sounds' | undefined;
        const table = kind ? pack.assets[kind] : undefined;
        const rel = table && key !== null && Object.hasOwn(table, key) ? table[key] : undefined;
        if (rel === undefined || !safeRelative(rel)) notFound(res);
        else void serveFile(res, `${packDir}/${rel}`, false);
      }
      return true;
    },

    publish(lines, state) {
      recent.push(...lines);
      if (recent.length > KEEP_LINES) recent.splice(0, recent.length - KEEP_LINES);
      for (const line of lines) {
        const view = toView(state, pack, recent);
        for (const c of clients) send(c.res, 'event', { line, view });
      }
    },

    close() {
      for (const c of clients) {
        deps.clearTimer(c.timer);
        c.res.end();
      }
      clients.clear();
    },
  };
}
