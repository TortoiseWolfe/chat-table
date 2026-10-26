import type { DiceCode } from './dice.js';
import type { Difficulty, WoundLevel } from './tables.js';
import type { Points } from './points.js';

export type Attribute =
  | 'reflexes'
  | 'coordination'
  | 'physique'
  | 'knowledge'
  | 'perception'
  | 'presence';

export interface Skill {
  name: string;
  attribute: Attribute;
  code: DiceCode;
}

export interface Weapon {
  id: string;
  name: string;
  skill: string;
  damage: DiceCode;
  range: Difficulty;
}

export interface BotScript {
  prefer: string[];
  combat: 'attack-weakest' | 'attack-strongest' | 'attack-first' | 'dodge';
  spendCp: 'never' | 'when-out-of-options' | 'on-checks';
}

export interface Character {
  id: string;
  name: string;
  pronouns: string;
  concept: string;
  attributes: Record<Attribute, DiceCode>;
  skills: Skill[];
  weapons: Weapon[];
  armor: DiceCode;
  wound: WoundLevel;
  stunnedUntil: number | null;
  points: Points;
  advances: Record<string, string>;
  bot: BotScript;
}

export interface NpcTemplate {
  id: string;
  name: string;
  attributes: Record<Attribute, DiceCode>;
  skills: Skill[];
  weapons: Weapon[];
  armor: DiceCode;
  outAt: WoundLevel;
  tactic: 'attack-weakest' | 'attack-random' | 'attack-first';
}

export interface Npc extends NpcTemplate {
  uid: string;
  wound: WoundLevel;
  stunnedUntil: number | null;
}

export interface Choice {
  id: string;
  label: string;
  next?: string;
  check?: {
    skill: string;
    difficulty: Difficulty | number;
    success: string;
    failure: string;
  };
}

export interface Scene {
  id: string;
  template: string;
  facts: Record<string, string>;
  map?: string;
  choices?: Choice[];
  default?: string;
  combat?: {
    npcs: { npc: string; count: number }[];
    win: string;
    lose: string;
    flee?: string;
  };
  ending?: 'victory' | 'defeat' | 'timeout';
}

export interface Adventure {
  start: string;
  roundLimit: number;
  rewards: {
    victory: number;
    defeat: number;
    timeout: number;
  };
  scenes: Scene[];
}

export interface Pack {
  id: string;
  name: string;
  version: string;
  licence: string;
  terms?: { specialDie?: string };
  skills: { name: string; attribute: Attribute }[];
  characters: Character[];
  npcs: NpcTemplate[];
  adventure: Adventure;
  templates: Record<string, string[]>;
  assets: {
    map: Record<string, string>;
    art: Record<string, string>;
    sounds: Record<string, string>;
  };
}
