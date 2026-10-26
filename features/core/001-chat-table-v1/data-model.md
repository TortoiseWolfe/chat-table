# Data model: chat-table v1

Types below are the contract for phase 2. Copy them into the named files as written; field names and
string literals are used by tests, the log and the overlay. Rules numbers come from
[research.md](./research.md) R1 to R7.

## Dice codes (`src/engine/dice.ts`)

```ts
/** A dice code such as 3D+2. Normalised: 0 <= pips <= 2. */
export interface DiceCode { dice: number; pips: number }

export function parseDiceCode(text: string): DiceCode        // "3D+2" | "3d" | "4D+1" | "2D-1"; throws on bad input
export function formatDiceCode(code: DiceCode): string       // "3D+2", "4D", "2D+1"
export function addDice(a: DiceCode, b: DiceCode): DiceCode   // pip carry: 3 pips -> 1 die
export function addPips(code: DiceCode, pips: number): DiceCode  // pips may be negative; never below 0D
export function minusDice(code: DiceCode, dice: number): DiceCode // penalty; never below 0D+0
export function doubleDice(code: DiceCode): DiceCode          // Fate Point: dice x2, pips x2, NOT normalised (4D+2 -> 8D+4)
```

Normalising: `2D+4` becomes `3D+1`; a negative pip borrows a die (`3D-1` becomes `2D+2`); `0D+n` is
legal. Parsing accepts upper or lower case `D` and ignores spaces. `doubleDice` is the one function
whose result may have pips above 2; `rollCode` accepts any pips >= 0.

## Random numbers (`src/engine/rng.ts`)

```ts
export interface RngState { seed: number; counter: number }   // both uint32-safe integers
export interface Rng { die(sides: number): number; readonly state: RngState }
export function createRng(state: RngState): Rng
export function mix32(x: number): number
```

Draw `k` (k = the counter before the draw) is `mix32((seed + Math.imul(k, 0x9e3779b9)) >>> 0)`, and
the die face is `1 + Math.floor((value / 4294967296) * sides)`. `mix32` is the MurmurHash3 finaliser:

```ts
h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return h >>> 0;
```

Every `die()` call adds 1 to `counter`. `apply` copies `rng.state` back into `GameState.rng`, so a
snapshot resumes the same sequence.

## Rules words (`src/engine/terms.ts`)

```ts
export const SPECIAL_DIE_NAME = 'Wild Die';      // FR-009: the only place this name is written
export const SPECIAL_DIE_SHORT = 'WD';
```

