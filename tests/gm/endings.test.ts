import { describe, expect, it } from 'vitest';
import { enterEnding } from '../../src/gm/endings.js';
import { sceneById } from '../../src/gm/scene.js';
import { DEFAULT_SETTINGS, initialState } from '../../src/engine/state.js';
import { ctxFor } from '../helpers/ctx.js';
import { fixedRng } from '../helpers/fixedRng.js';
import { tinyPack } from '../helpers/tinyPack.js';

describe('enterEnding', () => {
  it('rewards viewers and heals everyone', () => {
    const pack = tinyPack();
    const s = initialState(tinyPack(), 1, DEFAULT_SETTINGS);
    s.seats[0]!.holder = { kind: 'viewer', userId: 'u1', login: 'viewer1', activeFromRound: 0 };
    s.seats[0]!.character.points.cp = 3;
    s.seats[1]!.character.wound = 'wounded';
    const ctx = ctxFor(s, pack, fixedRng([]));
    enterEnding(ctx, sceneById(pack, 'win'));
    expect(ctx.events).toEqual([
      { type: 'ended', ending: 'victory', sceneId: 'win' },
      { type: 'rewards', userId: 'u1', login: 'viewer1', cp: 2 },
    ]);
    expect(s.viewers['u1']!.characters['ana']!.points.cp).toBe(5);
    expect(s.seats[1]!.character.wound).toBe('healthy');
    expect(s.phase).toBe('ended');
    expect(s.ending).toBe('victory');
  });
});
