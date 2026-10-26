# Contract: chat commands and replies

`src/runtime/parse.ts` turns one chat message into a `Command` (data-model.md) or `null`. It is pure:

```ts
export interface ChatMessage {
  messageId: string; userId: string; login: string; text: string;
  isMod: boolean; isBroadcaster: boolean; at: number;
  sourceChannelId: string | null;   // shared chat: the channel it was sent in; null when sent here
}
export function parseCommand(msg: ChatMessage): Command | null
```

`src/runtime/replies.ts` turns events into chat lines. It is pure too:

```ts
export function replyLines(events: Event[], state: GameState, pack: Pack): string[]
export function narrationLine(e: Extract<Event, { type: 'narrate' }>, pack: Pack): string  // the template fallback
export function chatLines(events: Event[], state: GameState, pack: Pack): string[] // every line, in event order
```

## Grammar

- A command starts with `!` as the first character of the trimmed text. Anything else is `null`.
- The word after `!` is matched case-insensitively. Arguments are split on runs of whitespace.
- An unknown word, or a known word with bad arguments, is `null`: no command, no reply, no cooldown.
- `actor` is `{ userId, login, isMod, isBroadcaster }` from the message; `at` is the message's `at`.

| Text | Command | Notes |
| ------ | --------- | ------- |
| `!join` | `{ type: 'join' }` | first free seat in index order |
| `!join kestrel` | `{ type: 'join', character: 'kestrel' }` | matched against character `id`, then `name`, case-insensitive |
| `!leave` | `{ type: 'leave' }` | frees the seat, or leaves the waitlist |
| `!sheet` | `{ type: 'query', what: 'sheet' }` | |
| `!status` | `{ type: 'query', what: 'status' }` | |
| `!characters` | `{ type: 'query', what: 'characters' }` | |
| `!help` | `{ type: 'query', what: 'help' }` | |
| `!1` .. `!9` | `{ type: 'pick', option: n }` | `!0`, `!10` and `!1x` are `null` |
| `!roll piloting` | `{ type: 'roll', skill: 'piloting' }` | the rest of the line, trimmed and lowercased; `!roll` alone is `null` |
| `!say Hold the line!` | `{ type: 'say', text: 'Hold the line!' }` | the rest of the line; cut to 200 characters; empty is `null` |
| `!cp` / `!cp 2` | `{ type: 'cp', count: 1 }` / `count: 2` | `count` an integer 1..9; anything else `null` |
| `!fp` | `{ type: 'fp' }` | |
| `!gm start` / `pause` / `stop` / `skip` | `{ type: 'admin', action }` | parsed for anyone; the engine rejects non-mods |
| `!gm kick somelogin` | `{ type: 'admin', action: 'kick', target: 'somelogin' }` | target lowercased, leading `@` removed; `!gm kick` alone is `null` |

## What the engine does with each command

- **Cooldown:** a command from a user whose last *accepted* command is less than
  `settings.cooldownMs` (3000) before `at` emits `ignored { reason: 'cooldown' }`. Accepted means it
  was not answered with `ignored`: a `rejected` reply counts, and so does a successful `say`, `cp` or
  `fp`, which emit no event. Every accepted command sets `cooldowns[userId] = at`. `query` commands
  count too. `host`, `tick` and `offline`
  have no actor and no cooldown.
- **Paused or idle:** `pick`, `roll`, `say`, `cp` and `fp` emit `ignored { reason: 'paused' }` while
  the phase is `idle`, `paused` or `ended`. `join`, `leave`, `query` and `admin` still work.
- **`join`:** if the user holds a seat: `rejected already-seated`. A named character that is not in
  the pack: `rejected no-such-character`. Named and
  bot-held, or unnamed with a bot-held seat free: `seat-claimed`, with
  `activeFromRound = state.round + 1` when a window is open, else `state.round`. Named and held by a
  viewer while another seat is bot-held: `rejected seat-taken` (the line lists the free ones). No
  bot-held seat at all: `waitlisted` with the 1-based position and the named character, if any, as a
  preference (a user already on the list gets `rejected already-seated`). Commands are applied one
  at a time in arrival order, so of two `!join kestrel` the first gets the seat (US2 scenario 2).
- **`leave`:** seated: `seat-released { reason: 'leave' }`; the bot takes over from the next window,
  then the first waitlisted viewer is promoted (`unwaitlisted`, then `seat-claimed`). Waitlisted:
  `unwaitlisted`. Neither: `rejected not-seated`.
- **`pick n`:** the user's seat must be active this round (`activeFromRound <= round`), else
  `rejected not-seated`. No open window, or `n` not among `window.options`: `ignored stale`. Else
  `declared { by: 'viewer' }`, replacing an earlier declaration from the same seat this window.
- **`roll skill`:** picks the first option in the window whose choice has a check on that skill (the
  name compared lowercased) and declares it as `pick`. No such option: `rejected no-check`.
- **`say text`:** seated users only (`rejected not-seated`). Stored as a quote for the next `narrate`
  event of this window, attributed to the seat's character name. It never changes a declaration, a
  roll or a scene (FR-018, SC-004). Last line per seat per window wins.