Every chat line, overlay label and template that names the special die reads these constants (or the
pack's `terms` override). No other file spells the name.

## Rolls (`src/engine/roll.ts`)

```ts
export type SpecialOneRule = 'complication' | 'drop-highest' | 'none';
export interface RollOptions {
  cpDice?: number;            // Character Point dice added (R4); a 1 on them counts as 1
  specialOne: SpecialOneRule;  // host option; default 'drop-highest' (R2)
}
export interface RollResult {
  code: DiceCode;              // the code rolled, after penalties and doubling
  normal: number[];            // faces of the normal dice (code.dice - 1 of them; none for 0D)
  special: number[];           // the special die chain: first face, then each reroll after a 6
  cp: number[][];              // one chain per Character Point die, same exploding rule
  dropped: number[];           // faces removed by 'drop-highest' (the 1 and the highest normal die)
  complication: boolean;       // true when the first special face is 1 and the rule is 'complication'
  pips: number;
  total: number;               // sum of kept faces + pips, never below 0
}
export function rollCode(code: DiceCode, opts: RollOptions, rng: Rng): RollResult
```

Order of draws (fixed, tests depend on it): normal dice left to right, then the special die chain,
then each CP chain in order. A code of `0D+n` rolls no dice and totals `n`. A code of `1D` rolls only
the special die.

## Tables (`src/engine/tables.ts`)

```ts
export type Difficulty = 'very-easy' | 'easy' | 'moderate' | 'difficult' | 'very-difficult' | 'heroic';
export const DIFFICULTY: Record<Difficulty, number>;   // 5, 10, 15, 20, 25, 30 (R3)
export const COMBAT_MIN_DIFFICULTY = 3;
export type WoundLevel = 'healthy' | 'stunned' | 'wounded' | 'severely-wounded'
  | 'incapacitated' | 'mortally-wounded' | 'dead';
export const WOUND_ORDER: readonly WoundLevel[];       // healthy ... dead, in that order
export const WOUND_BANDS: readonly { minMargin: number; level: WoundLevel }[];
  // [{1,'stunned'},{4,'wounded'},{9,'incapacitated'},{13,'mortally-wounded'},{16,'dead'}] (R5)
export const WOUND_PENALTY: Record<WoundLevel, number>;
  // stunned 1, wounded 1, severely-wounded 2, every other level 0 (R5)
```

## Checks, wounds, points, initiative

```ts
// src/engine/checks.ts
export interface CheckResult { total: number; target: number; success: boolean; margin: number }
export function check(roll: RollResult, difficulty: number): CheckResult      // success when total >= difficulty
export function opposed(initiator: RollResult, other: RollResult): CheckResult  // ties go to the initiator (R3)
export function multiActionPenalty(actions: number): number                     // dice removed: actions - 1, min 0

// src/engine/wounds.ts
export function woundFromMargin(margin: number): WoundLevel | null   // null when margin <= 0
export function applyWound(current: WoundLevel, hit: WoundLevel): WoundLevel // stacking rule, R5
export function isOut(level: WoundLevel): boolean                    // incapacitated or worse

// src/engine/points.ts
export interface Points { cp: number; fp: number }
export function canSpendCp(points: Points, n: number, max: number): boolean // 1 <= n <= max and n <= points.cp
export function canSpendFp(points: Points, cpOnThisRoll: number): boolean   // fp >= 1 and no CP on this roll (R4)

// src/engine/initiative.ts
export interface InitiativeEntry { id: string; total: number; perception: DiceCode; reflexes: DiceCode }
export function orderInitiative(entries: InitiativeEntry[]): string[]
  // total desc, then perception (dice, then pips) desc, then reflexes desc, then id asc (R6)
```

## Characters and NPCs (`src/engine/state.ts`, mirrored by `src/packs/schema.ts`)

```ts
export type Attribute = 'reflexes' | 'coordination' | 'physique' | 'knowledge' | 'perception' | 'presence';
export interface Skill { name: string; attribute: Attribute; code: DiceCode }   // code = full code, not a bonus
export interface Weapon { id: string; name: string; skill: string; damage: DiceCode; range: Difficulty }
export interface BotScript {
  prefer: string[];        // choice ids in preference order; first one present wins
  combat: 'attack-weakest' | 'attack-strongest' | 'attack-first' | 'dodge';
  spendCp: 'never' | 'when-out-of-options' | 'on-checks'; // bots spend at most 1 CP
}
export interface Character {
  id: string; name: string; pronouns: string; concept: string;
  attributes: Record<Attribute, DiceCode>;
  skills: Skill[];
  weapons: Weapon[];
  armor: DiceCode;            // added to physique when resisting damage
  wound: WoundLevel;
  stunnedUntil: number | null; // combatRound at whose end 'stunned' clears (R5)
  points: Points;
  advances: Record<string, string>;   // reserved; empty in v1
  bot: BotScript;
}
export interface NpcTemplate {
  id: string; name: string;
  attributes: Record<Attribute, DiceCode>;
  skills: Skill[]; weapons: Weapon[]; armor: DiceCode;
  outAt: WoundLevel;          // a minion is out at 'wounded'; a boss at 'incapacitated'
  tactic: 'attack-weakest' | 'attack-random' | 'attack-first';
}
export interface Npc extends NpcTemplate { uid: string; wound: WoundLevel; stunnedUntil: number | null } // uid = `${id}#${n}`, n from 1
```

The six attributes are D6 Adventure's (research.md R1). A skill the
character lacks rolls its attribute (FR-008); `skillCode(character, name, attributeOf)` lives in
`src/engine/checks.ts`. `attributeOf(name)` reads the pack's `skills` list.

## Seats and viewers

```ts
export type Holder =
  | { kind: 'bot' }
  | { kind: 'viewer'; userId: string; login: string; activeFromRound: number };
export interface Seat { index: 0 | 1 | 2 | 3; character: Character; holder: Holder; missed: number }
export interface WaitEntry { userId: string; login: string; character?: string }
export interface ViewerRecord { characters: Record<string, { points: Points; advances: Record<string, string> }> }
```

## Game state (`src/engine/state.ts`)

```ts
export type Phase = 'idle' | 'scene' | 'combat' | 'paused' | 'ended';
export type Declaration =
  | { kind: 'pick'; option: number; cp: number; fp: boolean }   // option = Option.n
  | { kind: 'default' };
export interface Window { round: number; opensAt: number; endsAt: number; options: Option[] }
export interface Option { n: number; id: string; label: string }   // n = 1..9 as shown in chat
export interface Settings {
  declareMs: number;         // 60000
  cooldownMs: number;        // 3000
  missedLimit: number;       // 2
  cpPerRollMax: number;      // 2
  specialOne: SpecialOneRule; // 'drop-highest'
}
export interface GameState {
  version: 1;
  packId: string;
  settings: Settings;
  phase: Phase;
  pausedFrom: Exclude<Phase, 'paused'> | null;
  sceneId: string | null;
  round: number;                  // windows opened so far
  window: Window | null;
  declarations: Record<number, Declaration>;   // key = seat index
  quotes: Record<number, string>;  // key = seat index; this window's !say line, cleared when it resolves
  dodges: Record<string, number>;  // who -> dodge total this combat round; cleared each round
  seats: Seat[];                  // always 4
  npcs: Npc[];                    // live NPCs in the current combat
  initiative: string[];           // ids: 'seat:0' | npc uid
  combatRound: number;
  waitlist: WaitEntry[];
  cooldowns: Record<string, number>;   // userId -> at of the last accepted command
  viewers: Record<string, ViewerRecord>;
  rng: RngState;
  seq: number;                    // events emitted so far
  ending: 'victory' | 'defeat' | 'timeout' | null;
}
export function initialState(pack: Pack, seed: number, settings: Settings, viewers?: Record<string, ViewerRecord>): GameState
```

## The GM's working context (`src/engine/ctx.ts`)

```ts
export type Emit = (e: Event) => void;
export interface GmCtx { s: GameState; pack: Pack; rng: Rng; at: number; emit: Emit }
```

`apply` clones the state once (`structuredClone`), builds a `GmCtx` whose `emit` pushes onto its
event list, and passes it to every GM and seat function. Those functions change `ctx.s` in place,
emit events through `ctx.emit` in the order they happen, and return `void` unless their task names a
return value. Only `apply` clones; nothing else copies the state.

## Commands (`src/engine/commands.ts`)

```ts
export interface Actor { userId: string; login: string; isMod: boolean; isBroadcaster: boolean }
export type AdminAction = 'start' | 'pause' | 'stop' | 'skip' | 'kick';
export type Command =
  | { type: 'join'; at: number; actor: Actor; character?: string }
  | { type: 'leave'; at: number; actor: Actor }
  | { type: 'pick'; at: number; actor: Actor; option: number }        // !1..!9
  | { type: 'roll'; at: number; actor: Actor; skill: string }
  | { type: 'say'; at: number; actor: Actor; text: string }
  | { type: 'cp'; at: number; actor: Actor; count: number }
  | { type: 'fp'; at: number; actor: Actor }
  | { type: 'query'; at: number; actor: Actor; what: 'sheet' | 'status' | 'characters' | 'help' }
  | { type: 'admin'; at: number; actor: Actor; action: AdminAction; target?: string } // chat !gm, needs mod
  | { type: 'host'; at: number; action: AdminAction; target?: string }               // admin dock, trusted
  | { type: 'tick'; at: number }                                                      // runtime timer
  | { type: 'offline'; at: number };                                                  // stream.offline
```

`at` is milliseconds since the epoch, supplied by the runtime clock (or the sim's fake clock). The
engine never reads a clock.

## Events (`src/engine/events.ts`)

The full union and its JSON shapes are in [contracts/events.md](./contracts/events.md).

## Pack (types in `src/engine/pack.ts`; zod in `src/packs/schema.ts`)

The types live in the engine so `state.ts` can use them without importing outside `src/engine`.
The JSON Schema is [contracts/pack.schema.json](./contracts/pack.schema.json); `schema.ts` is the zod
version of the same shape and `load.ts` parses dice-code strings into `DiceCode`.

```ts
export interface Pack {
  id: string; name: string; version: string; licence: string;
  terms?: { specialDie?: string };     // override SPECIAL_DIE_NAME for display
  skills: { name: string; attribute: Attribute }[];
  characters: Character[];             // exactly 4
  npcs: NpcTemplate[];
  adventure: Adventure;
  templates: Record<string, string[]>; // key -> variants; {placeholders}
  assets: { map: Record<string, string>; art: Record<string, string>; sounds: Record<string, string> };
}
export interface Adventure { start: string; roundLimit: number; rewards: { victory: number; defeat: number; timeout: number }; scenes: Scene[] }
export interface Choice {
  id: string; label: string;
  next?: string;                                           // plain move
  check?: { skill: string; difficulty: Difficulty | number; success: string; failure: string };
}
export interface Scene {
  id: string; template: string; facts: Record<string, string>; map?: string;
  choices?: Choice[];          // 1..9
  default?: string;            // choice id used when nobody declares
  combat?: { npcs: { npc: string; count: number }[]; win: string; lose: string; flee?: string };  // flee = a scene id
  ending?: 'victory' | 'defeat' | 'timeout';
}
```

Each scene has exactly one of `choices` (with `default`), `combat` or `ending`. Every `next`, `success`,
`failure`, `win`, `lose` and `flee` names a scene in the same adventure. The loader rejects a pack that breaks this, that has no
victory and no defeat ending reachable from `start`, or that does not have exactly one `timeout`
ending (the GM enters it when `round` passes `roundLimit`; it need not be reachable by a choice).
Every character and NPC has at least one weapon, and every `scene.template` and every GM template
key (tasks.md T031) exists in `templates`.

## Files on disk (`src/runtime/store.ts`)

| File | Content | Written |
| ------ | --------- | --------- |
| `state.json` | `{ "version": 1, "savedAt": <ms>, "state": GameState }` | after every applied command: write `.tmp`, fsync, rename; old file renamed to `state.prev.json` first |
| `events.jsonl` | one `LogLine` per line (contracts/events.md) | appended after every applied command, before the snapshot |
| `viewers.json` | `Record<userId, ViewerRecord>` | on `ended`, `stopped` and every seat release |
| `token.json` | Twitch access and refresh token | phase 4, mode 0600, never logged |
