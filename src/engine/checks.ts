import type { DiceCode } from './dice.js';
import type { Attribute, Character } from './pack.js';
import type { RollResult } from './roll.js';

export interface CheckResult {
  total: number;
  target: number;
  success: boolean;
  margin: number;
}

export function check(roll: RollResult, difficulty: number): CheckResult {
  const margin = roll.total - difficulty;
  return { total: roll.total, target: difficulty, success: margin >= 0, margin };
}

export function opposed(initiator: RollResult, other: RollResult): CheckResult {
  return check(initiator, other.total);
}

export function multiActionPenalty(actions: number): number {
  return Math.max(0, actions - 1);
}

export function skillCode(
  character: Character,
  name: string,
  attributeOf: (skill: string) => Attribute | undefined,
): DiceCode {
  const own = character.skills.find((skill) => skill.name === name);
  if (own) {
    return own.code;
  }
  const attribute = attributeOf(name);
  if (attribute === undefined) {
    throw new Error(`unknown skill: ${name}`);
  }
  return character.attributes[attribute];
}
