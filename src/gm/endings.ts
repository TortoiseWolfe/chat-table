import type { GmCtx } from '../engine/ctx.js';
import type { Scene } from '../engine/pack.js';
import { saveSeat } from '../seats/viewers.js';

export function enterEnding(ctx: GmCtx, scene: Scene): void {
  const { s, pack } = ctx;
  const ending = scene.ending;
  if (!ending) throw new Error(`not an ending scene: ${scene.id}`);
  s.ending = ending;
  ctx.emit({ type: 'ended', ending, sceneId: scene.id });
  const reward = pack.adventure.rewards[ending];
  for (const seat of s.seats) {
    if (seat.holder.kind === 'viewer') {
      seat.character.points.cp += reward;
      saveSeat(s, seat.index);
      ctx.emit({
        type: 'rewards',
        userId: seat.holder.userId,
        login: seat.holder.login,
        cp: reward,
      });
    }
  }
  for (const seat of s.seats) {
    seat.character.wound = 'healthy';
    seat.character.stunnedUntil = null;
  }
  s.npcs = [];
  s.window = null;
  s.phase = 'ended';
}
