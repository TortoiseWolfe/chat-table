import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { mix32, createRng } from '../../src/engine/rng.js';

describe('rng', () => {
  it('mix32 computes pinned values', () => {
    expect(mix32(0)).toBe(0);
    expect(mix32(1)).toBe(1364076727);
    expect(mix32(0xdeadbeef)).toBe(233162409);
  });

  it('draws 8 dice from seed 1', () => {
    const rng = createRng({ seed: 1, counter: 0 });
    const results = Array.from({ length: 8 }, () => rng.die(6));
    expect(results).toEqual([2, 4, 1, 4, 3, 3, 5, 6]);
    expect(rng.state).toEqual({ seed: 1, counter: 8 });
  });

  it('draws 8 dice from seed 42', () => {
    const rng = createRng({ seed: 42, counter: 0 });
    const results = Array.from({ length: 8 }, () => rng.die(6));
    expect(results).toEqual([1, 2, 6, 1, 5, 1, 4, 1]);
  });

  it('resumes sequence from counter', () => {
    const rng = createRng({ seed: 1, counter: 5 });
    const results = Array.from({ length: 3 }, () => rng.die(6));
    expect(results).toEqual([3, 5, 6]);
  });

  it('fast-check: die(n) returns integer in 1..n for n in 2..20', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 0xffffffff }),
        fc.integer({ min: 0, max: 10000 }),
        fc.integer({ min: 2, max: 20 }),
        (seed, counter, n) => {
          const rng = createRng({ seed, counter });
          const val = rng.die(n);
          expect(Number.isInteger(val)).toBe(true);
          expect(val).toBeGreaterThanOrEqual(1);
          expect(val).toBeLessThanOrEqual(n);
        }
      )
    );
  });

  it('distribution: 60000 die(6) draws from seed 7 are within 10000 +- 400', () => {
    const rng = createRng({ seed: 7, counter: 0 });
    const counts = [0, 0, 0, 0, 0, 0, 0]; // 1-indexed
    for (let i = 0; i < 60000; i++) {
      counts[rng.die(6)]!++;
    }
    for (let face = 1; face <= 6; face++) {
      expect(counts[face]).toBeGreaterThanOrEqual(9600);
      expect(counts[face]).toBeLessThanOrEqual(10400);
    }
  });
});
