import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { loadPackSync } from '../packs/load.js';
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
    else throw new Error(`unknown flag: ${a ?? ''}`);
  }
  if (!Number.isFinite(f.seed)) throw new Error('--seed needs a number');
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

async function main(): Promise<void> {
  const f = parseFlags(process.argv.slice(2));
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
