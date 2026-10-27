import { randomBytes } from 'node:crypto';
import { appendFile, mkdir, open, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createAdmin } from './admin/server.js';
import { createNarrator } from './narrator/narrator.js';
import { createOverlay, type FileReader, type Overlay } from './overlay/server.js';
import { loadPack } from './packs/load.js';
import { parseEnv, type Deps, type Env, type FsLike } from './runtime/deps.js';
import { createHttpServer } from './runtime/http.js';
import { createSession } from './runtime/session.js';
import { createStore } from './runtime/store.js';
import { createAdapter, lookupUserId } from './twitch/adapter.js';
import { createAuth } from './twitch/auth.js';
import { createOutbound } from './twitch/outbound.js';

const here = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

/** The one place real clocks, files, network and randomness are made; everything else is handed these. */
function realDeps(): Deps {
  const fs: FsLike = {
    readFile: (path) => readFile(path, 'utf8'),
    writeFile: (path, data, mode) => writeFile(path, data, mode === undefined ? {} : { mode }),
    appendFile: (path, data) => appendFile(path, data),
    rename,
    async fsync(path) {
      const handle = await open(path, 'r');
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
    },
    exists: (path) =>
      stat(path).then(
        () => true,
        () => false
      ),
    mkdir: async (path) => {
      await mkdir(path, { recursive: true });
    },
  };
  return {
    now: () => Date.now(),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
    fs,
    fetch: globalThis.fetch,
    log: (level, msg, data) =>
      process.stderr.write(
        `${JSON.stringify({ level, msg, ...(data === undefined ? {} : { data }) })}\n`
      ),
    randomSeed: () => randomBytes(4).readUInt32BE(0),
    randomBytes: (n) => randomBytes(n),
  };
}

function packFlag(argv: string[]): string | null {
  const i = argv.indexOf('--pack');
  if (i < 0) return null;
  const v = argv[i + 1];
  if (v === undefined) throw new Error('--pack needs a folder');
  return v;
}

async function login(deps: Deps, env: Env): Promise<void> {
  const auth = createAuth({
    deps,
    clientId: need(env.twitchClientId, 'TWITCH_CLIENT_ID'),
    ...(env.twitchClientSecret ? { clientSecret: env.twitchClientSecret } : {}),
    dataDir: env.dataDir,
  });
  await auth.login((message) => process.stdout.write(`${message}\n`));
  process.stdout.write('Logged in. Now run the bot with: run\n');
}

function need(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

async function run(deps: Deps, env: Env, packDir: string): Promise<void> {
  const clientId = need(env.twitchClientId, 'TWITCH_CLIENT_ID');
  const pack = await loadPack(packDir, deps.fs);

  const auth = createAuth({
    deps,
    clientId,
    ...(env.twitchClientSecret ? { clientSecret: env.twitchClientSecret } : {}),
    dataDir: env.dataDir,
  });
  await auth.start();
  const botUserId = auth.who().userId;
  const broadcasterId = await lookupUserId(
    deps,
    clientId,
    auth.token(),
    need(env.twitchBroadcasterLogin, 'TWITCH_BROADCASTER_LOGIN')
  );

  const outbound = createOutbound({
    deps,
    clientId,
    token: () => auth.token(),
    broadcasterId,
    senderId: botUserId,
  });

  const narrator = createNarrator(
    env.narratorUrl && env.narratorModel
      ? {
          url: env.narratorUrl,
          model: env.narratorModel,
          timeoutMs: env.narratorTimeoutMs,
          ...(env.narratorApiKey ? { apiKey: env.narratorApiKey } : {}),
        }
      : null,
    deps
  );

  const files: FileReader = {
    read: (path) =>
      readFile(path).then(
        (b) => new Uint8Array(b),
        () => null
      ),
  };
  const adminKey = Buffer.from(deps.randomBytes(32)).toString('hex');

  // The overlay is built after the session, since the session publishes into it.
  let publish: Overlay['publish'] = () => undefined;
  const session = createSession({
    deps,
    pack,
    settings: {
      declareMs: env.declareMs,
      cooldownMs: 3000,
      missedLimit: 2,
      cpPerRollMax: env.cpPerRollMax,
      specialOne: env.specialOne,
    },
    seed: deps.randomSeed(),
    store: createStore(deps.fs, env.dataDir, (l, m, d) => deps.log(l, m, d)),
    send: (line) => outbound.send(line),
    botUserId,
    channelId: broadcasterId,
    narrator,
    onLog: (lines, state) => publish(lines, state),
  });

  const overlay = createOverlay({
    pack,
    packDir,
    publicDir: here('../src/overlay/public'),
    files,
    getState: () => session.state(),
    deps,
  });
  publish = (lines, state) => {
    overlay.publish(lines, state);
  };
  const admin = createAdmin({
    session,
    key: adminKey,
    publicDir: here('../src/admin/public'),
    files,
  });

  const server = createHttpServer([overlay, admin]);
  await new Promise<void>((resolve) => server.listen(env.httpPort, resolve));
  process.stdout.write(
    `Admin dock: http://127.0.0.1:${String(env.httpPort)}/admin#key=${adminKey}\n`
  );

  const adapter = createAdapter({
    deps,
    clientId,
    token: () => auth.token(),
    botUserId,
    broadcasterId,
    session,
    outbound,
  });
  adapter.start();
  await session.start();

  const stop = (): void => {
    adapter.stop();
    outbound.stop();
    overlay.close();
    auth.stop();
    server.close();
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const command = argv[0] === 'login' ? 'login' : 'run';
  const deps = realDeps();
  const env = parseEnv(process.env, 'twitch');
  if (command === 'login') await login(deps, env);
  else await run(deps, env, packFlag(argv) ?? env.pack);
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
