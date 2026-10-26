# Implementation Plan: chat-table v1

**Branch**: `001-chat-table-v1` | **Date**: 2026-10-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `features/core/001-chat-table-v1/spec.md`

## Summary

A Twitch-chat tabletop RPG where software is always the game master. v1 is one TypeScript package on
Node 22 in Docker. A pure rules engine (open dice-pool rules: dice, checks, wounds, points) and a code game master
run a pack's adventure as a scene graph; four seats are bot-played until viewers `!join`. Chat comes
in over Twitch EventSub WebSocket and goes out through the Send Chat Message API behind a token
bucket. An optional language model words one or two sentences from facts the GM hands it, with a
templated fallback. An OBS browser-source overlay (fed by Server-Sent Events) and a localhost admin
dock show and steer the night. The public repo ships an original setting, `packs/frontier`; a content
guard keeps licensed franchise terms out of the repo and the image.

Work is split into five build phases (see tasks.md). Phase 2 (engine, GM, seats, sim, Frontier pack,
guard) runs fully offline and is written so an edit-only engine can build it from the task text.

## Technical Context

**Language/Version**: TypeScript 6.0 (`typescript@6.0.3`), ESM, `strict: true`, on Node 22
(`node:22-alpine`, v22.23.4). TypeScript 7 is not used: `typescript-eslint@8.72.1` peers on
`typescript >=4.8.4 <6.1.0`.

**Primary Dependencies**: runtime: `@twurple/auth`, `@twurple/api`, `@twurple/eventsub-ws` (8.2.0),
`zod` 4.6.7 (pack and config validation). Dev: `vitest` 5.0.5, `fast-check` 4.10.2, `tsx` 4.23.15,
`eslint` 10.13.0 + `typescript-eslint` 8.72.1, `markdownlint-cli2` 0.24.0, `@playwright/test` 1.64.1
(overlay screenshots only), `@types/node` 22.20.5. No web framework: HTTP, SSE and static files use
`node:http`.

**Storage**: files under a data directory (`/data` in the container, a named volume): `state.json`
(atomic snapshot: write `state.json.tmp`, fsync, rename; the previous one kept as `state.prev.json`),
`events.jsonl` (append-only log, every dice result), `viewers.json` (per-user-id progress), `token.json`
(bot token, mode 0600). No database.

**Testing**: Vitest unit tests, fast-check property tests for dice, sim end-to-end tests (seeded,
byte-identical logs), Twitch CLI mock EventSub server for adapter tests (phase 4), Playwright
screenshots of the overlay (phase 4). 0 skipped tests.

**Target Platform**: Linux container (GHCR image `ghcr.io/tortoisewolfe/chat-table`), run beside OBS
on the host's streaming PC or any always-on box.

**Project Type**: single project.

**Performance Goals**: a chat command is applied and its reply queued within 100 ms; overlay updates
within 1 s of an event (spec US4); narrator call capped at 8 s.

**Constraints**: Twitch limits (20 messages per rolling 30 s, 100 as a moderator; at least 1 s
apart; 500 characters); subscribe within 10 s of welcome; memory flat over a 4-hour soak; the
narrator never shares the GPU with OBS on the maintainer's machine (hosted endpoint).

**Scale/Scope**: one channel per copy, 4 seats, a waitlist, a few hundred chatters, one adventure per
night.

## Constitution Check

*GATE: passed before Phase 0 research and re-checked after Phase 1 design.*

| Principle | How the design meets it | Pass |
| ----------- | ------------------------- | ------ |
| I. Bot is the GM | `src/gm` decides every roll, wound, turn and scene; `src/narrator` only returns a string that is displayed, never parsed. No human-GM commands. | yes |
| II. Pure, deterministic engine | `apply(state, cmd, rng, pack)` in `src/engine/apply.ts`; time arrives as `cmd.at`; RNG is counter-based and its counter lives in state; snapshot and log writing live in `src/runtime`. | yes |
| III. Injected dependencies | `src/runtime/deps.ts` defines `Deps` (clock, timers, fs, fetch, log); `src/main.ts` is the only file that builds real ones. | yes |
| IV. Clean content and licensing | Frontier only; guard on repo and image in CI; `OGL.md` + `docs/licensing.md`; no compatibility wording; no Bits. | yes |
| V. Self-hosted | Host supplies their own Client ID/secret and bot account in env; no shared service. | yes |
| VI. Docker-first, tests first | `compose.yaml` service `app`; every task names its tests; CI fails on any skip. | yes |
| VII. Chat is slow | Menu picks, 60 s declare window, default actions, two-miss seat release, token bucket. | yes |

## Project Structure

### Documentation (this feature)

```text
features/core/001-chat-table-v1/
├── spec.md              # /speckit.specify
├── plan.md              # this file
├── research.md          # Phase 0: decisions and the sources behind them
├── data-model.md        # Phase 1: types, tables, state
├── quickstart.md        # Phase 1: run it offline, then on Twitch
├── contracts/
│   ├── chat-commands.md   # chat grammar, replies, errors
│   ├── events.md          # Event union, JSONL log line, snapshot file
│   ├── http.md            # overlay SSE stream + admin HTTP API
│   ├── narrator.md        # facts in, one line out
│   └── pack.schema.json   # JSON Schema for a pack
├── checklists/requirements.md
└── tasks.md             # /speckit.tasks
```

### Source Code (repository root)

