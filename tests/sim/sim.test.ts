import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, initialState } from '../../src/engine/state.js';
import { formatLogLine, toLogLines } from '../../src/runtime/log.js';
import { FakeClock } from '../../src/sim/clock.js';
import { runSim } from '../../src/sim/run.js';
import { parseScript } from '../../src/sim/script.js';
import { tinyPack } from '../helpers/tinyPack.js';

describe('parseScript', () => {
  it('parses once and every lines', () => {
    const lines = parseScript('5 viewer1 !join ana\n# x\n\nevery 10 viewer2 !1');
    expect(lines).toEqual([
      { kind: 'once', offsetMs: 5000, login: 'viewer1', text: '!join ana', line: 1 },
      { kind: 'every', offsetMs: 10000, login: 'viewer2', text: '!1', line: 4 },
    ]);
  });

  it('rejects a bad line', () => {
    expect(() => parseScript('5')).toThrow('script line 1:');
  });
});

describe('FakeClock', () => {
  it('fires timers in time order', () => {
    const c = new FakeClock(0);
    const fired: number[] = [];
    c.setTimer(() => fired.push(30), 30);
    c.setTimer(() => fired.push(10), 10);
    c.advanceTo(30);
    expect(fired).toEqual([10, 30]);
    expect(c.now()).toBe(30);
  });

  it('never fires a cleared timer', () => {
    const c = new FakeClock(0);
    const fired: number[] = [];
    const id = c.setTimer(() => fired.push(1), 10);
    c.clearTimer(id);
    c.advanceTo(100);
    expect(fired).toEqual([]);
  });
});

describe('log lines', () => {
  it('formats in contract order', () => {
    const s = initialState(tinyPack(), 1, DEFAULT_SETTINGS);
    const line = toLogLines([{ type: 'stopped' }], { ...s, seq: 4, round: 0 }, 1000)[0]!;
    expect(formatLogLine(line)).toBe('{"seq":5,"at":1000,"round":0,"type":"stopped"}');
  });
});

describe('runSim', () => {
  it('plays the tiny pack to an ending, twice the same', () => {
    const a = runSim({ pack: tinyPack(), seed: 1 });
    expect(a.state.phase).toBe('ended');
    const last = a.log.trimEnd().split('\n').at(-1)!;
    expect((JSON.parse(last) as { type: string }).type).toBe('ended');
    const b = runSim({ pack: tinyPack(), seed: 1 });
    expect(b.log).toBe(a.log);
  });
});
