import { describe, expect, it } from 'vitest';
import { createNarrator } from '../../src/narrator/narrator.js';
import { loadPackSync } from '../../src/packs/load.js';
import { narrateLines, runSim } from '../../src/sim/run.js';

describe('sim with a dead narrator endpoint (SC-003)', () => {
  it('still reaches ended, with every line templated', async () => {
    const pack = loadPackSync('packs/frontier');
    const run = runSim({ pack, seed: 42 });
    expect(run.state.phase).toBe('ended');
    expect(run.narrations.length).toBeGreaterThan(0);
    const logs: string[] = [];
    const narrator = createNarrator(
      { url: 'http://dead.test/v1', model: 'm', timeoutMs: 50 },
      {
        fetch: () => Promise.reject(new Error('connection refused')),
        setTimer: (fn, ms) => setTimeout(fn, ms),
        clearTimer: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
        log: (_level, msg) => logs.push(msg),
      }
    );
    const lines = await narrateLines(run, narrator);
    expect(lines).toEqual(run.lines);
    expect(logs).toHaveLength(run.narrations.length);
  });
});
