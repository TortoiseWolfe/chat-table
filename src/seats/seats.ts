import type { Actor } from '../engine/commands.js';
import type { GmCtx } from '../engine/ctx.js';
import type { GameState, Seat } from '../engine/state.js';
import { recordFor, resetSeatCharacter, saveSeat } from './viewers.js';

export function seatOf(s: GameState, userId: string): Seat | undefined {
  return s.seats.find((seat) => seat.holder.kind === 'viewer' && seat.holder.userId === userId);
}

export function freeCharacters(s: GameState): string[] {
  return s.seats.filter((seat) => seat.holder.kind === 'bot').map((seat) => seat.character.name);
}

export function claimSeat(ctx: GmCtx, actor: Actor, seatIndex: number): void {
  const { s } = ctx;
  const seat = s.seats[seatIndex];
  if (!seat) throw new Error(`unknown seat: ${seatIndex}`);
  seat.holder = {
    kind: 'viewer',
    userId: actor.userId,
    login: actor.login,
    activeFromRound: s.window ? s.round + 1 : s.round,
  };
  seat.missed = 0;
  const record = recordFor(s, actor.userId, seat.character.id);
  if (record) {
    seat.character.points = { ...record.points };
    seat.character.advances = { ...record.advances };
  }
  ctx.emit({
    type: 'seat-claimed',
    seat: seatIndex,
    userId: actor.userId,
    login: actor.login,
    character: seat.character.id,
  });
}

export function releaseSeat(
  ctx: GmCtx,
  seatIndex: number,
  reason: 'leave' | 'missed' | 'kick',
): void {
  const { s } = ctx;
  const seat = s.seats[seatIndex];
  if (!seat || seat.holder.kind !== 'viewer') return;
  const { userId, login } = seat.holder;
  saveSeat(s, seatIndex);
  ctx.emit({ type: 'seat-released', seat: seatIndex, userId, login, reason });
  seat.holder = { kind: 'bot' };
  seat.missed = 0;
  resetSeatCharacter(s, seatIndex, ctx.pack);
  promoteWaitlist(ctx);
}

export function promoteWaitlist(ctx: GmCtx): void {
  const { s } = ctx;
  while (s.waitlist.length > 0) {
    const free = s.seats.filter((seat) => seat.holder.kind === 'bot');
    const lowest = free[0];
    if (!lowest) return;
    const entry = s.waitlist.shift()!;
    const wanted = free.find((seat) => seat.character.id === entry.character);
    const seat = wanted ?? lowest;
    ctx.emit({ type: 'unwaitlisted', userId: entry.userId });
    const actor = { userId: entry.userId, login: entry.login, isMod: false, isBroadcaster: false };
    claimSeat(ctx, actor, seat.index);
  }
}
