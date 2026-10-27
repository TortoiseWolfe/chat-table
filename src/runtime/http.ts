import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

/** Something that answers the paths it owns and says `false` for the rest. */
export interface Handler {
  handle(req: IncomingMessage, res: ServerResponse): boolean;
}

/** One server for the overlay and the admin dock: the first handler to claim a path answers it. */
export function createHttpServer(handlers: Handler[]): Server {
  return createServer((req, res) => {
    for (const h of handlers) if (h.handle(req, res)) return;
    res.writeHead(404, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end('{}');
  });
}
