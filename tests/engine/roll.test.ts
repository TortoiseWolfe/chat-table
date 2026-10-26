import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { doubleDice } from '../../src/engine/dice.js';
import { createRng } from '../../src/engine/rng.js';
import { rollCode } from '../../src/engine/roll.js';
import { fixedRng } from '../helpers/fixedRng.js';

describe('rollCode', () => {
  it('rolls 3D+2 with the special die on its own', () => {
    const rng = fixedRng([4, 2, 5]);
    const r = rollCode({ dice: 3, pips: 2 }, { specialOne: 'none' }, rng);
    expect(r.normal).toEqual([4, 2]);
    expect(r.special).toEqual([5]);
    expect(r.total).toBe(13);
    expect(rng.left()).toBe(0);
  });

  it('explodes the special die on a 6', () => {
    const r = rollCode({ dice: 3, pips: 0 }, { specialOne: 'none' }, fixedRng([3, 4, 6, 6, 2]));
    expect(r.special).toEqual([6, 6, 2]);
    expect(r.total).toBe(21);
  });

  it('drop-highest removes the 1 and the highest normal die', () => {
    const r = rollCode(
      { dice: 3, pips: 1 },
      { specialOne: 'drop-highest' },
      fixedRng([5, 2, 1]),
    );
    expect(r.dropped).toEqual([1, 5]);
    expect(r.total).toBe(3);
  });

  it('complication counts everything and flags it; none counts everything', () => {
    const faces = [5, 2, 1];
    const c = rollCode({ dice: 3, pips: 1 }, { specialOne: 'complication' }, fixedRng(faces));
    expect(c.total).toBe(9);
    expect(c.complication).toBe(true);
    const n = rollCode({ dice: 3, pips: 1 }, { specialOne: 'none' }, fixedRng(faces));
    expect(n.total).toBe(9);
    expect(n.complication).toBe(false);
  });

  it('drop-highest on 1D drops only the 1', () => {
    const r = rollCode({ dice: 1, pips: 2 }, { specialOne: 'drop-highest' }, fixedRng([1]));
    expect(r.dropped).toEqual([1]);
    expect(r.total).toBe(2);
  });

  it('0D+2 draws nothing', () => {
    const r = rollCode({ dice: 0, pips: 2 }, { specialOne: 'drop-highest' }, fixedRng([]));
    expect(r.total).toBe(2);
    expect(r.normal).toEqual([]);
    expect(r.special).toEqual([]);
  });

  it('rolls Character Point dice after the special chain', () => {
    const r = rollCode(
      { dice: 2, pips: 0 },
      { specialOne: 'none', cpDice: 2 },
      fixedRng([3, 4, 6, 1, 2]),
    );
    expect(r.normal).toEqual([3]);
    expect(r.special).toEqual([4]);
    expect(r.cp).toEqual([[6, 1], [2]]);
    expect(r.total).toBe(16);
  });

  it('a 1 after a 6 on the special die is just a 1', () => {
    const r = rollCode(
      { dice: 2, pips: 0 },
      { specialOne: 'drop-highest' },
      fixedRng([2, 6, 1]),
    );
    expect(r.special).toEqual([6, 1]);
    expect(r.dropped).toEqual([]);
    expect(r.total).toBe(9);
  });

  it('rolls a doubled code with pips above 2', () => {
    const r = rollCode(
      doubleDice({ dice: 4, pips: 2 }),
      { specialOne: 'none' },
      fixedRng([1, 1, 1, 1, 1, 1, 1, 2]),
    );
    expect(r.normal).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect(r.special).toEqual([2]);
    expect(r.total).toBe(13);
  });

  it('holds its invariants for any seed', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 0xffffffff }),
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 0, max: 2 }),
        fc.constantFrom('complication', 'drop-highest', 'none'),
        (seed, dice, pips, rule) => {
          const r = rollCode({ dice, pips }, { specialOne: rule }, createRng({ seed, counter: 0 }));
          expect(r.total).toBeGreaterThanOrEqual(0);
          expect(r.normal.length).toBe(Math.max(0, dice - 1));
          if (r.special.length > 0) {
            expect(r.special[r.special.length - 1]).not.toBe(6);
          }
        },
      ),
    );
  });
});
