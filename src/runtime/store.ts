import type { Event } from '../engine/events.js';
import type { GameState, ViewerRecord } from '../engine/state.js';
import type { Deps, FsLike } from './deps.js';
import { formatLogLine, toLogLines } from './log.js';

export interface Store {
  append(events: Event[], before: Pick<GameState, 'seq' | 'round'>, at: number): Promise<void>;
  snapshot(state: GameState, savedAt: number): Promise<void>;
  load(): Promise<GameState | null>;
  saveViewers(viewers: Record<string, ViewerRecord>): Promise<void>;
  loadViewers(): Promise<Record<string, ViewerRecord>>;
}

interface Snapshot {
  version: 1;
  savedAt: number;
  state: GameState;
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function createStore(fs: FsLike, dir: string, log: Deps['log']): Store {
  const path = (name: string): string => `${dir}/${name}`;
  let ready: Promise<void> | null = null;
  const ensureDir = (): Promise<void> => (ready ??= fs.mkdir(dir));

  async function replace(name: string, data: string, keepPrev: string | null): Promise<void> {
    await ensureDir();
    const tmp = path(name + '.tmp');
    await fs.writeFile(tmp, data);
    await fs.fsync(tmp);
    if (keepPrev !== null && (await fs.exists(path(name)))) {
      await fs.rename(path(name), path(keepPrev));
    }
    await fs.rename(tmp, path(name));
  }

  async function readSnapshot(name: string): Promise<GameState | null> {
    const parsed = JSON.parse(await fs.readFile(path(name))) as Partial<Snapshot>;
    if (parsed.version !== 1 || !parsed.state || parsed.state.version !== 1) {
      throw new Error(`${name}: unsupported snapshot`);
    }
    return parsed.state;
  }

  return {
    async append(events, before, at) {
      if (events.length === 0) return;
      await ensureDir();
      const text = toLogLines(events, before, at)
        .map((l) => formatLogLine(l) + '\n')
        .join('');
      await fs.appendFile(path('events.jsonl'), text);
    },

    async snapshot(state, savedAt) {
      const snap: Snapshot = { version: 1, savedAt, state };
      await replace('state.json', JSON.stringify(snap), 'state.prev.json');
    },

    async load() {
      const hasCurrent = await fs.exists(path('state.json'));
      const hasPrev = await fs.exists(path('state.prev.json'));
      if (!hasCurrent && !hasPrev) return null;
      if (hasCurrent) {
        try {
          return await readSnapshot('state.json');
        } catch (err) {
          log('error', 'state.json unreadable, using state.prev.json', { message: describe(err) });
        }
      } else {
        log('error', 'state.json missing, using state.prev.json');
      }
      if (!hasPrev) return null;
      try {
        return await readSnapshot('state.prev.json');
      } catch (err) {
        log('error', 'state.prev.json unreadable, starting fresh', { message: describe(err) });
        return null;
      }
    },

    async saveViewers(viewers) {
      await replace('viewers.json', JSON.stringify(viewers), null);
    },

    async loadViewers() {
      if (!(await fs.exists(path('viewers.json')))) return {};
      try {
        return JSON.parse(await fs.readFile(path('viewers.json'))) as Record<string, ViewerRecord>;
      } catch (err) {
        log('error', 'viewers.json unreadable, starting empty', { message: describe(err) });
        return {};
      }
    },
  };
}
