import { describe, it, expect } from 'vitest';
import type { Attribute } from '../../src/engine/pack.js';
import {
  check,
  opposed,
  multiActionPenalty,
  skillCode,
} from '../../src/engine/checks.js';
import type { RollResult } from '../../src/engine/roll.js';
import { character } from '../helpers/actor.js';

function r(total: number): RollResult {
  return {
    code: { dice: 3, pips: 0 },
    normal: [],
    special: [],
    cp: [],
    dropped: [],
    complication: false,
    pips: 0,
    total,
  };
}

const ATTRIBUTES: Record<string, Attribute> = {
  marksmanship: 'coordination',
  dodge: 'reflexes',
  sneak: 'perception',
};
const attributeOf = (skill: string): Attribute | undefined => ATTRIBUTES[skill];

describe('checks', () => {
  it('check succeeds when the total meets the difficulty', () => {
    expect(check(r(15), 15)).toEqual({ total: 15, target: 15, success: true, margin: 0 });
    const miss = check(r(14), 15);
    expect(miss.success).toBe(false);
    expect(miss.margin).toBe(-1);
  });

  it('opposed ties go to the initiator', () => {
    const tie = opposed(r(12), r(12));
    expect(tie.success).toBe(true);
    expect(tie.margin).toBe(0);
    const loss = opposed(r(11), r(12));
    expect(loss.success).toBe(false);
    expect(loss.margin).toBe(-1);
  });

  it('multiActionPenalty removes one die per extra action', () => {
    expect(multiActionPenalty(0)).toBe(0);
    expect(multiActionPenalty(1)).toBe(0);
    expect(multiActionPenalty(2)).toBe(1);
    expect(multiActionPenalty(3)).toBe(2);
  });

  it('skillCode uses the character skill, else the attribute', () => {
    const ana = character('ana');
    expect(skillCode(ana, 'marksmanship', attributeOf)).toEqual({ dice: 3, pips: 0 });
    expect(skillCode(ana, 'sneak', attributeOf)).toEqual({ dice: 2, pips: 0 });
    const trained = {
      ...ana,
      skills: [
        ...ana.skills,
        { name: 'sneak', attribute: 'perception' as const, code: { dice: 4, pips: 0 } },
      ],
    };
    expect(skillCode(trained, 'sneak', attributeOf)).toEqual({ dice: 4, pips: 0 });
    expect(() => skillCode(ana, 'flying', attributeOf)).toThrow('unknown skill: flying');
  });
});
