# Contract: events, the log and the snapshot

`src/engine/events.ts` exports the `Event` union below, written as is. `apply()` returns events in the
order they happened; the runtime numbers them, appends them to `events.jsonl`, then writes the
snapshot. The overlay, the chat replies and the narrator are all fed from these events and nothing
else.

## The Event union

```ts
import type { DiceCode } from './dice.js';
import type { WoundLevel } from './tables.js';
import type { Option } from './state.js';

export type Who = string;   // 'seat:0'..'seat:3' or an NPC uid such as 'raider#1'

export type Event =
  | { type: 'started'; packId: string; seed: number }
  | { type: 'paused'; reason: 'host' | 'admin' | 'offline' }
  | { type: 'resumed' }
  | { type: 'stopped' }
  | { type: 'scene-entered'; sceneId: string }
  | { type: 'window-opened'; round: number; endsAt: number; options: Option[] }
  | { type: 'declared'; seat: number; by: 'bot' | 'viewer'; option: number }
  | { type: 'vote'; sceneId: string; tally: Record<number, number>; winner: number }
  | { type: 'roll'; who: Who; skill: string; code: DiceCode; normal: number[]; special: number[];
      cp: number[][]; dropped: number[]; complication: boolean; total: number }
  | { type: 'check'; who: Who; skill: string; total: number; target: number; success: boolean; margin: number }
  | { type: 'complication'; who: Who }
  | { type: 'initiative'; order: Who[] }
  | { type: 'damage'; target: Who; total: number; resist: number; margin: number; wound: WoundLevel | null }
  | { type: 'wound'; target: Who; from: WoundLevel; to: WoundLevel }
  | { type: 'points'; who: Who; kind: 'cp' | 'fp'; spent: number; left: number }
  | { type: 'seat-claimed'; seat: number; userId: string; login: string; character: string }
  | { type: 'seat-released'; seat: number; userId: string; login: string; reason: 'leave' | 'missed' | 'kick' }
  | { type: 'waitlisted'; userId: string; login: string; position: number; character?: string }
  | { type: 'unwaitlisted'; userId: string }
  | { type: 'missed'; seat: number; userId: string; login: string; count: number }
  | { type: 'narrate'; template: string; variant: number; vars: Record<string, string>;
      quotes: { character: string; text: string }[] }
  | { type: 'reply'; to: string; login: string; kind: 'sheet' | 'status' | 'characters' | 'help' }
  | { type: 'rejected'; to: string; login: string; reason: RejectReason }
  | { type: 'ignored'; reason: 'cooldown' | 'stale' | 'paused' }
  | { type: 'ended'; ending: 'victory' | 'defeat' | 'timeout'; sceneId: string }
  | { type: 'rewards'; userId: string; login: string; cp: number };

export type RejectReason =
  | 'seat-taken' | 'no-such-character' | 'already-seated' | 'not-mod'
  | 'no-check' | 'no-points' | 'not-seated';
```

## When each event is emitted

| Event | Emitted by | When |
| ------- | ----------- | ------ |
| `started` | `host`/`admin` `start` | first start of a night; `seed` is `state.rng.seed` |
| `paused` | `host`/`admin` `pause`, `offline` | phase becomes `paused`; the open window's timer stops |
| `resumed` | `start` while `paused` | phase returns to `pausedFrom`; the window reopens with a fresh `endsAt` |
| `stopped` | `host`/`admin` `stop` | phase becomes `ended` with `ending: null`; viewers saved |
| `scene-entered` | GM | every scene change, including the first |
| `window-opened` | GM | each declare window; `endsAt = at + settings.declareMs` |
| `declared` | `pick`, `roll`, bot | one per seat per window; bots declare as the window opens |
| `vote` | GM | when a scene window closes; `tally` maps option `n` to votes |
| `roll` | engine | every dice roll, including NPC rolls and initiative |
| `check` | engine | every roll compared to a difficulty or an opposed roll |
| `complication` | engine | first special face 1 under `specialOne: 'complication'` |
| `initiative` | GM | start of each combat round |
| `damage`, `wound` | GM | a hit; `wound` only when the level changes (stun clearing included) |
| `points` | engine | a CP or FP is spent (at resolution, before the roll) |
| `seat-claimed`, `seat-released` | seats | claims, `!leave`, two misses, `kick` |
| `waitlisted`, `unwaitlisted` | seats | `!join` with no free seat; `!leave` or promotion off the list |
| `missed` | GM | a viewer seat had no declaration when the window closed |
| `narrate` | GM | each line to word; `variant` is drawn from the RNG, so the log is deterministic |
| `reply` | `query` | a `!sheet`/`!status`/`!characters`/`!help`; the runtime builds the text |
| `rejected` | any command | the command was understood but not allowed; `to` is the user id |
| `ignored` | any command | cooldown, stale option (no open window or `n` not offered) or paused |
| `ended` | GM | an ending scene is entered |
| `rewards` | GM | after `ended`, one per seated viewer; `cp` from `adventure.rewards` |

Rules that tests pin:

- Every event aimed at one viewer carries both `userId`/`to` (the key) and `login` (for the reply
  line), so `replyLines` never needs a lookup.
- `ignored` carries no `to`, and the runtime sends no chat line for it (FR-017, edge case "stale !2").
- `rejected` always gets one chat reply (contracts/chat-commands.md).
- Wound levels in `wound.from`/`wound.to` use `WOUND_ORDER` names exactly.
- A `roll` event's arrays are copies of the `RollResult` (data-model.md); `total` is never below 0.

## The JSONL log line (`events.jsonl`)

```ts
export interface LogLine extends Record<string, unknown> {
  seq: number;     // 1, 2, 3 ... across the whole night: before.seq + index + 1
  at: number;      // the command's `at`
  round: number;   // before.round, then the `round` of each `window-opened` from that event on
  type: Event['type'];
}
// one line = JSON.stringify({ seq, at, round, ...event })
```

`toLogLines(events, before, at)` gets the state from before the command (`before`), so one command
that spans two rounds still logs each event with the round it belongs to.

Keys are written in that order (`seq`, `at`, `round`, then the event's own keys in the order of the
union above). Same seed, same script, same pack: byte-identical file (SC-001). No line holds a token,
an API key or a narrator response body.

## The snapshot (`state.json`)

```json
{ "version": 1, "savedAt": 1793000000000, "state": { "version": 1, "packId": "frontier", "...": "GameState" } }
```

- Written after the log append for every applied command: write `state.json.tmp`, fsync, rename the
  old `state.json` to `state.prev.json`, rename the tmp file to `state.json`.
- On load: parse `state.json`; on a parse or version error use `state.prev.json` and log the error
  (edge case "corrupt snapshot"). If both fail, start from `initialState`.
- On load into `scene` or `combat`, the runtime passes the state through the pure
  `reopenWindow(state, at)` (exported by `src/engine/apply.ts`): the open window keeps its round,
  options and declarations and gets `endsAt = at + settings.declareMs` (edge case "crash
  mid-round"). No dice are rerolled and no event is emitted.
