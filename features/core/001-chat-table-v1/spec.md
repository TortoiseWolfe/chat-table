# Feature Specification: chat-table v1

**Feature Branch**: `001-chat-table-v1`
**Created**: 2026-10-26
**Status**: Draft
**Input**: User description: "chat-table v1: the smallest thing that runs an automated game night on a
Twitch channel: a chat-played tabletop RPG on open dice-pool rules (Open Game Content, OGL 1.0a) where a bot is always the game master."
Source of truth: the approved plan (26 Oct 2026, about 2:10 PM), kept by the maintainer outside this repo.

## Decisions already made (do not reopen)

- **The bot is always the game master.** The maintainer will not run games ("I'm not GMing, I don't
  have time, I might play the whole point is the bot should be able to game master"). "Host" means
  the hosting software and the streamer who runs it. No human-GM tooling is in scope.
- **Setting:** the public repo ships an original setting, *Frontier*. Licensed franchise settings are
  private packs only, loaded at run time, never committed.
- **Automated nights:** the bot runs the game; bots fill empty seats until a viewer types `!join`.
- **Not a Twitch Extension first.** A chat bot plus an OBS browser-source overlay comes first. An
  Extension (mobile character sheet) is optional and after v1.
- **Self-hosted:** every streamer runs their own copy with their own Twitch application and bot account.
- **No Bits**, no paid advantage, no wagers.

## Actors

- **Viewer**: a Twitch chatter. Joins, plays a character through chat commands, or just watches.
- **Host**: the streamer who runs a copy. Starts, pauses and stops a night from an admin dock in OBS.
- **Moderator**: a channel moderator; may use the admin chat commands.
- **Bot player**: the software playing an unclaimed seat.
- **Game master (GM)**: the software running the adventure and every rules decision.
- **Narrator**: the optional language model that words one or two sentences of narration.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A full adventure plays itself (Priority: P1)

The host starts a night with nobody joining. The GM runs the Frontier starter adventure from its first
scene to an ending with four bot-played characters: it describes scenes, offers numbered choices, calls
for skill checks, runs combat with NPCs, applies wounds and moves between scenes. The whole thing plays
in a terminal simulation with no Twitch connection.

**Why this priority**: everything else (chat, overlay, narration) decorates this loop. If the bot can
run a whole adventure alone, a night can never stall for lack of players or of a human GM.

**Independent Test**: run the simulation with 4 bots and seed S; it reaches an ending scene. Run it
again with seed S; the event log is identical byte for byte.

**Acceptance Scenarios**:

1. **Given** the Frontier pack and seed S, **When** the sim runs with 4 bots, **Then** the adventure
   reaches one of its ending scenes within the pack's round limit, with no error.
2. **Given** the same pack and seed S, **When** the sim runs twice, **Then** both logs are identical.
3. **Given** a combat scene, **When** a damage total beats the target's Physique-plus-armor roll,
   **Then** its wound level rises per the wound table and its action penalty applies on later rolls.
4. **Given** every character is Incapacitated or worse, **When** the round ends, **Then** the GM moves
   to the pack's defeat ending rather than stalling.

---

### User Story 2 - Viewers take seats and play from chat (Priority: P1)

A viewer types `!characters`, then `!join kestrel`. The bot gives them that seat, says so in chat, and
from then on the viewer plays it: picking menu options with `!1` `!2` `!3`, rolling offered checks with
`!roll <skill>`, adding flavour with `!say <line>`, checking `!sheet` and `!status`. If they go quiet,
the game keeps moving and their seat eventually returns to a bot or to the next viewer waiting.

**Why this priority**: viewer play is the point of the product.

**Independent Test**: in the sim, two scripted viewers join mid-scene and play to the end of the
adventure alongside two bots.

**Acceptance Scenarios**:

1. **Given** a free bot-played seat, **When** a viewer sends `!join <character>`, **Then** they hold
   that seat from the next declare window and the bot stops acting for it.
2. **Given** two viewers send `!join kestrel` at once, **When** both are processed, **Then** the first
   to arrive gets the seat and the second is told which seats are free (or put on the waitlist if none).
3. **Given** a viewer holding a seat, **When** the 60-second declare window ends with no input from
   them, **Then** their character takes the scene's default action; **When** this happens on 2 turns in
   a row, **Then** the seat goes to the first waitlisted viewer, or back to a bot.
4. **Given** a viewer who played on an earlier night, **When** they join again, **Then** their
   character's Character Points and advances are what they were at the end of that night.
5. **Given** a viewer sends the same command 5 times in 2 seconds, **Then** only the first is acted on
   (3-second per-user cooldown).

---

### User Story 3 - It runs on a real Twitch channel (Priority: P1)

The host registers their own Twitch application, signs the bot account in once with a device code,
and starts chat-table. It reads the channel's chat live, answers within the rate limits, survives
Twitch reconnects, pauses and saves when the stream goes offline, and answers each command once.

**Why this priority**: without it the game exists only in a terminal.

**Independent Test**: against the Twitch CLI mock EventSub server: welcome, subscribe, session
reconnect, a dropped socket and a resubscribe all pass; a burst of 50 `!join` never breaks the
outbound limit.

**Acceptance Scenarios**:

1. **Given** a welcome message, **When** chat-table connects, **Then** it subscribes to the chat events
   within 10 seconds.
2. **Given** a reconnect notice with a new URL, **When** it arrives, **Then** chat-table connects to the
   new URL before closing the old one and loses no messages Twitch delivered.
3. **Given** the socket drops, **When** chat-table reconnects, **Then** it subscribes again.
4. **Given** the same chat message delivered twice, **Then** it is acted on once.
5. **Given** a burst of 50 `!join`, **Then** outbound chat stays within 20 messages per rolling
   30 seconds (100 when the bot is a moderator), at least 1 second apart, 500 characters each; extra
   replies are batched or dropped with a logged reason.
6. **Given** the stream goes offline, **Then** the game pauses and saves; **When** the host starts again,
   **Then** it resumes from the saved state.
7. **Given** a bot token near expiry, **When** the hourly validation runs, **Then** the token is
   refreshed with no interruption to play.

---

### User Story 4 - Viewers see the game on stream (Priority: P2)

The host adds one OBS browser source. It shows the scene map, character tokens, wound bars, the
initiative order with a turn timer, an action feed and dice results, updating as events happen.

**Why this priority**: chat text alone is hard to follow on stream; the overlay makes it watchable.

**Independent Test**: screenshots of a sim session at 1920x1080 show each element.

**Acceptance Scenarios**:

1. **Given** a running session, **When** a roll happens, **Then** the overlay shows the dice, the Wild
   Die and the total within 1 second.
2. **Given** a wound, **Then** that character's wound bar changes within 1 second.
3. **Given** the overlay reloads mid-session, **Then** it shows the current state at once.

---

### User Story 5 - Narration with personality, never in charge (Priority: P2)

Scene text and outcomes are worded by a language model the host chooses, from facts the GM hands it.
If the model is slow, down or misbehaves, the game uses the pack's pre-written lines and carries on.
Nothing a viewer writes can change a roll or a scene.

**Why this priority**: narration makes the night fun to watch, but it must never be able to break or
steer the game.

**Independent Test**: a sim session with the narrator endpoint dead finishes on templates; a session
where a viewer's `!say` contains instructions to the model produces the same rolls and scenes as one
without it.

**Acceptance Scenarios**:

1. **Given** the narrator takes longer than 8 seconds, **Then** the pack's template line is used.
2. **Given** a `!say` line that tells the model to grant a success, **Then** rolls, wounds and scene
   changes are identical to a run without that line.
3. **Given** no narrator is configured, **Then** the game runs on templates alone.

---

### User Story 6 - The host runs the night from OBS (Priority: P2)

The host adds a custom dock in OBS showing a local admin page: start, pause, stop, kick a viewer from a
seat, skip the scene. Broadcaster and moderators can do the same from chat with `!gm start|pause|stop|
kick <user>|skip`.

**Independent Test**: each button and each `!gm` command changes the sim's state as named; a viewer
without moderator rights sending `!gm stop` changes nothing.

**Acceptance Scenarios**:

1. **Given** a running game, **When** the host presses Pause, **Then** declare timers stop and state is saved.
2. **Given** a non-moderator, **When** they send `!gm stop`, **Then** nothing happens.

---

### User Story 7 - The public repo stays clean (Priority: P1)

Every change and every published image is checked for licensed franchise terms and for compatibility
claims. A hit fails CI.

**Independent Test**: the guard is green on the repo and image, red on a planted fixture, and does not
hit an ordinary word like "shuttle".

**Acceptance Scenarios**:

1. **Given** a file containing a term on the denylist, **Then** CI fails and names the file and line
   but never prints the term.
2. **Given** the word "shuttle", **Then** the guard passes.

---

### Edge Cases

- A viewer `!join`s a character that does not exist, or one already held: they are told the free seats.
- A viewer holds a seat and also tries to `!join` another: refused; one seat per viewer.
- All four seats are held and more viewers join: waitlist in arrival order; `!leave` takes them off it.
- A viewer leaves mid-round: the bot takes the seat at the start of the next declare window.
- A command for a scene that has moved on (stale `!2` after a scene change): ignored with no reply.
- A roll is requested for a skill the character lacks: rolled on the governing attribute (book rule, docs/licensing.md).
- The process crashes mid-round: on restart the last snapshot loads and the round restarts its window.
- The snapshot file is corrupt: the previous good snapshot is used and the error is logged.
- Twitch sends a shared-chat message from another channel: ignored.
- The bot's own messages arrive back as chat events: ignored.
- The narrator returns text over 500 characters or with a link: replaced by the template line.
- Two copies of the bot answer the same channel: the host's checklist says to switch off any other
  game-command bot on the channel first (see Assumptions).

## Requirements *(mandatory)*

### Functional Requirements

#### Rules (Open Game Content; numbers and sources in docs/licensing.md and research.md)

- **FR-001**: Attributes and skills MUST be dice codes with pips (e.g. 3D+2); 3 pips make 1 die.
- **FR-002**: Every roll MUST include one Wild Die that rerolls and adds on each 6. The result of a
  1 on the Wild Die's first roll MUST follow one host-chosen option (drop it and the highest die,
  a complication, or count it as 1; research.md R2); the default, used on automated nights, is drop
  it and the highest die.
