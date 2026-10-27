import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/engine/state.js';
import type { Narrator } from '../../src/narrator/narrator.js';
import type { Deps } from '../../src/runtime/deps.js';
import type { ChatMessage } from '../../src/runtime/parse.js';
import { createSession } from '../../src/runtime/session.js';
import { createStore } from '../../src/runtime/store.js';
import { FakeClock } from '../../src/sim/clock.js';
import { memFs } from '../helpers/memfs.js';
import { tinyPack } from '../helpers/tinyPack.js';

const START = 1793000000000;

function setup(fs = memFs(), clock = new FakeClock(START), narrator?: Narrator) {
  const logs: string[] = [];
  const sent: string[] = [];
  const deps: Deps = {
    now: () => clock.now(),
    setTimer: (fn, ms) => clock.setTimer(fn, ms),
    clearTimer: (id) => clock.clearTimer(id as number),
    fs,
    fetch: () => {
      throw new Error('no network in tests');
    },
    log: (level, msg) => logs.push(`${level}: ${msg}`),
    randomSeed: () => 1,
    randomBytes: (n) => new Uint8Array(n),
  };
  const session = createSession({
    deps,
    pack: tinyPack(),
    settings: DEFAULT_SETTINGS,
    seed: 1,
    store: createStore(fs, '/d', (level, message, fields) => deps.log(level, message, fields)),
    send: (line) => {
      sent.push(line);
      return Promise.resolve();
    },
    botUserId: 'bot',
    channelId: 'chan',
    ...(narrator ? { narrator } : {}),
  });
  const msg = (over: Partial<ChatMessage> = {}): ChatMessage => ({
    messageId: 'm1',
    userId: 'u1',
    login: 'viewer1',
    text: '!join ana',
    isMod: false,
    isBroadcaster: false,
    at: clock.now(),
    sourceChannelId: null,
    ...over,
  });
  const logLines = (): number =>
    (fs.files.get('/d/events.jsonl') ?? '').split('\n').filter(Boolean).length;
  return { fs, clock, session, sent, logs, msg, logLines };
}

describe('createSession', () => {
  it('sends the opening narration and logs every event of the start', async () => {
    const t = setup();
    await t.session.start();
    await t.session.host('start');
    expect(t.sent).toContain('scene.start line');
    expect(t.logLines()).toBe(8);
  });

  it('answers a !join with one line and one more log line', async () => {
    const t = setup();
    await t.session.start();
    await t.session.host('start');
    const sentBefore = t.sent.length;
    const logBefore = t.logLines();
    await t.session.chat(t.msg());
    expect(t.sent).toHaveLength(sentBefore + 1);
    expect(t.logLines()).toBe(logBefore + 1);
  });

  it('handles a repeated message id once, and drops the bot and other channels', async () => {
    const t = setup();
    await t.session.start();
    await t.session.host('start');
    await t.session.chat(t.msg());
    const sent = t.sent.length;
    await t.session.chat(t.msg());
    await t.session.chat(t.msg({ messageId: 'm2', userId: 'bot' }));
    await t.session.chat(t.msg({ messageId: 'm3', userId: 'u3', sourceChannelId: 'other' }));
    expect(t.sent).toHaveLength(sent);
  });

  it('closes the window when the clock reaches its end', async () => {
    const t = setup();
    await t.session.start();
    await t.session.host('start');
    t.clock.advanceTo(START + DEFAULT_SETTINGS.declareMs);
    await t.session.idle();
    expect(t.fs.files.get('/d/events.jsonl')).toContain('"type":"vote"');
  });

  it('reopens the window after a restart', async () => {
    const fs = memFs();
    const first = setup(fs);
    await first.session.start();
    await first.session.host('start');
    const round = (JSON.parse(fs.files.get('/d/state.json')!) as { state: { round: number } }).state
      .round;

    const later = START + 300_000;
    const second = setup(fs, new FakeClock(later));
    await second.session.start();
    second.clock.advanceTo(later + DEFAULT_SETTINGS.declareMs - 1);
    await second.session.idle();
    expect(fs.files.get('/d/events.jsonl')).not.toContain('"type":"vote"');
    second.clock.advanceTo(later + DEFAULT_SETTINGS.declareMs);
    await second.session.idle();
    const vote = (fs.files.get('/d/events.jsonl') ?? '')
      .split('\n')
      .filter((l) => l.includes('"type":"vote"'));
    expect(vote).toHaveLength(1);
    expect((JSON.parse(vote[0]!) as { round: number }).round).toBe(round);
  });

  it('with a narrator, a slow narration never lets a later line overtake it or hold the queue', async () => {
    let release: (text: string) => void = () => undefined;
    const calls: string[] = [];
    const narrator: Narrator = {
      narrate: (input) => {
        calls.push(input.template);
        return calls.length === 1
          ? new Promise<string>((resolve) => {
              release = resolve;
            })
          : Promise.resolve(input.fallback);
      },
    };
    const t = setup(memFs(), new FakeClock(START), narrator);
    await t.session.start();
    await t.session.host('start');
    await t.session.chat(t.msg());
    await t.session.chat(
      t.msg({ messageId: 'm2', userId: 'u2', login: 'viewer2', text: '!status' })
    );
    expect(t.sent).toEqual([]);
    expect(t.logLines()).toBeGreaterThan(8);
    release('The first scene, reworded.');
    await t.session.idle();
    expect(t.sent[0]).toBe('The first scene, reworded.');
    expect(t.sent.length).toBeGreaterThan(1);
  });

  it('pauses and saves when told the stream went offline', async () => {
    const t = setup();
    await t.session.start();
    await t.session.host('start');
    await t.session.offline();
    expect(t.session.state()?.phase).toBe('paused');
    expect(t.fs.files.get('/d/state.json')).toContain('"paused"');
  });
});
