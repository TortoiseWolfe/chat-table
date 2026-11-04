import { z } from 'zod';
import type { Pack } from '../engine/pack.js';
import type { GameState } from '../engine/state.js';
import type { Deps, FsLike } from '../runtime/deps.js';
import { createBotDriver } from './drivers/bot.js';
import { createClaudeDriver } from './drivers/claude.js';
import { createGeminiDriver } from './drivers/gemini.js';
import { createGroqDriver } from './drivers/groq.js';
import type { Caps, Driver, DriverId, DriverSpec, SeatConfig } from './types.js';

const DriverIdSchema = z.enum(['bot', 'claude', 'gemini', 'groq']);
const SpecSchema = z
  .object({ id: DriverIdSchema, model: z.string().default('') })
  .refine((s) => s.id === 'bot' || s.model !== '', { message: 'a model driver needs a model id' });
const CapsSchema = z
  .object({
    tokensPerTurn: z.number().int().min(1),
    callsPerTurn: z.number().int().min(1),
    tokensPerSession: z.number().int().min(1),
    callsPerSession: z.number().int().min(1),
  })
  .partial();

const SeatSchema = z.object({
  seat: z.number().int().min(0).max(3),
  label: z.string().min(1).max(40),
  primary: SpecSchema,
  backup: SpecSchema,
  caps: CapsSchema.optional(),
});

const ConfigSchema = z.object({
  seats: z.array(SeatSchema).min(1).max(4),
  /** Paths of the key files, read at start through `Deps.fs`. Never the keys themselves. */
  keyFiles: z
    .object({
      claude: z.string().optional(),
      gemini: z.string().optional(),
      groq: z.string().optional(),
    })
    .default({}),
});

/** The tightest caps go to the paid model; the free tiers get more room. */
export function defaultCaps(id: DriverId): Caps {
  if (id === 'claude') {
    return { tokensPerTurn: 1500, callsPerTurn: 1, tokensPerSession: 60000, callsPerSession: 60 };
  }
  if (id === 'bot') {
    return { tokensPerTurn: 1, callsPerTurn: 1000, tokensPerSession: 1, callsPerSession: 100000 };
  }
  return { tokensPerTurn: 3000, callsPerTurn: 2, tokensPerSession: 200000, callsPerSession: 300 };
}

export interface AiConfig {
  seats: SeatConfig[];
  keyFiles: Partial<Record<'claude' | 'gemini' | 'groq', string>>;
}

export function parseAiConfig(text: string): AiConfig {
  const raw = ConfigSchema.parse(JSON.parse(text));
  const seen = new Set<number>();
  const seats = raw.seats.map((s): SeatConfig => {
    if (seen.has(s.seat)) throw new Error(`ai seats: seat ${String(s.seat)} appears twice`);
    seen.add(s.seat);
    const base = defaultCaps(s.primary.id);
    return {
      seat: s.seat as SeatConfig['seat'],
      label: s.label,
      primary: s.primary,
      backup: s.backup,
      caps: {
        tokensPerTurn: s.caps?.tokensPerTurn ?? base.tokensPerTurn,
        callsPerTurn: s.caps?.callsPerTurn ?? base.callsPerTurn,
        tokensPerSession: s.caps?.tokensPerSession ?? base.tokensPerSession,
        callsPerSession: s.caps?.callsPerSession ?? base.callsPerSession,
      },
    };
  });
  const keyFiles: AiConfig['keyFiles'] = {};
  for (const k of ['claude', 'gemini', 'groq'] as const) {
    const v = raw.keyFiles[k];
    if (v !== undefined) keyFiles[k] = v;
  }
  return { seats, keyFiles };
}

/** Reads each key file once. A missing or empty file means that driver reports `no-key`. */
export async function loadKeys(
  fs: Pick<FsLike, 'readFile'>,
  keyFiles: AiConfig['keyFiles'],
  log: Deps['log']
): Promise<Record<'claude' | 'gemini' | 'groq', string | null>> {
  const keys: Record<'claude' | 'gemini' | 'groq', string | null> = {
    claude: null,
    gemini: null,
    groq: null,
  };
  for (const id of ['claude', 'gemini', 'groq'] as const) {
    const path = keyFiles[id];
    if (path === undefined) continue;
    try {
      const value = (await fs.readFile(path)).trim();
      keys[id] = value === '' ? null : value;
    } catch {
      // Only the driver name is logged: never the path's contents, never a key.
      log('warn', 'key file unreadable; that driver is off', { driver: id });
    }
    if (keys[id] === null) log('warn', 'no key for driver', { driver: id });
  }
  return keys;
}

export function createDriverFactory(opts: {
  keys: Record<'claude' | 'gemini' | 'groq', string | null>;
  deps: Pick<Deps, 'now' | 'setTimer' | 'clearTimer' | 'fetch' | 'log'>;
  pack: Pack;
  state: () => GameState | null;
}): (spec: DriverSpec) => Driver {
  const { keys, deps } = opts;
  return (spec) => {
    switch (spec.id) {
      case 'bot':
        return createBotDriver({ state: opts.state, pack: opts.pack });
      case 'claude':
        return createClaudeDriver({ model: spec.model, key: keys.claude, deps });
      case 'gemini':
        return createGeminiDriver({ model: spec.model, key: keys.gemini, deps });
      case 'groq':
        return createGroqDriver({ model: spec.model, key: keys.groq, deps });
    }
  };
}
