import { describe, expect, it } from 'vitest';
import { createQueue } from '../../src/runtime/queue.js';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe('createQueue', () => {
  it('runs items one at a time in push order', async () => {
    const done: number[] = [];
    const q = createQueue<[number, number]>(async ([n, ms]) => {
      await sleep(ms);
      done.push(n);
    }, () => undefined);
    void q.push([1, 30]);
    void q.push([2, 10]);
    void q.push([3, 20]);
    await q.idle();
    expect(done).toEqual([1, 2, 3]);
  });

  it('logs a throwing item once and still runs the next one', async () => {
    const logs: string[] = [];
    const done: number[] = [];
    const q = createQueue<number>(
      (n) => {
        if (n === 1) return Promise.reject(new Error('boom'));
        done.push(n);
        return Promise.resolve();
      },
      (level) => logs.push(level),
    );
    void q.push(1);
    void q.push(2);
    await q.idle();
    expect(logs).toEqual(['error']);
    expect(done).toEqual([2]);
  });

  it('idle resolves only after the last item', async () => {
    let finished = false;
    const q = createQueue<number>(async () => {
      await sleep(20);
      finished = true;
    }, () => undefined);
    void q.push(1);
    await q.idle();
    expect(finished).toBe(true);
  });
});
