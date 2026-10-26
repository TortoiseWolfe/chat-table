# Research and decisions: chat-table v1

Rules numbers are quoted with page numbers in [docs/licensing.md](../../../docs/licensing.md)
section 6 (D6 Adventure v2.0). This page records what chat-table decided from them.

## R1. Rules source

- **Decision:** copy mechanics from D6 Adventure only. Six attributes: Reflexes, Coordination,
  Physique, Knowledge, Perception, Presence. The book's seventh, Extranormal, is left out of v1.
- **Why:** one source keeps the Section 15 notice to one book's lines, and D6 Adventure's own Product
  Identity block is the one we copy. D6 Space renames attributes (Agility, Strength, ...) and moves the
  open edition's own name into Product Identity (docs/licensing.md section 1).
- **Rejected:** mixing books (more notices, and conflicting Product Identity lists).

## R2. The special die's first-roll 1

- **Decision:** `specialOne` setting with three values: `drop-highest` (the 1 and the highest normal
  die are removed; book option 1), `complication` (add normally, and the GM emits a `complication`
  event that picks the pack's complication line; book option 2), `none` (the 1 counts as 1; the third
  option Mini Six lists). **Default: `drop-highest`**, and automated nights use the default.
- **Why:** the book leaves the pick to a human GM "depending on the gravity of the situation". A code
  GM cannot weigh gravity; `drop-highest` is mechanical, is listed first, and is what the book's own
  introductory adventure uses. `complication` has no mechanical effect in v1, only a narration line.
- Only the first face of the chain is checked; a 1 after a 6 is just a 1 (book note). A 1D roll is the
  special die alone; with `drop-highest` and no normal dice, only the 1 is removed (total = pips).

## R3. Difficulties and ties

- **Decision:** `DIFFICULTY = { 'very-easy': 5, easy: 10, moderate: 15, difficult: 20,
  'very-difficult': 25, heroic: 30 }` (the top of each band). A pack may give a number instead of a
  name. Success is **meet or beat** (`total >= difficulty`). Opposed rolls: higher wins, **ties go to
  the initiator** (the attacker or the one who acts).
- **Why:** the book says "meet or beat" on p. 47 but "greater than" on p. 53; meet-or-beat is the more
  common reading. "Ties generally go to the initiator" is the book's line. (The spec's first draft
  gave ties to the defender; it now follows the book.)

## R4. Character Points and Fate Points

- **Decision:**
  - Each Character Point adds one extra special die that explodes on 6 and counts a 1 as 1. At most
    `cpPerRollMax` = 2 per roll (the book's maximum for adventures "with easy challenges"; a host
    setting). Points are spent at declaration, before the roll (chat cannot spend after seeing it).
  - A Fate Point doubles the dice and pips of the character's attribute or skill code before
    penalties (4D+2 becomes 8D+4, the book's example; not normalised), still with one special die.
    Weapon damage and armor are not doubled. One per roll. Not on the same roll as Character Points.
  - Climactic Fate Points, earning Fate Points back, and CP on initiative are out of v1.
- **Starting points:** each pack character sets its own (Frontier: 5 CP, 1 FP). The adventure awards
  CP at its end (`rewards`), stored per viewer user id.

## R5. Wounds

- **Decision:** `WOUND_BANDS` = margin 1-3 stunned, 4-8 wounded, 9-12 incapacitated, 13-15
  mortally-wounded, 16+ dead. Stacking (`applyWound`): if the current level is not `healthy` and the
  new hit is at or below the current level, move up one level; otherwise take the hit's level. This
  covers the book's "already Wounded becomes Severely Wounded" and "additional damage less than the
  current level moves up one level" (equal hits are treated the same way).
- Penalties (dice removed from skill and attribute rolls, not from damage, resistance or initiative;
  not cumulative): stunned 1, wounded 1, severely-wounded 2. Incapacitated and worse are out of the
  fight in v1 (no stay-up roll, no dying roll).
- Stunned lasts to the end of the next combat round (`stunnedUntil` on the character), then clears
  to `healthy` unless a worse wound replaced it. All wounds clear when the adventure ends; pre-made
  characters start each night healthy.
- Resistance is Physique plus armor. Wound penalties do not apply to it.

## R6. Initiative and combat

- **Decision:** a Perception roll for every seat and NPC at the start of each combat round. Order:
  total high to low, then Perception code, then Reflexes code, then id (book tie-breaks: Perception,
  search, Reflexes, dodge; v1 has no search or dodge tie-break).
- Combat menu per seat (numbered in this order): attack each live NPC; dodge; attack the weakest NPC
  and dodge (two actions, -1D on both, FR-005); flee (when the scene allows it).
- Attack: weapon skill roll against `max(weaponRange, target's dodge total this round)`, never below
  3. **The dodge rule is chat-table's simplification**, not the book's active-defence text, which was
  not checked. Base difficulty comes from the weapon's range band (default `easy` = 10, the book's
  base combat difficulty).
