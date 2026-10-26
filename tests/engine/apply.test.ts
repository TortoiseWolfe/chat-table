import { describe, expect, it } from 'vitest';
import { apply, reopenWindow } from '../../src/engine/apply.js';
import { createRng } from '../../src/engine/rng.js';
import { DEFAULT_SETTINGS, initialState, type GameState } from '../../src/engine/state.js';
import type { Command } from '../../src/engine/commands.js';
import type { Event } from '../../src/engine/events.js';
import { mod, viewer } from '../helpers/actor.js';
import { tinyPack } from '../helpers/tinyPack.js';

const pack = tinyPack();

function fresh(): GameState {
  return initialState(pack, 1, DEFAULT_SETTINGS);
}

function run(s: GameState, cmd: Command): { state: GameState; events: Event[] } {
  return apply(s, cmd, createRng(s.rng), pack);
}

const host = (action: 'start' | 'pause' | 'stop' | 'skip' | 'kick', at: number, target?: string): Command =>
  target === undefined ? { type: 'host', at, action } : { type: 'host', at, action, target };

function started(): GameState {
  return run(fresh(), host('start', 0)).state;
}

const types = (events: Event[]): string[] => events.map((e) => e.type);

describe('apply', () => {
  it('does not change the input state', () => {
    const s = fresh();
    const copy = structuredClone(s);
    run(s, host('start', 0));
    expect(s).toEqual(copy);
  });

  it('host start opens the first scene', () => {
    const r = run(fresh(), host('start', 0));
    expect(types(r.events)).toEqual([
      'started', 'scene-entered', 'narrate', 'window-opened',
      'declared', 'declared', 'declared', 'declared',
    ]);
    expect(r.state.window?.endsAt).toBe(60000);
    expect(r.state.phase).toBe('scene');
    expect(r.state.seq).toBe(8);
  });

  it('tick closes the window at endsAt only', () => {
    const s = started();
    expect(run(s, { type: 'tick', at: 59999 }).events).toEqual([]);
    const r = run(s, { type: 'tick', at: 60000 });
    expect(r.events[0]).toEqual({ type: 'vote', sceneId: 'start', tally: { 1: 4 }, winner: 1 });
    expect(r.events[1]).toEqual({ type: 'scene-entered', sceneId: 'fight' });
    expect(r.state.phase).toBe('combat');
  });

  it('pause then resume', () => {
    const s = started();
    const p = run(s, host('pause', 100));
    expect(p.events).toEqual([{ type: 'paused', reason: 'host' }]);
    expect(run(p.state, { type: 'tick', at: 60000 }).events).toEqual([]);
    const r = run(p.state, host('start', 70000));
    expect(r.events).toEqual([{ type: 'resumed' }]);
    expect(r.state.window?.endsAt).toBe(130000);
    expect(r.state.declarations).toEqual(s.declarations);
  });

  it('host stop', () => {
    const r = run(started(), host('stop', 5));
    expect(r.events).toEqual([{ type: 'stopped' }]);
    expect(r.state.phase).toBe('ended');
    expect(r.state.ending).toBeNull();
  });

  it('host skip', () => {
    const s = started();
    const a = run(s, host('skip', 10));
    expect(a.events[0]).toEqual({ type: 'scene-entered', sceneId: 'fight' });
    const b = run(a.state, host('skip', 20));
    expect(b.events).toContainEqual({ type: 'scene-entered', sceneId: 'win' });
    expect(b.events).toContainEqual({ type: 'ended', ending: 'victory', sceneId: 'win' });
  });

  it('admin stop needs a mod', () => {
    const s = started();
    const a = run(s, { type: 'admin', at: 10, actor: viewer(1), action: 'stop' });
    expect(a.events).toEqual([{ type: 'rejected', to: 'u1', login: 'viewer1', reason: 'not-mod' }]);
    expect(a.state.phase).toBe('scene');
    const b = run(s, { type: 'admin', at: 10, actor: mod(1), action: 'stop' });
    expect(b.events).toEqual([{ type: 'stopped' }]);
  });

  it('cooldown', () => {
    const s = started();
    const a = run(s, { type: 'admin', at: 1000, actor: mod(1), action: 'pause' });
    expect(a.events).toEqual([{ type: 'paused', reason: 'admin' }]);
    const b = run(a.state, { type: 'admin', at: 2000, actor: mod(1), action: 'start' });
    expect(b.events).toEqual([{ type: 'ignored', reason: 'cooldown' }]);
    expect(b.state.phase).toBe('paused');
    const c = run(b.state, { type: 'admin', at: 4000, actor: mod(1), action: 'start' });
    expect(c.events).toEqual([{ type: 'resumed' }]);
  });

  it('host kick', () => {
    const s = started();
    s.seats[0]!.holder = { kind: 'viewer', userId: 'u1', login: 'viewer1', activeFromRound: 1 };
    const a = run(s, host('kick', 10, 'viewer1'));
    expect(a.events[0]).toMatchObject({ type: 'seat-released', reason: 'kick' });
    expect(run(s, host('kick', 10, 'nobody')).events).toEqual([]);
  });

  it('offline pauses a scene', () => {
    const r = run(started(), { type: 'offline', at: 5 });
    expect(r.events).toEqual([{ type: 'paused', reason: 'offline' }]);
  });

  it('reopenWindow', () => {
    const s = started();
    const r = reopenWindow(s, 500000);
    expect(r.window?.endsAt).toBe(560000);
    expect(r.window?.round).toBe(s.window?.round);
    expect(r.declarations).toEqual(s.declarations);
  });

  it('is deterministic', () => {
    const list: Command[] = [host('start', 0), { type: 'tick', at: 60000 }, host('skip', 61000)];
    const play = (): Event[] => {
      let s = fresh();
      const out: Event[] = [];
      for (const c of list) {
        const r = run(s, c);
        s = r.state;
        out.push(...r.events);
      }
      return out;
    };
    expect(play()).toEqual(play());
  });
});
