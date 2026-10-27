import { describe, expect, it } from 'vitest';
import { createBucket } from '../../src/twitch/bucket.js';

function run(limit: number, offers: { text: string; user?: string }[], seconds: number) {
  let t = 0;
  const logs: string[] = [];
  const bucket = createBucket({
    limit,
    now: () => t,
    log: (_l, msg) => logs.push(msg),
  });
  for (const o of offers) bucket.offer(o);
  const sent: { at: number; text: string }[] = [];
  for (let s = 0; s <= seconds; s++) {
    t = s * 1000;
    for (const text of bucket.drain()) sent.push({ at: t, text });
  }
  return { sent, logs, bucket };
}

const joins = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    text: `viewer${String(i)} joined`,
    user: `u${String(i)}`,
  }));

function worstWindow(sent: { at: number }[]): number {
  let worst = 0;
  for (const s of sent) {
    worst = Math.max(worst, sent.filter((x) => x.at >= s.at && x.at < s.at + 30000).length);
  }
  return worst;
}

describe('createBucket', () => {
  it('50 replies in one second with limit 20: at most 20 per 30 s, gaps of 1 s, every drop logged', () => {
    const { sent, logs, bucket } = run(20, joins(50), 120);
    expect(worstWindow(sent)).toBeLessThanOrEqual(20);
    for (let i = 1; i < sent.length; i++) {
      expect((sent[i]?.at ?? 0) - (sent[i - 1]?.at ?? 0)).toBeGreaterThanOrEqual(1000);
    }
    expect(sent).toHaveLength(20);
    expect(logs.filter((m) => m === 'bucket dropped a reply')).toHaveLength(30);
    expect(bucket.size()).toBe(0);
    expect(sent[0]?.text).toBe('viewer30 joined');
  });

  it('limit 100 (a moderator bot) keeps all 50 and never exceeds 100 per window', () => {
    const { sent, logs } = run(100, joins(50), 120);
    expect(sent).toHaveLength(50);
    expect(logs).toEqual([]);
    expect(worstWindow(sent)).toBeLessThanOrEqual(100);
  });

  it('merges the oldest replies to one user before dropping anything', () => {
    const offers = [
      { text: 'a1', user: 'a' },
      { text: 'b1', user: 'b' },
      { text: 'a2', user: 'a' },
    ];
    const { sent, logs } = run(2, offers, 5);
    expect(sent.map((s) => s.text)).toEqual(['a1 a2', 'b1']);
    expect(logs).toEqual(['bucket merged replies']);
  });

  it('cuts a line over 500 characters', () => {
    const { sent } = run(20, [{ text: 'word '.repeat(200) }], 2);
    expect(sent[0]?.text.length).toBeLessThanOrEqual(500);
    expect(sent[0]?.text.endsWith('...')).toBe(true);
  });

  it('sends each line once', () => {
    const { sent } = run(2, joins(2), 40);
    expect(sent).toHaveLength(2);
  });

  it('allows more per window after setLimit raises the allowance', () => {
    let t = 0;
    const bucket = createBucket({ limit: 2, now: () => t });
    const sent: string[] = [];
    for (const o of joins(2)) bucket.offer(o);
    for (let s = 0; s < 3; s++) {
      t = s * 1000;
      sent.push(...bucket.drain());
    }
    expect(sent).toHaveLength(2);
    bucket.setLimit(100);
    for (const o of joins(5)) bucket.offer(o);
    for (let s = 3; s < 12; s++) {
      t = s * 1000;
      sent.push(...bucket.drain());
    }
    expect(sent).toHaveLength(7);
  });
});