- **FR-003**: Checks MUST compare a roll total to a difficulty number from the rules' table (meet or
  beat), or to an opposing roll (opposed checks; ties go to the initiator).
- **FR-004**: Initiative MUST be a Perception roll each combat round, highest first.
- **FR-005**: Taking more than one action in a round MUST cost -1D per extra action on every action.
- **FR-006**: Damage MUST be rolled against the target's Physique plus armor; the difference sets the
  wound level from the rules' wound table, and each wound level applies its action penalty.
- **FR-007**: A player MUST be able to spend Character Points (each adds one die that rerolls on 6, at
  most 2 per roll by default) or a Fate Point (doubles the dice of the declared action), not both on
  one roll.
- **FR-008**: A skill the character lacks MUST be rolled on its governing attribute.
- **FR-009**: The rules term for the special die MUST live in one place in code and data, so it can be
  renamed if its licence status requires.

#### Game master

- **FR-010**: The GM MUST run a pack's adventure as a graph of scenes. Each scene offers numbered
  choices, checks with difficulties, outcomes, NPC turns or combat, and a default choice.
- **FR-011**: The GM MUST decide every roll, wound, turn and scene change. Nothing from the narrator or
  from viewer free text may change game state.
- **FR-012**: The GM MUST pace play: a 60-second declare window per round, majority vote among seated
  players for menu choices (ties broken by seat order), default actions for missing declarations, and a
  per-adventure round limit leading to the pack's timeout ending.

