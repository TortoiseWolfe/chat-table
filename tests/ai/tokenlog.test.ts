import { describe, expect, it } from 'vitest';
import { createTokenLog } from '../../src/ai/tokenlog.js';
import { memFs } from '../helpers/memfs.js';

function setup() {
  const fs = memFs();
  const logs: string[] = [];
  let t = 1000;
  const log = createTokenLog(
    { now: () => t++, fs, log: (l, m) => logs.push(`${l}: ${m}`) },
    '/d/tokens.jsonl'
  );
  const lines = (): Record<string, unknown>[] =>
    (fs.files.get('/d/tokens.jsonl') ?? '')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Record<string, unknown>);
  return { fs, log, lines, logs };
}

describe('createTokenLog', () => {
  it('writes a call row with driver, model, tokens, latency and outcome', async () => {
    const t = setup();
    t.log.call({
      seat: 1,
      driver: 'claude',
      model: 'm',
      round: 3,
      tokensIn: 800,
      tokensOut: 20,
      latencyMs: 640,
      outcome: 'ok',
    });
    await t.log.idle();
    expect(t.lines()).toEqual([
      {
        t: 1000,
        kind: 'call',
        seat: 1,
        driver: 'claude',
        model: 'm',
        round: 3,
        in: 800,
        out: 20,
        ms: 640,
        outcome: 'ok',
      },
    ]);
  });

  it('writes a swap row', async () => {
    const t = setup();
    t.log.swap({ seat: 2, from: 'gemini', to: 'groq', reason: 'manual', round: 9 });
    await t.log.idle();
    expect(t.lines()[0]).toMatchObject({
      kind: 'swap',
      seat: 2,
      from: 'gemini',
      to: 'groq',
      reason: 'manual',
      round: 9,
    });
  });

  it('keeps the order of lines and writes only the known fields', async () => {
    const t = setup();
    for (let i = 0; i < 5; i++) {
      t.log.call({
        seat: 0,
        driver: 'bot',
        model: 'autopilot',
        round: i,
        tokensIn: 0,
        tokensOut: 0,
        latencyMs: 0,
        outcome: 'ok',
        // @ts-expect-error a stray field must never reach the file
        packet: 'secret viewer text',
      });
    }
    await t.log.idle();
    expect(t.lines().map((l) => l['round'])).toEqual([0, 1, 2, 3, 4]);
    expect(t.fs.files.get('/d/tokens.jsonl')).not.toContain('secret');
  });

  it('logs a failed write and carries on', async () => {
    const t = setup();
    t.fs.appendFile = () => Promise.reject(new Error('disk full'));
    t.log.swap({ seat: 0, from: 'bot', to: 'claude', reason: 'start', round: 0 });
    await t.log.idle();
    expect(t.logs).toEqual(['error: token log write failed']);
  });
});
