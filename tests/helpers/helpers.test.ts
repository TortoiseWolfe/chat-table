import { describe, it, expect } from 'vitest';
import { fixedRng } from './fixedRng.js';
import { viewer, mod, character } from './actor.js';

describe('fixedRng', () => {
  it('returns faces in order, counts them and throws when empty', () => {
    const rng = fixedRng([3, 6]);
    expect(rng.die(6)).toBe(3);
    expect(rng.die(6)).toBe(6);
    expect(rng.left()).toBe(0);
    expect(rng.state).toEqual({ seed: 0, counter: 2 });
    expect(() => rng.die(6)).toThrow(new Error('fixedRng: out of faces'));
  });

  it('throws when a face is above the sides', () => {
    expect(() => fixedRng([7]).die(6)).toThrow(new Error('fixedRng: face 7 > sides 6'));
  });
});

describe('actors', () => {
  it('viewer and mod', () => {
    expect(viewer(3)).toEqual({
      userId: 'u3',
      login: 'viewer3',
      isMod: false,
      isBroadcaster: false,
    });
    expect(mod(3).isMod).toBe(true);
  });

  it('character names and fresh objects', () => {
    expect(character('ben').name).toBe('Ben');
    expect(character()).not.toBe(character());
  });
});
