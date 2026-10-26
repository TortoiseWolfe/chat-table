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

Status: specification. The v1 spec, plan and task list live in
[features/core/001-chat-table-v1](features/core/001-chat-table-v1/).

## Why this is its own repo

This started as a side job in TortoiseWolfe/TurtleWolfe (the idea notes live in its
`stream/d6-chat-rpg/`). It is a separate repo because it has a **different deployer** (every host
self-hosts it with their own Twitch app, not the TurtleWolfe site's pipeline) and a **published
artifact** (a Docker image on GHCR).

## Running it

Docker only; nothing is installed on the host. Instructions arrive with the first release.

## Licence

Code: MIT ([LICENSE](LICENSE)). Rules text that is Open Game Content: Open Game License 1.0a, with the
Section 15 notice in [OGL.md](OGL.md). This project is not affiliated with or endorsed by the owners of
any game system or setting.
