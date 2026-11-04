# Data Model: AI-driven player seats

## Engine additions (pure)

- `Holder` gains `{ kind: 'ai'; label: string }`. `label` is shown to viewers (for example
  `Claude Haiku`); it is not a key or an id of a service.
- `Command` gains
  `{ type: 'ai-declare'; at: number; seat: number; option: number; cp: number; fp: boolean; quote?: string }`
  and `{ type: 'assign'; at: number; seat: number; holder: 'ai' | 'bot'; label?: string }`.
  Neither has an `actor`, so the viewer cooldown does not apply.
- `Event` gains `{ type: 'seat-assigned'; seat: number; holder: 'ai' | 'bot'; label: string }`;
  `declared.by` gains `'ai'`.
- An `ai` seat is not "free" (`!join` cannot take it) and does not miss rounds. An undeclared `ai`
  seat at window close is declared by the bot script (the autopilot).

## Runtime (not in game state)

```ts
type DriverId = 'bot' | 'claude' | 'gemini' | 'groq';

interface SeatConfig {
  seat: 0 | 1 | 2 | 3;          // which character
  label: string;                // shown on the overlay, e.g. "Claude Haiku"
  primary: DriverSpec;
  backup: DriverSpec;           // usually bot or groq
  caps: Caps;
}
interface DriverSpec { id: DriverId; model: string }
interface Caps {
  tokensPerTurn: number; callsPerTurn: number;
  tokensPerSession: number; callsPerSession: number;
}

interface TurnPacket {
  seat: number;
  round: number;
  system: string;               // fixed role text for every driver
  user: string;                 // the seat's view, about 850 tokens
  options: { n: number; label: string }[];
  maxCp: number;
  hasFp: boolean;
  deadlineMs: number;
}

interface Decision { option: number; cp: number; fp: boolean; quote?: string }

interface DriverResult {
  decision: Decision | null;
  tokensIn: number; tokensOut: number; latencyMs: number;
  outcome: 'ok' | 'bad-answer' | 'http-error' | 'timeout' | 'capped' | 'no-key';
}

interface Driver {
  readonly id: DriverId;
  readonly model: string;
  decide(packet: TurnPacket, deadlineAt: number): Promise<DriverResult>;
}
```

## Packet allow-list (the spoiler firewall)

The packet may hold, and only these:

- the seat's own character: name, pronouns, concept, attribute codes, skill names and codes, weapon
  names, wound level, Character and Force Points left;
- the scene as the table read it: the scene's narration line and its `place`;
- the options on offer: number and label;
- who else is in the scene: allies' names, concepts and wound levels; live NPCs' names and wound
  levels;
- the round number, the rounds left and the seconds left;
- the seat's own history: up to 5 lines of what this seat chose and what happened to it;
- the last table lines everyone saw, quoted, at most 3, each cut to 140 characters.

It never holds: scene ids, `next`, `success`, `failure`, `win`, `lose`, `flee`, a check's skill or
difficulty, NPC attributes, skills, weapons or tactics, other seats' attributes, skills, bot scripts or
points, `state.rng`, `seq`, the viewer user ids.

## Token log line (JSON, one per line)

`{"t":<ms>,"kind":"call","seat":1,"driver":"claude","model":"...","round":7,"in":812,"out":14,
"ms":640,"outcome":"ok"}` and
`{"t":<ms>,"kind":"swap","seat":2,"from":"gemini","to":"groq","reason":"manual|failover|human-left","round":9}`.
No key, no viewer text, no packet text.

## Seats file

`<DATA_DIR>/ai-seats.json`: `{ version: 1, seats: [{ seat, driver: DriverId, onBackup: boolean,
history: string[] }] }`, written after each turn so a restart picks the seat's driver and history up.
