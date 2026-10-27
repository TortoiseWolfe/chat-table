import { describe, expect, it } from 'vitest';
import type { LogLine } from '../../src/runtime/log.js';
import { toView } from '../../src/overlay/view.js';
import { createTable, SIM_EPOCH } from '../../src/sim/run.js';
import { tinyPack } from '../helpers/tinyPack.js';

function play(untilPhase: 'combat' | 'ended') {
  const pack = tinyPack();
  pack.assets.map = { dock: 'maps/dock.png' };
  pack.assets.art = { ana: 'art/ana.png', grunt: 'art/grunt.png' };
  const startScene = pack.adventure.scenes.find((s) => s.id === 'start');
  if (startScene) startScene.map = 'dock';
  const table = createTable({ pack, seed: 3 });
  table.host('start', SIM_EPOCH);
  let at = SIM_EPOCH;
  for (let i = 0; i < 40 && table.state().phase !== untilPhase; i++) {
    at = table.state().window?.endsAt ?? at + 1000;
    table.advanceTo(at);
  }
  const recent = table.log.map((l) => JSON.parse(l) as LogLine);
  return { pack, table, recent };
}

describe('toView', () => {
  it('maps the opening scene: map url, timer, options, round', () => {
    const pack = tinyPack();
    pack.assets.map = { dock: 'maps/dock.png' };
    const scene = pack.adventure.scenes.find((s) => s.id === 'start');
    if (scene) scene.map = 'dock';
    const table = createTable({ pack, seed: 3 });
    table.host('start', SIM_EPOCH);
    const recent = table.log.map((l) => JSON.parse(l) as LogLine);
    const v = toView(table.state(), pack, recent);
    expect(v.scene).toEqual({ id: 'start', map: '/overlay/assets/map/dock' });
    expect(v.phase).toBe('scene');
    expect(v.round).toBe(1);
    expect(v.roundLimit).toBe(6);
    expect(v.window?.endsAt).toBe(SIM_EPOCH + 60000);
    expect(v.window?.options.map((o) => o.label)).toEqual(['Walk in', 'Sneak past']);
    expect(v.specialDieName).toBe('Wild Die');
    expect(v.feed.length).toBeGreaterThan(0);
    expect(v.feed.map((f) => f.text)).toContain('scene.start line');
    expect(v.feed.at(-1)?.text).toBe('Round 1: !1 Walk in, !2 Sneak past (60s to choose)');
  });

  it('shows four seat tokens with art, holder and an empty wound bar', () => {
    const { pack, table, recent } = play('combat');
    const v = toView(table.state(), pack, recent);
    const ana = v.tokens.find((t) => t.who === 'seat:0');
    expect(ana).toMatchObject({
      name: 'Ana',
      art: '/overlay/assets/art/ana',
      holder: 'bot',
      wound: 'healthy',
      woundIndex: 0,
      out: false,
    });
    expect(v.tokens.filter((t) => t.who.startsWith('seat:'))).toHaveLength(4);
  });

  it('in combat lists live NPC tokens and the initiative order, first one current', () => {
    const { pack, table, recent } = play('combat');
    const s = table.state();
    expect(s.phase).toBe('combat');
    const v = toView(s, pack, recent);
    expect(v.tokens.some((t) => t.name === 'Grunt')).toBe(true);
    expect(v.initiative.length).toBeGreaterThan(1);
    expect(v.initiative.filter((e) => e.current)).toHaveLength(1);
    expect(v.initiative[0]?.current).toBe(true);
  });

  it('keeps only the last 8 feed lines, newest last', () => {
    const { pack, table, recent } = play('ended');
    const v = toView(table.state(), pack, recent);
    expect(v.feed.length).toBeLessThanOrEqual(8);
    const seqs = v.feed.map((f) => f.seq);
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);
  });

  it('reports the latest roll with its check target and result', () => {
    const { pack, table, recent } = play('ended');
    const v = toView(table.state(), pack, recent);
    const rolls = recent.filter((l) => l.type === 'roll');
    expect(rolls.length).toBeGreaterThan(0);
    expect(v.dice).not.toBeNull();
    expect(v.dice?.total).toBe((rolls.at(-1) as unknown as { total: number }).total);
  });

  it('has no dice before any roll', () => {
    const pack = tinyPack();
    const table = createTable({ pack, seed: 3 });
    table.host('start', SIM_EPOCH);
    const v = toView(table.state(), pack, []);
    expect(v.dice).toBeNull();
    expect(v.feed).toEqual([]);
  });
});
