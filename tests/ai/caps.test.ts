import { describe, expect, it } from 'vitest';
import { createCaps } from '../../src/ai/caps.js';
import { defaultCaps } from '../../src/ai/config.js';

const caps = { tokensPerTurn: 1000, callsPerTurn: 2, tokensPerSession: 3000, callsPerSession: 5 };

describe('createCaps', () => {
  it('allows a call within every cap', () => {
    expect(createCaps(caps).check(500)).toBeNull();
  });
  it('refuses the third call of a turn, then allows it after a new turn', () => {
    const m = createCaps(caps);
    m.record(100, 10);
    m.record(100, 10);
    expect(m.check(10)).toBe('turn-calls');
    m.beginTurn();
    expect(m.check(10)).toBeNull();
  });
  it('refuses a call that would pass the per-turn tokens', () => {
    const m = createCaps(caps);
    m.record(800, 100);
    expect(m.check(200)).toBe('turn-tokens');
    expect(m.check(100)).toBeNull();
  });
  it('keeps session totals across turns and refuses past them', () => {
    const m = createCaps({ ...caps, callsPerTurn: 9, tokensPerTurn: 9999 });
    for (let i = 0; i < 3; i++) {
      m.record(900, 100);
      m.beginTurn();
    }
    expect(m.spent()).toMatchObject({ tokens: 3000, calls: 3 });
    expect(m.check(1)).toBe('session-tokens');
  });
  it('refuses past the session call count', () => {
    const m = createCaps({ ...caps, tokensPerSession: 1e9 });
    for (let i = 0; i < 5; i++) {
      m.record(1, 1);
      m.beginTurn();
    }
    expect(m.check(1)).toBe('session-calls');
  });
  it('ignores negative token counts', () => {
    const m = createCaps(caps);
    m.record(-50, 10);
    expect(m.spent().tokens).toBe(10);
  });
  it('gives the Claude seat the tightest default caps', () => {
    const claude = defaultCaps('claude');
    for (const id of ['gemini', 'groq'] as const) {
      const other = defaultCaps(id);
      expect(claude.tokensPerTurn).toBeLessThan(other.tokensPerTurn);
      expect(claude.callsPerTurn).toBeLessThanOrEqual(other.callsPerTurn);
      expect(claude.tokensPerSession).toBeLessThan(other.tokensPerSession);
      expect(claude.callsPerSession).toBeLessThan(other.callsPerSession);
    }
  });
});
