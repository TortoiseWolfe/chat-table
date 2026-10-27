import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, initialState, type ViewerRecord } from '../../src/engine/state.js';
import { createStore } from '../../src/runtime/store.js';
import { memFs } from '../helpers/memfs.js';
import { tinyPack } from '../helpers/tinyPack.js';

function setup() {
  const fs = memFs();
  const logs: { level: string; msg: string }[] = [];
  const store = createStore(fs, '/d', (level, msg) => logs.push({ level, msg }));
  return { fs, logs, store };
}

describe('createStore', () => {
  it('appends log lines in order', async () => {
    const { fs, store } = setup();
    await store.append([{ type: 'stopped' }], { seq: 0, round: 0 }, 1000);
    await store.append([{ type: 'resumed' }], { seq: 1, round: 0 }, 2000);
    expect(fs.files.get('/d/events.jsonl')).toBe(
      '{"seq":1,"at":1000,"round":0,"type":"stopped"}\n{"seq":2,"at":2000,"round":0,"type":"resumed"}\n',
    );
  });

  it('keeps the previous snapshot beside the latest', async () => {
    const { fs, store } = setup();
    const first = initialState(tinyPack(), 1, DEFAULT_SETTINGS);
    const second = { ...first, seq: 9 };
    await store.snapshot(first, 100);
    await store.snapshot(second, 200);
    const now = JSON.parse(fs.files.get('/d/state.json')!) as { savedAt: number; state: { seq: number } };
    const prev = JSON.parse(fs.files.get('/d/state.prev.json')!) as { state: { seq: number } };
    expect(now.savedAt).toBe(200);
    expect(now.state.seq).toBe(9);
    expect(prev.state.seq).toBe(0);
    expect(fs.files.has('/d/state.json.tmp')).toBe(false);
    expect(await store.load()).toEqual(second);
  });

  it('falls back to the previous snapshot when state.json is corrupt', async () => {
    const { fs, logs, store } = setup();
    const first = initialState(tinyPack(), 1, DEFAULT_SETTINGS);
    await store.snapshot(first, 100);
    await store.snapshot({ ...first, seq: 9 }, 200);
    fs.files.set('/d/state.json', '{bad');
    expect(await store.load()).toEqual(first);
    expect(logs.filter((l) => l.level === 'error')).toHaveLength(1);
  });

  it('starts empty from an empty directory', async () => {
    const { logs, store } = setup();
    expect(await store.load()).toBeNull();
    expect(await store.loadViewers()).toEqual({});
    expect(logs).toEqual([]);
  });

  it('round-trips viewers', async () => {
    const { store } = setup();
    const viewers: Record<string, ViewerRecord> = {
      u1: { characters: { ana: { points: { cp: 6, fp: 1 }, advances: {} } } },
    };
    await store.saveViewers(viewers);
    expect(await store.loadViewers()).toEqual(viewers);
  });
});
