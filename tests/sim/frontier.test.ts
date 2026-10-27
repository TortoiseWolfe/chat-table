import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadPackSync } from '../../src/packs/load.js';
import { runSim } from '../../src/sim/run.js';
import { parseScript } from '../../src/sim/script.js';

describe('Frontier pack', () => {
  it('loads with 4 characters and 10 scenes', () => {
    const pack = loadPackSync('packs/frontier');
    expect(pack.characters).toHaveLength(4);
    expect(pack.adventure.scenes).toHaveLength(10);
  });

  it('plays itself to an ending, the same way twice (SC-001)', () => {
    const pack = loadPackSync('packs/frontier');
    const a = runSim({ pack, seed: 42 });
    const b = runSim({ pack, seed: 42 });
    expect(a.state.phase).toBe('ended');
    expect(b.log).toBe(a.log);
  });

  it('reaches an ending for seeds 1 to 20', () => {
    const pack = loadPackSync('packs/frontier');
    for (let seed = 1; seed <= 20; seed++) {
      expect(runSim({ pack, seed }).state.phase).toBe('ended');
    }
  });

  it('plays two scripted viewers to the end and rewards each', () => {
    const pack = loadPackSync('packs/frontier');
    const script = parseScript(
      readFileSync('tests/fixtures/sim/two-viewers.txt', 'utf8').replace('!join ana', '!join kestrel'),
    );
    const r = runSim({ pack, seed: 1, script });
    expect(r.state.phase).toBe('ended');
    const types = r.log
      .trimEnd()
      .split('\n')
      .map((l) => (JSON.parse(l) as { type: string }).type);
    expect(types.filter((t) => t === 'rewards')).toHaveLength(2);
  });
});
