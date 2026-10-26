import { WOUND_ORDER, WOUND_BANDS, type WoundLevel } from './tables.js';

export function woundFromMargin(margin: number): WoundLevel | null {
  if (margin <= 0) {
    return null;
  }
  for (let i = WOUND_BANDS.length - 1; i >= 0; i--) {
    const band = WOUND_BANDS[i]!;
    if (margin >= band.minMargin) {
      return band.level;
    }
  }
  return null;
}

export function applyWound(current: WoundLevel, hit: WoundLevel): WoundLevel {
  if (current === 'healthy') {
    return hit;
  }

  const currentIndex = WOUND_ORDER.indexOf(current);
  const hitIndex = WOUND_ORDER.indexOf(hit);

  if (hitIndex <= currentIndex) {
    const nextIndex = Math.min(currentIndex + 1, WOUND_ORDER.length - 1);
    return WOUND_ORDER[nextIndex]!;
  }

  return hit;
}

export function isOut(level: WoundLevel): boolean {
  return WOUND_ORDER.indexOf(level) >= WOUND_ORDER.indexOf('incapacitated');
}
