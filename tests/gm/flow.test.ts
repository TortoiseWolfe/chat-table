import { describe, expect, it } from 'vitest';
import { enterScene, resolveWindow } from '../../src/gm/flow.js';
import { DEFAULT_SETTINGS, initialState } from '../../src/engine/state.js';
import { ctxFor } from '../helpers/ctx.js';
import { fixedRng } from '../helpers/fixedRng.js';
import { tinyPack } from '../helpers/tinyPack.js';

const INIT = [5, 5, 2, 2, 2, 2, 2, 2, 2, 2];

function setup(faces: number[] = []) {
  const pack = tinyPack();
  const s = initialState(tinyPack(), 1, DEFAULT_SETTINGS);
  const rng = fixedRng(faces);
  return { s, ctx: ctxFor(s, pack, rng), rng };
}

describe('flow', () => {
  it('enters a choice scene', () => {
    const { s, ctx } = setup();
    enterScene(ctx, 'start');
    expect(ctx.events[0]).toEqual({ type: 'scene-entered', sceneId: 'start' });
    expect(ctx.events[1]).toMatchObject({
      type: 'narrate',
      template: 'scene.start',
      vars: { place: 'a door' },
    });
    expect(ctx.events[2]).toMatchObject({ type: 'window-opened', round: 1 });
    expect(ctx.events.filter((e) => e.type === 'declared')).toHaveLength(4);
    expect(s.phase).toBe('scene');
  });

  it('enters a combat scene', () => {
    const { s, ctx } = setup(INIT);
    enterScene(ctx, 'fight');
    expect(ctx.events.map((e) => e.type)).toEqual([
      'scene-entered',
      'narrate',
      'narrate',
      'roll',
      'roll',
      'roll',
      'roll',
      'roll',
      'initiative',
      'window-opened',
      'declared',
      'declared',
      'declared',
      'declared',
    ]);
    expect(ctx.events[1]).toMatchObject({ template: 'scene.fight' });
    expect(ctx.events[2]).toMatchObject({ template: 'combat.start' });
    const w = ctx.events[9];
    expect(w?.type === 'window-opened' && w.options).toHaveLength(4);
    expect(s.phase).toBe('combat');
  });

  it('enters an ending', () => {
    const { s, ctx } = setup();
    enterScene(ctx, 'win');
    expect(ctx.events.map((e) => e.type)).toEqual(['scene-entered', 'narrate', 'ended']);
    expect(ctx.events[2]).toMatchObject({ ending: 'victory' });
    expect(s.phase).toBe('ended');
    expect(s.window).toBeNull();
  });

  it('times out at the round limit', () => {
    const { s, ctx } = setup();
    s.round = 6;
    enterScene(ctx, 'start');
    expect(ctx.events).toMatchObject([
      { type: 'scene-entered', sceneId: 'start' },
      { type: 'narrate', template: 'scene.start' },
      { type: 'scene-entered', sceneId: 'out-of-time' },
      { type: 'narrate', template: 'scene.timeout' },
      { type: 'ended', ending: 'timeout', sceneId: 'out-of-time' },
    ]);
  });

  it('resolves a window into the next scene', () => {
    const { s, ctx } = setup(INIT);
    enterScene(ctx, 'start');
    ctx.events.length = 0;
    resolveWindow(ctx);
    expect(ctx.events[0]?.type).toBe('vote');
    expect(ctx.events[1]).toEqual({ type: 'scene-entered', sceneId: 'fight' });
    expect(s.phase).toBe('combat');
    expect(s.window?.round).toBe(2);
  });
});
