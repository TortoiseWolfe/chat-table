import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseHashes, scanText, shouldSkip, type Hit } from './scan.js';

interface Flags {
  root: string;
  denylist: string | null;
  all: boolean;
}

function parseFlags(argv: string[]): Flags {
  const f: Flags = { root: '.', denylist: null, all: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? '';
    if (a === '--all') f.all = true;
    else if (a === '--denylist') {
      const v = argv[++i];
      if (v === undefined) throw new Error('missing value for --denylist');
      f.denylist = v;
    } else if (a.startsWith('--')) throw new Error(`unknown flag: ${a}`);
    else f.root = a;
  }
  return f;
}

function* walk(root: string, rel: string, all: boolean): Generator<string> {
  for (const entry of readdirSync(join(root, rel), { withFileTypes: true })) {
    const path = rel === '' ? entry.name : `${rel}/${entry.name}`;
    if (shouldSkip(path, { all })) continue;
    if (entry.isDirectory()) yield* walk(root, path, all);
    else if (entry.isFile()) yield path;
  }
}

function main(): void {
  const f = parseFlags(process.argv.slice(2));
  const hashes = parseHashes(readFileSync(f.denylist ?? join(f.root, 'guard/denylist.sha256'), 'utf8'));
  const hits: Hit[] = [];
  for (const path of walk(f.root, '', f.all)) {
    const buf = readFileSync(join(f.root, path));
    if (buf.includes(0)) continue;
    hits.push(...scanText(path, buf.toString('utf8'), hashes));
  }
  for (const h of hits) process.stdout.write(`${h.path}:${h.line} ${h.kind}\n`);
  process.stdout.write(`hits: ${String(hits.length)}\n`);
  if (hits.length > 0) process.exitCode = 1;
}

try {
  main();
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
}
