import { loadPackSync } from '../../src/packs/load.js';
import type { Pack } from '../../src/engine/pack.js';

export function tinyPack(): Pack {
  return structuredClone(loadPackSync('tests/fixtures/packs/tiny'));
}
