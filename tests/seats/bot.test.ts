import { describe, expect, it } from 'vitest';
import { botDeclaration } from '../../src/seats/bot.js';
import { DEFAULT_SETTINGS, initialState } from '../../src/engine/state.js';
import type { BotScript } from '../../src/engine/pack.js';
import { tinyPack } from '../helpers/tinyPack.js';

function sceneState(bot: Partial<BotScript>) {
  const pack = tinyPack();
  const s = initialState(pack, 1, DEFAULT_SETTINGS);
  s.phase = 'scene';
  s.sceneId = 'start';
  s.window = {
    round: 1,
    opensAt: 0,
    endsAt: 60000,
    options: [
      { n: 1, id: 'go', label: 'Walk in' },
      { n: 2, id: 'sneak', label: 'Sneak past' },
    ],
  };
  Object.assign(s.seats[0]!.character.bot, bot);
  return { s, pack };
}

function combatState(bot: Partial<BotScript>) {
  const pack = tinyPack();
  const s = initialState(pack, 1, DEFAULT_SETTINGS);
  s.phase = 'combat';
  s.sceneId = 'fight';
  const template = pack.npcs[0]!;
  s.npcs = [
    { ...structuredClone(template), uid: 'grunt#1', wound: 'healthy', stunnedUntil: null, outAt: 'incapacitated' },
    { ...structuredClone(template), uid: 'grunt#2', wound: 'stunned', stunnedUntil: 1, outAt: 'incapacitated' },
  ];
  s.window = {
    round: 1,
    opensAt: 0,
    endsAt: 60000,
    options: [
      { n: 1, id: 'attack:grunt#1', label: 'Attack Grunt 1' },
      { n: 2, id: 'attack:grunt#2', label: 'Attack Grunt 2' },
      { n: 3, id: 'dodge', label: 'Dodge' },
      { n: 4, id: 'attack-dodge', label: 'Attack and dodge' },
    ],
  };
  Object.assign(s.seats[0]!.character.bot, bot);
  return { s, pack };
}

describe('botDeclaration, scene', () => {
  it('takes the first preferred option', () => {
    const { s, pack } = sceneState({ prefer: ['go'] });
    expect(botDeclaration(s, 0, pack)).toEqual({ kind: 'pick', option: 1, cp: 0, fp: false });
  });

  it('spends cp on checks', () => {
    const { s, pack } = sceneState({ prefer: ['nope', 'sneak'], spendCp: 'on-checks' });
    expect(botDeclaration(s, 0, pack)).toEqual({ kind: 'pick', option: 2, cp: 1, fp: false });
    s.seats[0]!.character.points.cp = 0;
    expect(botDeclaration(s, 0, pack)).toEqual({ kind: 'pick', option: 2, cp: 0, fp: false });
  });

  it('falls back to the default choice', () => {
    const { s, pack } = sceneState({ prefer: [] });
    expect(botDeclaration(s, 0, pack)).toEqual({ kind: 'pick', option: 1, cp: 0, fp: false });
  });
});

describe('botDeclaration, combat', () => {
  const opt = (bot: Partial<BotScript>) => {
    const { s, pack } = combatState(bot);
    const d = botDeclaration(s, 0, pack);
    return d.kind === 'pick' ? d.option : 0;
  };

  it('picks a target by style', () => {
    expect(opt({ combat: 'attack-first' })).toBe(1);
    expect(opt({ combat: 'attack-weakest' })).toBe(2);
    expect(opt({ combat: 'attack-strongest' })).toBe(1);
    expect(opt({ combat: 'dodge' })).toBe(3);
  });

  it('skips an out npc', () => {
    const { s, pack } = combatState({ combat: 'attack-first' });
    s.npcs[0]!.wound = 'incapacitated';
    expect(botDeclaration(s, 0, pack)).toMatchObject({ option: 2 });
  });

  it('spends cp when out of options', () => {
    const { s, pack } = combatState({ spendCp: 'when-out-of-options' });
    s.seats[0]!.character.wound = 'wounded';
    expect(botDeclaration(s, 0, pack)).toMatchObject({ cp: 1 });
    s.seats[0]!.character.wound = 'stunned';
    expect(botDeclaration(s, 0, pack)).toMatchObject({ cp: 0 });
  });
});
