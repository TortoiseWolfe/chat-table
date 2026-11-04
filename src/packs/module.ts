import { isAbsolute, relative, resolve } from 'node:path';
import { inspect } from 'node:util';
import { z } from 'zod';
import type { FsLike } from '../runtime/deps.js';

/**
 * A private adventure module: notes only the game master may read, kept in a folder outside the
 * repo. It mirrors the content pack's shape (one JSON file per topic, a schema for each, one error
 * listing every problem), but it adds nothing a player can see.
 *
 * Spoiler firewall: only the files in MODULE_READERS import this file (a test checks the list), and
 * a loaded module can only be read through `GmOnlyModule`, which hides its content from JSON,
 * string conversion and console output. The packet builder, the narrator facts and the overlay view
 * never receive one.
 */

const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);
const text = z.string().max(2000);

export const moduleMetaSchema = z.strictObject({
  id,
  name: z.string().min(1),
  version: z.string().regex(/^[0-9]+\.[0-9]+\.[0-9]+$/),
  /** Where the material comes from, for the owner's own reference. */
  source: z.string(),
});

export const sceneNotesSchema = z.array(
  z.strictObject({
    scene: id,
    notes: z.array(text),
    secrets: z.array(text),
  })
);

export const npcNotesSchema = z.array(
  z.strictObject({
    npc: id,
    motive: text,
    secrets: z.array(text),
  })
);

export const ModuleFiles = {
  'module.json': moduleMetaSchema,
  'scenes.json': sceneNotesSchema,
  'npcs.json': npcNotesSchema,
} as const;

export type ModuleFileName = keyof typeof ModuleFiles;
const FILE_NAMES = Object.keys(ModuleFiles) as ModuleFileName[];

/** Source files allowed to import this module (the loader's callers); a test keeps the list true. */
export const MODULE_READERS: readonly string[] = [
  'src/main.ts',
  'src/runtime/session.ts',
];

export interface SceneNotes {
  notes: string[];
  secrets: string[];
}
export interface NpcNotes {
  motive: string;
  secrets: string[];
}

/** The only way to read a loaded module. Content is in private fields and never serialised. */
export class GmOnlyModule {
  readonly #notes: Map<string, SceneNotes>;
  readonly #npcs: Map<string, NpcNotes>;
  /** Safe to show: the module's id, name and version. */
  readonly label: string;

  constructor(label: string, notes: Map<string, SceneNotes>, npcs: Map<string, NpcNotes>) {
    this.label = label;
    this.#notes = notes;
    this.#npcs = npcs;
  }

  scene(sceneId: string): SceneNotes | undefined {
    return this.#notes.get(sceneId);
  }

  npc(npcId: string): NpcNotes | undefined {
    return this.#npcs.get(npcId);
  }

  toJSON(): string {
    return `[gm-only module ${this.label}]`;
  }

  toString(): string {
    return this.toJSON();
  }

  [inspect.custom](): string {
    return this.toJSON();
  }
}

/** Builds the module from raw file text; throws one error listing every problem. */
export function moduleFromFiles(files: Record<string, string>, known?: KnownIds): GmOnlyModule {
  const problems: string[] = [];
  const parsed: Partial<Record<ModuleFileName, unknown>> = {};
  for (const name of FILE_NAMES) {
    const raw = files[name];
    if (raw === undefined) {
      problems.push(`${name}: (file): missing`);
      continue;
    }
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch (e) {
      problems.push(`${name}: (file): invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    const r = ModuleFiles[name].safeParse(json);
    if (r.success) parsed[name] = r.data;
    else {
      for (const issue of r.error.issues) {
        problems.push(`${name}: ${issue.path.join('.') || '(root)'}: ${issue.message}`);
      }
    }
  }
  if (problems.length > 0) throw new Error(problems.join('\n'));

  const meta = parsed['module.json'] as z.infer<typeof moduleMetaSchema>;
  const scenes = parsed['scenes.json'] as z.infer<typeof sceneNotesSchema>;
  const npcs = parsed['npcs.json'] as z.infer<typeof npcNotesSchema>;

  const notes = new Map<string, SceneNotes>();
  scenes.forEach((s, i) => {
    if (notes.has(s.scene)) problems.push(`scenes.json: ${String(i)}.scene: duplicate "${s.scene}"`);
    if (known && !known.scenes.has(s.scene)) {
      problems.push(`scenes.json: ${String(i)}.scene: no such scene "${s.scene}" in the pack`);
    }
    notes.set(s.scene, { notes: s.notes, secrets: s.secrets });
  });
  const npcMap = new Map<string, NpcNotes>();
  npcs.forEach((n, i) => {
    if (npcMap.has(n.npc)) problems.push(`npcs.json: ${String(i)}.npc: duplicate "${n.npc}"`);
    if (known && !known.npcs.has(n.npc)) {
      problems.push(`npcs.json: ${String(i)}.npc: no such npc "${n.npc}" in the pack`);
    }
    npcMap.set(n.npc, { motive: n.motive, secrets: n.secrets });
  });
  if (problems.length > 0) throw new Error(problems.join('\n'));

  return new GmOnlyModule(`${meta.id}@${meta.version}`, notes, npcMap);
}

/** Scene and NPC ids of the pack a module is played with, to catch a note for something absent. */
export interface KnownIds {
  scenes: ReadonlySet<string>;
  npcs: ReadonlySet<string>;
}

export async function loadPrivateModule(
  dir: string,
  fs: FsLike,
  known?: KnownIds
): Promise<GmOnlyModule> {
  const files: Record<string, string> = {};
  for (const name of FILE_NAMES) {
    try {
      files[name] = await fs.readFile(`${dir}/${name}`);
    } catch {
      // reported by moduleFromFiles as a missing file
    }
  }
  return moduleFromFiles(files, known);
}

/**
 * The module folder from the environment: null when the variable is unset (there is no default
 * path), an error when the folder is relative or inside the repo (a private module must never sit
 * where a commit could pick it up).
 */
export function privateModuleDir(
  env: Record<string, string | undefined>,
  repoRoot: string
): string | null {
  const raw = env['PRIVATE_MODULE_DIR'];
  if (raw === undefined || raw.trim() === '') return null;
  const dir = raw.trim();
  if (!isAbsolute(dir)) throw new Error('PRIVATE_MODULE_DIR must be an absolute path');
  const rel = relative(resolve(repoRoot), resolve(dir));
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    throw new Error('PRIVATE_MODULE_DIR must be outside the repo, so private text is never committed');
  }
  return resolve(dir);
}
