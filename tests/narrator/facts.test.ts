import { describe, expect, it } from 'vitest';
import { factsFor } from '../../src/narrator/facts.js';
import { initialState, DEFAULT_SETTINGS } from '../../src/engine/state.js';
import { tinyPack } from '../helpers/tinyPack.js';

describe('factsFor', () => {
  it('merges scene facts with event vars, event vars winning', () => {
    const pack = tinyPack();
    const scene = pack.adventure.scenes[0];
    if (!scene) throw new Error('tiny pack has no scene');
    scene.facts = { place: 'dock', mood: 'calm' };
    const state = { ...initialState(pack, 1, DEFAULT_SETTINGS, {}), sceneId: scene.id };
    const out = factsFor(
      {
        type: 'narrate',
        template: 't',
        variant: 0,
        vars: { mood: 'tense', who: 'Ana' },
        quotes: [],
      },
      state,
      pack
    );
    expect(out).toEqual({ place: 'dock', mood: 'tense', who: 'Ana' });
  });
  it('gives only event vars when no scene is current', () => {
    const pack = tinyPack();
    const state = initialState(pack, 1, DEFAULT_SETTINGS, {});
    const out = factsFor(
      { type: 'narrate', template: 't', variant: 0, vars: { a: 'b' }, quotes: [] },
      state,
      pack
    );
    expect(out).toEqual({ a: 'b' });
  });
});
