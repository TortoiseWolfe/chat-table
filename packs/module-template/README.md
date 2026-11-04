# Private module template

A blank, game-master-only module in the same shape as a content pack. Copy this folder to a place
outside the repo, fill it in from your own books, and point `PRIVATE_MODULE_DIR` at the copy (an
absolute path). Nothing in it ever reaches a player, the overlay or the stream.

- `module.json`: the module's id, name, version and where the material comes from.
- `scenes.json`: notes and secrets per scene id of the pack you play it with.
- `npcs.json`: motive and secrets per NPC id of that pack.

Keep real book text out of this repo, including in tests. The repo's content guard and its
licensing rules apply to everything committed here.
