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

## Licence

Code: MIT ([LICENSE](LICENSE)). Rules text that is Open Game Content: Open Game License 1.0a, with the
Section 15 notice in [OGL.md](OGL.md). This project is not affiliated with or endorsed by the owners of
any game system or setting.
