import type { DiceCode } from './dice.js';
import type { WoundLevel } from './tables.js';
import type { Option } from './state.js';

export type Who = string;

export type RejectReason =
  | 'seat-taken'
  | 'no-such-character'
  | 'already-seated'
  | 'not-mod'
  | 'no-check'
  | 'no-points'
  | 'not-seated';

export type Event =
  | { type: 'started'; packId: string; seed: number }
  | { type: 'paused'; reason: 'host' | 'admin' | 'offline' }
  | { type: 'resumed' }
  | { type: 'stopped' }
  | { type: 'scene-entered'; sceneId: string }
  | { type: 'window-opened'; round: number; endsAt: number; options: Option[] }
  | { type: 'declared'; seat: number; by: 'bot' | 'viewer'; option: number }
  | { type: 'vote'; sceneId: string; tally: Record<number, number>; winner: number }
  | {
      type: 'roll';
      who: Who;
      skill: string;
      code: DiceCode;
      normal: number[];
      special: number[];
      cp: number[][];
      dropped: number[];
      complication: boolean;
      total: number;
    }
  | {
      type: 'check';
      who: Who;
      skill: string;
      total: number;
      target: number;
      success: boolean;
      margin: number;
    }
  | { type: 'complication'; who: Who }
  | { type: 'initiative'; order: Who[] }
  | {
      type: 'damage';
      target: Who;
      total: number;
      resist: number;
      margin: number;
      wound: WoundLevel | null;
    }
  | { type: 'wound'; target: Who; from: WoundLevel; to: WoundLevel }
  | { type: 'points'; who: Who; kind: 'cp' | 'fp'; spent: number; left: number }
  | { type: 'seat-claimed'; seat: number; userId: string; login: string; character: string }
  | {
      type: 'seat-released';
      seat: number;
      userId: string;
      login: string;
      reason: 'leave' | 'missed' | 'kick';
    }
  | { type: 'waitlisted'; userId: string; login: string; position: number; character?: string }
  | { type: 'unwaitlisted'; userId: string }
  | { type: 'missed'; seat: number; userId: string; login: string; count: number }
  | {
      type: 'narrate';
      template: string;
      variant: number;
      vars: Record<string, string>;
      quotes: { character: string; text: string }[];
    }
  | { type: 'reply'; to: string; login: string; kind: 'sheet' | 'status' | 'characters' | 'help' }
  | { type: 'rejected'; to: string; login: string; reason: RejectReason }
  | { type: 'ignored'; reason: 'cooldown' | 'stale' | 'paused' }
  | { type: 'ended'; ending: 'victory' | 'defeat' | 'timeout'; sceneId: string }
  | { type: 'rewards'; userId: string; login: string; cp: number };
