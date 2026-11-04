import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { appendFile, mkdir, open, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { createAdmin } from '../admin/server.js';
import type { DriverId } from '../ai/types.js';
import { DEFAULT_SETTINGS } from '../engine/state.js';
import { createOverlay, type FileReader } from '../overlay/server.js';
import { loadPackSync } from '../packs/load.js';
import type { Deps, FsLike } from '../runtime/deps.js';
import { createHttpServer } from '../runtime/http.js';
import { runLive, type LiveSink } from './live.js';
import { FakeClock } from './clock.js';
import { createNarrator } from '../narrator/narrator.js';
import { createTable, narrateLines, runSim, SIM_EPOCH } from './run.js';
import { parseScript } from './script.js';

interface Flags {
  seed: number;
  script: string | null;
  pack: string;
  out: string | null;
  interactive: boolean;
  narrator: string | null;
  narratorModel: string;
  live: boolean;
  seatsFile: string | null;
  dataDir: string;
  paceSeconds: number;
  declareSeconds: number;
  maxMinutes: number;
  swap: { afterMs: number; seat: number; to: DriverId } | null;
  stopOnCap: boolean;
  httpPort: number | null;
}

/** `--swap <seat>:<driver>:<minutes>`, for example `2:groq:12`. */
function parseSwap(text: string): NonNullable<Flags['swap']> {
  const m = /^(\d):(bot|claude|gemini|groq):(\d+(?:\.\d+)?)$/.exec(text);
  if (!m) throw new Error('--swap needs <seat>:<driver>:<minutes>, for example 2:groq:12');
  return { seat: Number(m[1]), to: m[2] as DriverId, afterMs: Number(m[3]) * 60_000 };
}

function parseFlags(argv: string[]): Flags {
  const f: Flags = {
    seed: 1,
    script: null,
    pack: 'packs/frontier',
    out: null,
    interactive: false,
    narrator: null,
    narratorModel: 'default',
    live: false,
    seatsFile: null,
    dataDir: '/tmp/chat-table-live',
    paceSeconds: 0,
    declareSeconds: 60,
    maxMinutes: 30,
    swap: null,
    stopOnCap: false,
    httpPort: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`missing value for ${a ?? ''}`);
      return v;
    };
    if (a === '--seed') f.seed = Number(value());
    else if (a === '--script') f.script = value();
    else if (a === '--pack') f.pack = value();
    else if (a === '--out') f.out = value();
    else if (a === '--narrator') f.narrator = value();
    else if (a === '--narrator-model') f.narratorModel = value();
    else if (a === '--interactive') f.interactive = true;
    else if (a === '--live') f.live = true;
    else if (a === '--seats-file') f.seatsFile = value();
    else if (a === '--data-dir') f.dataDir = value();
    else if (a === '--pace') f.paceSeconds = Number(value());
    else if (a === '--declare') f.declareSeconds = Number(value());
    else if (a === '--max-minutes') f.maxMinutes = Number(value());
    else if (a === '--stop-on-cap') f.stopOnCap = true;
    else if (a === '--http-port') f.httpPort = Number(value());
    else if (a === '--swap') f.swap = parseSwap(value());
    else throw new Error(`unknown flag: ${a ?? ''}`);
  }
  if (!Number.isFinite(f.seed)) throw new Error('--seed needs a number');
  for (const n of [f.paceSeconds, f.declareSeconds, f.maxMinutes]) {
    if (!Number.isFinite(n) || n < 0) throw new Error('--pace, --declare and --max-minutes need numbers');
  }
  if (f.live && f.seatsFile === null) throw new Error('--live needs --seats-file');
  return f;
}

