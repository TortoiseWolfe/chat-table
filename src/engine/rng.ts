export interface RngState {
  seed: number;
  counter: number;
}

export interface Rng {
  die(sides: number): number;
  readonly state: RngState;
}

export function mix32(x: number): number {
  let h = x >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export function createRng(initialState: RngState): Rng {
  const seed = initialState.seed >>> 0;
  let counter = initialState.counter >>> 0;

  return {
    die(sides: number): number {
      const k = counter;
      counter = (counter + 1) >>> 0;
      const input = (seed + Math.imul(k, 0x9e3779b9)) >>> 0;
      const value = mix32(input);
      return 1 + Math.floor((value / 4294967296) * sides);
    },
    get state(): RngState {
      return { seed, counter };
    },
  };
}
