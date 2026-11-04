import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildPacket, estimateTokens, SYSTEM_TEXT } from '../../src/ai/packet.js';
import type { SeatMemory } from '../../src/ai/types.js';
import { formatDiceCode, parseDiceCode } from '../../src/engine/dice.js';
import { createRng } from '../../src/engine/rng.js';
import type { Pack } from '../../src/engine/pack.js';
import { DEFAULT_SETTINGS, initialState, type GameState } from '../../src/engine/state.js';
import { enterScene } from '../../src/gm/flow.js';
import { loadPackSync } from '../../src/packs/load.js';
import { ctxFor } from '../helpers/ctx.js';

const frontier = (): Pack => loadPackSync('packs/frontier');

/** A state standing in the given scene with its window open, seats all `ai`. */
function inScene(pack: Pack, sceneId: string, seed = 987654321): GameState {
  const s = initialState(pack, seed, DEFAULT_SETTINGS);
  for (const seat of s.seats) seat.holder = { kind: 'ai', label: 'x' };
  const ctx = ctxFor(s, pack, createRng(s.rng), 1000);
  enterScene(ctx, sceneId);
  return s;
}

const memory = (): SeatMemory => ({ history: ['Round 1: you chose "Take the corridor". Result: nothing of note.'] });

describe('buildPacket', () => {
  it('returns null with no open window', () => {
    const pack = frontier();
    const s = initialState(pack, 1, DEFAULT_SETTINGS);
    expect(buildPacket(s, pack, 0, memory(), [], 0)).toBeNull();
  });

  it('holds the sheet, scene, options and a deadline hint', () => {
    const pack = frontier();
    const s = inScene(pack, pack.adventure.start);
    const p = buildPacket(s, pack, 1, memory(), ['The lamp swings.'], 1000)!;
    expect(p.seat).toBe(1);
    expect(p.round).toBe(1);
    expect(p.user).toContain('You play Marrow');
    expect(p.user).toContain('Scene: ');
    expect(p.user).toContain('1. Take the corridor');
    expect(p.user).toContain('60 seconds left');
    expect(p.options.map((o) => o.n)).toEqual([1, 2]);
    expect(p.system).toBe(SYSTEM_TEXT);
  });

  it('stays between 350 and 900 tokens, busiest turn included', () => {
    const pack = frontier();
    const busy: SeatMemory = {
      history: Array.from({ length: 8 }, (_, i) => `Round ${i}: you chose "${'x'.repeat(200)}". Result: ${'y'.repeat(200)}.`),
    };
    for (const scene of pack.adventure.scenes) {
      if (scene.ending) continue;
      const s = inScene(pack, scene.id);
      for (const seat of s.seats) {
        const lines = ['a'.repeat(400), 'b'.repeat(400), 'c'.repeat(400), 'd'.repeat(400)];
        const p = buildPacket(s, pack, seat.index, busy, lines, 1000)!;
        const t = estimateTokens(p.system + p.user);
        expect(t).toBeLessThanOrEqual(900);
        const calm = buildPacket(s, pack, seat.index, memory(), [], 1000)!;
        expect(estimateTokens(calm.system + calm.user)).toBeGreaterThanOrEqual(350);
      }
    }
  });

  it('cuts table lines to 140 characters and keeps the last three', () => {
    const pack = frontier();
    const s = inScene(pack, pack.adventure.start);
    const lines = ['one', 'two', 'three', 'four ' + 'z'.repeat(300)];
    const p = buildPacket(s, pack, 0, { history: [] }, lines, 1000)!;
    expect(p.user).not.toContain('- one');
    expect(p.user).toContain('- two');
    expect(p.user).not.toContain('z'.repeat(150));
  });

  it('lists live opponents in a fight and not the ones already out', () => {
    const pack = frontier();
    const s = inScene(pack, 'ambush');
    const live = s.npcs.length;
    expect(live).toBeGreaterThan(0);
    const p = buildPacket(s, pack, 0, { history: [] }, [], 1000)!;
    expect(p.user).toContain('Opposing you:');
    const first = s.npcs[0]!;
    first.wound = first.outAt;
    const q = buildPacket(s, pack, 0, { history: [] }, [], 1000)!;
    expect(q.user.match(/\(healthy\)/g)?.length ?? 0).toBeLessThan(
      p.user.match(/\(healthy\)/g)?.length ?? 0
    );
  });

  it('caps Character Points at what the seat has and the per-roll maximum', () => {
    const pack = frontier();
    const s = inScene(pack, pack.adventure.start);
    s.seats[1]!.character.points = { cp: 1, fp: 0 };
    const p = buildPacket(s, pack, 1, { history: [] }, [], 1000)!;
    expect(p.maxCp).toBe(1);
    expect(p.hasFp).toBe(false);
    expect(p.user).not.toContain('Force Point instead');
  });
});

