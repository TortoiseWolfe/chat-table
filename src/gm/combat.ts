import type { GmCtx } from '../engine/ctx.js';
import { addDice } from '../engine/dice.js';
import { check } from '../engine/checks.js';
import { orderInitiative, type InitiativeEntry } from '../engine/initiative.js';
import type { Character, Npc, Scene } from '../engine/pack.js';
import type { GameState, Option } from '../engine/state.js';
import { COMBAT_MIN_DIFFICULTY, DIFFICULTY, WOUND_ORDER, type WoundLevel } from '../engine/tables.js';
import { applyWound, isOut, woundFromMargin } from '../engine/wounds.js';
import {
  effectiveCode,
  payFp,
  rollAndEmit,
  settleDeclarations,
  spendPoints,
  standingSeats,
} from './round.js';
import { narrate, sceneById } from './scene.js';

function windex(level: WoundLevel): number {
  return WOUND_ORDER.indexOf(level);
}

export function npcOut(npc: Npc): boolean {
  return windex(npc.wound) >= windex(npc.outAt);
}

export function whoName(s: GameState, who: string): string {
  const npc = s.npcs.find((n) => n.uid === who);
  if (npc) return `${npc.name} ${npc.uid.slice(npc.uid.indexOf('#') + 1)}`;
  const m = /^seat:(\d+)$/.exec(who);
  const seat = m ? s.seats[Number(m[1])] : undefined;
  return seat ? seat.character.name : who;
}

export function spawnNpcs(ctx: GmCtx, scene: Scene): void {
  const npcs: Npc[] = [];
  for (const { npc, count } of scene.combat?.npcs ?? []) {
    const template = ctx.pack.npcs.find((t) => t.id === npc);
    if (!template) throw new Error(`unknown npc: ${npc}`);
    for (let k = 1; k <= count; k++) {
      npcs.push({
        ...structuredClone(template),
        uid: `${npc}#${k}`,
        wound: 'healthy',
        stunnedUntil: null,
      });
    }
  }
  ctx.s.npcs = npcs;
  ctx.s.combatRound = 0;
}

export function combatOptions(s: GameState, scene: Scene): Option[] {
  const raw: { id: string; label: string }[] = s.npcs
    .filter((n) => !npcOut(n))
    .map((n) => ({ id: `attack:${n.uid}`, label: `Attack ${whoName(s, n.uid)}` }));
  raw.push({ id: 'dodge', label: 'Dodge' }, { id: 'attack-dodge', label: 'Attack and dodge' });
  if (scene.combat?.flee) raw.push({ id: 'flee', label: 'Flee' });
  return raw.map((o, i) => ({ n: i + 1, ...o }));
}

export function combatOutcome(s: GameState): 'win' | 'lose' | null {
  if (s.npcs.every(npcOut)) return 'win';
  if (s.seats.every((seat) => isOut(seat.character.wound))) return 'lose';
  return null;
}

export function startCombatRound(ctx: GmCtx): void {
  const { s } = ctx;
  s.combatRound += 1;
  s.dodges = {};
  const entries: InitiativeEntry[] = [];
  const add = (id: string, who: Character | Npc): void => {
    const r = rollAndEmit(ctx, id, 'perception', who.attributes.perception);
    entries.push({
      id,
      total: r.total,
      perception: who.attributes.perception,
      reflexes: who.attributes.reflexes,
    });
  };
  for (const seat of standingSeats(s)) add(`seat:${seat.index}`, seat.character);
  for (const npc of s.npcs) {
    if (!npcOut(npc)) add(npc.uid, npc);
  }
  s.initiative = orderInitiative(entries);
  ctx.emit({ type: 'initiative', order: [...s.initiative] });
}

type Choice = { id: string; cp: number; fp: boolean };

