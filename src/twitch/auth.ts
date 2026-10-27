import type { Deps } from '../runtime/deps.js';

const ID = 'https://id.twitch.tv/oauth2';
const SCOPES = 'user:read:chat user:write:chat user:bot';
const HOUR_MS = 3600 * 1000;
/** A token with less than an hour and this much slack left is renewed at the next check. */
const SLACK_MS = 5 * 60 * 1000;

export type AuthDeps = Pick<Deps, 'fetch' | 'fs' | 'now' | 'setTimer' | 'clearTimer' | 'log'>;

export interface TokenFile {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  login: string;
  userId: string;
}

export interface AuthOptions {
  deps: AuthDeps;
  clientId: string;
  clientSecret?: string;
  dataDir: string;
}

export interface Auth {
  /** Device-code login: prints the code and page, waits for approval, saves token.json. */
  login(print: (message: string) => void): Promise<void>;
  /** Loads token.json, makes sure the token is valid, and starts the hourly check. */
  start(): Promise<void>;
  /** The access token to use right now. */
  token(): string;
  stop(): void;
}

interface TokenReply {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

interface ValidateReply {
  login: string;
  user_id: string;
  expires_in: number;
}

function form(fields: Record<string, string | undefined>): URLSearchParams {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) body.set(k, v);
  return body;
}

export function createAuth(opts: AuthOptions): Auth {
  const { deps, clientId, clientSecret } = opts;
  const path = `${opts.dataDir}/token.json`;
  let file: TokenFile | null = null;
  let timer: unknown = null;
  let stopped = false;

  const log = (level: 'info' | 'warn' | 'error', msg: string, data?: unknown): void =>
    deps.log(level, msg, data);

  async function post(url: string, body: URLSearchParams): Promise<Response> {
    return deps.fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
  }

  async function save(f: TokenFile): Promise<void> {
    file = f;
    await deps.fs.writeFile(`${path}.tmp`, JSON.stringify(f, null, 2) + '\n', 0o600);
    await deps.fs.rename(`${path}.tmp`, path);
  }

  async function validate(accessToken: string): Promise<ValidateReply | null> {
    const res = await deps.fetch(`${ID}/validate`, {
      headers: { authorization: `OAuth ${accessToken}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as ValidateReply;
  }

  async function refresh(): Promise<boolean> {
    if (!file) return false;
    const res = await post(
      `${ID}/token`,
      form({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: file.refreshToken,
      })
    );
    if (!res.ok) {
      log('error', 'twitch token refresh failed', { status: res.status });
      return false;
    }
    const t = (await res.json()) as TokenReply;
    await save({
      ...file,
      accessToken: t.access_token,
      refreshToken: t.refresh_token,
      expiresAt: deps.now() + t.expires_in * 1000,
    });
    log('info', 'twitch token refreshed', { login: file.login });
    return true;
  }

  async function check(): Promise<void> {
    if (!file) throw new Error('no Twitch token: run the login command first');
    const v = await validate(file.accessToken);
    if (v === null) {
      if (!(await refresh()))
        throw new Error('Twitch token is not valid and could not be refreshed');
      return;
    }
    file = { ...file, expiresAt: deps.now() + v.expires_in * 1000 };
    if (v.expires_in * 1000 < HOUR_MS + SLACK_MS) await refresh();
  }

  function arm(): void {
    if (stopped) return;
    timer = deps.setTimer(() => {
      timer = null;
      check()
        .catch((err: unknown) =>
          log('error', 'twitch token check failed', {
            message: err instanceof Error ? err.message : String(err),
          })
        )
        .finally(arm);
    }, HOUR_MS);
  }

  return {
    async login(print) {
      const start = await post(`${ID}/device`, form({ client_id: clientId, scopes: SCOPES }));
      if (!start.ok) throw new Error(`Twitch refused the login request (${String(start.status)})`);
      const d = (await start.json()) as {
        device_code: string;
        user_code: string;
        verification_uri: string;
        expires_in: number;
        interval: number;
      };
      print(`Open ${d.verification_uri} and enter the code ${d.user_code}`);
      const deadline = deps.now() + d.expires_in * 1000;
      for (;;) {
        await new Promise<void>((resolve) => {
          deps.setTimer(resolve, d.interval * 1000);
        });
        if (deps.now() > deadline) throw new Error('The login code expired; run login again');
        const res = await post(
          `${ID}/token`,
          form({
            client_id: clientId,
            scopes: SCOPES,
            device_code: d.device_code,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          })
        );
        if (!res.ok) continue;
        const t = (await res.json()) as TokenReply;
        const v = await validate(t.access_token);
        if (!v) throw new Error('Twitch rejected the new token');
        await save({
          accessToken: t.access_token,
          refreshToken: t.refresh_token,
          expiresAt: deps.now() + t.expires_in * 1000,
          login: v.login,
          userId: v.user_id,
        });
        print(`Logged in as ${v.login}`);
        return;
      }
    },

    async start() {
      stopped = false;
      file = JSON.parse(await deps.fs.readFile(path)) as TokenFile;
      await check();
      arm();
    },

    token() {
      if (!file) throw new Error('no Twitch token: run the login command first');
      return file.accessToken;
    },

    stop() {
      stopped = true;
      if (timer !== null) deps.clearTimer(timer);
      timer = null;
    },
  };
}
