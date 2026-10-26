import { describe, it, expect } from 'vitest';
import { orderInitiative, type InitiativeEntry } from '../../src/engine/initiative.js';

describe('initiative', () => {
  it('orders initiative entries correctly', () => {
    const entries: InitiativeEntry[] = [
      {
        id: 'b',
        total: 10,
        perception: { dice: 3, pips: 0 },
        reflexes: { dice: 2, pips: 0 },
      },
      {
        id: 'a',
        total: 10,
        perception: { dice: 3, pips: 0 },
        reflexes: { dice: 2, pips: 0 },
      },
      {
        id: 'e',
        total: 10,
        perception: { dice: 3, pips: 0 },
        reflexes: { dice: 3, pips: 0 },
      },
      {
        id: 'c',
        total: 12,
        perception: { dice: 2, pips: 0 },
        reflexes: { dice: 2, pips: 0 },
      },
      {
        id: 'd',
        total: 10,
        perception: { dice: 3, pips: 1 },
        reflexes: { dice: 1, pips: 0 },
      },
    ];

    expect(orderInitiative(entries)).toEqual(['c', 'd', 'e', 'a', 'b']);
  });
});
