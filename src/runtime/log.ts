import type { Event } from '../engine/events.js';
import type { GameState } from '../engine/state.js';

export interface LogLine extends Record<string, unknown> {
  seq: number;
  at: number;
  round: number;
  type: Event['type'];
}

export function toLogLines(
  events: Event[],
  before: Pick<GameState, 'seq' | 'round'>,
  at: number,
): LogLine[] {
  let round = before.round;
  return events.map((e, i) => {
    if (e.type === 'window-opened') round = e.round;
    return { seq: before.seq + i + 1, at, round, ...e };
  });
}

export function formatLogLine(line: LogLine): string {
  return JSON.stringify(line);
}
