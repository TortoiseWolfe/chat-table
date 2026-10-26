import { describe, it, expect } from 'vitest';
import {
  DIFFICULTY,
  COMBAT_MIN_DIFFICULTY,
  WOUND_ORDER,
  WOUND_BANDS,
  WOUND_PENALTY,
} from '../../src/engine/tables.js';

describe('tables', () => {
  it('DIFFICULTY matches expected values', () => {
    expect(DIFFICULTY).toEqual({
      'very-easy': 5,
      easy: 10,
      moderate: 15,
      difficult: 20,
      'very-difficult': 25,
      heroic: 30,
    });
  });

  it('COMBAT_MIN_DIFFICULTY is 3', () => {
    expect(COMBAT_MIN_DIFFICULTY).toBe(3);
  });

  it('WOUND_ORDER has the 7 levels in data-model order', () => {
    expect(WOUND_ORDER).toEqual([
      'healthy',
      'stunned',
      'wounded',
      'severely-wounded',
      'incapacitated',
      'mortally-wounded',
      'dead',
    ]);
  });

  it('WOUND_BANDS deep-equals the expected bands', () => {
    expect(WOUND_BANDS).toEqual([
      { minMargin: 1, level: 'stunned' },
      { minMargin: 4, level: 'wounded' },
      { minMargin: 9, level: 'incapacitated' },
      { minMargin: 13, level: 'mortally-wounded' },
      { minMargin: 16, level: 'dead' },
    ]);
  });

  it('WOUND_PENALTY matches expected penalties', () => {
    expect(WOUND_PENALTY).toEqual({
      healthy: 0,
      stunned: 1,
      wounded: 1,
      'severely-wounded': 2,
      incapacitated: 0,
      'mortally-wounded': 0,
      dead: 0,
    });
  });
});
