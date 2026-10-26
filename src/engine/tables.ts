export type Difficulty =
  | 'very-easy'
  | 'easy'
  | 'moderate'
  | 'difficult'
  | 'very-difficult'
  | 'heroic';

export const DIFFICULTY: Record<Difficulty, number> = {
  'very-easy': 5,
  easy: 10,
  moderate: 15,
  difficult: 20,
  'very-difficult': 25,
  heroic: 30,
};

export const COMBAT_MIN_DIFFICULTY = 3;

export type WoundLevel =
  | 'healthy'
  | 'stunned'
  | 'wounded'
  | 'severely-wounded'
  | 'incapacitated'
  | 'mortally-wounded'
  | 'dead';

export const WOUND_ORDER: readonly WoundLevel[] = [
  'healthy',
  'stunned',
  'wounded',
  'severely-wounded',
  'incapacitated',
  'mortally-wounded',
  'dead',
] as const;

export const WOUND_BANDS: readonly { minMargin: number; level: WoundLevel }[] = [
  { minMargin: 1, level: 'stunned' },
  { minMargin: 4, level: 'wounded' },
  { minMargin: 9, level: 'incapacitated' },
  { minMargin: 13, level: 'mortally-wounded' },
  { minMargin: 16, level: 'dead' },
] as const;

export const WOUND_PENALTY: Record<WoundLevel, number> = {
  healthy: 0,
  stunned: 1,
  wounded: 1,
  'severely-wounded': 2,
  incapacitated: 0,
  'mortally-wounded': 0,
  dead: 0,
};