- Hit: roll the weapon's damage code against the target's Physique + armor; the margin sets the wound.
- NPCs act in initiative order with their `tactic`; they do not dodge in v1.
- Combat ends with the `win` scene when every NPC is out, or the `lose` scene when every seat is out.

## R7. Pacing and voting

- **Decision:** a 60 s declare window per round. Bots declare when the window opens. The window
  closes early once every seat has declared and at least one seat is held by an active viewer; with
  only bots it runs its full time, so viewers can see the menu and join. Scene choices are a majority vote of seats, ties broken
  by the lowest seat index among the tied options' first voters. A check on the winning choice is
  rolled by the voter for it with the best code in that skill (ties: lowest seat index); only that
  seat's CP or FP count.
- A viewer seat with no declaration takes the default (`scene.default`, or dodge in combat) and its
  `missed` count rises; any declaration resets it to 0; at 2 the seat goes to the first waitlisted
  viewer or back to the bot.
- `round` counts declare windows; at `adventure.roundLimit` the GM moves to the timeout ending.

## R8. Determinism

- **Decision:** a counter-based RNG (seed and counter, MurmurHash3 finaliser; data-model.md), so the
  whole RNG state is two integers in the snapshot. Commands carry `at` from the runtime clock; the
  engine never reads time. The sim uses a fake clock that starts at a fixed epoch and moves only when
  the script says.
- **Rejected:** `Math.random` (not seedable), a stateful PRNG object (its internal state would need
  its own serialisation).

## R9. Content guard

- **Decision:** SHA-256 hashes of normalised 1-3 word terms (docs/content-guard.md), plus one plain
  rule for Section 7 claims (docs/content-guard.md, "The compatibility rule"), which exempts only
  OGL.md and docs/licensing.md. Written in TypeScript (`src/guard`); CI uses an equivalent Python step until
  phase 2 lands it.
- **Why:** a plain word list in a public repo would publish the very terms it bans.

## R10. Twitch

Sources: Twitch developer docs.

- EventSub WebSocket: subscribe within 10 s of `session_welcome`; on `session_reconnect` connect to
  the new URL before the old closes; after a drop, make a new session and subscribe again (no replay).
  <https://dev.twitch.tv/docs/eventsub/handling-websocket-events/>
- Chat in: `channel.chat.message` with scope `user:read:chat`. Chat out: Send Chat Message API with
  `user:write:chat`. <https://dev.twitch.tv/docs/api/reference/#send-chat-message>
- Limits: 20 messages per 30 s, 100 when the bot is a moderator or broadcaster.
  <https://dev.twitch.tv/docs/chat/#rate-limits>
- Device code grant for the bot account on a confidential app (public clients' refresh tokens expire
  after 30 days). <https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#device-code-grant-flow>
- Validate the token at start and hourly. <https://dev.twitch.tv/docs/authentication/validate-tokens/>
- Library: Twurple 8.2.0 (`@twurple/eventsub-ws`, `@twurple/api`, `@twurple/auth`). Its
  `EventSubWsListener` takes a `url` option, so tests point it at the Twitch CLI mock
  (`twitch event websocket start-server`).

## R11. Narrator

- **Decision:** any OpenAI-compatible chat endpoint (URL, model, key from env), 8 s timeout, output
  rejected when over 500 characters or containing a link, then the pack template. Viewer text only
  inside quotes. For the maintainer's channel, a hosted free tier on its own key (a local 8B model
  needs about 9 GB with its cache, more than an 8 GB GPU has beside OBS). The model is picked by a
  phase 3 bake-off on recorded sim sessions.

## R12. Toolchain

- TypeScript 6.0.3: `typescript-eslint` 8.72.1 peers on `typescript >=4.8.4 <6.1.0`, so TypeScript 7
  would lose type-aware linting and the import rules in plan.md.
- Node 22 (`node:22-alpine`), Vitest 5.0.5, fast-check 4.10.2, zod 4.6.7, tsx 4.23.15, ESLint
  10.13.0, markdownlint-cli2 0.24.0, Playwright 1.64.1, `@types/node` 22.20.5. Versions read with
  `npm view` in `node:22-alpine` on 26 Oct 2026.
