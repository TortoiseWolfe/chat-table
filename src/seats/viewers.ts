import type { Pack } from '../engine/pack.js';
import type { Points } from '../engine/points.js';
import type { GameState } from '../engine/state.js';

export function recordFor(
  s: GameState,
  userId: string,
  characterId: string,
): { points: Points; advances: Record<string, string> } | null {
  return s.viewers[userId]?.characters[characterId] ?? null;
}

export function saveSeat(s: GameState, seatIndex: number): void {
  const seat = s.seats[seatIndex];
  if (!seat || seat.holder.kind !== 'viewer') return;
  const record = (s.viewers[seat.holder.userId] ??= { characters: {} });
  record.characters[seat.character.id] = {
    points: { ...seat.character.points },
    advances: { ...seat.character.advances },
  };
}

export function resetSeatCharacter(s: GameState, seatIndex: number, pack: Pack): void {
  const seat = s.seats[seatIndex];
  const start = seat && pack.characters.find((c) => c.id === seat.character.id);
  if (!seat || !start) return;
  seat.character.points = { ...start.points };
  seat.character.advances = { ...start.advances };
}
