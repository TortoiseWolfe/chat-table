import { describe, expect, it } from 'vitest';
import { apply } from '../../src/engine/apply.js';
import type { Command } from '../../src/engine/commands.js';
import type { Event } from '../../src/engine/events.js';
import { createRng } from '../../src/engine/rng.js';
import {
  DEFAULT_SETTINGS,
  holderName,
  initialState,
  type GameState,
} from '../../src/engine/state.js';
import { viewer } from '../helpers/actor.js';
import { tinyPack } from '../helpers/tinyPack.js';

function table(extraAi = false) {
  const pack = tinyPack();
  let s: GameState = initialState(tinyPack(), 1, DEFAULT_SETTINGS);
  const run = (cmd: Command): Event[] => {
    const r = apply(s, cmd, createRng(s.rng), pack);
    s = r.state;
    return r.events;
  };
  if (extraAi) run({ type: 'assign', at: 0, seat: 3, holder: 'ai', label: 'Idle' });
  return { run, state: () => s };
}

describe('ai seats in the engine', () => {
  it('assign makes an ai seat, and it is not free for !join', () => {
    const t = table();
    const ev = t.run({ type: 'assign', at: 0, seat: 1, holder: 'ai', label: 'Claude Haiku' });
    expect(ev).toEqual([{ type: 'seat-assigned', seat: 1, holder: 'ai', label: 'Claude Haiku' }]);
    expect(holderName(t.state().seats[1]!.holder)).toBe('Claude Haiku');
    t.run({ type: 'host', at: 0, action: 'start' });
    const free = t.state().seats.filter((x) => x.holder.kind === 'bot').length;
    expect(free).toBe(t.state().seats.length - 1);
  });

  it('assign never takes a viewer seat', () => {
    const t = table();
    t.run({ type: 'join', at: 0, actor: viewer(1) });
    const ev = t.run({ type: 'assign', at: 1, seat: 0, holder: 'ai', label: 'x' });
    expect(ev).toEqual([]);
    expect(t.state().seats[0]!.holder.kind).toBe('viewer');
  });

  it('ai-declare records a declaration by ai, with cp clipped', () => {
    const t = table(true);
    t.run({ type: 'assign', at: 0, seat: 1, holder: 'ai', label: 'A' });
    t.run({ type: 'host', at: 0, action: 'start' });
    expect(t.state().declarations[1]).toBeUndefined();
    const have = t.state().seats[1]!.character.points.cp;
    const ev = t.run({ type: 'ai-declare', at: 5, seat: 1, option: 2, cp: 99, fp: false });
    expect(ev).toContainEqual({ type: 'declared', seat: 1, by: 'ai', option: 2 });
    const d = t.state().declarations[1];
    expect(d).toEqual({
      kind: 'pick',
      option: 2,
      cp: Math.min(DEFAULT_SETTINGS.cpPerRollMax, have),
      fp: false,
    });
  });

  it('ai-declare ignores a stale option, a bot seat and a paused game', () => {
    const t = table(true);
    t.run({ type: 'assign', at: 0, seat: 1, holder: 'ai', label: 'A' });
    t.run({ type: 'host', at: 0, action: 'start' });
    expect(t.run({ type: 'ai-declare', at: 1, seat: 1, option: 9, cp: 0, fp: false })).toEqual([
      { type: 'ignored', reason: 'stale' },
    ]);
    expect(t.run({ type: 'ai-declare', at: 1, seat: 2, option: 1, cp: 0, fp: false })).toEqual([]);
    t.run({ type: 'host', at: 2, action: 'pause' });
    expect(t.run({ type: 'ai-declare', at: 3, seat: 1, option: 1, cp: 0, fp: false })).toEqual([
      { type: 'ignored', reason: 'paused' },
    ]);
  });

  it('ai-declare does not use the viewer cooldown (two in a row both land)', () => {
    const t = table(true);
    t.run({ type: 'assign', at: 0, seat: 1, holder: 'ai', label: 'A' });
    t.run({ type: 'host', at: 0, action: 'start' });
    t.run({ type: 'ai-declare', at: 5, seat: 1, option: 1, cp: 0, fp: false });
    t.run({ type: 'ai-declare', at: 6, seat: 1, option: 2, cp: 0, fp: false });
    expect(t.state().declarations[1]).toMatchObject({ option: 2 });
  });

  it('fp is dropped when cp is spent, and kept when no cp is asked', () => {
    const t = table(true);
    t.run({ type: 'assign', at: 0, seat: 1, holder: 'ai', label: 'A' });
    t.run({ type: 'host', at: 0, action: 'start' });
    t.run({ type: 'ai-declare', at: 5, seat: 1, option: 1, cp: 1, fp: true });
    expect(t.state().declarations[1]).toMatchObject({ cp: 1, fp: false });
    t.run({ type: 'ai-declare', at: 6, seat: 1, option: 1, cp: 0, fp: true });
    expect(t.state().declarations[1]).toMatchObject({ cp: 0, fp: true });
  });

  it('an ai quote is cut and stored; a blank one is not', () => {
    const t = table(true);
    t.run({ type: 'assign', at: 0, seat: 1, holder: 'ai', label: 'A' });
    t.run({ type: 'host', at: 0, action: 'start' });
    t.run({
      type: 'ai-declare',
      at: 5,
      seat: 1,
      option: 1,
      cp: 0,
      fp: false,
      quote: 'x'.repeat(300),
    });
    expect(t.state().quotes[1]).toHaveLength(140);
    t.run({ type: 'ai-declare', at: 6, seat: 1, option: 1, cp: 0, fp: false, quote: '   ' });
    expect(t.state().quotes[1]).toHaveLength(140);
  });

  it('an undeclared ai seat is declared by the bot script when the window closes', () => {
    const t = table();
    t.run({ type: 'assign', at: 0, seat: 1, holder: 'ai', label: 'A' });
    t.run({ type: 'host', at: 0, action: 'start' });
    const endsAt = t.state().window!.endsAt;
    const ev = t.run({ type: 'tick', at: endsAt });
    expect(ev).toContainEqual(expect.objectContaining({ type: 'declared', seat: 1, by: 'bot' }));
  });

  it('the window closes early once every seat has declared and an ai seat is present', () => {
    const t = table();
    for (const i of [0, 1, 2, 3]) {
      t.run({ type: 'assign', at: 0, seat: i, holder: 'ai', label: 'A' + String(i) });
    }
    t.run({ type: 'host', at: 0, action: 'start' });
    const round = t.state().round;
    for (const i of [0, 1, 2, 3]) {
      t.run({ type: 'ai-declare', at: 5, seat: i, option: 1, cp: 0, fp: false });
    }
    expect(t.state().round).toBeGreaterThan(round);
  });

  it('a viewer who leaves hands the seat to the bot', () => {
    const t = table();
    t.run({ type: 'join', at: 0, actor: viewer(1) });
    t.run({ type: 'leave', at: 10000, actor: viewer(1) });
    expect(t.state().seats[0]!.holder).toEqual({ kind: 'bot' });
  });
});
