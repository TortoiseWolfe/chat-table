import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/runtime/deps.js';

describe('parseEnv', () => {
  it('gives the defaults in sim mode', () => {
    expect(parseEnv({}, 'sim')).toEqual({
      dataDir: '/data',
      pack: '/app/packs/frontier',
      httpPort: 8787,
      declareMs: 60000,
      specialOne: 'drop-highest',
      cpPerRollMax: 2,
      narratorTimeoutMs: 8000,
    });
  });

  it('requires the Twitch variables in twitch mode', () => {
    expect(() => parseEnv({}, 'twitch')).toThrow(/TWITCH_CLIENT_ID/);
  });

  it('reads DECLARE_SECONDS', () => {
    expect(parseEnv({ DECLARE_SECONDS: '30' }, 'sim').declareMs).toBe(30000);
    expect(() => parseEnv({ DECLARE_SECONDS: 'x' }, 'sim')).toThrow(/DECLARE_SECONDS/);
  });

  it('rejects an unknown SPECIAL_ONE naming the allowed values', () => {
    expect(() => parseEnv({ SPECIAL_ONE: 'bogus' }, 'sim')).toThrow(
      /complication.*drop-highest.*none/
    );
  });

  it('accepts a full twitch environment', () => {
    const env = parseEnv(
      {
        TWITCH_CLIENT_ID: 'a',
        TWITCH_CLIENT_SECRET: 'b',
        TWITCH_BROADCASTER_LOGIN: 'c',
        TWITCH_BOT_LOGIN: 'd',
        NARRATOR_URL: 'http://n',
      },
      'twitch'
    );
    expect(env.twitchBotLogin).toBe('d');
    expect(env.narratorUrl).toBe('http://n');
  });

  it('reads the optional narrator model and key', () => {
    const env = parseEnv({ NARRATOR_MODEL: 'm', NARRATOR_API_KEY: 'k' }, 'sim');
    expect(env.narratorModel).toBe('m');
    expect(env.narratorApiKey).toBe('k');
  });
});
