import type { Event } from '../engine/events.js';
import type { Pack } from '../engine/pack.js';
import type { GameState } from '../engine/state.js';
import { WOUND_ORDER, type WoundLevel } from '../engine/tables.js';
import { specialDieName } from '../engine/terms.js';
import type { LogLine } from '../runtime/log.js';
import { chatItems } from '../runtime/replies.js';

export interface OverlayView {
  scene: { id: string; map: string | null };
  round: number;
  roundLimit: number;
  window: { endsAt: number; options: { n: number; label: string }[] } | null;
  phase: GameState['phase'];
  tokens: {
    who: string;
    name: string;
    art: string | null;
    holder: string; // 'bot', or the viewer's login
    wound: WoundLevel;
    woundIndex: number;
    out: boolean;
  }[];
  initiative: { who: string; name: string; current: boolean }[];
  feed: { seq: number; text: string }[];
  dice: {
    who: string;
    skill: string;
    normal: number[];
    special: number[];
    cp: number[][];
    dropped: number[];
    total: number;
    target: number | null;
    success: boolean | null;
  } | null;
  specialDieName: string;
}

const FEED_LINES = 8;
const SEAT_OUT_AT: WoundLevel = 'incapacitated';

const woundIndex = (w: WoundLevel): number => WOUND_ORDER.indexOf(w);

function assetUrl(kind: 'map' | 'art', pack: Pack, key: string | undefined): string | null {
  if (key === undefined || !Object.hasOwn(pack.assets[kind], key)) return null;
  return `/overlay/assets/${kind}/${encodeURIComponent(key)}`;
}

/** The event inside a log line (the log's `round` is kept: window-opened carries its own). */
function asEvent(line: LogLine): Event {
  const fields = Object.entries(line).filter(([k]) => k !== 'seq' && k !== 'at');
  return Object.fromEntries(fields) as unknown as Event;
}

export function toView(state: GameState, pack: Pack, recent: LogLine[]): OverlayView {
  const scene = pack.adventure.scenes.find((s) => s.id === state.sceneId);
  const nameOf = (who: string): string => {
    const m = /^seat:(\d+)$/.exec(who);
    if (m) return state.seats[Number(m[1])]?.character.name ?? who;
    return state.npcs.find((n) => n.uid === who)?.name ?? who;
  };

  const tokens: OverlayView['tokens'] = state.seats.map((seat) => ({
    who: `seat:${String(seat.index)}`,
    name: seat.character.name,
    art: assetUrl('art', pack, seat.character.id),
    holder: seat.holder.kind === 'bot' ? 'bot' : seat.holder.login,
    wound: seat.character.wound,
    woundIndex: woundIndex(seat.character.wound),
    out: woundIndex(seat.character.wound) >= woundIndex(SEAT_OUT_AT),
  }));
  for (const npc of state.npcs) {
    const out = woundIndex(npc.wound) >= woundIndex(npc.outAt);
    if (out) continue;
    tokens.push({
      who: npc.uid,
      name: npc.name,
      art: assetUrl('art', pack, npc.id),
      holder: 'bot',
      wound: npc.wound,
      woundIndex: woundIndex(npc.wound),
      out,
    });
  }

  const live = new Set(tokens.filter((t) => !t.out).map((t) => t.who));
  const order = state.initiative.filter((who) => live.has(who));
  const initiative = order.map((who, i) => ({
    who,
    name: nameOf(who),
    current: state.phase === 'combat' && i === 0,
  }));

  const feed: OverlayView['feed'] = [];
  for (const line of recent) {
    const event = asEvent(line);
    for (const item of chatItems([event], state, pack))
      feed.push({ seq: line.seq, text: item.line });
  }

  let dice: OverlayView['dice'] = null;
  for (let i = recent.length - 1; i >= 0; i--) {
    const line = recent[i];
    if (line?.type !== 'roll') continue;
    const roll = asEvent(line) as Extract<Event, { type: 'roll' }>;
    const next = recent.slice(i + 1).find((l) => l.type === 'check');
    const check = next ? (asEvent(next) as Extract<Event, { type: 'check' }>) : null;
    const matches = check !== null && check.who === roll.who && check.skill === roll.skill;
    dice = {
      who: roll.who,
      skill: roll.skill,
      normal: roll.normal,
      special: roll.special,
      cp: roll.cp,
      dropped: roll.dropped,
      total: roll.total,
      target: matches ? check.target : null,
      success: matches ? check.success : null,
    };
    break;
  }

  return {
    scene: { id: scene?.id ?? '', map: assetUrl('map', pack, scene?.map) },
    round: state.round,
    roundLimit: pack.adventure.roundLimit,
    window: state.window
      ? {
          endsAt: state.window.endsAt,
          options: state.window.options.map((o) => ({ n: o.n, label: o.label })),
        }
      : null,
    phase: state.phase,
    tokens,
    initiative,
    feed: feed.slice(-FEED_LINES),
    dice,
    specialDieName: specialDieName(pack),
  };
}
