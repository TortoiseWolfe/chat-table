import { describe, expect, it } from 'vitest';
import { recordFor, resetSeatCharacter, saveSeat } from '../../src/seats/viewers.js';
import { DEFAULT_SETTINGS, initialState } from '../../src/engine/state.js';
import { tinyPack } from '../helpers/tinyPack.js';

describe('viewer records', () => {
  it('recordFor is null on an empty state', () => {
    const s = initialState(tinyPack(), 1, DEFAULT_SETTINGS);
    expect(recordFor(s, 'u1', 'ana')).toBeNull();
  });

  it('saveSeat stores a viewer seat', () => {
    const s = initialState(tinyPack(), 1, DEFAULT_SETTINGS);
    s.seats[0]!.holder = { kind: 'viewer', userId: 'u1', login: 'viewer1', activeFromRound: 0 };
    s.seats[0]!.character.points.cp = 7;
    saveSeat(s, 0);
    expect(s.viewers['u1']!.characters['ana']!.points).toEqual({ cp: 7, fp: 1 });
    expect(recordFor(s, 'u1', 'ana')).not.toBeNull();
  });

  it('saveSeat ignores a bot seat', () => {
    const s = initialState(tinyPack(), 1, DEFAULT_SETTINGS);
    saveSeat(s, 0);
    expect(s.viewers).toEqual({});
  });

  it('resetSeatCharacter restores points and keeps the wound', () => {
    const pack = tinyPack();
    const s = initialState(pack, 1, DEFAULT_SETTINGS);
    s.seats[0]!.character.points.cp = 2;
    s.seats[0]!.character.wound = 'wounded';
    resetSeatCharacter(s, 0, pack);
    expect(s.seats[0]!.character.points.cp).toBe(5);
    expect(s.seats[0]!.character.wound).toBe('wounded');
  });
});
