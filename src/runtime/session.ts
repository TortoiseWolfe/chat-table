import { apply, reopenWindow } from "../engine/apply.js";
import type { AdminAction, Command } from "../engine/commands.js";
import type { Pack } from "../engine/pack.js";
import { createRng } from "../engine/rng.js";
import {
  initialState,
  type GameState,
  type Settings,
} from "../engine/state.js";
import type { Deps } from "./deps.js";
import { parseCommand, type ChatMessage } from "./parse.js";
import { createQueue } from "./queue.js";
import { chatLines } from "./replies.js";
import type { Store } from "./store.js";

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
}

export interface Session {
  start(): Promise<void>;
  chat(msg: ChatMessage): Promise<void>;
  host(action: AdminAction, target?: string): Promise<void>;
  idle(): Promise<void>;
}

export function createSession(opts: SessionOptions): Session {
  const { deps, pack, settings, seed, store, send, botUserId, channelId } =
    opts;
  let state: GameState | null = null;
  let timer: unknown = null;
  const seen = new Map<string, number>();

  function arm(): void {
    if (timer !== null) deps.clearTimer(timer);
    timer = null;
    const s = state;
    if (!s || !s.window || (s.phase !== "scene" && s.phase !== "combat"))
      return;
    const wait = Math.max(0, s.window.endsAt - deps.now());
    timer = deps.setTimer(() => {
      timer = null;
      void queue.push({ type: "tick", at: deps.now() });
    }, wait);
  }

  const queue = createQueue<Command>(
    async (cmd) => {
      const before = state;
      if (!before) throw new Error("session not started");
      try {
        const result = apply(before, cmd, createRng(before.rng), pack);
        state = result.state;
        await store.append(result.events, before, cmd.at);
        await store.snapshot(state, deps.now());
        if (
          result.events.some(
            (e) =>
              e.type === "rewards" ||
              e.type === "seat-released" ||
              e.type === "stopped",
          )
        ) {
          await store.saveViewers(state.viewers);
        }
        for (const line of chatLines(result.events, state, pack))
          await send(line);
      } finally {
        arm();
      }
    },
    (level, message, fields) => deps.log(level, message, fields),
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
      const cmd: Command = { type: "host", at: deps.now(), action };
      if (target !== undefined) cmd.target = target;
      return queue.push(cmd);
    },

    idle: () => queue.idle(),
  };
}
