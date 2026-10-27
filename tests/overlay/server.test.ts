import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { LogLine } from '../../src/runtime/log.js';
import { createOverlay, type FileReader } from '../../src/overlay/server.js';
import { createTable, SIM_EPOCH } from '../../src/sim/run.js';
import { tinyPack } from '../helpers/tinyPack.js';

const enc = new TextEncoder();
const FILES = new Map<string, string>([
  ['/pub/index.html', '<html>overlay</html>'],
  ['/pub/overlay.js', 'js'],
  ['/pub/overlay.css', 'css'],
  ['/pack/maps/dock.png', 'PNGDATA'],
  ['/secret.txt', 'SECRET'],
]);
const files: FileReader = {
  read: (p) => Promise.resolve(FILES.has(p) ? enc.encode(FILES.get(p)) : null),
};

let server: Server | undefined;
afterEach(() => {
  server?.closeAllConnections();
  server?.close();
});

async function boot(assets: Record<string, string> = { dock: 'maps/dock.png' }) {
  const pack = tinyPack();
  pack.assets.map = assets;
  const table = createTable({ pack, seed: 3 });
  table.host('start', SIM_EPOCH);
  const overlay = createOverlay({
    pack,
    packDir: '/pack',
    publicDir: '/pub',
    files,
    getState: () => table.state(),
    deps: {
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (id) => clearTimeout(id as never),
    },
  });
  server = createServer((req, res) => {
    if (!overlay.handle(req, res)) {
      res.writeHead(418);
      res.end();
    }
  });
  await new Promise<void>((r) => server?.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${String((server?.address() as AddressInfo).port)}`;
  return { base, overlay, table };
}

describe('overlay server', () => {
  it('serves the page and the static files, no-store on the scripts', async () => {
    const { base } = await boot();
    const page = await fetch(`${base}/overlay`);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(await page.text()).toContain('overlay');
    const js = await fetch(`${base}/overlay/overlay.js`);
    expect(js.headers.get('cache-control')).toBe('no-store');
    expect(await js.text()).toBe('js');
  });

  it('leaves other paths alone', async () => {
    const { base } = await boot();
    expect((await fetch(`${base}/other`)).status).toBe(418);
  });

  it('serves a pack asset by key and 404s for unknown keys and ".." paths', async () => {
    const { base } = await boot({
      dock: 'maps/dock.png',
      evil: '../secret.txt',
      abs: '/secret.txt',
    });
    const ok = await fetch(`${base}/overlay/assets/map/dock`);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('image/png');
    expect(await ok.text()).toBe('PNGDATA');
    expect((await fetch(`${base}/overlay/assets/map/missing`)).status).toBe(404);
    expect((await fetch(`${base}/overlay/assets/map/evil`)).status).toBe(404);
    expect((await fetch(`${base}/overlay/assets/map/abs`)).status).toBe(404);
    expect((await fetch(`${base}/overlay/assets/map/..%2F..%2Fsecret.txt`)).status).toBe(404);
    expect((await fetch(`${base}/overlay/assets/map/../../secret.txt`)).status).toBe(404);
    expect((await fetch(`${base}/overlay/assets/other/dock`)).status).toBe(404);
  });

  it('sends a snapshot first, then one event per published log line', async () => {
    const { base, overlay, table } = await boot();
    const res = await fetch(`${base}/overlay/events`);
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    const reader = res.body?.getReader();
    if (!reader) throw new Error('no body');
    const dec = new TextDecoder();
    let buf = '';
    const until = async (needle: string): Promise<void> => {
      while (!buf.includes(needle)) {
        const { value, done } = await reader.read();
        if (done) throw new Error('stream ended');
        buf += dec.decode(value);
      }
    };
    await until('\n\n');
    expect(buf.startsWith('event: snapshot\n')).toBe(true);
    const lines = table.log.slice(0, 2).map((l) => JSON.parse(l) as LogLine);
    overlay.publish(lines, table.state());
    await until('event: event');
    const count = (buf.match(/event: event/g) ?? []).length;
    await until('"seq":' + String(lines[1]?.seq));
    expect(count).toBeGreaterThanOrEqual(1);
    expect((buf.match(/event: event/g) ?? []).length).toBe(2);
    await reader.cancel();
  });
});
