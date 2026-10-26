import type { DiceCode } from './dice.js';

export interface InitiativeEntry {
  id: string;
  total: number;
  perception: DiceCode;
  reflexes: DiceCode;
}

export function orderInitiative(entries: InitiativeEntry[]): string[] {
  const sorted = [...entries].sort((a, b) => {
    if (b.total !== a.total) {
      return b.total - a.total;
    }
    if (b.perception.dice !== a.perception.dice) {
      return b.perception.dice - a.perception.dice;
    }
    if (b.perception.pips !== a.perception.pips) {
      return b.perception.pips - a.perception.pips;
    }
    if (b.reflexes.dice !== a.reflexes.dice) {
      return b.reflexes.dice - a.reflexes.dice;
    }
    if (b.reflexes.pips !== a.reflexes.pips) {
      return b.reflexes.pips - a.reflexes.pips;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return sorted.map((e) => e.id);
}
