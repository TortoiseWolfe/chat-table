/** A dice code such as 3D+2. Normalised: 0 <= pips <= 2. */
export interface DiceCode {
  dice: number;
  pips: number;
}

export function parseDiceCode(text: string): DiceCode {
  const clean = text.replace(/\s+/g, '');
  const match = /^(\d+)[dD](?:([+-])(\d+))?$/.exec(clean);
  if (!match || match[1] === undefined) {
    throw new Error(`Invalid dice code: "${text}"`);
  }

  const dice = parseInt(match[1], 10);
  const sign = match[2];
  const pipVal = match[3] !== undefined ? parseInt(match[3], 10) : 0;
  const pips = sign === '-' ? -pipVal : pipVal;

  const totalPips = dice * 3 + pips;
  if (totalPips < 0) {
    throw new Error(`Dice code cannot be negative: "${text}"`);
  }

  return {
    dice: Math.floor(totalPips / 3),
    pips: totalPips % 3,
  };
}

export function formatDiceCode(code: DiceCode): string {
  if (code.pips > 0) {
    return `${code.dice}D+${code.pips}`;
  }
  return `${code.dice}D`;
}

export function addDice(a: DiceCode, b: DiceCode): DiceCode {
  const totalPips = (a.dice + b.dice) * 3 + a.pips + b.pips;
  return {
    dice: Math.floor(totalPips / 3),
    pips: totalPips % 3,
  };
}

export function addPips(code: DiceCode, pips: number): DiceCode {
  const totalPips = code.dice * 3 + code.pips + pips;
  if (totalPips < 0) {
    return { dice: 0, pips: 0 };
  }
  return {
    dice: Math.floor(totalPips / 3),
    pips: totalPips % 3,
  };
}

export function minusDice(code: DiceCode, dice: number): DiceCode {
  const rem = code.dice - dice;
  return {
    dice: Math.max(0, rem),
    pips: rem >= 0 ? code.pips : 0,
  };
}

export function doubleDice(code: DiceCode): DiceCode {
  return {
    dice: code.dice * 2,
    pips: code.pips * 2,
  };
}
