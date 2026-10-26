import { describe, expect, it } from 'vitest';
import { claimSeat, freeCharacters, releaseSeat, seatOf } from '../../src/seats/seats.js';
import { DEFAULT_SETTINGS, initialState } from '../../src/engine/state.js';
import { ctxFor } from '../helpers/ctx.js';
import { fixedRng } from '../helpers/fixedRng.js';
import { tinyPack } from '../helpers/tinyPack.js';
import { viewer } from '../helpers/actor.js';

function setup() {
  const pack = tinyPack();
  const s = initialState(tinyPack(), 1, DEFAULT_SETTINGS);
  return { s, ctx: ctxFor(s, pack, fixedRng([])) };
}

describe('seats', () => {
  it('claimSeat with no window', () => {
    const { s, ctx } = setup();
    claimSeat(ctx, viewer(1), 0);
    expect(ctx.events).toEqual([
      { type: 'seat-claimed', seat: 0, userId: 'u1', login: 'viewer1', character: 'ana' },
    ]);
    expect(s.seats[0]!.holder).toEqual({
      kind: 'viewer',
      userId: 'u1',
      login: 'viewer1',
      activeFromRound: 0,
    });
  });

  it('claimSeat with a window open', () => {
    const { s, ctx } = setup();
    s.round = 1;
    s.window = { round: 1, opensAt: 0, endsAt: 1, options: [] };
    claimSeat(ctx, viewer(1), 0);
    expect(s.seats[0]!.holder).toMatchObject({ activeFromRound: 2 });
  });

  it('seatOf and freeCharacters', () => {
    const { s, ctx } = setup();
    claimSeat(ctx, viewer(1), 0);
    expect(seatOf(s, 'u1')!.index).toBe(0);
    expect(seatOf(s, 'u9')).toBeUndefined();
    expect(freeCharacters(s)).toEqual(['Ben', 'Cy', 'Dee']);
  });

  it('claimSeat restores a saved record', () => {
    const { s, ctx } = setup();
    s.viewers['u1'] = { characters: { ana: { points: { cp: 9, fp: 0 }, advances: {} } } };
    claimSeat(ctx, viewer(1), 0);
    expect(s.seats[0]!.character.points).toEqual({ cp: 9, fp: 0 });
  });

  it('releaseSeat saves and resets', () => {
    const { s, ctx } = setup();
    claimSeat(ctx, viewer(1), 0);
    ctx.events.length = 0;
    s.seats[0]!.character.points.cp = 7;
    releaseSeat(ctx, 0, 'leave');
    expect(ctx.events).toEqual([
      { type: 'seat-released', seat: 0, userId: 'u1', login: 'viewer1', reason: 'leave' },
    ]);
    expect(s.viewers['u1']!.characters['ana']!.points.cp).toBe(7);
    expect(s.seats[0]!.holder).toEqual({ kind: 'bot' });
    expect(s.seats[0]!.character.points.cp).toBe(5);
  });

  it('release promotes the waitlist', () => {
    const { s, ctx } = setup();
    claimSeat(ctx, viewer(1), 0);
    ctx.events.length = 0;
    s.waitlist = [{ userId: 'u5', login: 'viewer5', character: 'ana' }];
    releaseSeat(ctx, 0, 'leave');
    expect(ctx.events.map((e) => e.type)).toEqual(['seat-released', 'unwaitlisted', 'seat-claimed']);
    expect(ctx.events[1]).toEqual({ type: 'unwaitlisted', userId: 'u5' });
    expect(ctx.events[2]).toMatchObject({ seat: 0, userId: 'u5' });
    expect(s.waitlist).toEqual([]);
  });
});
