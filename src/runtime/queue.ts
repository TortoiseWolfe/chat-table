import type { Deps } from './deps.js';

export interface Queue<T> {
  push(item: T): Promise<void>;
  idle(): Promise<void>;
}

/** Runs one item at a time in push order; a handler error is logged and the queue carries on. */
export function createQueue<T>(
  handler: (item: T) => Promise<void>,
  log: Deps['log'],
): Queue<T> {
  let tail: Promise<void> = Promise.resolve();

  const push = (item: T): Promise<void> => {
    const run = tail.then(async () => {
      try {
        await handler(item);
      } catch (err) {
        log('error', 'queue handler failed', { message: err instanceof Error ? err.message : String(err) });
      }
    });
    tail = run;
    return run;
  };

  return {
    push,
    idle: () => tail,
  };
}
