import { z } from 'zod';

const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);
const dice = z.string().regex(/^\s*[0-9]+\s*[dD]\s*([+-]\s*[0-9]+)?\s*$/);
const attribute = z.enum([
  'reflexes',
  'coordination',
  'physique',
  'knowledge',
  'perception',
  'presence',
]);
const difficulty = z.enum([
  'very-easy',
  'easy',
  'moderate',
  'difficult',
  'very-difficult',
  'heroic',
]);
const wound = z.enum([
  'healthy',
  'stunned',
  'wounded',
  'severely-wounded',
  'incapacitated',
  'mortally-wounded',
  'dead',
]);

const attributes = z.strictObject({
  reflexes: dice,
  coordination: dice,
  physique: dice,
  knowledge: dice,
  perception: dice,
  presence: dice,
});

const skill = z.strictObject({ name: z.string().min(1), attribute, code: dice });

const weapon = z.strictObject({
  id,
  name: z.string(),
  skill: z.string(),
  damage: dice,
  range: difficulty,
});

const character = z.strictObject({
  id,
  name: z.string().min(1),
  pronouns: z.string(),
  concept: z.string(),
  attributes,
  skills: z.array(skill),
  weapons: z.array(weapon),
  armor: dice,
  points: z.strictObject({ cp: z.number().int().min(0), fp: z.number().int().min(0) }),
  bot: z.strictObject({
    prefer: z.array(z.string()),
    combat: z.enum(['attack-weakest', 'attack-strongest', 'attack-first', 'dodge']),
    spendCp: z.enum(['never', 'when-out-of-options', 'on-checks']),
  }),
});

const npc = z.strictObject({
  id,
  name: z.string(),
  attributes,
  skills: z.array(skill),
  weapons: z.array(weapon),
  armor: dice,
  outAt: wound,
  tactic: z.enum(['attack-weakest', 'attack-random', 'attack-first']),
});

const choice = z
  .strictObject({
    id,
    label: z.string().min(1).max(40),
    next: id.optional(),
    check: z
      .strictObject({
        skill: z.string(),
        difficulty: z.union([difficulty, z.number().int().min(1)]),
        success: id,
        failure: id,
      })
      .optional(),
  })
  .refine((c) => (c.next !== undefined) !== (c.check !== undefined), {
    message: 'a choice has exactly one of next and check',
  });

const combat = z.strictObject({
  npcs: z
    .array(z.strictObject({ npc: id, count: z.number().int().min(1).max(6) }))
    .min(1),
  win: id,
  lose: id,
  flee: id.optional(),
});

const scene = z
  .strictObject({
    id,
    template: z.string(),
    facts: z.record(z.string(), z.string()),
    map: z.string().optional(),
    choices: z.array(choice).min(1).max(9).optional(),
    default: id.optional(),
    combat: combat.optional(),
    ending: z.enum(['victory', 'defeat', 'timeout']).optional(),
  })
  .refine(
    (s) => {
      const hasChoices = s.choices !== undefined && s.default !== undefined;
      const choicesPart = s.choices !== undefined || s.default !== undefined;
      const kinds =
        (choicesPart ? 1 : 0) + (s.combat !== undefined ? 1 : 0) + (s.ending !== undefined ? 1 : 0);
      if (kinds !== 1) return false;
      return choicesPart ? hasChoices : true;
    },
    { message: 'a scene has exactly one of choices (with default), combat, or ending' }
  );

const adventure = z.strictObject({
  start: id,
  roundLimit: z.number().int().min(1),
  rewards: z.strictObject({
    victory: z.number().int().min(0),
    defeat: z.number().int().min(0),
    timeout: z.number().int().min(0),
  }),
  scenes: z.array(scene).min(1),
});

const assetMap = z.record(z.string(), z.string().regex(/^[^/.][^:]*$/));

export const packFileSchema = z.strictObject({
  id,
  name: z.string().min(1),
  version: z.string().regex(/^[0-9]+\.[0-9]+\.[0-9]+$/),
  licence: z.string().min(1),
  terms: z.strictObject({ specialDie: z.string().min(1).max(20).optional() }).optional(),
  skills: z.array(z.strictObject({ name: z.string().min(1), attribute })).min(1),
  assets: z.strictObject({
    map: assetMap.default({}),
    art: assetMap.default({}),
    sounds: assetMap.default({}),
  }),
});

export const charactersFileSchema = z.array(character).length(4);
export const npcsFileSchema = z.array(npc);
export const adventureFileSchema = adventure;
export const templatesFileSchema = z.record(
  z.string(),
  z.array(z.string().min(1).max(300)).min(1)
);

export const PackFiles = {
  'pack.json': packFileSchema,
  'characters.json': charactersFileSchema,
  'npcs.json': npcsFileSchema,
  'adventure.json': adventureFileSchema,
  'templates.json': templatesFileSchema,
} as const;

export type PackFileName = keyof typeof PackFiles;
export type PackFileData = {
  [K in PackFileName]: z.infer<(typeof PackFiles)[K]>;
};
