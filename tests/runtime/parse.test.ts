import { describe, expect, it } from 'vitest';
import { parseCommand, type ChatMessage } from '../../src/runtime/parse.js';

function msg(text: string): ChatMessage {
  return {
    messageId: 'm1',
    userId: 'u1',
    login: 'viewer1',
    text,
    isMod: false,
    isBroadcaster: false,
    at: 1234,
    sourceChannelId: null,
  };
}

const actor = { userId: 'u1', login: 'viewer1', isMod: false, isBroadcaster: false };
const at = 1234;

describe('parseCommand', () => {
  it.each([
    ['!join', { type: 'join', at, actor }],
    ['!join kestrel', { type: 'join', at, actor, character: 'kestrel' }],
    ['!leave', { type: 'leave', at, actor }],
    ['!sheet', { type: 'query', at, actor, what: 'sheet' }],
    ['!status', { type: 'query', at, actor, what: 'status' }],
    ['!characters', { type: 'query', at, actor, what: 'characters' }],
    ['!help', { type: 'query', at, actor, what: 'help' }],
    ['!1', { type: 'pick', at, actor, option: 1 }],
    ['!9', { type: 'pick', at, actor, option: 9 }],
    ['!roll piloting', { type: 'roll', at, actor, skill: 'piloting' }],
    ['!say Hold the line!', { type: 'say', at, actor, text: 'Hold the line!' }],
    ['!cp', { type: 'cp', at, actor, count: 1 }],
    ['!cp 2', { type: 'cp', at, actor, count: 2 }],
    ['!fp', { type: 'fp', at, actor }],
    ['!gm start', { type: 'admin', at, actor, action: 'start' }],
    ['!gm pause', { type: 'admin', at, actor, action: 'pause' }],
    ['!gm stop', { type: 'admin', at, actor, action: 'stop' }],
    ['!gm skip', { type: 'admin', at, actor, action: 'skip' }],
    ['!gm kick somelogin', { type: 'admin', at, actor, action: 'kick', target: 'somelogin' }],
  ])('%s', (text, expected) => {
    expect(parseCommand(msg(text))).toEqual(expected);
  });

  it('handles the odd cases', () => {
    expect(parseCommand(msg('hello'))).toBeNull();
    expect(parseCommand(msg(' !JOIN Kestrel '))).toEqual({
      type: 'join', at, actor, character: 'kestrel',
    });
    expect(parseCommand(msg('!0'))).toBeNull();
    expect(parseCommand(msg('!10'))).toBeNull();
    expect(parseCommand(msg('!roll'))).toBeNull();
    expect(parseCommand(msg('!cp 0'))).toBeNull();
    expect(parseCommand(msg('!cp two'))).toBeNull();
    expect(parseCommand(msg('!gm kick @SomeOne'))).toMatchObject({ target: 'someone' });
    expect(parseCommand(msg('!gm kick'))).toBeNull();
    const say = parseCommand(msg('!say ' + 'x'.repeat(300)));
    expect(say && say.type === 'say' ? say.text.length : -1).toBe(200);
    expect(parseCommand(msg('!dance'))).toBeNull();
  });
});
