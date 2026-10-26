import type { SpecialOneRule } from '../engine/roll.js';

export interface FsLike {
  readFile(path: string): Promise<string>;
  writeFile(path: string, data: string, mode?: number): Promise<void>;
  appendFile(path: string, data: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  fsync(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
}

export interface Deps {
  now(): number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(id: unknown): void;
  fs: FsLike;
  fetch: typeof fetch;
  log(level: 'info' | 'warn' | 'error', msg: string, data?: unknown): void;
  randomSeed(): number;
  randomBytes(n: number): Uint8Array;
}

export interface Env {
  dataDir: string;
  pack: string;
  httpPort: number;
  declareMs: number;
  specialOne: SpecialOneRule;
  cpPerRollMax: number;
  narratorTimeoutMs: number;
  narratorUrl?: string;
  twitchClientId?: string;
  twitchClientSecret?: string;
  twitchBroadcasterLogin?: string;
  twitchBotLogin?: string;
}

const SPECIAL_ONE_RULES: readonly SpecialOneRule[] = ['complication', 'drop-highest', 'none'];

function intOf(
  env: Record<string, string | undefined>,
  name: string,
  fallback: number,
  min: number
): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!/^\d+$/.test(raw.trim()) || !Number.isInteger(n) || n < min) {
    throw new Error(`${name} must be an integer >= ${min}, got "${raw}"`);
  }
  return n;
}

export function parseEnv(env: Record<string, string | undefined>, mode: 'twitch' | 'sim'): Env {
  const specialRaw = env['SPECIAL_ONE'] ?? 'drop-highest';
  const specialOne = SPECIAL_ONE_RULES.find((r) => r === specialRaw);
  if (specialOne === undefined) {
    throw new Error(
      `SPECIAL_ONE must be one of ${SPECIAL_ONE_RULES.join(', ')}, got "${specialRaw}"`
    );
  }

  const out: Env = {
    dataDir: env['DATA_DIR'] || '/data',
    pack: env['PACK'] || '/app/packs/frontier',
    httpPort: intOf(env, 'HTTP_PORT', 8787, 1),
    declareMs: intOf(env, 'DECLARE_SECONDS', 60, 1) * 1000,
    specialOne,
    cpPerRollMax: intOf(env, 'CP_PER_ROLL_MAX', 2, 0),
    narratorTimeoutMs: intOf(env, 'NARRATOR_TIMEOUT_MS', 8000, 1),
  };
  const narratorUrl = env['NARRATOR_URL'];
  if (narratorUrl) out.narratorUrl = narratorUrl;

  const twitch: [string, keyof Env][] = [
    ['TWITCH_CLIENT_ID', 'twitchClientId'],
    ['TWITCH_CLIENT_SECRET', 'twitchClientSecret'],
    ['TWITCH_BROADCASTER_LOGIN', 'twitchBroadcasterLogin'],
    ['TWITCH_BOT_LOGIN', 'twitchBotLogin'],
  ];
  const missing: string[] = [];
  for (const [name, key] of twitch) {
    const v = env[name];
    if (v) {
      (out as unknown as Record<string, string>)[key] = v;
    } else if (mode === 'twitch') {
      missing.push(name);
    }
  }
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  return out;
}
