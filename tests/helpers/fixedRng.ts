import type { Rng } from '../../src/engine/rng.js';

export function fixedRng(faces: number[]): Rng & { left(): number } {
  let used = 0;
  return {
    die(sides: number): number {
      const face = faces[used];
      if (face === undefined) {
        throw new Error('fixedRng: out of faces');
      }
      if (face > sides) {
        throw new Error(`fixedRng: face ${face} > sides ${sides}`);
      }
      used += 1;
      return face;
    },
    get state() {
      return { seed: 0, counter: used };
    },
    left(): number {
      return faces.length - used;
    },
  };
}
