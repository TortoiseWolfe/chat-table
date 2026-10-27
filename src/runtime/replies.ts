import { formatDiceCode } from '../engine/dice.js';
import type { Event } from '../engine/events.js';
import type { Attribute, Pack } from '../engine/pack.js';
import type { GameState } from '../engine/state.js';
import { specialDieName } from '../engine/terms.js';
import { fillTemplate } from '../gm/scene.js';
import { freeCharacters, seatOf } from '../seats/seats.js';

type Narrate = Extract<Event, { type: 'narrate' }>;

const MAX_LINE = 500;

function cut(line: string): string {
  if (line.length <= MAX_LINE) return line;
  const head = line.slice(0, 497);
  const space = head.lastIndexOf(' ');
  return (space > 0 ? head.slice(0, space) : head) + '...';
}

export function narrationLine(e: Narrate, pack: Pack): string {
  const variants = pack.templates[e.template] ?? [];
  const text = fillTemplate(variants[e.variant] ?? '', e.vars);
  return text + e.quotes.map((q) => ` ${q.character}: "${q.text}"`).join('');
}

function nameOf(who: string, s: GameState): string {
  const m = /^seat:(\d+)$/.exec(who);
  if (m) return s.seats[Number(m[1])]?.character.name ?? who;
  return s.npcs.find((n) => n.uid === who)?.name ?? who;
}

function optionsText(s: GameState, options = s.window?.options ?? []): string {
  return options.map((o) => `!${o.n} ${o.label}`).join(', ');
}

const ATTRS: [Attribute, string][] = [
  ['reflexes', 'REF'],
  ['coordination', 'COO'],
  ['physique', 'PHY'],
  ['knowledge', 'KNO'],
  ['perception', 'PER'],
  ['presence', 'PRE'],
];

function lineFor(events: Event[], i: number, s: GameState, pack: Pack): string | null {
  const e = events[i];
  if (!e) return null;
  const free = (): string => {
    const f = freeCharacters(s);
    return f.length > 0 ? f.join(', ') : "none, you'll go in line";
  };
  switch (e.type) {
    case 'rejected': {
      const at = `@${e.login}`;
      switch (e.reason) {
        case 'seat-taken':
          return `${at} that character is taken. Free: ${free()}. Type !join <name>.`;
        case 'no-such-character':
          return `${at} no character called that. Free: ${free()}. Type !characters for the list.`;
        case 'already-seated':
          return `${at} you already have a seat (or a place in line).`;
        case 'not-mod':
          return `${at} only the broadcaster and moderators can use !gm.`;
        case 'no-check':
          return `${at} nothing to roll that on right now. Options: ${optionsText(s)}.`;
        case 'no-points': {
          const p = seatOf(s, e.to)?.character.points;
          return `${at} you can't spend that now (${p?.cp ?? 0} CP, ${p?.fp ?? 0} FP left; CP and FP never on the same roll).`;
        }
        case 'not-seated':
          return `${at} you need a seat for that. Type !join.`;
      }
      return null;
    }
    case 'seat-claimed': {
      const name = s.seats[e.seat]?.character.name ?? e.character;
      return `@${e.login} you are ${name}. You act from the next round. !sheet for your character.`;
    }
    case 'seat-released': {
      const name = s.seats[e.seat]?.character.name ?? '';
      if (e.reason === 'missed') {
        return `@${e.login} ${name} went quiet for two rounds and goes back to the bot.`;
      }
      return `${name} goes back to the bot.`;
    }
    case 'waitlisted':
      return `@${e.login} all seats are full. You are number ${e.position} in line.`;
    case 'window-opened': {
      const w = s.window;
      const ms = w && w.round === e.round ? w.endsAt - w.opensAt : s.settings.declareMs;
      return `Round ${e.round}: ${optionsText(s, e.options)} (${Math.round(ms / 1000)}s to choose)`;
    }
    case 'check': {
      let prev: Event | undefined;
      for (let j = i - 1; j >= 0; j--) {
        const p = events[j];
        if (p && p.type === 'roll' && p.who === e.who) {
          prev = p;
          break;
        }
      }
      const exploded = prev && prev.type === 'roll' && prev.special.length > 1;
      const tail = exploded ? ` ${specialDieName(pack)} exploded!` : '';
      return `${nameOf(e.who, s)} rolls ${e.skill}: ${e.total} vs ${e.target}, ${e.success ? 'success' : 'failure'}.${tail}`;
    }
    case 'ended':
      return `The adventure ends: ${e.ending}. Thanks for playing!`;
    case 'rewards':
      return `@${e.login} +${e.cp} Character Points, saved for next time.`;
    case 'reply':
      switch (e.kind) {
        case 'characters': {
          const list = s.seats
            .map(
              (seat) =>
                `${seat.character.name} (${seat.character.concept}, ${seat.holder.kind === 'bot' ? 'free' : 'taken'})`
            )
            .join('; ');
          return `Characters: ${list}. Type !join <name>.`;
        }
        case 'sheet': {
          const seat = seatOf(s, e.to);
          if (!seat) return `@${e.login} you need a seat for that. Type !join.`;
          const c = seat.character;
          const attrs = ATTRS.map(([k, abbr]) => `${abbr} ${formatDiceCode(c.attributes[k])}`).join(
            ', '
          );
          const skills = c.skills.map((sk) => `${sk.name} ${formatDiceCode(sk.code)}`).join(', ');
          const wound = c.wound.replace(/-/g, ' ');
          const woundText = wound.charAt(0).toUpperCase() + wound.slice(1);
          return `@${e.login} ${c.name}: ${attrs}. Skills: ${skills}. ${woundText}. ${c.points.cp} CP, ${c.points.fp} FP.`;
        }
        case 'status': {
          const seats = s.seats
            .map(
              (seat) =>
                `${seat.character.name} (${seat.holder.kind === 'viewer' ? seat.holder.login : 'bot'})`
            )
            .join(', ');
          return `Scene: ${s.sceneId ?? 'none'}, round ${s.round}/${pack.adventure.roundLimit}. Seats: ${seats}. In line: ${s.waitlist.length}.`;
        }
        case 'help':
          return 'Play from chat: !join, !1-!9 to choose, !roll <skill>, !say <line>, !cp, !fp, !sheet, !status, !leave.';
      }
      return null;
    default:
      return null;
  }
}

export function replyLines(events: Event[], state: GameState, pack: Pack): string[] {
  const out: string[] = [];
  events.forEach((_, i) => {
    const line = lineFor(events, i, state, pack);
    if (line !== null) out.push(cut(line));
  });
  return out;
}

export interface ChatItem {
  line: string;
  narrate: Narrate | null;
}

/** Chat lines in event order; a narrate event carries its event so a narrator can reword it. */
export function chatItems(events: Event[], state: GameState, pack: Pack): ChatItem[] {
  const out: ChatItem[] = [];
  events.forEach((e, i) => {
    const line = e.type === 'narrate' ? narrationLine(e, pack) : lineFor(events, i, state, pack);
    if (line !== null) out.push({ line: cut(line), narrate: e.type === 'narrate' ? e : null });
  });
  return out;
}

export function chatLines(events: Event[], state: GameState, pack: Pack): string[] {
  return chatItems(events, state, pack).map((item) => item.line);
}

export { cut as cutLine };