#### Seats

- **FR-013**: A pack MUST provide 4 pre-made characters; each seat is bot-played from the pack's
  scripted actions until a viewer claims it.
- **FR-014**: Seats MUST be keyed by Twitch user id, not display name. A viewer's character state and
  Character Points persist per user id across nights.
- **FR-015**: Two missed turns in a row MUST free a seat for the waitlist or a bot.

#### Chat play

- **FR-016**: The game MUST accept `!join [character]`, `!leave`, `!sheet`, `!status`, `!characters`,
  `!help`, `!1` to `!9`, `!roll <skill>`, `!say <line>`, `!cp [n]`, `!fp`, and for broadcaster and
  moderators `!gm start|pause|stop|kick <user>|skip`.
- **FR-017**: Commands MUST pass through one serial queue in arrival order, with a 3-second per-user
  cooldown.
- **FR-018**: `!say` text MUST reach narration only as a quoted line attributed to the character.

#### Narrator

- **FR-019**: The narrator MUST call any OpenAI-compatible chat endpoint the host configures, with an
  8-second timeout, and fall back to the pack's templated line on timeout, error, over-length output or
  output containing a link.
- **FR-020**: Narration MUST be built only from facts the GM hands over plus quoted viewer lines.

#### Twitch

- **FR-021**: Inbound chat MUST come from Twitch EventSub over WebSocket; outbound chat MUST use the
  Send Chat Message API, from a separate bot account.
- **FR-022**: The connection MUST follow Twitch's rules: subscribe within 10 s of welcome; on reconnect
  open the new socket before closing the old; resubscribe after a drop; ignore its own messages; dedupe
  on message id; skip shared-chat messages.
- **FR-023**: Outbound chat MUST respect the limits in User Story 3, scenario 5, and log every drop
  with a reason.
