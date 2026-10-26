import { describe, it, expect } from 'vitest';
import { woundFromMargin, applyWound, isOut } from '../../src/engine/wounds.js';

describe('wounds', () => {
  it('computes woundFromMargin', () => {
    expect(woundFromMargin(0)).toBeNull();
    expect(woundFromMargin(-3)).toBeNull();
    expect(woundFromMargin(1)).toBe('stunned');
    expect(woundFromMargin(3)).toBe('stunned');
    expect(woundFromMargin(4)).toBe('wounded');
    expect(woundFromMargin(8)).toBe('wounded');
    expect(woundFromMargin(9)).toBe('incapacitated');
    expect(woundFromMargin(12)).toBe('incapacitated');
    expect(woundFromMargin(13)).toBe('mortally-wounded');
    expect(woundFromMargin(15)).toBe('mortally-wounded');
    expect(woundFromMargin(16)).toBe('dead');
    expect(woundFromMargin(40)).toBe('dead');
  });

  it('applies wounds according to stacking rules', () => {
    expect(applyWound('healthy', 'stunned')).toBe('stunned');
    expect(applyWound('healthy', 'wounded')).toBe('wounded');
    expect(applyWound('stunned', 'wounded')).toBe('wounded');
    expect(applyWound('stunned', 'stunned')).toBe('wounded');
    expect(applyWound('wounded', 'stunned')).toBe('severely-wounded');
    expect(applyWound('wounded', 'wounded')).toBe('severely-wounded');
    expect(applyWound('severely-wounded', 'wounded')).toBe('incapacitated');
    expect(applyWound('wounded', 'incapacitated')).toBe('incapacitated');
    expect(applyWound('mortally-wounded', 'stunned')).toBe('dead');
    expect(applyWound('dead', 'stunned')).toBe('dead');
  });

  it('determines isOut correctly', () => {
    expect(isOut('severely-wounded')).toBe(false);
    expect(isOut('incapacitated')).toBe(true);
    expect(isOut('mortally-wounded')).toBe(true);
    expect(isOut('dead')).toBe(true);
  });
});
