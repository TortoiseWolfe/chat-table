import { apply, reopenWindow } from '../engine/apply.js';
import type { AdminAction, Command } from '../engine/commands.js';
import type { Pack } from '../engine/pack.js';
import { createRng } from '../engine/rng.js';
import { initialState, type GameState, type Settings } from '../engine/state.js';
import type { Deps } from './deps.js';
import { toLogLines, type LogLine } from './log.js';
import { parseCommand, type ChatMessage } from './parse.js';
import { createQueue } from './queue.js';
import { factsFor } from '../narrator/facts.js';
import type { Narrator } from '../narrator/narrator.js';
import { chatItems, cutLine, narrationLine } from './replies.js';
import type { Store } from './store.js';

const DEDUPE_MS = 10 * 60 * 1000;

export interface SessionOptions {
  deps: Deps;
  pack: Pack;
  settings: Settings;
  seed: number;
  store: Store;
  send: (line: string) => Promise<void>;
  botUserId: string;
  channelId: string;
  narrator?: Narrator;
  /** Called after each applied command with its new log lines and the new state. */
  onLog?: (lines: LogLine[], state: GameState) => void;
}

export interface Session {
  start(): Promise<void>;
  chat(msg: ChatMessage): Promise<void>;
  host(action: AdminAction, target?: string): Promise<void>;
  /** The stream went offline: the game pauses and saves. */
  offline(): Promise<void>;
  idle(): Promise<void>;
  state(): GameState | null;
}

export function createSession(opts: SessionOptions): Session {
  const { deps, pack, settings, seed, store, send, botUserId, channelId, narrator, onLog } = opts;
  let state: GameState | null = null;
  let timer: unknown = null;
  const seen = new Map<string, number>();
  // With a narrator, lines go out through this chain in event order, so a slow narration
  // never lets a later line overtake it and never holds the command queue.
  let sendTail: Promise<void> = Promise.resolve();

  function sendInOrder(line: string | Promise<string>): void {
    sendTail = sendTail.then(async () => {
      try {
        await send(await line);
      } catch (err) {
        deps.log('error', 'send failed', {
          message: err instanceof Error ? err.message : String(err),
        });
      }
    });
  }

  function arm(): void {
    if (timer !== null) deps.clearTimer(timer);
    timer = null;
    const s = state;
    if (!s || !s.window || (s.phase !== 'scene' && s.phase !== 'combat')) return;
    const wait = Math.max(0, s.window.endsAt - deps.now());
    timer = deps.setTimer(() => {
      timer = null;
      void queue.push({ type: 'tick', at: deps.now() });
    }, wait);
  }

  const queue = createQueue<Command>(
    async (cmd) => {
      const before = state;
      if (!before) throw new Error('session not started');
      try {
        const result = apply(before, cmd, createRng(before.rng), pack);
        state = result.state;
        await store.append(result.events, before, cmd.at);
        await store.snapshot(state, deps.now());
        onLog?.(toLogLines(result.events, before, cmd.at), state);
        if (
          result.events.some(
            (e) => e.type === 'rewards' || e.type === 'seat-released' || e.type === 'stopped'
          )
        ) {
          await store.saveViewers(state.viewers);
        }
        for (const item of chatItems(result.events, state, pack)) {
          const e = item.narrate;
          if (!narrator) {
            await send(item.line);
          } else if (e) {
            const fallback = narrationLine(e, pack);
            sendInOrder(
              narrator
                .narrate({
                  template: e.template,
                  variant: e.variant,
                  facts: factsFor(e, state, pack),
                  quotes: e.quotes,
                  fallback,
                })
                .then((text) => cutLine(text === fallback ? item.line : text))
            );
          } else {
            sendInOrder(item.line);
          }
        }
      } finally {
        arm();
      }
    },
    (level, message, fields) => deps.log(level, message, fields)
  );

  function fresh(msg: ChatMessage): boolean {
    const now = deps.now();
    for (const [id, at] of seen) if (now - at > DEDUPE_MS) seen.delete(id);
    if (seen.has(msg.messageId)) return false;
    seen.set(msg.messageId, now);
    return true;
  }

  return {
    async start() {
      const loaded = await store.load();
      if (loaded) {
        state = loaded.window ? reopenWindow(loaded, deps.now()) : loaded;
      } else {
        state = initialState(pack, seed, settings, await store.loadViewers());
      }
      arm();
    },

    chat(msg) {
      if (!fresh(msg)) return Promise.resolve();
      if (msg.userId === botUserId) return Promise.resolve();
      if (msg.sourceChannelId !== null && msg.sourceChannelId !== channelId)
        return Promise.resolve();
      const cmd = parseCommand(msg);
      return cmd ? queue.push(cmd) : Promise.resolve();
    },

    host(action, target) {
      const cmd: Command = { type: 'host', at: deps.now(), action };
      if (target !== undefined) cmd.target = target;
      return queue.push(cmd);
    },

    offline() {
      return queue.push({ type: 'offline', at: deps.now() });
    },

    state: () => state,

    async idle() {
      await queue.idle();
      await sendTail;
    },
  };
}
