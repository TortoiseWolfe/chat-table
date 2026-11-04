# chat-table

A tabletop roleplaying game that a Twitch channel's chat plays together, with a bot as the game master.

Viewers type `!join` to take one of four pre-made characters, then play by picking numbered menu
options (`!1`, `!2`, `!3`) and rolling skill checks (`!roll <skill>`). Empty seats are played by bots
until a viewer claims them. A browser-source overlay in OBS shows the map, the tokens, wounds, the
turn order and the dice.

- **The bot always runs the game.** A game master written in code decides every roll, wound, turn and
  scene change. An optional language model only words the narration, one or two sentences at a time,
  from facts the game master hands it. If the model is slow or down, the game carries on with
  pre-written lines.
- **Rules:** Open Game Content used under the Open Game License 1.0a; see [OGL.md](OGL.md) and
  [docs/licensing.md](docs/licensing.md).
- **Setting:** an original space-opera setting, *Frontier*, in `packs/frontier`. Settings are content
  packs (JSON plus art and sound); a host can load their own with `--pack <path>`. Packs built on
  someone else's licensed property stay private to the host and never enter this repo, and CI blocks
  them (see [docs/content-guard.md](docs/content-guard.md)).
- **Self-hosted.** Every streamer runs their own copy with their own Twitch app and bot account. There
  is no shared service.

Status: the game engine, the offline simulator, the Twitch connection, the overlay and the admin
dock are built; the live-night checks on a real channel come next. The v1 spec, plan and task list live in
[features/core/001-chat-table-v1](features/core/001-chat-table-v1/).

## Why this is its own repo

This started as a side job in TortoiseWolfe/TurtleWolfe (the idea notes live in its
`stream/d6-chat-rpg/`). It is a separate repo because it has a **different deployer** (every host
self-hosts it with their own Twitch app, not the TurtleWolfe site's pipeline) and a **published
artifact** (a Docker image on GHCR).

## Running it

Docker only; nothing is installed on the host. Put a timeout on each command.

Play an adventure offline first (four bots, a fixed seed, no Twitch):

```sh
timeout 600 docker compose run --rm app npm ci
timeout 600 docker compose run --rm app npm run sim -- --seed 42 --out out/sim-42
```

To run it on your channel:

1. Register an application at <https://dev.twitch.tv/console/apps>: client type **Confidential**,
   OAuth redirect `http://localhost`. Copy its Client ID and make a Client Secret.
2. Make a second Twitch account for the bot. Make it a moderator on your channel (`/mod botname`),
   which raises its chat limit from 20 to 100 messages per 30 seconds.
3. Switch off any other bot on the channel that answers game commands, so only one bot replies.
4. Copy `.env.example` to `.env` and fill in `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`,
   `TWITCH_BROADCASTER_LOGIN` (your login) and `TWITCH_BOT_LOGIN`. Narration is optional: set
   `NARRATOR_URL`, `NARRATOR_MODEL` and `NARRATOR_API_KEY` for any OpenAI-compatible endpoint, or
   leave them empty to use the pack's pre-written lines.
5. Sign the bot in once (device code; open the printed link while signed in as the bot account):

   ```sh
   timeout 900 docker compose run --rm chat-table node dist/main.js login
   ```

   The token is saved to the data volume as `token.json` (mode 0600) and refreshed by itself.
6. Start it, and read the admin dock link from the log:

   ```sh
   timeout 300 docker compose up -d chat-table
   timeout 60 docker compose logs chat-table | grep "Admin dock"
   ```

7. In OBS, add a **Browser** source with URL `http://127.0.0.1:8787/overlay`, 1920 x 1080. Add a
   **Custom Browser Dock** (Docks menu) with the `Admin dock:` URL from the log. Press **Start**.
8. Viewers type `!characters`, then `!join <name>`. `!help` lists the rest.

Stop with `timeout 120 docker compose down`. The game saves after every command, and pauses and
saves when the stream goes offline; **Start** resumes it. The image is also published as
`ghcr.io/tortoisewolfe/chat-table`; `timeout 900 docker compose build chat-table` builds it from
source instead. The full walk-through is in
[features/core/001-chat-table-v1/quickstart.md](features/core/001-chat-table-v1/quickstart.md).

## AI-driven seats

A seat can be played by a model instead of a viewer. The seat keeps its character, points and history;
the driver (bot, Claude, Gemini or Groq) is interchangeable, and each seat has a primary and a backup.
Every turn a driver is handed the same short turn packet: its own character sheet, the scene text
everyone read, and the choices on offer. It never sees another seat's private information, a rule
table or the dice. Each seat has call and token caps (the Claude seat's are the tightest), and the
token log (`ai-tokens.jsonl` in the data folder) lists driver, model, tokens in and out, latency and
swaps. A human who leaves a seat hands it to the bot. The overlay shows each seat's driver and a token
gauge, and marks swaps. The admin dock can swap a seat's driver (`POST /admin/api/swap`).

1. Copy [docs/ai-seats.example.json](docs/ai-seats.example.json), edit the seats and the model ids
   (check them against each vendor's model list), and mount your key files read-only into the
   container at the paths the file names. A key never goes in a compose file, a commit or a log.
2. For a game on your channel, set `AI_SEATS_FILE` (and optionally `AI_PACE_SECONDS`) in your env file.
3. For a private run with no Twitch connection, use the live simulator. The pace holds each answer so
   a game lasts about as long as `--max-minutes`:

   ```sh
   timeout 2400 docker compose run --rm -v "$KEYS_DIR:/keys:ro" app npm run sim -- --live \
     --seats-file docs/ai-seats.example.json --declare 180 --pace 170 --max-minutes 30 \
     --swap 2:groq:12 --stop-on-cap --data-dir /tmp/run
   ```

Design notes: [features/core/002-ai-seats/spec.md](features/core/002-ai-seats/spec.md).

## Private adventure module (game master only)

You can keep notes from your own books in a folder **outside** this repo and have the game master
read them. Copy [packs/module-template](packs/module-template) somewhere else, fill it in, and set
`PRIVATE_MODULE_DIR` to the absolute path (mount it read-only in the container). With the variable
unset nothing loads, and a path inside the repo is refused. The notes sit behind the same firewall as
the rest of the secrets: they never reach a seat's packet, the narrator, the overlay, the chat or any
file the game saves, and a test plays a whole game to prove it. Only the host-side `gmNotes()` of the
session returns them. Never commit book text here, not even as a test sample.

## Licence

Code: MIT ([LICENSE](LICENSE)). Rules text that is Open Game Content: Open Game License 1.0a, with the
Section 15 notice in [OGL.md](OGL.md). This project is not affiliated with or endorsed by the owners of
any game system or setting.
