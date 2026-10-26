import { apply } from '../engine/apply.js';
import type { Command } from '../engine/commands.js';
import type { Pack } from '../engine/pack.js';
import { createRng } from '../engine/rng.js';
import { DEFAULT_SETTINGS, initialState, type GameState, type Settings } from '../engine/state.js';
import { formatLogLine, toLogLines } from '../runtime/log.js';
import { parseCommand } from '../runtime/parse.js';
import { chatLines } from '../runtime/replies.js';
import type { ScriptLine } from './script.js';

export const SIM_EPOCH = 1793000000000;

export interface Table {
  chat(login: string, text: string, at: number, messageId?: string): void;
  host(action: 'start' | 'pause' | 'stop' | 'skip', at: number): void;
  advanceTo(at: number): void;
  state(): GameState;
  lines: string[];
  log: string[];
}

export function createTable(opts: { pack: Pack; seed: number; settings?: Settings }): Table {
  const { pack } = opts;
  let s = initialState(pack, opts.seed, opts.settings ?? DEFAULT_SETTINGS);
  const lines: string[] = [];
  const log: string[] = [];
  let counter = 0;

  const run = (cmd: Command): void => {
    const before = s;
    const r = apply(before, cmd, createRng(before.rng), pack);
    s = r.state;
    for (const l of toLogLines(r.events, before, cmd.at)) log.push(formatLogLine(l));
    lines.push(...chatLines(r.events, s, pack));
  };

  return {
    chat(login, text, at, messageId) {
      counter += 1;
      const cmd = parseCommand({
        messageId: messageId ?? `m${counter}`,
        userId: 'sim-' + login,
        login,
        text,
        isMod: login.startsWith('mod'),
        isBroadcaster: login === 'host',
        at,
        sourceChannelId: null,
      });
      if (cmd) run(cmd);
    },
    host(action, at) {
      run({ type: 'host', at, action });
    },
    advanceTo(at) {
      while (
        (s.phase === 'scene' || s.phase === 'combat') &&
        s.window !== null &&
        s.window.endsAt <= at
      ) {
        run({ type: 'tick', at: s.window.endsAt });
      }
    },
    state: () => s,
    lines,
    log,
  };
}

export function runSim(opts: {
  pack: Pack;
  seed: number;
  script?: ScriptLine[];
}): { lines: string[]; log: string; state: GameState } {
  const { pack } = opts;
  const table = createTable({ pack, seed: opts.seed });
  const script = opts.script ?? [];
  table.host('start', SIM_EPOCH);

  const once = script
    .filter((l) => l.kind === 'once')
    .map((l) => ({ at: SIM_EPOCH + l.offsetMs, l }))
    .sort((a, b) => a.at - b.at);
  const every = script.filter((l) => l.kind === 'every');
  const sentEvery = new Set<string>();
  let onceIndex = 0;
  const maxRound = pack.adventure.roundLimit + 5;

  while (table.state().phase !== 'ended') {
    const s = table.state();
    if (s.round > maxRound) throw new Error('sim: no ending');
    const w = s.window;
    const live = (s.phase === 'scene' || s.phase === 'combat') && w !== null;

    let next: { at: number; l: ScriptLine; id: string } | undefined;
    const nextOnce = once[onceIndex];
    if (nextOnce) next = { at: nextOnce.at, l: nextOnce.l, id: '' };
    if (live) {
      for (const l of every) {
        const key = `${l.line}-${w.round}`;
        const at = w.opensAt + l.offsetMs;
        if (sentEvery.has(key)) continue;
        if (!next || at < next.at) next = { at, l, id: key };
      }
    }

    if (live && (!next || next.at >= w.endsAt)) {
      table.advanceTo(w.endsAt);
    } else if (next) {
      if (next.id === '') onceIndex += 1;
      else sentEvery.add(next.id);
      const round = w?.round ?? s.round;
      const messageId = next.l.kind === 'every' ? `m${next.l.line}-r${round}` : `m${next.l.line}`;
      table.chat(next.l.login, next.l.text, next.at, messageId);
    } else {
      throw new Error('sim: no ending');
    }
  }
  const lines = table.lines;
  return { lines, log: table.log.join('\n') + '\n', state: table.state() };
}
