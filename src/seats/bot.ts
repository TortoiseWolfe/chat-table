import type { Declaration, GameState } from '../engine/state.js';
import type { Pack } from '../engine/pack.js';
import { WOUND_ORDER } from '../engine/tables.js';

function windex(level: (typeof WOUND_ORDER)[number]): number {
  return WOUND_ORDER.indexOf(level);
}

export function botDeclaration(s: GameState, seatIndex: number, pack: Pack): Declaration {
  const seat = s.seats[seatIndex];
  const window = s.window;
  if (!seat || !window) {
    return { kind: 'default' };
  }
  const bot = seat.character.bot;
  const options = window.options;
  const pick = (id: string | undefined): number | undefined =>
    id === undefined ? undefined : options.find((o) => o.id === id)?.n;

  if (s.phase !== 'combat') {
    const scene = pack.adventure.scenes.find((sc) => sc.id === s.sceneId);
    const preferred = bot.prefer.find((id) => options.some((o) => o.id === id));
    const chosenId = preferred ?? scene?.default ?? options[0]?.id;
    const option = pick(chosenId) ?? 1;
    const choice = scene?.choices?.find((c) => c.id === chosenId);
    const cp = bot.spendCp === 'on-checks' && choice?.check && seat.character.points.cp >= 1 ? 1 : 0;
    return { kind: 'pick', option, cp, fp: false };
  }

  const live = s.npcs.filter((n) => windex(n.wound) < windex(n.outAt));
  let target = live[0];
  if (bot.combat === 'attack-weakest') {
    for (const n of live) {
      if (target && windex(n.wound) > windex(target.wound)) target = n;
    }
  } else if (bot.combat === 'attack-strongest') {
    for (const n of live) {
      if (target && windex(n.wound) < windex(target.wound)) target = n;
    }
  }
  const dodgeOption = pick('dodge') ?? 1;
  const option =
    bot.combat === 'dodge' || !target ? dodgeOption : (pick(`attack:${target.uid}`) ?? dodgeOption);
  const cp =
    bot.spendCp === 'when-out-of-options' &&
    windex(seat.character.wound) >= windex('wounded') &&
    seat.character.points.cp >= 1
      ? 1
      : 0;
  return { kind: 'pick', option, cp, fp: false };
}
