# Feature Specification: AI-driven player seats

**Feature Branch**: `002-ai-seats`
**Created**: 2026-11-04
**Status**: Draft
**Input**: User description: "Some seats played by AI models. A seat holds a persistent character; who
plays it (the driver) is interchangeable: the existing bot, a Claude driver, a Gemini driver, a Groq
driver. Each seat has a primary driver and a backup." Source: the maintainer's notes of 28 Oct and
4 Nov 2026, kept outside this repo.

## Decisions already made (do not reopen)

- **The code game master still decides everything.** A driver only chooses which numbered option a seat
  declares (and whether to spend points). Rolls, wounds, scene changes and the dice stay in the pure
  engine. A model never sees a rule table and never writes to the game state.
- **Characters belong to the seat, not the driver.** Points, wounds and history live with the seat, so
  swapping the driver changes nothing about the character.
- **Every turn uses one turn packet** (a few hundred tokens, never more than 900). A driver that is swapped in mid-game is
  handed the same packet the old one would have been.
- **No keys in the repo, the image, a log or a report.** Keys are read from files at run time through
  `Deps`, and never logged.
- **Tests never call a real API.** Drivers are tested with a fake `fetch` through `Deps`.
- **Setting stays original.** Seat characters are the Frontier pack's own; no licensed content.

## Actors

- **Seat**: one of the four characters. Holds a character, a primary driver and a backup driver.
- **Driver**: whatever plays a seat for one turn: `bot` (the autopilot already in the engine),
  `claude`, `gemini` or `groq`.
- **Turn packet**: the text and choices a driver is handed to make one decision.
- **Host**: the streamer. Reads the token gauges, may swap a seat's driver from the admin dock.
- **Viewer**: a chatter. A viewer who leaves hands the seat to the bot driver.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A seat is played by a model (Priority: P1)

The host configures the marrow seat for Claude with the bot as backup. When a round opens, the seat's
driver gets the turn packet, answers with one option, and the engine declares it for the seat. If the
model is slow, wrong or over its cap, the backup (then the bot) answers instead; the round never
stalls and never waits past its window.

**Why this priority**: it is the point of the feature; everything else guards or shows it.

**Independent Test**: run a game in the simulator with a fake `fetch` for the Claude driver that
returns `{"option":2,"cp":0}`: the seat declares option 2 in every round it is offered.

**Acceptance Scenarios**:

1. **Given** an AI seat and a window that offers options 1 to 3, **When** the driver answers
   option 2, **Then** the engine records a declaration by `ai` for that seat and option 2.
2. **Given** a driver answer that is not valid JSON, names an option not on offer, or arrives after
   the window's deadline, **When** the turn ends, **Then** the next driver in the chain answers
   (primary, backup, bot) and the failure is recorded in the token log.
3. **Given** every driver in the chain fails, **When** the window closes, **Then** the bot driver's
   pick stands, so the round resolves normally.
4. **Given** all four seats are AI or bot seats and nobody is watching, **Then** the adventure still
   reaches an ending.

---

### User Story 2 - Swap the driver, keep the character (Priority: P1)

Mid-game the host (or an automatic failover) switches the Gemini seat to its Groq backup. The next
turn's packet is built the same way; the character, points, wounds and the seat's recent history are
unchanged.

**Independent Test**: build the packet for a seat, swap its driver, build it again: the two packets are
equal except for the round number they were built in.

**Acceptance Scenarios**:

1. **Given** a seat on its primary driver, **When** the swap command names the backup, **Then** the next
   turn is decided by the backup and a `swap` row is written to the token log.
2. **Given** two consecutive failures of a primary driver, **When** the second turn ends, **Then** the
   seat is swapped to its backup automatically (reason `failover`).
3. **Given** a swap, **Then** the character's points and wound and the seat's history list are
   identical before and after.

---

### User Story 3 - Spoiler firewall (Priority: P1)

A seat's packet holds only what its character can see: its own sheet, the scene text everyone read,
the choices on offer, who is in the scene and how hurt they look. It never holds other scenes, where a
choice leads, a check's skill or difficulty, an NPC's stats, another seat's sheet or bot script, or the
random seed.

**Independent Test**: for every scene in the Frontier pack and every seat, the packet text contains none
of: any other scene's id, any `next`/`success`/`failure` target, any check difficulty word, any other
character's attribute or skill codes, the seed.

**Acceptance Scenarios**:

1. **Given** any state in any scene, **When** a packet is built, **Then** it contains only fields from
   the allow-list in data-model.md.
2. **Given** viewer chat text in the history, **Then** it appears only inside quotation marks and cut to
   the packet's length limit (the narrator's rule).

---

