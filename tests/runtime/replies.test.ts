import { describe, expect, it } from 'vitest';
import type { Event } from '../../src/engine/events.js';
import { DEFAULT_SETTINGS, initialState, type GameState } from '../../src/engine/state.js';
import { chatLines, narrationLine, replyLines } from '../../src/runtime/replies.js';
import { tinyPack } from '../helpers/tinyPack.js';

const pack = tinyPack();

function state(): GameState {
  const s = initialState(pack, 1, DEFAULT_SETTINGS);
  s.seats[0]!.holder = { kind: 'viewer', userId: 'u1', login: 'viewer1', activeFromRound: 1 };
  s.sceneId = 'start';
  s.round = 2;
  s.window = {
    round: 2,
    opensAt: 0,
    endsAt: 60000,
    options: [
      { n: 1, id: 'go', label: 'Walk in' },
      { n: 2, id: 'sneak', label: 'Sneak past' },
    ],
  };
  return s;
}

function one(e: Event, s = state()): string[] {
  return replyLines([e], s, pack);
}

const rej = (reason: Extract<Event, { type: 'rejected' }>['reason']): Event => ({
  type: 'rejected', to: 'u1', login: 'viewer1', reason,
});

describe('replyLines', () => {
  it('rejected lines', () => {
    expect(one(rej('seat-taken'))).toEqual([
      '@viewer1 that character is taken. Free: Ben, Cy, Dee. Type !join <name>.',
    ]);
    expect(one(rej('no-such-character'))).toEqual([
      '@viewer1 no character called that. Free: Ben, Cy, Dee. Type !characters for the list.',
    ]);
    expect(one(rej('already-seated'))).toEqual(['@viewer1 you already have a seat (or a place in line).']);
    expect(one(rej('not-mod'))).toEqual(['@viewer1 only the broadcaster and moderators can use !gm.']);
    expect(one(rej('no-check'))).toEqual([
      '@viewer1 nothing to roll that on right now. Options: !1 Walk in, !2 Sneak past.',
    ]);
    expect(one(rej('no-points'))).toEqual([
      "@viewer1 you can't spend that now (5 CP, 1 FP left; CP and FP never on the same roll).",
    ]);
    expect(one(rej('not-seated'))).toEqual(['@viewer1 you need a seat for that. Type !join.']);
  });

  it('none free', () => {
    const s = state();
    for (const seat of s.seats) seat.holder = { kind: 'viewer', userId: 'x', login: 'x', activeFromRound: 0 };
    expect(one(rej('seat-taken'), s)[0]).toContain("Free: none, you'll go in line.");
  });

  it('seat lines', () => {
    expect(one({ type: 'seat-claimed', seat: 0, userId: 'u1', login: 'viewer1', character: 'ana' })).toEqual([
      '@viewer1 you are Ana. You act from the next round. !sheet for your character.',
    ]);
    const rel = (reason: 'leave' | 'missed' | 'kick'): Event => ({
      type: 'seat-released', seat: 0, userId: 'u1', login: 'viewer1', reason,
    });
    expect(one(rel('leave'))).toEqual(['Ana goes back to the bot.']);
    expect(one(rel('kick'))).toEqual(['Ana goes back to the bot.']);
    expect(one(rel('missed'))).toEqual([
      '@viewer1 Ana went quiet for two rounds and goes back to the bot.',
    ]);
    expect(one({ type: 'waitlisted', userId: 'u2', login: 'viewer2', position: 3 })).toEqual([
      '@viewer2 all seats are full. You are number 3 in line.',
    ]);
  });

  it('window, ended, rewards', () => {
    const s = state();
    expect(one({ type: 'window-opened', round: 2, endsAt: 60000, options: s.window!.options }, s)).toEqual([
      'Round 2: !1 Walk in, !2 Sneak past (60s to choose)',
    ]);
    expect(one({ type: 'ended', ending: 'victory', sceneId: 'win' })).toEqual([
      'The adventure ends: victory. Thanks for playing!',
    ]);
    expect(one({ type: 'rewards', userId: 'u1', login: 'viewer1', cp: 2 })).toEqual([
      '@viewer1 +2 Character Points, saved for next time.',
    ]);
  });

  const roll = (special: number[]): Event => ({
    type: 'roll', who: 'seat:0', skill: 'sneak', code: { dice: 4, pips: 0 }, normal: [3, 3, 3],
    special, cp: [], dropped: [], complication: false, total: 12,
  });
  const chk: Event = {
    type: 'check', who: 'seat:0', skill: 'sneak', total: 12, target: 10, success: true, margin: 2,
  };

  it('check lines', () => {
    expect(replyLines([roll([3]), chk], state(), pack)).toEqual(['Ana rolls sneak: 12 vs 10, success.']);
    expect(
      replyLines([roll([3]), { ...chk, success: false }], state(), pack),
    ).toEqual(['Ana rolls sneak: 12 vs 10, failure.']);
    expect(replyLines([roll([6, 2]), chk], state(), pack)).toEqual([
      'Ana rolls sneak: 12 vs 10, success. Wild Die exploded!',
    ]);
    const p = tinyPack();
    p.terms = { specialDie: 'Spark Die' };
    expect(replyLines([roll([6, 2]), chk], state(), p)[0]).toContain('Spark Die exploded!');
  });

  it('npc names in checks', () => {
    const s = state();
    s.npcs = [{ ...structuredClone(pack.npcs[0]!), uid: 'grunt#1', wound: 'healthy', stunnedUntil: null }];
    expect(one({ ...chk, who: 'grunt#1' }, s)).toEqual(['Grunt rolls sneak: 12 vs 10, success.']);
  });

  it('reply lines', () => {
    expect(one({ type: 'reply', to: 'u9', login: 'viewer9', kind: 'characters' })).toEqual([
      'Characters: Ana (tester, taken); Ben (tester, free); Cy (tester, free); Dee (tester, free). Type !join <name>.',
    ]);
    expect(one({ type: 'reply', to: 'u1', login: 'viewer1', kind: 'sheet' })).toEqual([
      '@viewer1 Ana: REF 2D, COO 2D, PHY 2D, KNO 2D, PER 2D, PRE 2D. Skills: marksmanship 3D, dodge 3D, sneak 4D. Healthy. 5 CP, 1 FP.',
    ]);
    expect(one({ type: 'reply', to: 'u9', login: 'viewer9', kind: 'sheet' })).toEqual([
      '@viewer9 you need a seat for that. Type !join.',
    ]);
    expect(one({ type: 'reply', to: 'u1', login: 'viewer1', kind: 'status' })).toEqual([
      'Scene: start, round 2/6. Seats: Ana (viewer1), Ben (bot), Cy (bot), Dee (bot). In line: 0.',
    ]);
    expect(one({ type: 'reply', to: 'u1', login: 'viewer1', kind: 'help' })).toEqual([
      'Play from chat: !join, !1-!9 to choose, !roll <skill>, !say <line>, !cp, !fp, !sheet, !status, !leave.',
    ]);
  });

  it('wound text and ignored', () => {
    const s = state();
    s.seats[0]!.character.wound = 'severely-wounded';
    expect(one({ type: 'reply', to: 'u1', login: 'viewer1', kind: 'sheet' }, s)[0]).toContain(
      'Severely wounded. 5 CP',
    );
    expect(one({ type: 'ignored', reason: 'cooldown' })).toEqual([]);
  });

  it('cuts long lines', () => {
    const s = state();
    s.seats[1]!.character.concept = 'word '.repeat(120);
    const [line] = one({ type: 'reply', to: 'u9', login: 'viewer9', kind: 'characters' }, s);
    expect(line!.length).toBeLessThanOrEqual(500);
    expect(line!.endsWith('...')).toBe(true);
  });
});

describe('narration', () => {
  const nar: Event = {
    type: 'narrate', template: 'scene.start', variant: 0, vars: { place: 'a door' }, quotes: [],
  };

  it('narrationLine uses the template', () => {
    if (nar.type !== 'narrate') throw new Error('x');
    expect(narrationLine(nar, pack)).toBe('scene.start line');
    expect(narrationLine({ ...nar, quotes: [{ character: 'Ana', text: 'Hi' }] }, pack)).toBe(
      'scene.start line Ana: "Hi"',
    );
  });

  it('chatLines keeps event order and skips ignored', () => {
    const lines = chatLines(
      [
        { type: 'seat-claimed', seat: 0, userId: 'u1', login: 'viewer1', character: 'ana' },
        nar,
        { type: 'ignored', reason: 'stale' },
      ],
      state(),
      pack,
    );
    expect(lines).toEqual([
      '@viewer1 you are Ana. You act from the next round. !sheet for your character.',
      'scene.start line',
    ]);
  });
});
