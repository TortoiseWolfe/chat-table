import type { Caps } from './types.js';

export type CapReason = 'turn-calls' | 'turn-tokens' | 'session-calls' | 'session-tokens';

export interface CapMeter {
  /** A new round: the per-turn counters start again. */
  beginTurn(): void;
  /** Null when a call that may cost `estimate` tokens is allowed, else the cap it would break. */
  check(estimate: number): CapReason | null;
  /** Counts a finished call. */
  record(tokensIn: number, tokensOut: number): void;
  spent(): { tokens: number; calls: number; turnTokens: number; turnCalls: number };
  readonly caps: Caps;
}

export function createCaps(caps: Caps): CapMeter {
  let turnTokens = 0;
  let turnCalls = 0;
  let tokens = 0;
  let calls = 0;
  return {
    caps,
    beginTurn() {
      turnTokens = 0;
      turnCalls = 0;
    },
    check(estimate) {
      if (turnCalls >= caps.callsPerTurn) return 'turn-calls';
      if (calls >= caps.callsPerSession) return 'session-calls';
      if (turnTokens + estimate > caps.tokensPerTurn) return 'turn-tokens';
      if (tokens + estimate > caps.tokensPerSession) return 'session-tokens';
      return null;
    },
    record(tokensIn, tokensOut) {
      const n = Math.max(0, tokensIn) + Math.max(0, tokensOut);
      turnTokens += n;
      turnCalls += 1;
      tokens += n;
      calls += 1;
    },
    spent: () => ({ tokens, calls, turnTokens, turnCalls }),
  };
}