- **FR-024**: The bot account MUST sign in by device code on the host's own confidential Twitch app
  with scopes `user:read:chat` and `user:write:chat`; the token is validated at start and hourly and
  refreshed before expiry. Tokens never appear in logs.
- **FR-025**: When the stream goes offline the game MUST pause and save.

#### Overlay and admin

- **FR-026**: An OBS browser source page MUST show the map, tokens, wound bars, initiative and turn
  timer, action feed and dice, updated by pushed events, and render the current state on load.
- **FR-027**: A localhost admin page (an OBS custom dock) MUST offer start, pause, stop, kick and skip,
  and be reachable only from the host machine by default.
- **FR-028**: Map art, token art and sounds MUST come from the pack.

#### Content and licensing

- **FR-029**: The repo MUST ship the original Frontier pack: 4 characters, 1 starter adventure, NPCs,
  maps and templated narration lines, with an ASSETS.md giving the source and licence of each asset.
- **FR-030**: A host MUST be able to load another pack from a path at start-up.
- **FR-031**: CI MUST run the content guard on the repo and on the Docker image, and fail on any hit.
- **FR-032**: The repo MUST carry the OGL 1.0a text with a correct Section 15 notice for the rules
  text, and MUST NOT claim compatibility with any trademarked game system.

#### Running it

- **FR-033**: chat-table MUST ship as one Docker image on GHCR. A host installs and starts it from the
  README on a clean machine.
- **FR-034**: Game state MUST be saved atomically after every command, with a JSONL event log that
  records every dice result.

### Key Entities

- **Pack**: a setting. Characters, NPCs, adventure, maps, art, sounds, narration templates, metadata
  (name, licence, version).
- **Character**: name, attributes and skills as dice codes, wound level, Character Points, Fate Points,
  gear, scripted bot actions.
- **Seat**: one of 4 slots: its character, holder (bot or a Twitch user id), missed-turn count.
- **Scene**: a node in the adventure graph: text facts, choices, checks, NPCs, combat setup, exits.
- **Game state**: pack id, scene, round, phase, seats, initiative order, waitlist, RNG seed and counter.
- **Event**: one thing that happened (roll, wound, scene change, join, narration), appended to the log.
- **Viewer record**: Twitch user id to character progress (Character Points, advances).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The Frontier adventure plays start to finish with 4 bots, and again with 2 scripted
  viewers joining mid-scene; the same seed gives the same log.
- **SC-002**: Rules tests and property tests (Wild Die distribution, exploding 6, the chosen 1-rule,
  Character and Fate Points) pass with 0 skipped.
- **SC-003**: With the narrator endpoint dead, a full session still finishes, on templates.
- **SC-004**: An injection line in `!say` never changes a roll or a scene.
- **SC-005**: The narrator bake-off table (rubric score, 95th-percentile latency, cost per session) is
  in the repo.
- **SC-006**: The content guard is green on the repo and image, red on a planted fixture, and has no
  false hit on "shuttle".
- **SC-007**: Against the Twitch mock: welcome-to-subscribe timing, session reconnect and a drop plus
  resubscribe all pass; outbound chat never exceeds its limits under a burst of 50 `!join`; token
  refresh works with an injected clock.
- **SC-008**: Overlay screenshots of a sim session at 1920x1080 show every element of FR-026.
- **SC-009**: Off-air test channel with 3 or more real people completes a session.
- **SC-010**: A 4-hour soak with no crash and flat memory.
- **SC-011**: During a narrated rehearsal with OBS streaming, OBS's rendering lag stays under 0.5%, with
  GPU use logged.
- **SC-012**: A clean machine installs and runs it from the README with a new Twitch app.
- **SC-013**: On the maintainer's channel, a live `!join` is answered by exactly one bot.
- **SC-014**: Each phase merges only on green CI.

## Assumptions

- Hosts are comfortable registering a Twitch application and running Docker.
- The bot account is made a moderator on the channel (raises the chat limit to 100 per 30 s).
- The maintainer's channel switches off the older game-command bot on it before any live test, so only
  one bot answers game commands (SC-013).
- The narrator model for the maintainer's channel is a hosted free tier on its own key (chat text is
  public); it is chosen by the bake-off (SC-005). A local 8B model does not fit beside OBS on his GPU.
- A hosted model's cost is the host's; any paid option for the maintainer's channel goes to him.

## Out of scope for v1

- Human game-master tooling.
- OBS automation (scene switching, scheduled go-live), npm package, Twitch Extension.
- Bits, channel points, or any paid feature.
- Any licensed franchise content in this repo.
