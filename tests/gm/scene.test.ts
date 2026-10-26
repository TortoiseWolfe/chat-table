import { describe, expect, it } from 'vitest';
import { choiceOptions, fillTemplate, narrate, sceneById } from '../../src/gm/scene.js';
import { initialState, DEFAULT_SETTINGS } from '../../src/engine/state.js';
import { ctxFor } from '../helpers/ctx.js';
import { fixedRng } from '../helpers/fixedRng.js';
import { tinyPack } from '../helpers/tinyPack.js';

function setup(faces: number[] = []) {
  const rng = fixedRng(faces);
  const pack = tinyPack();
  const ctx = ctxFor(initialState(tinyPack(), 1, DEFAULT_SETTINGS), pack, rng);
  return { ctx, pack, rng };
}

describe('scene helpers', () => {
  it('fillTemplate', () => {
    expect(fillTemplate('Hi {name}', { name: 'Kes' })).toBe('Hi Kes');
    expect(fillTemplate('Hi {who}', {})).toBe('Hi {who}');
  });

  it('sceneById throws on an unknown id', () => {
    const { pack } = setup();
    expect(() => sceneById(pack, 'nowhere')).toThrow('unknown scene: nowhere');
  });

  it('choiceOptions numbers from 1', () => {
    const { pack } = setup();
    expect(choiceOptions(sceneById(pack, 'start'))).toEqual([
      { n: 1, id: 'go', label: 'Walk in' },
      { n: 2, id: 'sneak', label: 'Sneak past' },
    ]);
  });

  it('narrate emits the quotes and clears them', () => {
    const { ctx, rng } = setup();
    ctx.s.quotes = { 0: 'hi' };
    narrate(ctx, 'scene.start', { place: 'a door' });
    expect(ctx.events).toEqual([
      {
        type: 'narrate',
        template: 'scene.start',
        variant: 0,
        vars: { place: 'a door' },
        quotes: [{ character: 'Ana', text: 'hi' }],
      },
    ]);
    expect(ctx.s.quotes).toEqual({});
    expect(rng.state.counter).toBe(0);
  });

  it('narrate draws a variant when there are several', () => {
    const { ctx, pack } = setup([2]);
    pack.templates['scene.start'] = ['a', 'b'];
    narrate(ctx, 'scene.start', {});
    expect(ctx.events[0]).toMatchObject({ variant: 1 });
  });
});
