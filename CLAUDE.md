# CLAUDE.md

chat-table: a Twitch-chat tabletop RPG where a bot is the game master. Public, MIT. One TypeScript
package on Node 22, Vitest. Spec, plan and tasks: `features/core/001-chat-table-v1/`.
Rules for the project as a whole: `.specify/memory/constitution.md`.

## Hard rules

- **Docker only.** Never run npm, pnpm, node or tsc on the host. Use
  `timeout 600 docker compose run --rm app <cmd>` (service `app`, image node:22). Put `timeout` on
  every docker call.
- **No franchise content.** Never write a name, place, species, ship, stat block or text from a
  licensed franchise, in code, data, tests, docs or commit messages. The setting in this repo is the
  original `packs/frontier`. The content guard (`guard/denylist.sha256`, `npm run guard`) fails CI on a
  hit; never add plain-text banned terms anywhere, not even in tests.
- **No compatibility claims.** Never write that the project is "compatible with" or "for use with"
  any trademarked game system (OGL 1.0a Section 7; see `docs/licensing.md`).
- **The engine is pure.** `src/engine` does no I/O, reads no clock and draws randomness only from the
  `Rng` it is given. The code GM decides; the narrator only words. Viewer text reaches the narrator
  only inside quotes.
- **Inject dependencies.** Anything that touches the outside world (fetch, clock, timers, files,
  sockets, randomness) comes in through a `Deps` object; only the two entry points, `src/main.ts` and
  `src/sim/cli.ts`, wire real ones (tests may use `node:fs` to read fixtures).
- **Tests:** 0 skipped. A `.skip` or `.todo` fails review.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
