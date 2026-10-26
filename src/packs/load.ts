import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDiceCode } from '../engine/dice.js';
import type { Character, NpcTemplate, Pack, Scene, Skill, Weapon } from '../engine/pack.js';
import { GM_TEMPLATE_KEYS } from '../gm/keys.js';
import type { FsLike } from '../runtime/deps.js';
import { PackFiles, type PackFileData, type PackFileName } from './schema.js';

const FILE_NAMES = Object.keys(PackFiles) as PackFileName[];

type RawSkill = { name: string; attribute: Skill['attribute']; code: string };
type RawWeapon = { id: string; name: string; skill: string; damage: string; range: Weapon['range'] };
type RawAttrs = Record<Skill['attribute'], string>;

function dice(text: string) {
  return parseDiceCode(text);
}

function attrs(a: RawAttrs): Character['attributes'] {
  return {
    reflexes: dice(a.reflexes),
    coordination: dice(a.coordination),
    physique: dice(a.physique),
    knowledge: dice(a.knowledge),
    perception: dice(a.perception),
    presence: dice(a.presence),
  };
}

function skills(list: RawSkill[]): Skill[] {
  return list.map((k) => ({ name: k.name, attribute: k.attribute, code: dice(k.code) }));
}

function weapons(list: RawWeapon[]): Weapon[] {
  return list.map((w) => ({
    id: w.id,
    name: w.name,
    skill: w.skill,
    damage: dice(w.damage),
    range: w.range,
  }));
}

function crossCheck(
  data: PackFileData,
  assetExists: (rel: string) => boolean,
  problems: string[]
): void {
  const bad = (file: PackFileName, path: string, message: string): void => {
    problems.push(`${file}: ${path}: ${message}`);
  };
  const skillNames = new Set(data['pack.json'].skills.map((k) => k.name));
  const checkSkill = (file: PackFileName, path: string, name: string): void => {
    if (!skillNames.has(name)) bad(file, path, `unknown skill "${name}"`);
  };

  data['characters.json'].forEach((c, i) => {
    c.skills.forEach((k, j) => checkSkill('characters.json', `${i}.skills.${j}.name`, k.name));
    c.weapons.forEach((w, j) => checkSkill('characters.json', `${i}.weapons.${j}.skill`, w.skill));
    if (c.weapons.length === 0) bad('characters.json', `${i}.weapons`, 'needs at least one weapon');
  });
  const npcIds = new Set<string>();
  data['npcs.json'].forEach((n, i) => {
    npcIds.add(n.id);
    n.skills.forEach((k, j) => checkSkill('npcs.json', `${i}.skills.${j}.name`, k.name));
    n.weapons.forEach((w, j) => checkSkill('npcs.json', `${i}.weapons.${j}.skill`, w.skill));
    if (n.weapons.length === 0) bad('npcs.json', `${i}.weapons`, 'needs at least one weapon');
  });

  const adv = data['adventure.json'];
  const templates = data['templates.json'];
  const sceneIds = new Set(adv.scenes.map((s) => s.id));
  const byId = new Map(adv.scenes.map((s) => [s.id, s]));
  const sceneRef = (path: string, ref: string): void => {
    if (!sceneIds.has(ref)) bad('adventure.json', path, `unknown scene "${ref}"`);
  };

  sceneRef('start', adv.start);
  adv.scenes.forEach((s, i) => {
    const p = `scenes.${i}`;
    if (!(s.template in templates)) {
      bad('templates.json', `${p}.template`, `missing template "${s.template}"`);
    }
    s.choices?.forEach((c, j) => {
      const cp = `${p}.choices.${j}`;
      if (c.next !== undefined) sceneRef(`${cp}.next`, c.next);
      if (c.check) {
        sceneRef(`${cp}.check.success`, c.check.success);
        sceneRef(`${cp}.check.failure`, c.check.failure);
        checkSkill('adventure.json', `${cp}.check.skill`, c.check.skill);
      }
    });
    if (s.default !== undefined && !(s.choices ?? []).some((c) => c.id === s.default)) {
      bad('adventure.json', `${p}.default`, `"${s.default}" is not a choice id`);
    }
    if (s.combat) {
      s.combat.npcs.forEach((n, j) => {
        if (!npcIds.has(n.npc)) bad('adventure.json', `${p}.combat.npcs.${j}.npc`, `unknown npc "${n.npc}"`);
      });
      sceneRef(`${p}.combat.win`, s.combat.win);
      sceneRef(`${p}.combat.lose`, s.combat.lose);
      if (s.combat.flee !== undefined) sceneRef(`${p}.combat.flee`, s.combat.flee);
    }
  });

  for (const key of GM_TEMPLATE_KEYS) {
    if (!(key in templates)) bad('templates.json', key, `missing template "${key}"`);
  }

  const timeouts = adv.scenes.filter((s) => s.ending === 'timeout').length;
  if (timeouts !== 1) {
    bad('adventure.json', 'scenes', `exactly one timeout ending is required, found ${timeouts}`);
  }

  // reachability from start
  const seen = new Set<string>();
  const queue = [adv.start];
  while (queue.length > 0) {
    const id = queue.pop();
    if (id === undefined || seen.has(id)) continue;
    const s: Scene | undefined = byId.get(id) as Scene | undefined;
    if (!s) continue;
    seen.add(id);
    for (const c of s.choices ?? []) {
      if (c.next !== undefined) queue.push(c.next);
      if (c.check) queue.push(c.check.success, c.check.failure);
    }
    if (s.combat) {
      queue.push(s.combat.win, s.combat.lose);
      if (s.combat.flee !== undefined) queue.push(s.combat.flee);
    }
  }
  for (const ending of ['victory', 'defeat'] as const) {
    const reachable = adv.scenes.some((s) => s.ending === ending && seen.has(s.id));
    if (!reachable) bad('adventure.json', 'scenes', `no ${ending} ending is reachable from start`);
  }

  const assets = data['pack.json'].assets;
  for (const kind of ['map', 'art', 'sounds'] as const) {
    for (const [key, rel] of Object.entries(assets[kind])) {
      if (!assetExists(rel)) bad('pack.json', `assets.${kind}.${key}`, `file not found: ${rel}`);
    }
  }
}

