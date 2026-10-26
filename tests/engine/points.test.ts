import { describe, it, expect } from 'vitest';
import { canSpendCp, canSpendFp } from '../../src/engine/points.js';

describe('points', () => {
  it('checks canSpendCp', () => {
    expect(canSpendCp({ cp: 5, fp: 1 }, 2, 2)).toBe(true);
    expect(canSpendCp({ cp: 5, fp: 1 }, 3, 2)).toBe(false);
    expect(canSpendCp({ cp: 1, fp: 1 }, 2, 2)).toBe(false);
    expect(canSpendCp({ cp: 5, fp: 1 }, 0, 2)).toBe(false);
  });

  it('checks canSpendFp', () => {
    expect(canSpendFp({ cp: 5, fp: 1 }, 0)).toBe(true);
    expect(canSpendFp({ cp: 5, fp: 1 }, 1)).toBe(false);
    expect(canSpendFp({ cp: 5, fp: 0 }, 0)).toBe(false);
  });
});
