# Content guard

chat-table ships an original setting. Settings built on someone else's licensed property are private
packs and must never enter this repo or its Docker image. The content guard enforces that in CI.

## How it works

- `guard/denylist.sha256` holds SHA-256 hashes of banned words and phrases (one to three words), never
  the words themselves, so the repo holds no banned term even in its own guard.
- Normalising a text: Unicode NFKC, lowercase, every run of characters outside `[a-z0-9]` becomes one
  space, trim.
- The guard splits each scanned file into normalised words and hashes every 1-, 2- and 3-word window.
  Any hash on the list is a hit: the guard prints the file and line (never the term) and exits 1.
- It scans every tracked text file in the repo except `guard/denylist.sha256`, and every text file in
  the built Docker image's `/app`.
- Its unit tests inject a made-up denylist (hashes of invented words) and plant a fixture at test
  time, so no real banned term is ever written into a test.

## Changing the list

New hashes come from the hub, which keeps the plain list outside every repo. Never add a plain-text
term to this repo, not in a test, a comment or a commit message.
