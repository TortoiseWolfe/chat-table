import { describe, expect, it } from 'vitest';
import {
  closeCombatWindow,
  combatOptions,
  combatOutcome,
  spawnNpcs,
  startCombatRound,
  whoName,
} from '../../src/gm/combat.js';
import { effectiveCode, openWindow } from '../../src/gm/round.js';
import { sceneById } from '../../src/gm/scene.js';
import { DEFAULT_SETTINGS, initialState } from '../../src/engine/state.js';
import { ctxFor } from '../helpers/ctx.js';
import { fixedRng } from '../helpers/fixedRng.js';
import { tinyPack } from '../helpers/tinyPack.js';
import { character } from '../helpers/actor.js';

function setup(faces: number[] = []) {
  const pack = tinyPack();
  const s = initialState(tinyPack(), 1, DEFAULT_SETTINGS);
  s.sceneId = 'fight';
  s.phase = 'combat';
  const rng = fixedRng(faces);
  const ctx = ctxFor(s, pack, rng);
  spawnNpcs(ctx, sceneById(pack, 'fight'));
  return { s, pack, ctx, rng, scene: sceneById(pack, 'fight') };
}

function openWith(t: ReturnType<typeof setup>, ids: Record<number, string>): void {
  const options = combatOptions(t.s, t.scene);
  t.s.window = { round: 1, opensAt: 0, endsAt: 60000, options };
  t.s.round = 1;
  for (const [seat, id] of Object.entries(ids)) {
    const n = options.find((o) => o.id === id)!.n;
    t.s.declarations[Number(seat)] = { kind: 'pick', option: n, cp: 0, fp: false };
  }
  t.ctx.events.length = 0;
}

const out = (t: ReturnType<typeof setup>, ...seats: number[]) => {
  for (const i of seats) t.s.seats[i]!.character.wound = 'incapacitated';
};

describe('effectiveCode', () => {
  it('applies wounds, actions and fp', () => {
    const { pack } = setup();
    const c = character('ana');
    c.wound = 'wounded';
    expect(effectiveCode(c, 'marksmanship', pack, 2, false)).toEqual({ dice: 1, pips: 0 });
    expect(effectiveCode(character('ana'), 'marksmanship', pack, 1, true)).toEqual({
      dice: 6,
      pips: 0,
    });
    expect(effectiveCode(c, 'marksmanship', pack, 1, true)).toEqual({ dice: 5, pips: 0 });
  });
});

describe('combatOutcome', () => {
  it('detects win, lose and ongoing', () => {
    const t = setup();
    expect(combatOutcome(t.s)).toBeNull();
    t.s.npcs[0]!.wound = 'wounded';
    expect(combatOutcome(t.s)).toBe('win');
    t.s.npcs[0]!.wound = 'healthy';
    out(t, 0, 1, 2, 3);
    expect(combatOutcome(t.s)).toBe('lose');
    t.s.seats[0]!.character.wound = 'healthy';
    expect(combatOutcome(t.s)).toBeNull();
  });
});

describe('spawn and options', () => {
  it('spawns and lists options', () => {
    const t = setup();
    expect(t.s.npcs.map((n) => n.uid)).toEqual(['grunt#1']);
    expect(combatOptions(t.s, t.scene)).toEqual([
      { n: 1, id: 'attack:grunt#1', label: 'Attack Grunt 1' },
      { n: 2, id: 'dodge', label: 'Dodge' },
      { n: 3, id: 'attack-dodge', label: 'Attack and dodge' },
      { n: 4, id: 'flee', label: 'Flee' },
    ]);
    expect(whoName(t.s, 'grunt#1')).toBe('Grunt 1');
    expect(whoName(t.s, 'seat:0')).toBe('Ana');
  });
});

