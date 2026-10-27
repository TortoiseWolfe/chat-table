import { describe, expect, it } from 'vitest';
import { sanitize } from '../../src/narrator/sanitize.js';

describe('sanitize', () => {
  it('trims and collapses whitespace', () => {
    expect(sanitize('  a \n b  ')).toBe('a b');
  });
  it.each([
    [''],
    ['   '],
    ['x'.repeat(501)],
    ['visit https://a.b'],
    ['go to www.thing'],
    ['see example.com/path'],
    ['hi @bob'],
    ['/timeout bob'],
    ['.ban bob'],
  ])('rejects %j', (text) => {
    expect(sanitize(text)).toBeNull();
  });
  it('accepts exactly 500 characters', () => {
    expect(sanitize('x'.repeat(500))).toHaveLength(500);
  });
  it('allows an @ that is not followed by a letter', () => {
    expect(sanitize('cost 5 @ 3')).toBe('cost 5 @ 3');
  });
});
