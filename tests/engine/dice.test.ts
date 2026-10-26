import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  parseDiceCode,
  formatDiceCode,
  addDice,
  addPips,
  minusDice,
  doubleDice,
} from '../../src/engine/dice.js';

describe('dice', () => {
  it('parses valid dice codes', () => {
    expect(parseDiceCode('3D+2')).toEqual({ dice: 3, pips: 2 });
    expect(parseDiceCode('3d')).toEqual({ dice: 3, pips: 0 });
    expect(parseDiceCode('2D+4')).toEqual({ dice: 3, pips: 1 });
    expect(parseDiceCode('3D-1')).toEqual({ dice: 2, pips: 2 });
    expect(parseDiceCode(' 4 D + 1 ')).toEqual({ dice: 4, pips: 1 });
    expect(parseDiceCode('0D+2')).toEqual({ dice: 0, pips: 2 });
  });

  it('throws on invalid dice codes', () => {
    const invalidInputs = ['', 'D', '3', '3D+', 'xD', '0D-1', '1D-4'];
    for (const input of invalidInputs) {
      expect(() => parseDiceCode(input)).toThrow();
    }
  });

  it('formats dice codes', () => {
    expect(formatDiceCode({ dice: 4, pips: 0 })).toBe('4D');
    expect(formatDiceCode({ dice: 2, pips: 1 })).toBe('2D+1');
    expect(formatDiceCode({ dice: 0, pips: 2 })).toBe('0D+2');
  });

  it('adds dice codes', () => {
    expect(addDice({ dice: 3, pips: 2 }, { dice: 1, pips: 1 })).toEqual({ dice: 5, pips: 0 });
  });

  it('adds pips', () => {
    expect(addPips({ dice: 3, pips: 0 }, -1)).toEqual({ dice: 2, pips: 2 });
    expect(addPips({ dice: 0, pips: 1 }, -3)).toEqual({ dice: 0, pips: 0 });
  });

  it('subtracts dice', () => {
    expect(minusDice({ dice: 3, pips: 1 }, 1)).toEqual({ dice: 2, pips: 1 });
    expect(minusDice({ dice: 1, pips: 2 }, 1)).toEqual({ dice: 0, pips: 2 });
    expect(minusDice({ dice: 1, pips: 2 }, 2)).toEqual({ dice: 0, pips: 0 });
  });

  it('doubles dice', () => {
    expect(doubleDice({ dice: 4, pips: 2 })).toEqual({ dice: 8, pips: 4 });
  });

  it('roundtrips format and parse with fast-check', () => {
    fc.assert(
      fc.property(
        fc.record({
          dice: fc.integer({ min: 0, max: 20 }),
          pips: fc.integer({ min: 0, max: 2 }),
        }),
        (c) => {
          expect(parseDiceCode(formatDiceCode(c))).toEqual(c);
        }
      )
    );
  });
});
