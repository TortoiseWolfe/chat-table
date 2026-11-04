# T091 runbook: the off-air test with real people

This is the checklist for the first test with three or more real people (success criterion SC-009 in
[the v1 spec](../features/core/001-chat-table-v1/spec.md)). The channel is not streaming, so nobody
outside the group can see it. The game is the same one that plays on air. Nothing here schedules the
test or invites anyone; the maintainer names the time and tells people.

## Before the day

1. **The bot account exists** (task T090): the Twitch application is registered, the bot account is a
   moderator on the test channel, and any older game-command bot on that channel is switched off, so
   only one bot answers. This runbook cannot start without it.
2. The bot is signed in once. Open the printed link while signed in as the bot account:

   ```sh
   timeout 900 docker compose run --rm chat-table node dist/main.js login
   ```

3. The env file has the four Twitch values (see `.env.example`). Leave narration empty unless you want
   to test it.
4. Optional, for AI seats: set `AI_SEATS_FILE` to a seats file such as
   [ai-seats.example.json](ai-seats.example.json) and mount the key files read-only. Leave it empty
   if you only want to test people. Keep at least three seats free for the people.

## What to start

```sh
timeout 300 docker compose up -d chat-table
timeout 60 docker compose logs chat-table | grep "Admin dock"
```

Open the `Admin dock:` link that the log prints (on the machine running the game, `127.0.0.1` only).
Open the overlay in a browser tab so you can watch the table: `http://127.0.0.1:8787/overlay`.
Press **Start** in the admin dock.

## The link people open

The channel's chat, for example `https://www.twitch.tv/popout/CHANNEL/chat` (replace CHANNEL with the
test channel's login). Each person needs a Twitch account and nothing else. People do not need the
overlay; the host reads it aloud or shares the screen if they want to see the table.

## What each person does

1. Type `!characters` to see who is free, then `!join <name>` to take one seat. `!help` lists the rest.
2. Each round, read the scene in chat and type !1, !2 and so on for the option they want. Each person acts for
   their own character only.
3. Spend a Character Point only if the game offers it. Everyone must declare at least once, and at
   least one person must leave a seat before the end (`!leave`) so the autopilot handover is seen.
4. Someone who steps away does nothing: when the window closes without them, the bot declares for them.

## What the host does

- Press **Start** once, and watch the log for errors.
- If a model seat is playing, note which driver each seat shows on the overlay and whether a swap mark
  appears if one is made from the admin dock.
- Write down: the time it started, the number of people, how many rounds, and anything confusing.

## What counts as a pass

All of these:

1. Three or more different people joined seats and each acted in at least two rounds.
2. The game reached one of the pack's endings (or the round limit), with no crash and no restart.
3. A person who left a seat was replaced by the bot and the game carried on.
4. Every `!join` and every declaration got exactly one answer from the bot.
5. The host's notes list no command that was ignored or answered twice.

A fail on any line is a finding, not a disaster: write down which line and what was on screen.

## How to stop

```sh
timeout 120 docker compose down
```

The game saves after every command, so stopping loses nothing. The save and the token log (when AI seats
were on) are in the data volume. To start over from scratch, remove the volume only after copying out
anything you want to keep:

```sh
timeout 120 docker compose down -v
```
