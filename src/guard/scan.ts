import { createHash } from 'node:crypto';
import { normalise, windows } from './normalise.js';

export interface Hit {
  path: string;
  line: number;
  kind: 'denylist' | 'compat';
}

export interface ScanOpts {
  /** Paths that may quote the licence and so skip the compatibility check. */
  compatExempt?: string[];
}

const DEFAULT_COMPAT_EXEMPT = ['OGL.md', 'docs/licensing.md'];

// Built from pieces so this file never pairs the two on one normalised line.
const SYSTEM_WORDS = new Set(['d' + '6', 'open' + 'd' + '6']);
const COMPAT_PHRASES = ['compatible', 'compatibility', 'for use with', 'powered by'];

const ALWAYS_SKIPPED_DIRS = new Set(['.git', 'dist', 'out', 'packs-private']);

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function compatHit(normalised: string): boolean {
  const padded = ` ${normalised} `;
  const hasPhrase = COMPAT_PHRASES.some((p) => padded.includes(` ${p} `));
  return hasPhrase && normalised.split(' ').some((w) => SYSTEM_WORDS.has(w));
}

/** At most one hit of each kind per line. Never returns the matched words. */
export function scanText(
  path: string,
  text: string,
  hashes: ReadonlySet<string>,
  opts: ScanOpts = {},
): Hit[] {
  const exempt = opts.compatExempt ?? DEFAULT_COMPAT_EXEMPT;
  const hits: Hit[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const n = normalise(lines[i] ?? '');
    if (n === '') continue;
    if (windows(n.split(' '), 3).some((w) => hashes.has(sha256(w)))) {
      hits.push({ path, line: i + 1, kind: 'denylist' });
    }
    if (!exempt.includes(path) && compatHit(n)) hits.push({ path, line: i + 1, kind: 'compat' });
  }
  return hits;
}

/** Parses a hash list: one hex digest per line, blank lines and `#` comments ignored. */
export function parseHashes(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.trim();
    if (l !== '' && !l.startsWith('#')) out.add(l);
  }
  return out;
}

export function shouldSkip(relPath: string, opts: { all: boolean }): boolean {
  if (relPath === 'guard/denylist.sha256') return true;
  const segments = relPath.split('/');
  if (segments.some((s) => ALWAYS_SKIPPED_DIRS.has(s))) return true;
  return !opts.all && segments.includes('node_modules');
}
