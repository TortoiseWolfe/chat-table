import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createHttpServer } from '../../src/runtime/http.js';

let server: Server | null = null;

async function listen(handlers: Parameters<typeof createHttpServer>[0]): Promise<string> {
  server = createHttpServer(handlers);
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
}

afterEach(async () => {
  const s = server;
  server = null;
  if (s) await new Promise<void>((resolve) => s.close(() => resolve()));
});

const claims = (prefix: string, body: string) => ({
  handle(req: IncomingMessage, res: ServerResponse) {
    if (!req.url?.startsWith(prefix)) return false;
    res.writeHead(200);
    res.end(body);
    return true;
  },
});

describe('createHttpServer', () => {
  it('the first handler that claims a path answers it', async () => {
    const base = await listen([claims('/overlay', 'overlay'), claims('/admin', 'admin')]);
    expect(await (await fetch(`${base}/overlay/x`)).text()).toBe('overlay');
    expect(await (await fetch(`${base}/admin`)).text()).toBe('admin');
  });

  it('an unclaimed path is a 404 with an empty JSON body', async () => {
    const base = await listen([claims('/overlay', 'overlay')]);
    const res = await fetch(`${base}/nothing`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({});
  });
});
