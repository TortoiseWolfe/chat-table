import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { firstJsonObject, parseAnswer } from '../../src/ai/answer.js';
import type { TurnPacket } from '../../src/ai/types.js';

const packet = (over: Partial<TurnPacket> = {}): TurnPacket => ({
  seat: 1,
  round: 1,
  system: 's',
  user: 'u',
  options: [
    { n: 1, label: 'A' },
    { n: 2, label: 'B' },
    { n: 3, label: 'C' },
  ],
  maxCp: 2,
  hasFp: true,
  ...over,
});

describe('firstJsonObject', () => {
  it('finds the object inside prose and code fences', () => {
    expect(firstJsonObject('Sure! ```json\n{"a":1}\n``` done')).toBe('{"a":1}');
  });
  it('keeps nested braces and braces inside strings', () => {
    expect(firstJsonObject('x {"a":{"b":"}"},"c":2} y {"z":1}')).toBe('{"a":{"b":"}"},"c":2}');
  });
  it('is null with no object or an unbalanced one', () => {
    expect(firstJsonObject('no braces')).toBeNull();
    expect(firstJsonObject('{"a":1')).toBeNull();
  });
});

describe('parseAnswer', () => {
  it('reads option, cp, fp and say', () => {
    expect(parseAnswer('{"option":2,"cp":1,"fp":false,"say":"On it."}', packet())).toEqual({
      option: 2,
      cp: 1,
      fp: false,
      quote: 'On it.',
    });
  });
  it('accepts the option as a numeric string', () => {
    expect(parseAnswer('{"option":"3"}', packet())?.option).toBe(3);
  });
  it('clips cp to the maximum and drops a negative one', () => {
    expect(parseAnswer('{"option":1,"cp":9}', packet())?.cp).toBe(2);
    expect(parseAnswer('{"option":1,"cp":-4}', packet())?.cp).toBe(0);
    expect(parseAnswer('{"option":1,"cp":1.5}', packet())?.cp).toBe(0);
  });
  it('allows fp only with a point and without cp', () => {
    expect(parseAnswer('{"option":1,"fp":true}', packet())?.fp).toBe(true);
    expect(parseAnswer('{"option":1,"fp":true}', packet({ hasFp: false }))?.fp).toBe(false);
    expect(parseAnswer('{"option":1,"cp":1,"fp":true}', packet())?.fp).toBe(false);
  });
  it('cuts a long say to 140 characters and drops a blank one', () => {
    expect(parseAnswer(`{"option":1,"say":"${'x'.repeat(200)}"}`, packet())?.quote).toHaveLength(140);
    expect(parseAnswer('{"option":1,"say":"  "}', packet())).not.toHaveProperty('quote');
  });
  it('refuses an option that is not on offer, text, arrays and broken JSON', () => {
    expect(parseAnswer('{"option":4}', packet())).toBeNull();
    expect(parseAnswer('{"option":0}', packet())).toBeNull();
    expect(parseAnswer('I pick 2', packet())).toBeNull();
    expect(parseAnswer('[1,2]', packet())).toBeNull();
    expect(parseAnswer('{"option":', packet())).toBeNull();
    expect(parseAnswer('{option:2}', packet())).toBeNull();
  });
  it('never throws, and only ever returns an option on offer', () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const d = parseAnswer(text, packet());
        if (d !== null) expect([1, 2, 3]).toContain(d.option);
      })
    );
    fc.assert(
      fc.property(fc.jsonValue(), (v) => {
        const d = parseAnswer(JSON.stringify(v), packet());
        if (d !== null) {
          expect([1, 2, 3]).toContain(d.option);
          expect(d.cp).toBeGreaterThanOrEqual(0);
          expect(d.cp).toBeLessThanOrEqual(2);
        }
      })
    );
  });
});
