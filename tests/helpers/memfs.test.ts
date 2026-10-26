import { describe, expect, it } from 'vitest';
import { memFs } from './memfs.js';
import { ctxFor } from './ctx.js';
import { fixedRng } from './fixedRng.js';
import { character } from './actor.js';
import type { GameState } from '../../src/engine/state.js';
import type { Pack } from '../../src/engine/pack.js';

describe('memFs', () => {
  it('writes then reads', async () => {
    const fs = memFs();
    await fs.writeFile('a', 'hello');
    expect(await fs.readFile('a')).toBe('hello');
    expect(fs.modes.get('a')).toBe(0o644);
  });

  it('appends twice', async () => {
    const fs = memFs();
    await fs.appendFile('a', 'x');
    await fs.appendFile('a', 'y');
    expect(await fs.readFile('a')).toBe('xy');
  });

  it('renames', async () => {
    const fs = memFs();
    await fs.writeFile('a', 'x');
    await fs.rename('a', 'b');
    expect(await fs.readFile('b')).toBe('x');
    expect(await fs.exists('a')).toBe(false);
  });

  it('stores the mode', async () => {
    const fs = memFs();
    await fs.writeFile('t', 'x', 0o600);
    expect(fs.modes.get('t')).toBe(0o600);
  });

  it('rejects a missing read with ENOENT', async () => {
    await expect(memFs().readFile('nope')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('ctxFor', () => {
  it('sets at and collects events', () => {
    const s = { quotes: {} } as unknown as GameState;
    const ctx = ctxFor(s, {} as Pack, fixedRng([]), 5);
    expect(ctx.at).toBe(5);
    expect(ctx.s).toBe(s);
    const e = { type: 'resumed' } as const;
    ctx.emit(e);
    expect(ctx.events).toEqual([e]);
    expect(character().id).toBe('ana');
  });
});