export function packFromFiles(
  files: Record<string, string>,
  assetExists: (rel: string) => boolean
): Pack {
  const problems: string[] = [];
  const parsed: Partial<Record<PackFileName, unknown>> = {};

  for (const name of FILE_NAMES) {
    const text = files[name];
    if (text === undefined) {
      problems.push(`${name}: (file): missing`);
      continue;
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (e) {
      problems.push(`${name}: (file): invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    const r = PackFiles[name].safeParse(json);
    if (r.success) {
      parsed[name] = r.data;
    } else {
      for (const issue of r.error.issues) {
        problems.push(`${name}: ${issue.path.join('.') || '(root)'}: ${issue.message}`);
      }
    }
  }

  if (problems.length === 0) {
    crossCheck(parsed as PackFileData, assetExists, problems);
  }
  if (problems.length > 0) {
    throw new Error(problems.join('\n'));
  }

  const data = parsed as PackFileData;
  const meta = data['pack.json'];
  const characters: Character[] = data['characters.json'].map((c) => ({
    id: c.id,
    name: c.name,
    pronouns: c.pronouns,
    concept: c.concept,
    attributes: attrs(c.attributes),
    skills: skills(c.skills),
    weapons: weapons(c.weapons),
    armor: dice(c.armor),
    wound: 'healthy',
    stunnedUntil: null,
    points: { cp: c.points.cp, fp: c.points.fp },
    advances: {},
    bot: { prefer: [...c.bot.prefer], combat: c.bot.combat, spendCp: c.bot.spendCp },
  }));
  const npcs: NpcTemplate[] = data['npcs.json'].map((n) => ({
    id: n.id,
    name: n.name,
    attributes: attrs(n.attributes),
    skills: skills(n.skills),
    weapons: weapons(n.weapons),
    armor: dice(n.armor),
    outAt: n.outAt,
    tactic: n.tactic,
  }));

  const pack: Pack = {
    id: meta.id,
    name: meta.name,
    version: meta.version,
    licence: meta.licence,
    skills: meta.skills,
    characters,
    npcs,
    adventure: data['adventure.json'] as Pack['adventure'],
    templates: data['templates.json'],
    assets: { map: meta.assets.map, art: meta.assets.art, sounds: meta.assets.sounds },
  };
  if (meta.terms?.specialDie !== undefined) {
    pack.terms = { specialDie: meta.terms.specialDie };
  }
  return pack;
}

export async function loadPack(dir: string, fs: FsLike): Promise<Pack> {
  const files: Record<string, string> = {};
  for (const name of FILE_NAMES) {
    try {
      files[name] = await fs.readFile(`${dir}/${name}`);
    } catch {
      // reported by packFromFiles as a missing file
    }
  }
  const exists = new Map<string, boolean>();
  const assets = collectAssetPaths(files);
  for (const rel of assets) exists.set(rel, await fs.exists(`${dir}/${rel}`));
  return packFromFiles(files, (rel) => exists.get(rel) ?? false);
}

export function loadPackSync(dir: string): Pack {
  const files: Record<string, string> = {};
  for (const name of FILE_NAMES) {
    try {
      files[name] = readFileSync(join(dir, name), 'utf8');
    } catch {
      // reported by packFromFiles as a missing file
    }
  }
  return packFromFiles(files, (rel) => {
    try {
      readFileSync(join(dir, rel));
      return true;
    } catch {
      return false;
    }
  });
}

function collectAssetPaths(files: Record<string, string>): string[] {
  const text = files['pack.json'];
  if (text === undefined) return [];
  try {
    const assets = (JSON.parse(text) as { assets?: Record<string, unknown> }).assets ?? {};
    const out: string[] = [];
    for (const group of Object.values(assets)) {
      if (group && typeof group === 'object') {
        for (const v of Object.values(group as Record<string, unknown>)) {
          if (typeof v === 'string') out.push(v);
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}