export function closeCombatWindow(ctx: GmCtx): string | null {
  const { s, pack } = ctx;
  settleDeclarations(ctx);
  const scene = sceneById(pack, s.sceneId ?? '');
  const options = s.window?.options ?? [];
  const standing = standingSeats(s);
  const flee = scene.combat?.flee;

  const choices: Record<number, Choice> = {};
  for (const seat of standing) {
    const d = s.declarations[seat.index];
    let id = 'dodge';
    let cp = 0;
    let fp = false;
    if (d && d.kind === 'pick') {
      id = options.find((o) => o.n === d.option)?.id ?? 'dodge';
      cp = d.cp;
      fp = d.fp;
    }
    choices[seat.index] = { id, cp, fp };
  }
  const fleeCount = standing.filter((seat) => choices[seat.index]!.id === 'flee').length;
  if (flee !== undefined && standing.length > 0 && fleeCount * 2 > standing.length) {
    s.window = null;
    return flee;
  }
  for (const seat of standing) {
    const c = choices[seat.index]!;
    if (c.id === 'flee') c.id = 'dodge';
  }

  const spend = (who: string, char: Character, c: Choice) => {
    const sp = spendPoints(ctx, who, char, { kind: 'pick', option: 0, cp: c.cp, fp: c.fp }, true);
    if (sp.fp) payFp(ctx, who, char);
    return sp;
  };

  for (const seat of standing) {
    const c = choices[seat.index]!;
    if (c.id !== 'dodge' && c.id !== 'attack-dodge') continue;
    const who = `seat:${seat.index}`;
    const both = c.id === 'attack-dodge';
    const sp = both ? { cpDice: 0, fp: false } : spend(who, seat.character, c);
    const code = effectiveCode(seat.character, 'dodge', pack, both ? 2 : 1, sp.fp);
    s.dodges[who] = rollAndEmit(ctx, who, 'dodge', code, sp.cpDice).total;
  }

  const resolveHit = (attackerWho: string, weaponDamage: Character['weapons'][number], targetWho: string): void => {
    const dmg = rollAndEmit(ctx, attackerWho, 'damage', weaponDamage.damage);
    const seatMatch = /^seat:(\d+)$/.exec(targetWho);
    const target: Character | Npc =
      (seatMatch ? s.seats[Number(seatMatch[1])]?.character : s.npcs.find((n) => n.uid === targetWho)) ??
      (() => {
        throw new Error(`unknown target: ${targetWho}`);
      })();
    const res = rollAndEmit(
      ctx,
      targetWho,
      'resist',
      addDice(target.attributes.physique, target.armor),
    );
    const margin = dmg.total - res.total;
    const hit = woundFromMargin(margin);
    ctx.emit({
      type: 'damage',
      target: targetWho,
      total: dmg.total,
      resist: res.total,
      margin,
      wound: hit,
    });
    if (hit === null) return;
    const from = target.wound;
    const to = applyWound(from, hit);
    if (to === from) return;
    target.wound = to;
    target.stunnedUntil = to === 'stunned' ? s.combatRound + 1 : null;
    ctx.emit({ type: 'wound', target: targetWho, from, to });
    narrate(ctx, `wound.${to}`, { target: whoName(s, targetWho) });
  };

  const liveNpcs = (): Npc[] => s.npcs.filter((n) => !npcOut(n));
  for (const id of [...s.initiative]) {
    const seatMatch = /^seat:(\d+)$/.exec(id);
    if (seatMatch) {
      const seat = s.seats[Number(seatMatch[1])];
      const c = seat && choices[seat.index];
      if (!seat || !c || isOut(seat.character.wound)) continue;
      let target: Npc | undefined;
      if (c.id === 'attack-dodge') {
        for (const n of liveNpcs()) {
          if (!target || windex(n.wound) > windex(target.wound)) target = n;
        }
      } else if (c.id.startsWith('attack:')) {
        const chosen = s.npcs.find((n) => `attack:${n.uid}` === c.id);
        target = chosen && !npcOut(chosen) ? chosen : liveNpcs()[0];
      } else {
        continue;
      }
      if (!target) continue;
      const both = c.id === 'attack-dodge';
      const weapon = seat.character.weapons[0];
      if (!weapon) continue;
      const sp = spend(id, seat.character, c);
      const code = effectiveCode(seat.character, weapon.skill, pack, both ? 2 : 1, sp.fp);
      const r = rollAndEmit(ctx, id, weapon.skill, code, sp.cpDice);
      const res = check(r, Math.max(DIFFICULTY[weapon.range], COMBAT_MIN_DIFFICULTY));
      ctx.emit({
        type: 'check',
        who: id,
        skill: weapon.skill,
        total: res.total,
        target: res.target,
        success: res.success,
        margin: res.margin,
      });
      if (res.success) resolveHit(id, weapon, target.uid);
    } else {
      const npc = s.npcs.find((n) => n.uid === id);
      if (!npc || npcOut(npc)) continue;
      const alive = standingSeats(s);
      if (alive.length === 0) continue;
      let target = alive[0]!;
      if (npc.tactic === 'attack-weakest') {
        for (const seat of alive) {
          if (windex(seat.character.wound) > windex(target.character.wound)) target = seat;
        }
      } else if (npc.tactic === 'attack-random') {
        target = alive[ctx.rng.die(alive.length) - 1]!;
      }
      const weapon = npc.weapons[0];
      if (!weapon) continue;
      const targetWho = `seat:${target.index}`;
      const code = effectiveCode(npc, weapon.skill, pack, 1, false);
      const r = rollAndEmit(ctx, npc.uid, weapon.skill, code);
      const res = check(
        r,
        Math.max(DIFFICULTY[weapon.range], s.dodges[targetWho] ?? 0, COMBAT_MIN_DIFFICULTY),
      );
      ctx.emit({
        type: 'check',
        who: npc.uid,
        skill: weapon.skill,
        total: res.total,
        target: res.target,
        success: res.success,
        margin: res.margin,
      });
      if (res.success) resolveHit(npc.uid, weapon, targetWho);
    }
  }

  const unstun = (who: string, body: Character | Npc): void => {
    if (body.wound === 'stunned' && body.stunnedUntil === s.combatRound) {
      body.wound = 'healthy';
      body.stunnedUntil = null;
      ctx.emit({ type: 'wound', target: who, from: 'stunned', to: 'healthy' });
    }
  };
  for (const seat of s.seats) unstun(`seat:${seat.index}`, seat.character);
  for (const npc of s.npcs) unstun(npc.uid, npc);

  s.window = null;
  const outcome = combatOutcome(s);
  if (outcome === 'win') return scene.combat?.win ?? null;
  if (outcome === 'lose') return scene.combat?.lose ?? null;
  return null;
}
