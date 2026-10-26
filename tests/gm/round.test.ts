import { describe, expect, it } from 'vitest';
import { closeSceneWindow, openWindow, windowShouldClose } from '../../src/gm/round.js';
import { choiceOptions, sceneById } from '../../src/gm/scene.js';
import { DEFAULT_SETTINGS, initialState, type Declaration } from '../../src/engine/state.js';
import { ctxFor } from '../helpers/ctx.js';
import { fixedRng } from '../helpers/fixedRng.js';
import { tinyPack } from '../helpers/tinyPack.js';

function setup(faces: number[] = [], at = 0, settings = DEFAULT_SETTINGS) {
  const pack = tinyPack();
  const s = initialState(tinyPack(), 1, settings);
  s.sceneId = 'start';
  s.phase = 'scene';
  const rng = fixedRng(faces);
  const ctx = ctxFor(s, pack, rng, at);
  const options = choiceOptions(sceneById(pack, 'start'));
  return { s, ctx, rng, options };
}

function open(t: ReturnType<typeof setup>, picks: Record<number, Declaration>): void {
  openWindow(t.ctx, t.options);
  Object.assign(t.s.declarations, picks);
  t.ctx.events.length = 0;
}

const pick = (option: number, extra: { cp?: number; fp?: boolean } = {}): Declaration => ({
  kind: 'pick',
  option,
  cp: extra.cp ?? 0,
  fp: extra.fp ?? false,
});

function allPick2(t: ReturnType<typeof setup>, seat0: Declaration = pick(2)): void {
  open(t, { 0: seat0, 1: pick(2), 2: pick(2), 3: pick(2) });
}

describe('openWindow', () => {
  it('opens and lets the bots declare', () => {
    const t = setup([], 1000);
    openWindow(t.ctx, t.options);
    expect(t.ctx.events[0]).toMatchObject({ type: 'window-opened', round: 1, endsAt: 61000 });
    expect(t.ctx.events.slice(1)).toEqual(
      [0, 1, 2, 3].map((seat) => ({ type: 'declared', seat, by: 'bot', option: 1 })),
    );
  });

  it('skips an active viewer but not an inactive one', () => {
    const a = setup();
    a.s.seats[0]!.holder = { kind: 'viewer', userId: 'u1', login: 'viewer1', activeFromRound: 2 };
    openWindow(a.ctx, a.options);
    expect(a.ctx.events.filter((e) => e.type === 'declared')).toHaveLength(4);
    const b = setup();
    b.s.seats[0]!.holder = { kind: 'viewer', userId: 'u1', login: 'viewer1', activeFromRound: 1 };
    openWindow(b.ctx, b.options);
    expect(b.ctx.events.filter((e) => e.type === 'declared')).toHaveLength(3);
  });
});

describe('windowShouldClose', () => {
  it('closes on time with bots only', () => {
    const t = setup([], 1000);
    openWindow(t.ctx, t.options);
    expect(windowShouldClose(t.s, 60999)).toBe(false);
    expect(windowShouldClose(t.s, 61000)).toBe(true);
  });

  it('closes early when an active viewer and all declared', () => {
    const t = setup();
    t.s.seats[0]!.holder = { kind: 'viewer', userId: 'u1', login: 'viewer1', activeFromRound: 1 };
    openWindow(t.ctx, t.options);
    t.s.declarations[0] = pick(1);
    expect(windowShouldClose(t.s, 2000)).toBe(true);
  });
});