function writeOut(dir: string, log: string, state: unknown): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/events.jsonl`, log);
  writeFileSync(
    `${dir}/state.json`,
    JSON.stringify({ version: 1, savedAt: SIM_EPOCH, state }, null, 2) + '\n'
  );
}

async function interactive(f: Flags): Promise<void> {
  const pack = loadPackSync(f.pack);
  const table = createTable({ pack, seed: f.seed });
  const clock = new FakeClock(SIM_EPOCH);
  let printed = 0;
  const flush = (): void => {
    for (const l of table.lines.slice(printed)) process.stdout.write(l + '\n');
    printed = table.lines.length;
  };
  table.host('start', clock.now());
  flush();
  const rl = createInterface({ input: process.stdin });
  for await (const raw of rl) {
    const text = raw.trim();
    const wait = /^\/wait\s+(\d+(?:\.\d+)?)$/.exec(text);
    if (wait) {
      clock.advanceTo(clock.now() + Number(wait[1]) * 1000);
      table.advanceTo(clock.now());
    } else if (text !== '') {
      table.chat('you', text, clock.now());
    }
    flush();
  }
  if (f.out) writeOut(f.out, table.log.join('\n') + '\n', table.state());
}

const here = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

/** Real clocks, files and network for an off-air run; this entry point wires them, nothing else does. */
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

async function live(f: Flags): Promise<void> {
  const deps = realDeps();
  const pack = loadPackSync(f.pack);
  const sink: LiveSink = { publish: () => undefined, mark: () => undefined, refresh: () => undefined };
  const files: FileReader = {
    read: (path) =>
      readFile(path).then(
        (b) => new Uint8Array(b),
        () => null
      ),
  };
  let closeServer: (() => void) | null = null;
  const result = await runLive({
    deps,
    pack,
    seed: f.seed,
    settings: { ...DEFAULT_SETTINGS, declareMs: f.declareSeconds * 1000 },
    dataDir: f.dataDir,
    seatsFile: f.seatsFile ?? '',
    paceMs: f.paceSeconds * 1000,
    maxMs: f.maxMinutes * 60_000,
    ...(f.swap ? { swap: f.swap } : {}),
    stopOnCap: f.stopOnCap,
    sink,
    out: (line) => process.stdout.write(`${new Date(deps.now()).toISOString()} ${line}\n`),
    onReady: ({ session, runner }) => {
      if (f.httpPort === null) return;
      const overlay = createOverlay({
        pack,
        packDir: f.pack,
        publicDir: here('../overlay/public'),
        files,
        getState: () => session.state(),
        getSeats: () => runner.panel(),
        deps,
      });
      const key = Buffer.from(deps.randomBytes(16)).toString('hex');
      const admin = createAdmin({
        session,
        key,
        publicDir: here('../admin/public'),
        files,
        ai: { swap: (seat, to) => runner.swap(seat, to, 'manual'), panel: () => runner.panel() },
      });
      sink.publish = (lines, state) => overlay.publish(lines, state);
      sink.mark = (text) => overlay.mark(text);
      sink.refresh = () => overlay.refresh();
      const server = createHttpServer([overlay, admin]);
      server.listen(f.httpPort ?? 0, '127.0.0.1');
      process.stdout.write(`Table view: http://127.0.0.1:${String(f.httpPort)}/overlay\n`);
      closeServer = () => {
        overlay.close();
        server.close();
      };
    },
  });
  (closeServer as (() => void) | null)?.();
  process.stdout.write(
    `${JSON.stringify({ reason: result.reason, rounds: result.rounds, phase: result.state?.phase, capped: result.capped })}\n`
  );
}

async function main(): Promise<void> {
  const f = parseFlags(process.argv.slice(2));
  if (f.live) {
    await live(f);
    return;
  }
  if (f.interactive) {
    await interactive(f);
    return;
  }
  const pack = loadPackSync(f.pack);
  const script = f.script ? parseScript(readFileSync(f.script, 'utf8')) : [];
  const r = runSim({ pack, seed: f.seed, script });
  let lines = r.lines;
  if (f.narrator) {
    const narrator = createNarrator(
      { url: f.narrator, model: f.narratorModel, timeoutMs: 8000 },
      {
        fetch: globalThis.fetch,
        setTimer: (fn, ms) => setTimeout(fn, ms),
        clearTimer: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
        log: (level, msg, data) =>
          process.stderr.write(`${level}: ${msg} ${JSON.stringify(data ?? {})}\n`),
      }
    );
    lines = await narrateLines(r, narrator);
  }
  for (const l of lines) process.stdout.write(l + '\n');
  if (f.out) writeOut(f.out, r.log, r.state);
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
