import type { Actor } from '../../src/engine/commands.js';
import type { Character } from '../../src/engine/pack.js';

export function viewer(n: number): Actor {
  return { userId: 'u' + n, login: 'viewer' + n, isMod: false, isBroadcaster: false };
}

export function mod(n: number): Actor {
  return { ...viewer(n), isMod: true };
}

export function character(id = 'ana'): Character {
  return {
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    pronouns: 'they/them',
    concept: 'tester',
    attributes: {
      reflexes: { dice: 2, pips: 0 },
      coordination: { dice: 2, pips: 0 },
      physique: { dice: 2, pips: 0 },
      knowledge: { dice: 2, pips: 0 },
      perception: { dice: 2, pips: 0 },
      presence: { dice: 2, pips: 0 },
    },
    skills: [
      { name: 'marksmanship', attribute: 'coordination', code: { dice: 3, pips: 0 } },
      { name: 'dodge', attribute: 'reflexes', code: { dice: 3, pips: 0 } },
    ],
    weapons: [
      {
        id: 'pistol',
        name: 'Pistol',
        skill: 'marksmanship',
        damage: { dice: 3, pips: 0 },
        range: 'easy',
      },
    ],
    armor: { dice: 0, pips: 0 },
    wound: 'healthy',
    stunnedUntil: null,
    points: { cp: 5, fp: 1 },
    advances: {},
    bot: { prefer: ['go'], combat: 'attack-first', spendCp: 'never' },
  };
}
