import { describe, expect, it } from 'vitest';
import { GM_TEMPLATE_KEYS } from '../../src/gm/keys.js';
import { WOUND_ORDER } from '../../src/engine/tables.js';

describe('GM_TEMPLATE_KEYS', () => {
  it('has 10 unique keys', () => {
    expect(GM_TEMPLATE_KEYS).toHaveLength(10);
    expect(new Set(GM_TEMPLATE_KEYS).size).toBe(10);
  });

  it('has no ending keys', () => {
    for (const k of GM_TEMPLATE_KEYS) expect(k.startsWith('ending.')).toBe(false);
  });

  it('has a wound key for every level except healthy', () => {
    const keys: readonly string[] = GM_TEMPLATE_KEYS;
    for (const level of WOUND_ORDER) {
      if (level === 'healthy') continue;
      expect(keys).toContain(`wound.${level}`);
    }
  });
});