/** Every field a character cannot see, changed to nonsense. */
function scramble(state: GameState, pack: Pack, seatIndex: number, junk: string, n: number): void {
  const bump = (): ReturnType<typeof parseDiceCode> => parseDiceCode(`${String(2 + (n % 5))}D`);
  state.rng = { seed: n + 7, counter: n };
  state.seq = n + 100;
  state.waitlist = [{ userId: junk, login: junk }];
  state.viewers = { [junk]: { characters: {} } };
  state.dodges = { [junk]: n };
  state.cooldowns = { [junk]: n };
  state.initiative = [junk];
  for (const seat of state.seats) {
    if (seat.index === seatIndex) continue;
    const c = seat.character;
    for (const k of Object.keys(c.attributes) as (keyof typeof c.attributes)[]) {
      c.attributes[k] = bump();
    }
    c.skills = [{ name: junk, attribute: 'presence', code: bump() }];
    c.weapons = [];
    c.points = { cp: n, fp: n };
    c.bot = { prefer: [junk], combat: 'dodge', spendCp: 'never' };
    seat.missed = n;
  }
  for (const npc of state.npcs) {
    npc.attributes = { ...npc.attributes, reflexes: bump() };
    npc.skills = [];
    npc.weapons = [];
    npc.tactic = 'attack-random';
    npc.armor = bump();
  }
  for (const scene of pack.adventure.scenes) {
    for (const choice of scene.choices ?? []) {
      if (choice.next !== undefined) choice.next = junk;
      if (choice.check) {
        choice.check = { skill: junk, difficulty: n, success: junk, failure: junk };
      }
    }
    if (scene.combat) {
      scene.combat.win = junk;
      scene.combat.lose = junk;
      if (scene.combat.flee !== undefined) scene.combat.flee = junk;
    }
    if (scene.id !== state.sceneId) {
      scene.facts = { ...scene.facts, place: junk };
      scene.template = `scene.${junk}`;
    }
  }
  for (const other of pack.characters) {
    if (other.id !== state.seats[seatIndex]?.character.id) other.bot = { prefer: [junk], combat: 'dodge', spendCp: 'never' };
  }
}

describe('the spoiler firewall', () => {
  const pack0 = frontier();
  const sceneIds = pack0.adventure.scenes.filter((s) => !s.ending).map((s) => s.id);

  it('changing anything a character cannot see leaves its packet unchanged (every scene, every seat)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...sceneIds),
        fc.integer({ min: 0, max: 3 }),
        fc.string({ minLength: 3, maxLength: 12 }),
        fc.integer({ min: 0, max: 99 }),
        (sceneId, seat, junk, n) => {
          const packA = frontier();
          const stateA = inScene(packA, sceneId);
          const a = buildPacket(stateA, packA, seat, memory(), ['x'], 1000)!;

          const packB = frontier();
          const stateB = inScene(packB, sceneId);
          scramble(stateB, packB, seat, junk, n);
          const b = buildPacket(stateB, packB, seat, memory(), ['x'], 1000)!;
          expect(b.user).toBe(a.user);
          expect(b.options).toEqual(a.options);
        }
      ),
      { numRuns: 200 }
    );
  });

  it('the control: changing something visible does change the packet', () => {
    const pack = frontier();
    const s = inScene(pack, pack.adventure.start);
    const a = buildPacket(s, pack, 1, memory(), [], 1000)!;
    s.seats[1]!.character.wound = 'wounded';
    const b = buildPacket(s, pack, 1, memory(), [], 1000)!;
    expect(b.user).not.toBe(a.user);
    s.seats[1]!.character.wound = 'healthy';
    s.seats[2]!.character.wound = 'wounded';
    expect(buildPacket(s, pack, 1, memory(), [], 1000)!.user).not.toBe(a.user);
  });

  it('never names a rule field, a seed or another character sheet', () => {
    const pack = frontier();
    for (const id of sceneIds) {
      const s = inScene(pack, id, 987654321);
      for (const seat of s.seats) {
        const p = buildPacket(s, pack, seat.index, memory(), [], 1000)!;
        const text = p.system + p.user;
        expect(text).not.toContain('987654321');
        for (const word of ['prefer', 'spendCp', 'tactic', 'difficulty', 'success', 'failure']) {
          expect(text).not.toContain(word);
        }
        for (const other of s.seats) {
          if (other.index === seat.index) continue;
          const attrs = Object.entries(other.character.attributes)
            .map(([k, v]) => `${k} ${formatDiceCode(v)}`)
            .join(', ');
          expect(text).not.toContain(attrs);
        }
      }
    }
  });
});
