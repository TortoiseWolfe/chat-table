import type { Actor, Command } from '../engine/commands.js';
import type { GmCtx } from '../engine/ctx.js';
import type { RejectReason } from '../engine/events.js';
import { canSpendCp, canSpendFp } from '../engine/points.js';
import type { Seat } from '../engine/state.js';
import { sceneById } from '../gm/scene.js';
import { claimSeat, releaseSeat, seatOf } from './seats.js';

function reject(ctx: GmCtx, actor: Actor, reason: RejectReason): void {
  ctx.emit({ type: 'rejected', to: actor.userId, login: actor.login, reason });
}

function isPlaying(ctx: GmCtx): boolean {
  const { phase } = ctx.s;
  return phase === 'scene' || phase === 'combat';
}

/** The viewer's seat when it already plays in the current round, else undefined. */
function activeSeat(ctx: GmCtx, actor: Actor): Seat | undefined {
  const seat = seatOf(ctx.s, actor.userId);
  if (!seat || seat.holder.kind !== 'viewer') return undefined;
  return seat.holder.activeFromRound <= ctx.s.round ? seat : undefined;
}

function join(ctx: GmCtx, actor: Actor, wanted: string | undefined): void {
  const { s, pack } = ctx;
  if (seatOf(s, actor.userId) || s.waitlist.some((w) => w.userId === actor.userId)) {
    reject(ctx, actor, 'already-seated');
    return;
  }
  const free = s.seats.filter((seat) => seat.holder.kind === 'bot');
  let target: Seat | undefined = free[0];
  let preference: string | undefined;
  if (wanted !== undefined) {
    const key = wanted.toLowerCase();
    const character =
      pack.characters.find((c) => c.id.toLowerCase() === key) ??
      pack.characters.find((c) => c.name.toLowerCase() === key);
    const seat = character && s.seats.find((x) => x.character.id === character.id);
    if (!character || !seat) {
      reject(ctx, actor, 'no-such-character');
      return;
    }
    preference = character.id;
    if (seat.holder.kind === 'bot') {
      target = seat;
    } else if (free.length > 0) {
      reject(ctx, actor, 'seat-taken');
      return;
    } else {
      target = undefined;
    }
  }
  if (target) {
    claimSeat(ctx, actor, target.index);
    return;
  }
  const entry = { userId: actor.userId, login: actor.login };
  s.waitlist.push(preference === undefined ? entry : { ...entry, character: preference });
  ctx.emit({
    type: 'waitlisted',
    userId: actor.userId,
    login: actor.login,
    position: s.waitlist.length,
    ...(preference === undefined ? {} : { character: preference }),
  });
}

function leave(ctx: GmCtx, actor: Actor): void {
  const { s } = ctx;
  const seat = seatOf(s, actor.userId);
  if (seat) {
    releaseSeat(ctx, seat.index, 'leave');
    return;
  }
  const at = s.waitlist.findIndex((w) => w.userId === actor.userId);
  if (at >= 0) {
    s.waitlist.splice(at, 1);
    ctx.emit({ type: 'unwaitlisted', userId: actor.userId });
    return;
  }
  reject(ctx, actor, 'not-seated');
}

function declare(ctx: GmCtx, actor: Actor, option: number): void {
  const { s } = ctx;
  const seat = activeSeat(ctx, actor);
  if (!seat) {
    reject(ctx, actor, 'not-seated');
    return;
  }
  if (!s.window || !s.window.options.some((o) => o.n === option)) {
    ctx.emit({ type: 'ignored', reason: 'stale' });
    return;
  }
  s.declarations[seat.index] = { kind: 'pick', option, cp: 0, fp: false };
  ctx.emit({ type: 'declared', seat: seat.index, by: 'viewer', option });
}

function roll(ctx: GmCtx, actor: Actor, skill: string): void {
  const { s, pack } = ctx;
  if (!activeSeat(ctx, actor)) {
    reject(ctx, actor, 'not-seated');
    return;
  }
  if (!s.window) {
    ctx.emit({ type: 'ignored', reason: 'stale' });
    return;
  }
  const choices = s.sceneId ? (sceneById(pack, s.sceneId).choices ?? []) : [];
  const wanted = skill.toLowerCase();
  const option = s.window.options.find((o) =>
    choices.some((c) => c.id === o.id && c.check?.skill.toLowerCase() === wanted),
  );
  if (!option) {
    reject(ctx, actor, 'no-check');
    return;
  }
  declare(ctx, actor, option.n);
}

function spendCp(ctx: GmCtx, actor: Actor, count: number): void {
  const seat = activeSeat(ctx, actor);
  if (!seat) {
    reject(ctx, actor, 'not-seated');
    return;
  }
  const decl = ctx.s.declarations[seat.index];
  if (!decl || decl.kind !== 'pick') {
    reject(ctx, actor, 'no-check');
    return;
  }
  if (decl.fp || !canSpendCp(seat.character.points, count, ctx.s.settings.cpPerRollMax)) {
    reject(ctx, actor, 'no-points');
    return;
  }
  decl.cp = count;
}

function spendFp(ctx: GmCtx, actor: Actor): void {
  const seat = activeSeat(ctx, actor);
  if (!seat) {
    reject(ctx, actor, 'not-seated');
    return;
  }
  const decl = ctx.s.declarations[seat.index];
  if (!decl || decl.kind !== 'pick') {
    reject(ctx, actor, 'no-check');
    return;
  }
  if (!canSpendFp(seat.character.points, decl.cp)) {
    reject(ctx, actor, 'no-points');
    return;
  }
  decl.fp = true;
}

function say(ctx: GmCtx, actor: Actor, text: string): void {
  const seat = seatOf(ctx.s, actor.userId);
  if (!seat) {
    reject(ctx, actor, 'not-seated');
    return;
  }
  ctx.s.quotes[seat.index] = text;
}

export function handleChat(ctx: GmCtx, cmd: Command): void {
  switch (cmd.type) {
    case 'join':
      join(ctx, cmd.actor, cmd.character);
      return;
    case 'leave':
      leave(ctx, cmd.actor);
      return;
    case 'query':
      ctx.emit({ type: 'reply', to: cmd.actor.userId, login: cmd.actor.login, kind: cmd.what });
      return;
    case 'pick':
    case 'roll':
    case 'say':
    case 'cp':
    case 'fp':
      if (!isPlaying(ctx)) {
        ctx.emit({ type: 'ignored', reason: 'paused' });
        return;
      }
      if (cmd.type === 'pick') declare(ctx, cmd.actor, cmd.option);
      else if (cmd.type === 'roll') roll(ctx, cmd.actor, cmd.skill);
      else if (cmd.type === 'say') say(ctx, cmd.actor, cmd.text);
      else if (cmd.type === 'cp') spendCp(ctx, cmd.actor, cmd.count);
      else spendFp(ctx, cmd.actor);
      return;
    default:
      return;
  }
}
