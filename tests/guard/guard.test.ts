import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { normalise, windows } from '../../src/guard/normalise.js';
import { scanText, shouldSkip } from '../../src/guard/scan.js';

const sha = (s: string): string => createHash('sha256').update(s).digest('hex');
const hashes = new Set([sha('zorblax'), sha('quiv nadoon')]);

describe('guard', () => {
  it('normalises and windows', () => {
    expect(normalise('  The quiv  NADOON! ')).toBe('the quiv nadoon');
    expect(windows(['a', 'b', 'c'], 2)).toEqual(['a', 'b', 'c', 'a b', 'b c']);
  });

  it('finds a planted word on its line', () => {
    expect(scanText('a.md', 'a zorblax here', hashes)).toEqual([
      { path: 'a.md', line: 1, kind: 'denylist' },
    ]);
  });

  it('finds a phrase through normalising', () => {
    expect(scanText('a.md', 'the quiv  NADOON!', hashes)).toHaveLength(1);
  });

  it('leaves clean text alone (SC-006)', () => {
    expect(scanText('a.md', 'a shuttle docks', hashes)).toEqual([]);
  });

  it('flags a compatibility line, except in OGL.md', () => {
    const line = 'compat' + 'ible with D' + '6';
    expect(scanText('README.md', line, hashes)).toEqual([
      { path: 'README.md', line: 1, kind: 'compat' },
    ]);
    expect(scanText('OGL.md', line, hashes)).toEqual([]);
  });

  it('never carries the planted word in a hit', () => {
    const out = JSON.stringify(scanText('a.md', 'a zorblax here\nthe quiv nadoon', hashes));
    expect(out).not.toContain('zorblax');
    expect(out).not.toContain('nadoon');
  });

  it('skips by path', () => {
    expect(shouldSkip('node_modules/x.js', { all: false })).toBe(true);
    expect(shouldSkip('node_modules/x.js', { all: true })).toBe(false);
    expect(shouldSkip('.git/HEAD', { all: true })).toBe(true);
    expect(shouldSkip('guard/denylist.sha256', { all: true })).toBe(true);
    expect(shouldSkip('src/main.ts', { all: false })).toBe(false);
  });
});