### User Story 4 - Caps and the token log (Priority: P2)

Every seat has caps: tokens and calls per turn and per session. The Claude seat has the tightest. A
driver over a cap is skipped for that turn. The runtime writes one JSON line per model call (driver,
model, tokens in and out, latency, outcome) and one per swap, through `Deps`.

**Acceptance Scenarios**:

1. **Given** a cap of 2 calls per turn, **When** the third call is asked for, **Then** it is refused
   without a network call and logged as `capped`.
2. **Given** a session cap of N tokens spent, **Then** the driver is skipped for the rest of the
   session and the next driver in the chain is used.
3. **Given** a model call, **Then** the log line holds the driver id, model, tokens in, tokens out,
   latency in milliseconds and outcome; it never holds a key or the viewer text.

---

### User Story 5 - A human drops out, the bot takes over (Priority: P2)

A viewer who types `!leave`, is kicked or misses too many rounds hands the seat to the game master's
autopilot, which is the bot driver. The swap is written to the token log.

**Acceptance Scenarios**:

1. **Given** a viewer-held seat, **When** the viewer leaves, **Then** the next window's declaration for
   that seat is by the bot driver and the log shows a swap to `bot` with reason `human-left`.

---

### User Story 6 - The table view shows who plays (Priority: P2)

The overlay shows, beside each token, the seat's driver and a token gauge (spent against the session
cap), and marks a swap in the feed.

**Acceptance Scenarios**:

1. **Given** a running AI seat, **When** the overlay view is built, **Then** it lists the seat's driver
   label, model, tokens spent, session cap and a recent-swap flag.
2. **Given** a swap, **Then** the feed shows a line naming the seat and both drivers.

---

### Edge Cases

- A model answers in prose around the JSON: the first balanced `{...}` is parsed.
- A model asks for `cp` greater than the seat has or the per-roll maximum: the engine clips it.
- The stream goes offline or the game pauses mid-turn: the answer is dropped, not applied late.
- A restart mid-game: the seat's driver assignment and history come back from the data folder.
- A key file is missing: that driver is marked unavailable at start; the chain skips it.

## Requirements *(mandatory)*

- **FR-A01**: A seat has a persistent character plus a driver assignment `{ primary, backup }`; the
  assignment can change without touching the character.
- **FR-A02**: Drivers: `bot`, `claude`, `gemini`, `groq`, all behind one `Driver` interface.
- **FR-A03**: One turn packet per seat per round, built by one function; swaps change nothing about it.
- **FR-A04**: The packet is built from an allow-list; the firewall test covers every scene and seat.
- **FR-A05**: Per-seat caps on tokens and calls per turn and per session; the Claude seat's are the
  tightest. A capped driver is skipped, not retried.
- **FR-A06**: Per-seat token log, appended through `Deps.fs`; never holds a key or viewer text.
- **FR-A07**: A viewer who leaves, is kicked or is released for missing rounds hands the seat to the
  bot driver, logged as a swap.
- **FR-A08**: The overlay view shows each seat's driver and token gauge and marks swaps.
- **FR-A09**: Keys come from files through `Deps`; a missing file disables that driver only.
- **FR-A10**: A turn never takes longer than the window: each call has a deadline, and the chain
  stops asking when the window is nearly over.
- **FR-A11**: No driver call touches the engine's `Rng`; the engine stays byte-for-byte deterministic
  for a given seed and given declarations.

## Success Criteria *(mandatory)*

- **SC-A01**: A simulated game with three fake-model seats reaches an ending with 0 skipped tests.
- **SC-A02**: The firewall test passes for every (scene, seat) pair of the Frontier pack.
- **SC-A03**: A 30-minute private dry run with live Claude and Gemini drivers, one swap to Groq, stays
  under the maintainer's spend target (under 1 US dollar in total) with no cap tripping.
- **SC-A04**: The token log of the dry run shows, per seat, the driver, model, tokens and latency of
  every call and one swap row.
- **SC-A05**: Tasks T091 (three or more real people) runs with the AI seats on, from
  `docs/t091-runbook.md`.

## Assumptions

- The seat-to-character mapping for the first dry run: Claude plays marrow (mechanic, quiet and
  technical), Gemini plays sable (scout, the bounty-hunter type), the H-7CH seat plays juniper (repair
  automaton) on the `bot` driver as a labelled stand-in, and kestrel stays a bot.
- A live Hatch driver would need a real-time route into a game (a small authenticated endpoint that
  accepts the packet and returns a choice within the window). Hatch has none today, so that seat runs
  on the bot driver and the overlay labels it `H-7CH (stand-in)`.
- Model ids are plain config strings, so a new model needs no code change.
