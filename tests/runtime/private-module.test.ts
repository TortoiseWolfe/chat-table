import { describe, expect, it } from 'vitest';
import { buildPacket } from '../../src/ai/packet.js';
import { DEFAULT_SETTINGS, type GameState } from '../../src/engine/state.js';
import type { Narrator } from '../../src/narrator/narrator.js';
import { moduleFromFiles } from '../../src/packs/module.js';
import { toView } from '../../src/overlay/view.js';
import type { Deps } from '../../src/runtime/deps.js';
import type { LogLine } from '../../src/runtime/log.js';
import { createSession } from '../../src/runtime/session.js';
import { createStore } from '../../src/runtime/store.js';
import { FakeClock } from '../../src/sim/clock.js';
import { memFs } from '../helpers/memfs.js';
import { tinyPack } from '../helpers/tinyPack.js';

// A word no pack, template or engine text contains, planted in every field of the module.
const MARK = 'qzx-gm-only-marker';
const module = () =>
  moduleFromFiles({
    'module.json': JSON.stringify({ id: 'mod-a', name: `name ${MARK}`, version: '1.0.0', source: `src ${MARK}` }),
    'scenes.json': JSON.stringify(
      ['start', 'fight', 'win', 'lose', 'out-of-time'].map((scene) => ({
        scene,
        notes: [`note ${MARK}`],
        secrets: [`secret ${MARK}`],
      }))
    ),
    'npcs.json': JSON.stringify([{ npc: 'grunt', motive: `motive ${MARK}`, secrets: [`s ${MARK}`] }]),
  });

const START = 1793000000000;

async function playWith(privateModule: ReturnType<typeof module> | undefined) {
  const fs = memFs();
  const clock = new FakeClock(START);
  const sent: string[] = [];
  const narratorInputs: unknown[] = [];
  const views: unknown[] = [];
  const packets: unknown[] = [];
  const pack = tinyPack();
  const deps: Deps = {
    now: () => clock.now(),
    setTimer: (fn, ms) => clock.setTimer(fn, ms),
    clearTimer: (id) => clock.clearTimer(id as number),
    fs,
    fetch: () => {
      throw new Error('no network in tests');
    },
    log: () => undefined,
    randomSeed: () => 1,
    randomBytes: (n) => new Uint8Array(n),
  };
  const narrator: Narrator = {
    narrate: (input) => {
      narratorInputs.push(input);
      return Promise.resolve(input.fallback);
    },
  };
  const recent: LogLine[] = [];
  const session = createSession({
    deps,
    pack,
    settings: DEFAULT_SETTINGS,
    seed: 1,
    store: createStore(fs, '/d', () => undefined),
    send: (line) => {
      sent.push(line);
      return Promise.resolve();
    },
    botUserId: 'bot',
    channelId: 'chan',
    narrator,
    ...(privateModule ? { privateModule } : {}),
    onLog: (lines: LogLine[], state: GameState) => {
      recent.push(...lines);
      views.push(toView(state, pack, recent));
      for (const seat of state.seats) {
        packets.push(
          buildPacket(state, pack, seat.index, { history: [] }, [], clock.now())
        );
      }
    },
  });
  await session.start();
  await session.host('start');
  await session.chat({
    messageId: 'm1',
    userId: 'u1',
    login: 'viewer1',
    text: '!join ana',
    isMod: false,
    isBroadcaster: false,
    at: clock.now(),
    sourceChannelId: null,
  });
  for (let i = 0; i < 40 && session.state()?.phase !== 'ended'; i++) {
    clock.advanceTo(clock.now() + DEFAULT_SETTINGS.declareMs);
    await session.idle();
  }
  return { session, sent, narratorInputs, views, packets, fs, state: session.state() };
}

describe('a loaded private module never reaches a stream or overlay output', () => {
  it('leaves chat lines, narrator input, overlay views, seat packets and saved files untouched', async () => {
    const r = await playWith(module());
    expect(r.sent.length).toBeGreaterThan(0);
    expect(r.views.length).toBeGreaterThan(0);
    expect(r.packets.length).toBeGreaterThan(0);
    expect(r.narratorInputs.length).toBeGreaterThan(0);

    const everything = JSON.stringify({
      sent: r.sent,
      narrator: r.narratorInputs,
      views: r.views,
      packets: r.packets,
      state: r.state,
      files: Object.fromEntries(r.fs.files),
    });
    expect(everything).not.toContain(MARK);
  });

  it('plays the same game with and without the module', async () => {
    const withModule = await playWith(module());
    const without = await playWith(undefined);
    expect(withModule.sent).toEqual(without.sent);
    expect(JSON.stringify(withModule.views)).toBe(JSON.stringify(without.views));
    expect(JSON.stringify(withModule.packets)).toBe(JSON.stringify(without.packets));
    expect(withModule.fs.files.get('/d/events.jsonl')).toBe(without.fs.files.get('/d/events.jsonl'));
  });

  it('gives the host, and only the host, the notes for the scene in play', async () => {
    const r = await playWith(module());
    const notes = r.session.gmNotes();
    expect(notes?.scene?.secrets).toEqual([`secret ${MARK}`]);
    const none = await playWith(undefined);
    expect(none.session.gmNotes()).toBeNull();
  });
});
