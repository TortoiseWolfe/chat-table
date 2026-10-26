import type { GmCtx } from '../engine/ctx.js';
import type { DiceCode } from '../engine/dice.js';
import { doubleDice, minusDice } from '../engine/dice.js';
import { check, multiActionPenalty, skillCode } from '../engine/checks.js';
import type { Character, Npc, Pack } from '../engine/pack.js';
import { rollCode, type RollResult } from '../engine/roll.js';
import type { Declaration, GameState, Option, Seat } from '../engine/state.js';
import { DIFFICULTY, WOUND_PENALTY } from '../engine/tables.js';
import { isOut } from '../engine/wounds.js';
import { botDeclaration } from '../seats/bot.js';
import { releaseSeat } from '../seats/seats.js';
import { narrate, sceneById } from './scene.js';

export function effectiveCode(
  char: Character | Npc,
  skill: string,
  pack: Pack,
  actions: number,
  fp: boolean,
): DiceCode {
  const base = skillCode(char as Character, skill, (name) =>
    pack.skills.find((sk) => sk.name === name)?.attribute,
  );
  const code = fp ? doubleDice(base) : base;
  return minusDice(code, WOUND_PENALTY[char.wound] + multiActionPenalty(actions));
}

export function standingSeats(s: GameState): Seat[] {
  return s.phase === 'combat' ? s.seats.filter((seat) => !isOut(seat.character.wound)) : s.seats;
}

function activeViewer(seat: Seat, round: number): boolean {
  return seat.holder.kind === 'viewer' && seat.holder.activeFromRound <= round;
}

export function openWindow(ctx: GmCtx, options: Option[]): void {
  const { s } = ctx;
  s.round += 1;
  s.window = {
    round: s.round,
    opensAt: ctx.at,
    endsAt: ctx.at + s.settings.declareMs,
    options,
  };
  s.declarations = {};
  ctx.emit({ type: 'window-opened', round: s.round, endsAt: s.window.endsAt, options });
  for (const seat of standingSeats(s)) {
    if (seat.holder.kind === 'bot' || seat.holder.activeFromRound > s.round) {
      const decl = botDeclaration(s, seat.index, ctx.pack);
      s.declarations[seat.index] = decl;
      ctx.emit({
        type: 'declared',
        seat: seat.index,
        by: 'bot',
        option: decl.kind === 'pick' ? decl.option : 0,
      });
    }
  }
}

export function windowShouldClose(s: GameState, at: number): boolean {
  const w = s.window;
  if (!w) return false;
  if (at >= w.endsAt) return true;
  const allDeclared = standingSeats(s).every((seat) => s.declarations[seat.index] !== undefined);
  return allDeclared && s.seats.some((seat) => activeViewer(seat, w.round));
}

export function settleDeclarations(ctx: GmCtx): void {
  const { s } = ctx;
  const round = s.window?.round ?? s.round;
  for (const seat of standingSeats(s)) {
    const i = seat.index;
    const active = activeViewer(seat, round);
    if (s.declarations[i] !== undefined) {
      if (active) seat.missed = 0;
      continue;
    }
    if (active && seat.holder.kind === 'viewer') {
      seat.missed += 1;
      ctx.emit({
        type: 'missed',
        seat: i,
        userId: seat.holder.userId,
        login: seat.holder.login,
        count: seat.missed,
      });
      s.declarations[i] = { kind: 'default' };
      if (seat.missed >= s.settings.missedLimit) {
        releaseSeat(ctx, i, 'missed');
      }
    } else {
      const decl = botDeclaration(s, i, ctx.pack);
      s.declarations[i] = decl;
      ctx.emit({
        type: 'declared',
        seat: i,
        by: 'bot',
        option: decl.kind === 'pick' ? decl.option : 0,
      });
    }
  }
}

