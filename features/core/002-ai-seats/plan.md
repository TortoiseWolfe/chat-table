# Implementation Plan: AI-driven player seats

**Branch**: `002-ai-seats` | **Date**: 2026-11-04 | **Spec**: [spec.md](./spec.md)
**Input**: [spec.md](./spec.md), [data-model.md](./data-model.md); builds on
[001-chat-table-v1](../001-chat-table-v1/).

## Summary

Seats get a driver layer. The pure engine learns two small things: a seat can be held by an `ai`
holder, and a new `ai-declare` command lets the runtime declare for it without the viewer cooldown.
Everything else lives in a new `src/ai/` folder, outside the engine: the turn packet builder (an
allow-list, so the spoiler firewall is structural), four drivers behind one interface, caps, a token
log, and a runner that, when a window opens, asks each AI seat's chain of drivers (primary, backup,
bot) for a decision inside the window's deadline and submits it as `ai-declare`. A seat whose chain
fails is declared by the bot script when the window closes, so a round never stalls.

## Technical Context

Same stack as 001: TypeScript strict, ESM, Node 22 in Docker, Vitest and fast-check, `zod` for the
config file. No new runtime dependency: drivers use `fetch` (from `Deps`) against each vendor's HTTP
API.

| Driver | Endpoint | Auth | Reply shape read |
| ------ | -------- | ---- | ---------------- |
| claude | `https://api.anthropic.com/v1/messages` | `x-api-key`, `anthropic-version` headers | `content[0].text`, `usage.input_tokens`, `usage.output_tokens` |
| gemini | `https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent` | `x-goog-api-key` header | `candidates[0].content.parts[0].text`, `usageMetadata.promptTokenCount`, `candidatesTokenCount` |
| groq | `https://api.groq.com/openai/v1/chat/completions` | `Authorization: Bearer` | `choices[0].message.content`, `usage.prompt_tokens`, `completion_tokens` |

Keys: read once at start through `deps.fs.readFile(path)` from the paths in the config (default
`~/.config/anthropic/worker-key`, `~/.config/gemini/api-key`, `~/.config/groq/api-key`; in a
container, mount them read-only). A key is held in a closure inside its driver, is never put in a log
call and never passed to `deps.log`.

## Constitution Check

- Engine pure: the two engine additions do no I/O and draw no randomness. Gate: the 001 replay test
  (same seed, same log) still passes byte for byte.
- Deps injected: every driver, the log and the runner take `Deps`. Only `src/main.ts` and
  `src/sim/cli.ts` wire real ones.
- No franchise content: seat labels and prompts use the pack's own words.
- 0 skipped tests.

## Project Structure

```text
src/ai/
  types.ts        Driver, TurnPacket, Decision, Caps, SeatConfig
  packet.ts       buildPacket(state, pack, seat, memory, now): TurnPacket (the firewall)
  answer.ts       parseAnswer(text, packet): Decision | null
  caps.ts         createCaps(caps): per-seat meter
  tokenlog.ts     createTokenLog(deps, path): record call and swap lines
  config.ts       zod schema and loader for the seats file
  drivers/bot.ts, claude.ts, gemini.ts, groq.ts
  runner.ts       createSeatRunner(...): chain, deadline, swap, history, human-left
src/sim/live.ts   a real-timer table with overlay, no Twitch (the dry run); wired by sim/cli.ts
```

Engine files touched: `engine/state.ts`, `engine/events.ts`, `engine/commands.ts`,
`seats/chat.ts`, `gm/round.ts`, `runtime/session.ts` (a `command` method, an `onState` hook),
`runtime/replies.ts`, `overlay/view.ts` and `overlay/public/*`, `admin/server.ts` (a swap route),
`main.ts`.

## Phases

1. Engine support (T200).
2. Packet, answer parsing, caps, token log (T201 to T204).
3. Drivers (T205 to T208).
4. Runner and session hook (T209, T210).
5. Overlay and admin (T211, T212).
6. Wiring, simulator, docs (T213 to T215).
7. Suite, PR, private dry run, runbook (T216 to T219).

## Risks

- Model ids change: ids are config strings. The dry run lists the vendor's model list first.
- A slow model eats the window: deadline per call, chain stops when under 1.5 seconds remain.
- Spend: caps are the control; the dry run's cap trip stops the run.
