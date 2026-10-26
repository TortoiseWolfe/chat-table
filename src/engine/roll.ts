import type { DiceCode } from './dice.js';
import type { Rng } from './rng.js';

export type SpecialOneRule = 'complication' | 'drop-highest' | 'none';

export interface RollOptions {
  cpDice?: number;
  specialOne: SpecialOneRule;
}

export interface RollResult {
  code: DiceCode;
  normal: number[];
  special: number[];
  cp: number[][];
  dropped: number[];
  complication: boolean;
  pips: number;
  total: number;
}

function chain(rng: Rng): number[] {
  const faces: number[] = [];
  for (;;) {
    const face = rng.die(6);
    faces.push(face);
    if (face !== 6) {
      return faces;
    }
  }
}

function sum(faces: number[]): number {
  return faces.reduce((acc, face) => acc + face, 0);
}

export function rollCode(code: DiceCode, opts: RollOptions, rng: Rng): RollResult {
  const normal: number[] = [];
  for (let i = 0; i < Math.max(0, code.dice - 1); i++) {
    normal.push(rng.die(6));
  }
  const special = code.dice >= 1 ? chain(rng) : [];
  const cp: number[][] = [];
  for (let i = 0; i < (opts.cpDice ?? 0); i++) {
    cp.push(chain(rng));
  }

  let kept = [...normal];
  let specialKept = [...special];
  const dropped: number[] = [];
  let complication = false;
  if (special[0] === 1) {
    if (opts.specialOne === 'drop-highest') {
      dropped.push(1);
      specialKept = specialKept.slice(1);
      if (normal.length > 0) {
        const highest = Math.max(...normal);
        dropped.push(highest);
        kept.splice(kept.indexOf(highest), 1);
      }
    } else if (opts.specialOne === 'complication') {
      complication = true;
    }
  }
  kept = kept.concat(specialKept, cp.flat());

  return {
    code,
    normal,
    special,
    cp,
    dropped,
    complication,
    pips: code.pips,
    total: Math.max(0, sum(kept) + code.pips),
  };
}
