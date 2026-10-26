import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadPack, loadPackSync } from '../../src/packs/load.js';
import { memFs } from '../helpers/memfs.js';

const DIR = 'tests/fixtures/packs/tiny';
const NAMES = ['pack', 'characters', 'npcs', 'adventure', 'templates'].map((n) => `${n}.json`);

function fsWith(edit?: (files: Record<string, string>) => void) {
  const fs = memFs();
  const texts: Record<string, string> = {};
  for (const n of NAMES) texts[n] = readFileSync(`${DIR}/${n}`, 'utf8');
  edit?.(texts);
  for (const n of NAMES) fs.files.set(`/p/${n}`, texts[n]!);
  return fs;
}

async function problem(edit: (files: Record<string, string>) => void): Promise<string> {
  try {
    await loadPack('/p', fsWith(edit));
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  return '';
}

describe('loadPackSync', () => {
  it('loads the tiny pack', () => {
    const pack = loadPackSync(DIR);
    expect(pack.characters[0]?.attributes.reflexes).toEqual({ dice: 2, pips: 0 });
    expect(pack.characters[0]?.wound).toBe('healthy');
    expect(pack.assets).toEqual({ map: {}, art: {}, sounds: {} });
  });
});

describe('loadPack', () => {
  it('loads through FsLike', async () => {
    const pack = await loadPack('/p', fsWith());
    expect(pack.id).toBe('tiny');
  });

  it('fails on a dangling next', async () => {
    const msg = await problem((f) => {
      f['adventure.json'] = f['adventure.json']!.replace('"next": "fight"', '"next": "nowhere"');
    });
    expect(msg).toContain('adventure.json');
  });

  it('fails on a missing check.success template', async () => {
    const msg = await problem((f) => {
      const t = JSON.parse(f['templates.json']!) as Record<string, string[]>;
      delete t['check.success'];
      f['templates.json'] = JSON.stringify(t);
    });
    expect(msg).toContain('templates.json');
  });

  it('fails without the out-of-time scene', async () => {
    const msg = await problem((f) => {
      const a = JSON.parse(f['adventure.json']!) as { scenes: { id: string }[] };
      a.scenes = a.scenes.filter((s) => s.id !== 'out-of-time');
      f['adventure.json'] = JSON.stringify(a);
    });
    expect(msg).toContain('exactly one timeout ending');
  });

  it('lists two problems on two lines', async () => {
    const msg = await problem((f) => {
      f['adventure.json'] = f['adventure.json']!.replace('"next": "fight"', '"next": "nowhere"');
      const t = JSON.parse(f['templates.json']!) as Record<string, string[]>;
      delete t['check.success'];
      f['templates.json'] = JSON.stringify(t);
    });
    expect(msg.split('\n').filter((l) => l.length > 0).length).toBeGreaterThanOrEqual(2);
    expect(msg).toContain('adventure.json');
    expect(msg).toContain('templates.json');
  });

  it('reports a missing asset', async () => {
    const msg = await problem((f) => {
      const p = JSON.parse(f['pack.json']!) as { assets: unknown };
      p.assets = { map: { m: 'maps/none.png' } };
      f['pack.json'] = JSON.stringify(p);
    });
    expect(msg).toContain('maps/none.png');
  });
});