describe('rounds', () => {
  const INIT = [5, 5, 2, 2, 2, 2, 2, 2, 2, 2];

  it('rolls initiative', () => {
    const t = setup(INIT);
    startCombatRound(t.ctx);
    expect(t.ctx.events.filter((e) => e.type === 'roll')).toHaveLength(5);
    expect(t.ctx.events.every((e) => e.type !== 'roll' || e.skill === 'perception')).toBe(true);
    expect(t.ctx.events.at(-1)).toEqual({
      type: 'initiative',
      order: ['seat:0', 'grunt#1', 'seat:1', 'seat:2', 'seat:3'],
    });
    expect(t.s.combatRound).toBe(1);
  });

  it('plays a full round to a win', () => {
    const t = setup(INIT);
    startCombatRound(t.ctx);
    t.ctx.events.length = 0;
    const r = fixedRng([5, 5, 5, 5, 5, 5, 2, 2]);
    const ctx = ctxFor(t.s, t.pack, r);
    openWindow(ctx, combatOptions(t.s, t.scene));
    ctx.events.length = 0;
    expect(closeCombatWindow(ctx)).toBe('win');
    expect(ctx.events).toMatchObject([
      { type: 'roll', who: 'seat:0', skill: 'marksmanship' },
      { type: 'check', who: 'seat:0', total: 15, target: 10, success: true, margin: 5 },
      { type: 'roll', skill: 'damage' },
      { type: 'roll', who: 'grunt#1', skill: 'resist' },
      { type: 'damage', target: 'grunt#1', total: 15, resist: 4, margin: 11, wound: 'incapacitated' },
      { type: 'wound', from: 'healthy', to: 'incapacitated' },
      { type: 'narrate', template: 'wound.incapacitated', vars: { target: 'Grunt 1' } },
    ]);
    expect(r.left()).toBe(0);
  });

  it('lets an NPC attack against a dodge', () => {
    const t = setup([4, 4, 4, 5, 5]);
    out(t, 1, 2, 3);
    t.s.initiative = ['grunt#1', 'seat:0'];
    openWith(t, { 0: 'dodge' });
    expect(closeCombatWindow(t.ctx)).toBeNull();
    expect(t.ctx.events).toMatchObject([
      { type: 'roll', who: 'seat:0', skill: 'dodge', total: 12 },
      { type: 'roll', who: 'grunt#1' },
      { type: 'check', who: 'grunt#1', total: 10, target: 12, success: false, margin: -2 },
    ]);
  });

  it('stuns and then recovers', () => {
    const t = setup([5, 5, 4, 4, 4, 5, 5, 1, 2]);
    out(t, 1, 2, 3);
    t.s.combatRound = 1;
    t.s.initiative = ['grunt#1', 'seat:0'];
    openWith(t, { 0: 'attack:grunt#1' });
    expect(closeCombatWindow(t.ctx)).toBeNull();
    expect(t.ctx.events).toContainEqual({
      type: 'damage',
      target: 'seat:0',
      total: 12,
      resist: 10,
      margin: 2,
      wound: 'stunned',
    });
    expect(t.ctx.events).toContainEqual({
      type: 'wound',
      target: 'seat:0',
      from: 'healthy',
      to: 'stunned',
    });
    expect(t.s.seats[0]!.character.stunnedUntil).toBe(2);
    const seatRoll = t.ctx.events.filter((e) => e.type === 'roll' && e.skill === 'marksmanship' && e.who === 'seat:0')[0];
    expect(seatRoll).toMatchObject({ code: { dice: 2, pips: 0 }, total: 3 });
    expect(t.ctx.events.at(-1)).toMatchObject({ type: 'check', who: 'seat:0', success: false });

    const r = fixedRng([1, 2, 1, 2]);
    const ctx2 = ctxFor(t.s, t.pack, r);
    t.s.combatRound = 2;
    t.s.window = { round: 2, opensAt: 0, endsAt: 1, options: combatOptions(t.s, t.scene) };
    t.s.declarations = { 0: { kind: 'pick', option: 1, cp: 0, fp: false } };
    expect(closeCombatWindow(ctx2)).toBeNull();
    expect(ctx2.events.at(-1)).toEqual({
      type: 'wound',
      target: 'seat:0',
      from: 'stunned',
      to: 'healthy',
    });
    expect(r.left()).toBe(0);
  });

  it('flees on a majority', () => {
    const t = setup([]);
    openWith(t, { 0: 'flee', 1: 'flee', 2: 'flee', 3: 'dodge' });
    expect(closeCombatWindow(t.ctx)).toBe('start');
    expect(t.ctx.events.filter((e) => e.type === 'roll')).toHaveLength(0);
    expect(t.s.window).toBeNull();
  });
});
