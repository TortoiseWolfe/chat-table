import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PackFiles, type PackFileName } from '../../src/packs/schema.js';

const DIR = 'tests/fixtures/packs/tiny/';

function read(name: PackFileName): unknown {
  return JSON.parse(readFileSync(DIR + name, 'utf8')) as unknown;
}

describe('pack schema', () => {
  it('parses the five tiny files', () => {
    for (const name of Object.keys(PackFiles) as PackFileName[]) {
      const r = PackFiles[name].safeParse(read(name));
      expect(r.success, name).toBe(true);
    }
  });

  it('rejects a bad dice code', () => {
    const chars = read('characters.json') as { attributes: Record<string, string> }[];
    chars[0]!.attributes['reflexes'] = '3X';
    expect(PackFiles['characters.json'].safeParse(chars).success).toBe(false);
  });

  it('rejects a scene with choices and ending', () => {
    const adv = read('adventure.json') as { scenes: Record<string, unknown>[] };
    adv.scenes[0]!['ending'] = 'victory';
    expect(PackFiles['adventure.json'].safeParse(adv).success).toBe(false);
  });

  it('rejects 3 characters', () => {
    const chars = read('characters.json') as unknown[];
    expect(PackFiles['characters.json'].safeParse(chars.slice(0, 3)).success).toBe(false);
  });

  it('rejects a skill with no attribute', () => {
    const p = read('pack.json') as { skills: Record<string, unknown>[] };
    delete p.skills[0]!['attribute'];
    expect(PackFiles['pack.json'].safeParse(p).success).toBe(false);
  });
});