- **`cp count`:** attaches `cp: count` to the seat's declaration this window. Rejected `no-points`
  when `canSpendCp(points, count, settings.cpPerRollMax)` is false or the declaration already has
  `fp`. Seated, but no declaration yet this window: `rejected no-check`.
- **`fp`:** attaches `fp: true`. Rejected `no-points` when `canSpendFp(points, cp)` is false. No
  declaration yet: `rejected no-check`. Points are only deducted when the roll is made (`points`).
- **`query`:** `reply { to: userId, kind }`. Works for anyone, seated or not.
- **`admin`:** `isMod || isBroadcaster`, else `rejected not-mod` and nothing else happens (US6).
  Same effect as the `host` command with the same action.
- **`kick login`:** the seat held by that login gets `seat-released { reason: 'kick' }`. No such
  seated login: nothing happens, no event.

## Reply lines

`replyLines` writes at most one line per `reply`, `rejected`, `seat-claimed`, `seat-released`,
`waitlisted`, `window-opened`, `check`, `ended` and `rewards` event, and none for `ignored`. Each line
is at most 500 characters; a longer line is cut at the last space before 497 characters and ends in
`...`. Lines start with `@login` when they answer one user. The special die is always named from
`pack.terms?.specialDie ?? SPECIAL_DIE_NAME`.

| Event | Line (exact text; tests pin it) |
| ------- | ------ |
| `rejected seat-taken` | `@{login} that character is taken. Free: {free}. Type !join <name>.` |
| `rejected no-such-character` | `@{login} no character called that. Free: {free}. Type !characters for the list.` |
| `rejected already-seated` | `@{login} you already have a seat (or a place in line).` |
| `rejected not-mod` | `@{login} only the broadcaster and moderators can use !gm.` |
| `rejected no-check` | `@{login} nothing to roll that on right now. Options: {options}.` |
| `rejected no-points` | `@{login} you can't spend that now ({cp} CP, {fp} FP left; CP and FP never on the same roll).` |
| `rejected not-seated` | `@{login} you need a seat for that. Type !join.` |
| `seat-claimed` | `@{login} you are {character}. You act from the next round. !sheet for your character.` |
| `seat-released leave` | `{character} goes back to the bot.` |
| `seat-released missed` | `@{login} {character} went quiet for two rounds and goes back to the bot.` |
| `seat-released kick` | `{character} goes back to the bot.` |
| `waitlisted` | `@{login} all seats are full. You are number {position} in line.` |
| `window-opened` | `Round {round}: {options} ({seconds}s to choose)` |
| `check` | `{character} rolls {skill}: {total} vs {target}, {result}.` with result `success` or `failure`, plus ` {SPECIAL_DIE_NAME} exploded!` when the special chain has more than one face |
| `ended` | `The adventure ends: {ending}. Thanks for playing!` |
| `rewards` | `@{login} +{cp} Character Points, saved for next time.` |
| `reply characters` | `Characters: {list}. Type !join <name>.` with `{list}` = `Name (concept, free\|taken)` joined by `; ` |
| `reply sheet` | `@{login} {name}: {attributes}. Skills: {skills}. {wound}. {cp} CP, {fp} FP.` (not seated: the `not-seated` line) |
| `reply status` | `Scene: {sceneId}, round {round}/{roundLimit}. Seats: {seats}. In line: {count}.` |
| `reply help` | `Play from chat: !join, !1-!9 to choose, !roll <skill>, !say <line>, !cp, !fp, !sheet, !status, !leave.` |

- `{free}` is the free characters' names joined by `, `, or `none, you'll go in line` when none.
- `{options}` is `!1 Label, !2 Label, ...`.
- `{attributes}` is `REF 3D+1, COO 2D, PHY 3D, KNO 2D+2, PER 3D, PRE 2D`.
- `{skills}` is the character's skills as `name code` joined by `, ` (`marksmanship 3D, dodge 3D`).
- `{wound}` is the wound level with hyphens as spaces and a capital first letter (`Healthy`,
  `Severely wounded`).
- `{seats}` is each seat as `Character (login)` or `Character (bot)`, joined by `, `.
- `{seconds}` is `Math.round((window.endsAt - window.opensAt) / 1000)`.
- `{ending}` is the ending kind: `victory`, `defeat` or `timeout`.
- `{character}` comes from the event's `who` or `seat`: `seat:N` is `state.seats[N].character.name`, an
  NPC uid is that NPC's `name`.
- The `check` line's special-die suffix is added when the `roll` event just before it (same `who`)
  has `special.length > 1`.
- Narration (`narrate`) does not go through `replyLines`; it reaches chat as the narrator's line or
  its template fallback (contracts/narrator.md). The fallback is `narrationLine(e, pack)` =
  `fillTemplate(pack.templates[e.template][e.variant], e.vars)`.

## Dedupe and filtering (runtime, before `parseCommand`)

- A `messageId` seen in the last 10 minutes is dropped (FR-022 dedupe).
- Messages from the bot's own user id are dropped.
- Shared-chat messages (`sourceChannelId` set and not the channel; Twitch's
  `source_broadcaster_user_id`) are dropped.
