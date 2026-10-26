import type { GmCtx } from '../engine/ctx.js';
import { closeCombatWindow, combatOptions, spawnNpcs, startCombatRound } from './combat.js';
import { enterEnding } from './endings.js';
import { closeSceneWindow, openWindow } from './round.js';
import { choiceOptions, narrate, sceneById } from './scene.js';

export function enterScene(ctx: GmCtx, id: string): void {
  const { s } = ctx;
  const scene = sceneById(ctx.pack, id);
  s.sceneId = id;
  s.npcs = [];
  s.initiative = [];
  s.dodges = {};
  s.combatRound = 0;
  s.window = null;
  s.declarations = {};
  ctx.emit({ type: 'scene-entered', sceneId: id });
  narrate(ctx, scene.template, scene.facts);
  if (scene.ending) {
    enterEnding(ctx, scene);
    return;
  }
  if (scene.combat) {
    spawnNpcs(ctx, scene);
    s.phase = 'combat';
    narrate(ctx, 'combat.start', {});
  } else {
    s.phase = 'scene';
  }
  openOrTimeout(ctx);
}

export function openOrTimeout(ctx: GmCtx): void {
  const { s, pack } = ctx;
  if (s.round >= pack.adventure.roundLimit) {
    const timeout = pack.adventure.scenes.find((sc) => sc.ending === 'timeout');
    if (!timeout) throw new Error('no timeout scene');
    enterScene(ctx, timeout.id);
    return;
  }
  const scene = sceneById(pack, s.sceneId ?? '');
  if (s.phase === 'combat') {
    startCombatRound(ctx);
    openWindow(ctx, combatOptions(s, scene));
  } else {
    openWindow(ctx, choiceOptions(scene));
  }
}

export function resolveWindow(ctx: GmCtx): void {
  if (ctx.s.phase === 'combat') {
    const next = closeCombatWindow(ctx);
    if (next === null) openOrTimeout(ctx);
    else enterScene(ctx, next);
  } else {
    enterScene(ctx, closeSceneWindow(ctx));
  }
}
