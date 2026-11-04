---
description: "Task list for AI-driven player seats"
---

# Tasks: AI-driven player seats

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [data-model.md](./data-model.md)

**Tests**: required. 0 skipped: a `.skip`, `.only` or `.todo` fails review and CI. Drivers are tested
with a fake `fetch`; no test calls a real API.

**Format**: `- [ ] T### [USn] what, where`. Every command:
`timeout 600 docker compose run --rm app <cmd>`.

## Phase 1: Engine

- [x] T200 [US1,US5] `Holder` `ai`, commands `ai-declare` and `assign`, event `seat-assigned`,
  `declared.by: 'ai'`. `seats/chat.ts` handles both commands (validates: playing, seat holder is
  `ai`, option on offer; clips `cp` to points and `cpPerRollMax`; ignores `fp` when no point).
  `gm/round.ts`: `ai` seats are not auto-declared at open; an undeclared `ai` seat is declared by the
  bot script at close; the window may close early when every standing seat has declared and a viewer
  or `ai` seat is present. `!join` never takes an `ai` seat. Tests `tests/seats/ai.test.ts`.

## Phase 2: Packet, parsing, caps, log

- [x] T201 [US3] `src/ai/packet.ts` and `tests/ai/packet.test.ts`: allow-list build, token estimate
  within 700 to 900, firewall property test over every scene and seat of the Frontier pack.
- [x] T202 [US1] `src/ai/answer.ts` and test: first balanced JSON object, option must be on offer,
  `cp` clipped, prose around it tolerated, anything else gives `null`.
- [x] T203 [US4] `src/ai/caps.ts` and test: per-turn and per-session tokens and calls.
- [x] T204 [US4] `src/ai/tokenlog.ts` and test: lines match data-model.md, no key and no packet text.

## Phase 3: Drivers

- [x] T205 [US1] `src/ai/drivers/bot.ts` (wraps `botDeclaration`) and test.
- [x] T206 [P] [US1] `drivers/claude.ts` and test with fake fetch (request shape, usage counts, error
  statuses, deadline).
- [x] T207 [P] [US1] `drivers/gemini.ts` and test.
- [x] T208 [P] [US1] `drivers/groq.ts` and test.

## Phase 4: Runner

- [x] T209 [US1,US2,US5] `src/ai/runner.ts` and test: chain with deadline, caps, swap (manual,
  failover after 2 failures, human-left), history, persistence of `ai-seats.json`.
- [x] T210 `runtime/session.ts`: `command(cmd)` and an `onState` hook; `src/ai/config.ts` and test.

## Phase 5: Table view

- [x] T211 [US6] overlay view `ai` panel (driver, model, tokens, cap, swap flag) and overlay page
  rendering; swap line in the feed. Tests `tests/overlay`.
- [x] T212 [US2] admin dock route `POST /admin/api/swap` (seat, driver) and test.

## Phase 6: Wiring

- [x] T213 `src/sim/live.ts` (real timers through `Deps`, overlay, token log) and `sim/cli.ts --live`;
  `src/main.ts` builds the runner when `AI_SEATS_FILE` is set; `.env.example`, README section.
- [x] T214 [US1] End-to-end test `tests/sim/live.test.ts`: fake-model seats, a swap mid-run
  with the character carried over, no key in any log, a token row per call, same seed twice gives the
  same log, stop on the first cap. The human-leaves case is in `tests/ai/runner.test.ts`.
- [x] T215 Keep the engine replay test byte-identical (001's `tests/sim`).

## Phase 7: Land and prove

- [x] T216 Full suite (test, lint, typecheck, guard) in Docker: 56 files, 393 tests passed, 0 failed,
  0 skipped; lint, typecheck and guard clean (4 Nov, before the PR).
- [ ] T217 PR to main; squash-merge on green.
- [ ] T218 [SC-A03,SC-A04] Private 30-minute dry run on merged main: marrow on Claude, sable on
  Gemini with Groq as backup, juniper on the bot as the labelled H-7CH stand-in; one swap; logs saved.
- [ ] T219 [SC-A05] `docs/t091-runbook.md`.
