import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, initialState, type GameState } from '../../src/engine/state.js';
import { tinyPack } from '../helpers/tinyPack.js';

describe('initialState with the tiny pack', () => {
  it('builds four bot seats, idle', () => {
    const s = initialState(tinyPack(), 1, DEFAULT_SETTINGS);
    expect(s.seats).toHaveLength(4);
    for (const seat of s.seats) expect(seat.holder).toEqual({ kind: 'bot' });
    expect(s.seats[0]?.character.id).toBe('ana');
    expect(s.phase).toBe('idle');
    expect(s.rng).toEqual({ seed: 1, counter: 0 });
  });

  it('is plain JSON', () => {
    const s = initialState(tinyPack(), 1, DEFAULT_SETTINGS);
    expect(JSON.parse(JSON.stringify(s)) as GameState).toEqual(s);
  });

  it('does not share characters with the pack', () => {
    const pack = tinyPack();
    const s = initialState(pack, 1, DEFAULT_SETTINGS);
    s.seats[0]!.character.points.cp = 0;
    expect(tinyPack().characters[0]?.points.cp).toBe(5);
    expect(pack.characters[0]?.points.cp).toBe(5);
  });

  it('stores viewers as given', () => {
    const viewers = { u1: { characters: {} } };
    expect(initialState(tinyPack(), 1, DEFAULT_SETTINGS, viewers).viewers).toBe(viewers);
  });

  it('gives a fresh pack each call', () => {
    expect(tinyPack()).not.toBe(tinyPack());
  });
});
