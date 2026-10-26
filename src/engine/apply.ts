import { handleChat } from '../seats/chat.js';
import { releaseSeat } from '../seats/seats.js';
import { saveSeat } from '../seats/viewers.js';
import { enterScene, resolveWindow } from '../gm/flow.js';
import { windowShouldClose } from '../gm/round.js';
import { sceneById } from '../gm/scene.js';
import type { AdminAction, Command } from './commands.js';
import type { GmCtx } from './ctx.js';
import type { Event } from './events.js';
import type { Pack } from './pack.js';
import type { Rng } from './rng.js';
import type { GameState } from './state.js';

export function reopenWindow(state: GameState, at: number): GameState {
  const s = structuredClone(state);
  if (s.window) {
    s.window.opensAt = at;
    s.window.endsAt = at + s.settings.declareMs;
  }
  return s;
}

function isPlaying(s: GameState): boolean {
  return s.phase === 'scene' || s.phase === 'combat';
}

function pause(ctx: GmCtx, reason: 'host' | 'admin' | 'offline'): void {
  const { s } = ctx;
  if (s.phase !== 'scene' && s.phase !== 'combat') return;
  s.pausedFrom = s.phase;
  s.phase = 'paused';
  ctx.emit({ type: 'paused', reason });
}

function skip(ctx: GmCtx): void {
  const { s, pack } = ctx;
  if (!s.sceneId) return;
  const scene = sceneById(pack, s.sceneId);
  if (s.phase === 'scene') {
    const choice = scene.choices?.find((c) => c.id === scene.default);
    const next = choice?.next ?? choice?.check?.success;
    if (next !== undefined) enterScene(ctx, next);
  } else if (s.phase === 'combat' && scene.combat) {
    enterScene(ctx, scene.combat.win);
  }
}

function hostAction(
  ctx: GmCtx,
  action: AdminAction,
  target: string | undefined,
  reason: 'host' | 'admin',
): void {
  const { s, pack, at } = ctx;
  switch (action) {
    case 'start':
      if (s.phase === 'idle') {
        ctx.emit({ type: 'started', packId: s.packId, seed: s.rng.seed });
        enterScene(ctx, pack.adventure.start);
      } else if (s.phase === 'paused' && s.pausedFrom) {
        s.phase = s.pausedFrom;
        s.pausedFrom = null;
        ctx.emit({ type: 'resumed' });
        if (s.window) {
          s.window.opensAt = at;
          s.window.endsAt = at + s.settings.declareMs;
        }
      }
      break;
    case 'pause':
      pause(ctx, reason);
      break;
    case 'stop':
      if (s.phase !== 'idle' && s.phase !== 'ended') {
        for (const seat of s.seats) saveSeat(s, seat.index);
        ctx.emit({ type: 'stopped' });
        s.phase = 'ended';
        s.pausedFrom = null;
        s.ending = null;
        s.window = null;
      }
      break;
    case 'skip':
      skip(ctx);
      break;
    case 'kick': {
      const seat = s.seats.find((x) => x.holder.kind === 'viewer' && x.holder.login === target);
      if (seat) releaseSeat(ctx, seat.index, 'kick');
      break;
    }
  }
}

export function apply(
  state: GameState,
  cmd: Command,
  rng: Rng,
  pack: Pack,
): { state: GameState; events: Event[] } {
  const s = structuredClone(state);
  const events: Event[] = [];
  const at = cmd.at;
  const ctx: GmCtx = {
    s,
    pack,
    rng,
    at,
    emit: (e) => {
      events.push(e);
    },
  };

  const finish = (): { state: GameState; events: Event[] } => {
    s.rng = rng.state;
    s.seq += events.length;
    return { state: s, events };
  };

  if ('actor' in cmd) {
    const last = s.cooldowns[cmd.actor.userId];
    if (last !== undefined && at - last < s.settings.cooldownMs) {
      ctx.emit({ type: 'ignored', reason: 'cooldown' });
      return finish();
    }
  }

  switch (cmd.type) {
    case 'host':
      hostAction(ctx, cmd.action, cmd.target, 'host');
      break;
    case 'admin':
      if (cmd.actor.isMod || cmd.actor.isBroadcaster) {
        hostAction(ctx, cmd.action, cmd.target, 'admin');
      } else {
        ctx.emit({
          type: 'rejected',
          to: cmd.actor.userId,
          login: cmd.actor.login,
          reason: 'not-mod',
        });
      }
      break;
    case 'tick':
      if (isPlaying(s) && s.window && at >= s.window.endsAt) resolveWindow(ctx);
      break;
    case 'offline':
      pause(ctx, 'offline');
      break;
    default:
      handleChat(ctx, cmd);
      if (isPlaying(s) && windowShouldClose(s, at)) resolveWindow(ctx);
      break;
  }

  if ('actor' in cmd && !events.some((e) => e.type === 'ignored')) {
    s.cooldowns[cmd.actor.userId] = at;
  }
  return finish();
}
