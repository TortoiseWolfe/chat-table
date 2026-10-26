import type { GmCtx } from '../engine/ctx.js';
import type { Pack, Scene } from '../engine/pack.js';
import type { Option } from '../engine/state.js';

export function fillTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{([^{}]+)\}/g, (whole, name: string) => {
    const v = Object.hasOwn(vars, name) ? vars[name] : undefined;
    return v === undefined ? whole : v;
  });
}

export function sceneById(pack: Pack, id: string): Scene {
  const scene = pack.adventure.scenes.find((s) => s.id === id);
  if (!scene) throw new Error(`unknown scene: ${id}`);
  return scene;
}

export function choiceOptions(scene: Scene): Option[] {
  return (scene.choices ?? []).map((c, i) => ({ n: i + 1, id: c.id, label: c.label }));
}

export function narrate(ctx: GmCtx, key: string, vars: Record<string, string>): void {
  const variants = ctx.pack.templates[key];
  if (!variants) throw new Error(`unknown template: ${key}`);
  const variant = variants.length === 1 ? 0 : ctx.rng.die(variants.length) - 1;
  const quotes = ctx.s.seats.flatMap((seat) => {
    const text = ctx.s.quotes[seat.index];
    return text === undefined ? [] : [{ character: seat.character.name, text }];
  });
  ctx.emit({ type: 'narrate', template: key, variant, vars, quotes });
  ctx.s.quotes = {};
}
