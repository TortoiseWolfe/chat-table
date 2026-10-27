# Quickstart: chat-table v1

Docker only. Nothing is installed on the host. `compose.yaml` has two services: `app` (development:
`node:22-alpine` with the repo mounted at `/work`) and `chat-table` (the built image a host runs, data
in the `data` volume at `/data`). Put a timeout on each command.

## 1. Run the tests (phase 2 onward)

```sh
timeout 600 docker compose run --rm app npm ci
timeout 600 docker compose run --rm app npm test          # vitest run; 0 skipped
timeout 600 docker compose run --rm app npm run lint      # eslint + markdownlint
timeout 600 docker compose run --rm app npm run typecheck # tsc --noEmit
timeout 600 docker compose run --rm app npm run guard     # content guard over the repo
```

## 2. Play an adventure offline (phase 2 onward)

Four bots, a fixed seed, no Twitch:

```sh
timeout 600 docker compose run --rm app npm run sim -- --seed 42 --out out/sim-42
```

It prints each chat line and narration line, ends on one of the pack's endings, and writes
`out/sim-42/events.jsonl` and `out/sim-42/state.json` (`out/` is gitignored). Run it twice with the same seed: the two
`events.jsonl` files are identical (SC-001).

With scripted viewers (each script line is `<seconds> <login> <chat text>`):

```sh
timeout 600 docker compose run --rm app npm run sim -- --seed 42 --script tests/fixtures/sim/two-viewers.txt
```

Interactive (type chat lines as a viewer called `you`; `/wait 60` moves the fake clock):

```sh
timeout 600 docker compose run --rm -it app npm run sim -- --seed 7 --interactive
```

Another pack: `--pack /path/to/pack` (the folder holding `pack.json`).

## 3. Run it on Twitch (phase 4 onward)

1. Register an application at <https://dev.twitch.tv/console/apps>: client type **Confidential**,
   OAuth redirect `http://localhost`. Copy its Client ID and make a Client Secret.
2. Make a second Twitch account for the bot. Make it a moderator on your channel (`/mod botname`),
   which raises its chat limit from 20 to 100 messages per 30 seconds.
3. Switch off any other bot on the channel that answers game commands, so only one bot replies
   (SC-013).
4. Copy `.env.example` to `.env` and fill in `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`,
   `TWITCH_BROADCASTER_LOGIN` (your login) and `TWITCH_BOT_LOGIN`. Narration is optional: set `NARRATOR_URL`,
   `NARRATOR_MODEL` and `NARRATOR_API_KEY` for any OpenAI-compatible endpoint, or leave them empty
   to use the pack's pre-written lines.
5. Sign the bot in once (device code; open the printed link while signed in as the bot account):

   ```sh
   timeout 900 docker compose run --rm chat-table node dist/main.js login
   ```

   The token is saved to the data volume as `token.json` (mode 0600) and refreshed by itself.
6. Start it:

   ```sh
   timeout 300 docker compose up -d chat-table
   timeout 60 docker compose logs chat-table | grep "Admin dock"
   ```

7. In OBS, add a **Browser** source with URL `http://127.0.0.1:8787/overlay`, 1920 x 1080. Add a
   **Custom Browser Dock** (Docks menu) with the `Admin dock:` URL from the log. Press **Start**.
8. Viewers type `!characters`, then `!join <name>`. `!help` lists the rest.

Stop with `timeout 120 docker compose down`. The game saves after every command, and pauses and saves when the
stream goes offline; **Start** resumes it.

## 4. The published image (phase 4 onward)

```sh
timeout 600 docker pull ghcr.io/tortoisewolfe/chat-table:latest
```

The `chat-table` service runs `${CHAT_TABLE_IMAGE:-ghcr.io/tortoisewolfe/chat-table:latest}`;
`timeout 900 docker compose build chat-table` builds it from source instead.
