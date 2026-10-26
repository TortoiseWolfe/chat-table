export const SPECIAL_DIE_NAME = 'Wild Die';
export const SPECIAL_DIE_SHORT = 'WD';

export function specialDieName(pack?: { terms?: { specialDie?: string } }): string {
  return pack?.terms?.specialDie ?? SPECIAL_DIE_NAME;
}
