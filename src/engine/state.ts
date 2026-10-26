import type { SpecialOneRule } from './roll.js';
import type { Points } from './points.js';
import type { RngState } from './rng.js';
import type { Character, Npc, Pack } from './pack.js';

export type Holder =
  | { kind: 'bot' }
  | { kind: 'viewer'; userId: string; login: string; activeFromRound: number };

export interface Seat {
  index: 0 | 1 | 2 | 3;
  character: Character;
  holder: Holder;
  missed: number;
}

export interface WaitEntry {
  userId: string;
  login: string;
  character?: string;
}

export interface ViewerRecord {
  characters: Record<
    string,
    {
      points: Points;
      advances: Record<string, string>;
    }
  >;
}

export type Phase = 'idle' | 'scene' | 'combat' | 'paused' | 'ended';

export type Declaration =
  | { kind: 'pick'; option: number; cp: number; fp: boolean }
  | { kind: 'default' };

export interface Window {
  round: number;
  opensAt: number;
  endsAt: number;
  options: Option[];
}

export interface Option {
  n: number;
  id: string;
  label: string;
}

export interface Settings {
  declareMs: number;
  cooldownMs: number;
  missedLimit: number;
  cpPerRollMax: number;
  specialOne: SpecialOneRule;
}

export interface GameState {
  version: 1;
  packId: string;
  settings: Settings;
  phase: Phase;
  pausedFrom: Exclude<Phase, 'paused'> | null;
  sceneId: string | null;
  round: number;
  window: Window | null;
  declarations: Record<number, Declaration>;
  quotes: Record<number, string>;
  dodges: Record<string, number>;
  seats: Seat[];
  npcs: Npc[];
  initiative: string[];
  combatRound: number;
  waitlist: WaitEntry[];
  cooldowns: Record<string, number>;
  viewers: Record<string, ViewerRecord>;
  rng: RngState;
  seq: number;
  ending: 'victory' | 'defeat' | 'timeout' | null;
}

export const DEFAULT_SETTINGS: Settings = {
  declareMs: 60000,
  cooldownMs: 3000,
  missedLimit: 2,
  cpPerRollMax: 2,
  specialOne: 'drop-highest',
};

export function initialState(
  pack: Pack,
  seed: number,
  settings: Settings,
  viewers: Record<string, ViewerRecord> = {}
): GameState {
  const seats: Seat[] = pack.characters.slice(0, 4).map((c, i) => {
    const character = structuredClone(c);
    character.wound = 'healthy';
    character.stunnedUntil = null;
    return {
      index: i as 0 | 1 | 2 | 3,
      character,
      holder: { kind: 'bot' },
      missed: 0,
    };
  });

  return {
    version: 1,
    packId: pack.id,
    settings,
    phase: 'idle',
    pausedFrom: null,
    sceneId: null,
    round: 0,
    window: null,
    declarations: {},
    quotes: {},
    dodges: {},
    seats,
    npcs: [],
    initiative: [],
    combatRound: 0,
    waitlist: [],
    cooldowns: {},
    viewers,
    rng: { seed, counter: 0 },
    seq: 0,
    ending: null,
  };
}
