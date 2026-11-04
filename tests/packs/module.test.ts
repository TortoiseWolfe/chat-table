import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import {
  MODULE_READERS,
  loadPrivateModule,
  moduleFromFiles,
  privateModuleDir,
} from '../../src/packs/module.js';
import { memFs } from '../helpers/memfs.js';

const SENTINEL = 'ZZ-SENTINEL-GM-ONLY';
const meta = JSON.stringify({ id: 'mod-a', name: 'A', version: '1.0.0', source: 'x' });
const scenes = JSON.stringify([{ scene: 'start', notes: [`n ${SENTINEL}`], secrets: [`s ${SENTINEL}`] }]);
const npcs = JSON.stringify([{ npc: 'grunt', motive: `m ${SENTINEL}`, secrets: [] }]);
const good = { 'module.json': meta, 'scenes.json': scenes, 'npcs.json': npcs };

function templateFiles(): Record<string, string> {
  const dir = 'packs/module-template';
  return Object.fromEntries(
    ['module.json', 'scenes.json', 'npcs.json'].map((n) => [n, readFileSync(join(dir, n), 'utf8')])
  );
}

describe('moduleFromFiles', () => {
  it('reads scene and npc notes', () => {
    const m = moduleFromFiles(good);
    expect(m.label).toBe('mod-a@1.0.0');
    expect(m.scene('start')?.secrets).toEqual([`s ${SENTINEL}`]);
    expect(m.npc('grunt')?.motive).toBe(`m ${SENTINEL}`);
    expect(m.scene('nowhere')).toBeUndefined();
  });

  it('reports every problem at once', () => {
    expect(() =>
      moduleFromFiles({ 'module.json': '{', 'scenes.json': '[{"scene":"Bad Id"}]' })
    ).toThrow(/module\.json.*invalid JSON[\s\S]*scenes\.json[\s\S]*npcs\.json.*missing/);
  });

  it('refuses unknown fields, so a pack file dropped in by mistake fails loudly', () => {
    expect(() =>
      moduleFromFiles({ ...good, 'module.json': JSON.stringify({ id: 'a', name: 'A', version: '1.0.0', source: '', extra: 1 }) })
    ).toThrow(/module\.json/);
  });

  it('checks ids against the pack it is played with', () => {
    const known = { scenes: new Set(['start']), npcs: new Set(['grunt']) };
    expect(() => moduleFromFiles(good, known)).not.toThrow();
    expect(() => moduleFromFiles(good, { scenes: new Set(['other']), npcs: new Set(['grunt']) })).toThrow(
      /no such scene "start"/
    );
    expect(() => moduleFromFiles(good, { scenes: new Set(['start']), npcs: new Set() })).toThrow(
      /no such npc "grunt"/
    );
  });

  it('refuses a duplicate scene id', () => {
    const dup = JSON.stringify([
      { scene: 'start', notes: [], secrets: [] },
      { scene: 'start', notes: [], secrets: [] },
    ]);
    expect(() => moduleFromFiles({ ...good, 'scenes.json': dup })).toThrow(/duplicate "start"/);
  });
});

describe('GmOnlyModule hides its content', () => {
  const m = moduleFromFiles(good);
  it('from JSON, string conversion and console output', () => {
    for (const out of [
      JSON.stringify(m),
      JSON.stringify({ wrapped: [m] }),
      String(m),
      `${String(m)}`,
      inspect(m, { depth: 9 }),
    ]) {
      expect(out).not.toContain(SENTINEL);
      expect(out).toContain('gm-only');
    }
  });
});

describe('loadPrivateModule', () => {
  it('loads from a folder through the injected file system', async () => {
    const fs = memFs();
    for (const [k, v] of Object.entries(good)) fs.files.set(`/private/mod/${k}`, v);
    const m = await loadPrivateModule('/private/mod', fs);
    expect(m.scene('start')?.notes).toHaveLength(1);
  });

  it('names a missing file', async () => {
    await expect(loadPrivateModule('/nowhere', memFs())).rejects.toThrow(/scenes\.json.*missing/);
  });
});

describe('the blank template', () => {
  it('loads, and every field is empty or a visible placeholder', () => {
    const files = templateFiles();
    const m = moduleFromFiles(files);
    expect(m.label).toBe('my-module@0.0.1');
    for (const text of Object.values(files)) {
      const strings = [...text.matchAll(/"([^"]*)"\s*(?=[,\]}\n])/g)].map((x) => x[1] ?? '');
      const prose = strings.filter((s) => /\s/.test(s));
      for (const s of prose) expect(s.startsWith('PLACEHOLDER')).toBe(true);
    }
  });
});

describe('privateModuleDir', () => {
  const root = '/app';
  it('is null when the variable is unset or blank: there is no default path', () => {
    expect(privateModuleDir({}, root)).toBeNull();
    expect(privateModuleDir({ PRIVATE_MODULE_DIR: '  ' }, root)).toBeNull();
  });
  it('accepts an absolute folder outside the repo', () => {
    expect(privateModuleDir({ PRIVATE_MODULE_DIR: '/private/mod' }, root)).toBe('/private/mod');
    expect(privateModuleDir({ PRIVATE_MODULE_DIR: '/app-private/mod' }, root)).toBe('/app-private/mod');
  });
  it('refuses a relative path and any path inside the repo', () => {
    expect(() => privateModuleDir({ PRIVATE_MODULE_DIR: 'mod' }, root)).toThrow(/absolute/);
    expect(() => privateModuleDir({ PRIVATE_MODULE_DIR: '/app' }, root)).toThrow(/outside the repo/);
    expect(() => privateModuleDir({ PRIVATE_MODULE_DIR: '/app/packs/x' }, root)).toThrow(/outside the repo/);
    expect(() => privateModuleDir({ PRIVATE_MODULE_DIR: '/app/../app/x' }, root)).toThrow(/outside the repo/);
  });
});

describe('who may import the module', () => {
  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) return sources(p);
      return p.endsWith('.ts') ? [p] : [];
    });
  }
  it('only the files on the reader list import it', () => {
    const importers = sources('src')
      .filter((p) => p !== 'src/packs/module.ts')
      .filter((p) => /from\s+['"][^'"]*packs\/module(\.js)?['"]/.test(readFileSync(p, 'utf8')));
    expect([...importers].sort()).toEqual([...MODULE_READERS].sort());
  });
  it('the stream-facing code never imports it: overlay, narrator, packets, seats, chat replies', () => {
    for (const p of sources('src')) {
      if (!/^src\/(overlay|narrator|ai|seats|twitch|admin|engine|gm)\//.test(p)) continue;
      expect(readFileSync(p, 'utf8'), p).not.toMatch(/packs\/module/);
    }
  });
});
