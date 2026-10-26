import type { Actor, AdminAction, Command } from '../engine/commands.js';

export interface ChatMessage {
  messageId: string;
  userId: string;
  login: string;
  text: string;
  isMod: boolean;
  isBroadcaster: boolean;
  at: number;
  sourceChannelId: string | null;
}

const QUERIES = ['sheet', 'status', 'characters', 'help'] as const;
const ACTIONS: readonly AdminAction[] = ['start', 'pause', 'stop', 'skip'];

export function parseCommand(msg: ChatMessage): Command | null {
  const text = msg.text.trim();
  if (!text.startsWith('!')) return null;
  const m = /^!(\S+)\s*([\s\S]*)$/.exec(text);
  if (!m) return null;
  const word = (m[1] ?? '').toLowerCase();
  const rest = m[2] ?? '';
  const args = rest.split(/\s+/).filter((a) => a !== '');
  const actor: Actor = {
    userId: msg.userId,
    login: msg.login,
    isMod: msg.isMod,
    isBroadcaster: msg.isBroadcaster,
  };
  const at = msg.at;

  if (/^[1-9]$/.test(word)) return { type: 'pick', at, actor, option: Number(word) };

  switch (word) {
    case 'join': {
      const name = args[0];
      return name === undefined
        ? { type: 'join', at, actor }
        : { type: 'join', at, actor, character: name.toLowerCase() };
    }
    case 'leave':
      return { type: 'leave', at, actor };
    case 'fp':
      return { type: 'fp', at, actor };
    case 'roll': {
      const skill = rest.trim().toLowerCase();
      return skill === '' ? null : { type: 'roll', at, actor, skill };
    }
    case 'say': {
      const said = rest.trim().slice(0, 200);
      return said === '' ? null : { type: 'say', at, actor, text: said };
    }
    case 'cp': {
      if (args.length === 0) return { type: 'cp', at, actor, count: 1 };
      if (args.length === 1 && /^[1-9]$/.test(args[0] ?? '')) {
        return { type: 'cp', at, actor, count: Number(args[0]) };
      }
      return null;
    }
    case 'gm': {
      const action = (args[0] ?? '').toLowerCase();
      if (action === 'kick') {
        const target = (args[1] ?? '').replace(/^@/, '').toLowerCase();
        return target === '' ? null : { type: 'admin', at, actor, action: 'kick', target };
      }
      const found = ACTIONS.find((a) => a === action);
      return found ? { type: 'admin', at, actor, action: found } : null;
    }
    default: {
      const what = QUERIES.find((q) => q === word);
      return what ? { type: 'query', at, actor, what } : null;
    }
  }
}