describe('closeSceneWindow', () => {
  it('counts bot votes', () => {
    const t = setup();
    openWindow(t.ctx, t.options);
    t.ctx.events.length = 0;
    expect(closeSceneWindow(t.ctx)).toBe('fight');
    expect(t.ctx.events).toEqual([
      { type: 'vote', sceneId: 'start', tally: { 1: 4 }, winner: 1 },
    ]);
    expect(t.s.window).toBeNull();
  });

  it('breaks a tie and rolls the check', () => {
    const t = setup([4, 4, 4, 4]);
    open(t, { 0: pick(2), 1: pick(1), 2: pick(1), 3: pick(2) });
    expect(closeSceneWindow(t.ctx)).toBe('win');
    expect(t.ctx.events.map((e) => e.type)).toEqual(['vote', 'roll', 'check', 'narrate']);
    expect(t.ctx.events[0]).toMatchObject({ winner: 2 });
    expect(t.ctx.events[1]).toMatchObject({ who: 'seat:0', skill: 'sneak', total: 16 });
    expect(t.ctx.events[2]).toEqual({
      type: 'check',
      who: 'seat:0',
      skill: 'sneak',
      total: 16,
      target: 10,
      success: true,
      margin: 6,
    });
    expect(t.ctx.events[3]).toMatchObject({ template: 'check.success' });
    expect(t.rng.left()).toBe(0);
  });

  it('doubles the code with FP', () => {
    const t = setup([1, 1, 1, 1, 1, 1, 2]);
    t.s.seats[0]!.character.wound = 'wounded';
    allPick2(t, pick(2, { fp: true }));
    expect(closeSceneWindow(t.ctx)).toBe('fight');
    expect(t.ctx.events[1]).toEqual({ type: 'points', who: 'seat:0', kind: 'fp', spent: 1, left: 0 });
    expect(t.ctx.events[2]).toMatchObject({ type: 'roll', code: { dice: 7, pips: 0 }, total: 8 });
    expect(t.ctx.events[3]).toMatchObject({ type: 'check', success: false });
  });

  it('adds CP dice', () => {
    const t = setup([4, 4, 4, 4, 3, 2]);
    allPick2(t, pick(2, { cp: 2 }));
    closeSceneWindow(t.ctx);
    expect(t.ctx.events[1]).toEqual({ type: 'points', who: 'seat:0', kind: 'cp', spent: 2, left: 3 });
    expect(t.ctx.events[2]).toMatchObject({ type: 'roll', cp: [[3], [2]], total: 21 });
  });

  it('reports a complication', () => {
    const t = setup([6, 6, 6, 1], 0, { ...DEFAULT_SETTINGS, specialOne: 'complication' });
    allPick2(t);
    closeSceneWindow(t.ctx);
    expect(t.ctx.events.map((e) => e.type)).toEqual([
      'vote',
      'roll',
      'check',
      'complication',
      'narrate',
      'narrate',
    ]);
    expect(t.ctx.events[2]).toMatchObject({ total: 19, success: true });
    expect(t.ctx.events[3]).toEqual({ type: 'complication', who: 'seat:0' });
    expect(t.ctx.events[4]).toMatchObject({ template: 'check.complication' });
    expect(t.ctx.events[5]).toMatchObject({ template: 'check.success' });
  });

  it('counts a missed declaration', () => {
    const t = setup();
    t.s.seats[0]!.holder = { kind: 'viewer', userId: 'u1', login: 'viewer1', activeFromRound: 0 };
    openWindow(t.ctx, t.options);
    t.ctx.events.length = 0;
    closeSceneWindow(t.ctx);
    expect(t.ctx.events).toEqual([
      { type: 'missed', seat: 0, userId: 'u1', login: 'viewer1', count: 1 },
      { type: 'vote', sceneId: 'start', tally: { 1: 4 }, winner: 1 },
    ]);
  });

  it('releases a seat at the missed limit', () => {
    const t = setup();
    t.s.seats[0]!.holder = { kind: 'viewer', userId: 'u1', login: 'viewer1', activeFromRound: 0 };
    t.s.seats[0]!.missed = 1;
    openWindow(t.ctx, t.options);
    t.ctx.events.length = 0;
    closeSceneWindow(t.ctx);
    expect(t.ctx.events.map((e) => e.type)).toEqual(['missed', 'seat-released', 'vote']);
    expect(t.ctx.events[0]).toMatchObject({ count: 2 });
    expect(t.ctx.events[1]).toMatchObject({ reason: 'missed' });
    expect(t.s.seats[0]!.holder).toEqual({ kind: 'bot' });
  });
});