```text
package.json  tsconfig.json  vitest.config.ts  eslint.config.js  .markdownlint-cli2.jsonc
Dockerfile  compose.yaml  OGL.md  docs/licensing.md  docs/content-guard.md
guard/denylist.sha256
src/
├── engine/      pure rules + game state reducer
│   ├── dice.ts        dice codes (3D+2), pip arithmetic
│   ├── rng.ts         counter-based seeded RNG
│   ├── roll.ts        rollCode: normal dice, special die, CP dice, special-die-1 handling
│   ├── terms.ts       SPECIAL_DIE_NAME and other rules words (FR-009)
│   ├── tables.ts      difficulty and wound tables
│   ├── checks.ts      check vs difficulty, opposed check
│   ├── wounds.ts      damage -> wound level, penalties, stacking
│   ├── points.ts      Character Point and Fate Point rules
│   ├── initiative.ts  Perception initiative order
│   ├── state.ts       GameState, Seat, initialState()
│   ├── pack.ts        Pack, Adventure, Scene, Choice types
│   ├── ctx.ts         GmCtx, Emit
│   ├── commands.ts    Command union
│   ├── events.ts      Event union
│   ├── apply.ts       apply(state, cmd, rng, pack) -> { state, events }
│   └── index.ts
├── gm/          the game master (pure; imported by engine/apply.ts only)
│   ├── keys.ts        GM_TEMPLATE_KEYS
│   ├── scene.ts       templates, scene lookup, choice options, narrate events
│   ├── flow.ts        enterScene and resolveWindow: the only module that moves between scenes
│   ├── round.ts       declare window, vote tally, default actions, resolve round
│   ├── combat.ts      combat rounds, NPC actions, damage
│   └── endings.ts     defeat / timeout / victory endings
├── seats/       seat claims, waitlist, missed turns, bot action choice, viewer records (pure)
│   ├── seats.ts       claimSeat, releaseSeat, seatOf, freeCharacters
│   ├── bot.ts         botDeclaration
│   ├── viewers.ts     recordFor, saveSeat, resetSeatCharacter
│   └── chat.ts        handleChat: join, leave, pick, roll, cp, fp, say, query
├── runtime/     the I/O shell around the engine (uses Deps)
│   ├── deps.ts        Deps and Env interfaces, parseEnv
│   ├── parse.ts       chat text -> Command | null (pure)
│   ├── queue.ts       serial command queue
│   ├── store.ts       atomic snapshot, JSONL log, viewers file
│   ├── log.ts         toLogLines, formatLogLine (pure; the sim uses it too)
│   ├── session.ts     Session: queue -> apply -> store -> outputs; window timers
│   └── replies.ts     events -> chat lines (pure)
├── packs/       pack loader + zod schema
│   ├── schema.ts
│   └── load.ts
├── guard/       content guard CLI
│   ├── normalise.ts
│   ├── scan.ts
│   └── cli.ts
├── sim/         scripted chatters, fake clock, offline runner, CLI
│   ├── clock.ts       FakeClock
│   ├── script.ts      parseScript
│   ├── run.ts         createTable, runSim
│   └── cli.ts
├── narrator/    phase 3
│   ├── facts.ts  client.ts  sanitize.ts  narrator.ts
├── twitch/      phase 4
│   ├── auth.ts  eventsub.ts  outbound.ts  bucket.ts  adapter.ts
├── overlay/     phase 4: server.ts (SSE) + public/ (index.html, overlay.js, overlay.css)
├── admin/       phase 4: server.ts + public/index.html
└── main.ts      the only place real Deps are built
packs/frontier/
├── pack.json  characters.json  npcs.json  adventure.json  templates.json
├── maps/  art/  sounds/
└── ASSETS.md
tests/           mirrors src/: tests/engine/*.test.ts, tests/gm/*.test.ts, ...
tests/fixtures/  sim scripts and small hand-built packs
```

**Structure Decision**: one package. `src/{engine,gm,narrator,seats,twitch,overlay,admin,sim}` come
from the approved plan. Three folders are added: `src/runtime` (the I/O shell, so `engine`, `gm` and
`seats` stay pure), `src/packs` (loader and schema shared by every adapter) and `src/guard` (the guard
is TypeScript like everything else so CI needs only Node). Tests live in `tests/`, mirroring `src/`.

**Import rules** (checked by an ESLint `no-restricted-imports` rule in phase 2):

- `src/engine/*` may import only `src/engine/*`, except `apply.ts`, which also imports `src/gm/*` and
  `src/seats/*`.
- `src/gm/*` and `src/seats/*` may import `src/engine/*` rules files and types, never
  `src/engine/apply.ts` or `src/engine/index.ts`, and never `node:*`.
- Only `src/runtime`, `src/twitch`, `src/narrator`, `src/overlay`, `src/admin`, `src/sim`,
  `src/guard`, `src/packs/load.ts` and `src/main.ts` may import `node:*`.

## Complexity Tracking

| Addition | Why needed | Simpler alternative rejected because |
| ---------- | ------------ | -------------------------------------- |
| `src/runtime` beside the plan's folders | Snapshot, log, queue and timers are I/O; the plan requires the engine to do none | Putting them in `src/engine` breaks Principle II |
| Hashed denylist instead of a plain word list | The repo must never hold a banned term, not even in its own guard | A plain list in the repo is itself a hit, and excluding the file still publishes the terms |
| TypeScript 6.0, not 7 | `typescript-eslint` does not support 7 yet | Dropping type-aware lint loses the import rules above |