export function spendPoints(
  ctx: GmCtx,
  who: string,
  char: Character,
  decl: Declaration | undefined,
  allowFp: boolean,
): { cpDice: number; fp: boolean } {
  if (!decl || decl.kind !== 'pick') return { cpDice: 0, fp: false };
  const cp = Math.min(decl.cp, char.points.cp);
  if (cp > 0) {
    char.points.cp -= cp;
    ctx.emit({ type: 'points', who, kind: 'cp', spent: cp, left: char.points.cp });
    return { cpDice: cp, fp: false };
  }
  return { cpDice: 0, fp: allowFp && decl.fp && char.points.fp >= 1 };
}

export function payFp(ctx: GmCtx, who: string, char: Character): void {
  char.points.fp -= 1;
  ctx.emit({ type: 'points', who, kind: 'fp', spent: 1, left: char.points.fp });
}

export function rollAndEmit(
  ctx: GmCtx,
  who: string,
  skill: string,
  code: DiceCode,
  cpDice = 0,
): RollResult {
  const r = rollCode(code, { cpDice, specialOne: ctx.s.settings.specialOne }, ctx.rng);
  ctx.emit({
    type: 'roll',
    who,
    skill,
    code: r.code,
    normal: r.normal,
    special: r.special,
    cp: r.cp,
    dropped: r.dropped,
    complication: r.complication,
    total: r.total,
  });
  return r;
}

export function closeSceneWindow(ctx: GmCtx): string {
  const { s, pack } = ctx;
  settleDeclarations(ctx);
  const scene = sceneById(pack, s.sceneId ?? '');
  const options = s.window?.options ?? [];
  const optionOf = (d: Declaration | undefined): number => {
    if (d && d.kind === 'pick') return d.option;
    return options.find((o) => o.id === scene.default)?.n ?? 1;
  };
  const tally: Record<number, number> = {};
  const lowestVoter: Record<number, number> = {};
  for (const seat of s.seats) {
    const n = optionOf(s.declarations[seat.index]);
    tally[n] = (tally[n] ?? 0) + 1;
    lowestVoter[n] ??= seat.index;
  }
  let winner = 0;
  for (const key of Object.keys(tally)) {
    const n = Number(key);
    if (
      winner === 0 ||
      tally[n]! > tally[winner]! ||
      (tally[n] === tally[winner] && lowestVoter[n]! < lowestVoter[winner]!)
    ) {
      winner = n;
    }
  }
  ctx.emit({ type: 'vote', sceneId: scene.id, tally, winner });
  s.window = null;

  const optionId = options.find((o) => o.n === winner)?.id;
  const choice = scene.choices?.find((c) => c.id === optionId);
  if (!choice) throw new Error(`no choice for option ${winner}`);
  if (!choice.check) return choice.next ?? '';

  const { skill, difficulty, success, failure } = choice.check;
  let roller: Seat | undefined;
  let best = -1;
  for (const seat of s.seats) {
    if (optionOf(s.declarations[seat.index]) !== winner) continue;
    const code = effectiveCode(seat.character, skill, pack, 1, false);
    const score = code.dice * 3 + code.pips;
    if (score > best) {
      best = score;
      roller = seat;
    }
  }
  if (!roller) throw new Error('no roller');
  const who = `seat:${roller.index}`;
  const char = roller.character;
  const decl = s.declarations[roller.index];
  const spent = spendPoints(ctx, who, char, decl, true);
  if (spent.fp) payFp(ctx, who, char);
  const code = effectiveCode(char, skill, pack, 1, spent.fp);
  const r = rollAndEmit(ctx, who, skill, code, spent.cpDice);
  const target = typeof difficulty === 'number' ? difficulty : DIFFICULTY[difficulty];
  const res = check(r, target);
  ctx.emit({
    type: 'check',
    who,
    skill,
    total: res.total,
    target: res.target,
    success: res.success,
    margin: res.margin,
  });
  const vars = { character: char.name, skill };
  if (r.complication) {
    ctx.emit({ type: 'complication', who });
    narrate(ctx, 'check.complication', vars);
  }
  narrate(ctx, res.success ? 'check.success' : 'check.failure', vars);
  return res.success ? success : failure;
}
