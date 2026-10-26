# chat-table Constitution

## Core Principles

### I. The bot is the game master
A game master written in code (`src/gm`) makes every decision: rolls, difficulties, wounds, turn
order, NPC actions and scene changes. No human GM tooling is in scope. A language model may word the
narration and nothing else.

### II. A pure, deterministic engine
`src/engine` is `apply(state, command, rng) -> { state, events }`. No I/O, no clock, no global
randomness. The same seed and the same command stream give the same log, byte for byte. State is
snapshotted atomically after every command; the JSONL log stores dice results so a rules change never
breaks an old log.

### III. Injected dependencies
Every outside-world effect (network, clock, timers, files, sockets, randomness) enters through a
`Deps` interface, as in TurtleWolfe's `stream/alerts/src/config.ts`. Only `src/main.ts` builds the
real ones. Tests use fakes, never real time or real network.

### IV. Clean content and clean licensing (NON-NEGOTIABLE)
The public repo ships an original setting only. Licensed franchise content lives in private packs
loaded at run time. CI runs the content guard on the repo and on the Docker image. Rules text taken
from Open Game Content carries the OGL 1.0a and its Section 15 notice. No trademark or compatibility
claim (OGL 1.0a Section 7). No Bits, no paid advantage, no wagers.

### V. Self-hosted, one host per copy
Each streamer runs their own copy with their own Twitch application and bot account. The project
runs no shared service and ships no shared Client ID.

### VI. Docker-first, tests first
Node 22 in Docker; nothing installed on the host. Vitest for unit and property tests, Playwright for
overlay screenshots. A skipped test is a failing test. Each phase merges only on green CI.

### VII. Chat is slow and noisy
Stream video lags chat by 2 to 15 seconds. Play is menu-driven (`!1 !2 !3`), rounds have a declare
window, missed turns fall back to a default action, and outbound chat respects Twitch rate limits.

## Governance
This constitution outranks the plan and tasks. A change to it needs the maintainer's approval in a
PR.

**Version**: 1.0.0 | **Ratified**: 2026-10-26 | **Last Amended**: 2026-10-26
