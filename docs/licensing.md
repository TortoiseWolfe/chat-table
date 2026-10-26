# Licensing

Researched 26 Oct 2026 from the rule books' own licence pages. This is a summary for contributors,
not legal advice.

| Part of the repo | Licence |
| ------------------ | --------- |
| Program code (`src/`, tests, tooling) | MIT ([LICENSE](../LICENSE)) |
| Game mechanics (described in `docs/rules.md`, implemented in `src/engine`) | Open Game Content under the OGL 1.0a ([OGL.md](../OGL.md)) |
| The name chat-table, its logo, and the Frontier setting in `packs/frontier` | chat-table Product Identity; the pack's own licence is in `packs/frontier/ASSETS.md` |

## Sources

Primary text was read from the books' own OGL pages. The publisher's site is gone (its archived
2010 snapshot is a parked page), so the books were read from the copies kept by the community
OGC wiki, through the Internet Archive:

- D6 Adventure v2.0 (WEG51011):
  <https://web.archive.org/web/20201111163918/https://ogc.rpglibrary.org/images/1/1b/D6_Adventure_v2.0_weg51011OGL.pdf>
- D6 Space v2.0 (WEG51012):
  <https://web.archive.org/web/20201111163918/https://ogc.rpglibrary.org/images/8/8c/D6_Space_v2.0_weg51012OGL.pdf>
- D6 Space Aliens Vol. I (WEG51022):
  <https://web.archive.org/web/20201111163918/https://ogc.rpglibrary.org/images/6/61/D6_Space_Aliens_1_weg51022eOGL.pdf>
- D6 Legend and Conversion:
  <https://web.archive.org/web/20201111163918/https://ogc.rpglibrary.org/images/5/52/D6_Legend_And_Conversion_OGL.pdf>
- OGL 1.0a text: <https://opengamingfoundation.org/ogl.html>
- Mini Six Bare Bones Edition (a published game built on the same Open Game Content):
  <https://web.archive.org/web/2015id_/http://www.antipaladin.com/Mini_Six.pdf>

Secondary sources (forums, fan guides, news) are labelled where they are used.

## 1. There is no separate licence text

The rules were opened in 2009 by putting the books under the OGL 1.0a. Each book prints the full
OGL, its own Section 15 notice and a "Product Identification" block. There is no other licence
document.

D6 Adventure's block reads:

> Product Identity: The D6 System; the D6 trademarks, the D6 and related logos and any derivative
> trademarks not specified as Open Game Content; and all cover and interior art and trade dress are
> designated as Product Identity (PI) and are properties of Purgatory Publishing Inc. All rights
> reserved.
> Open Game Content: All game mechanics and material not covered under Product Identity (PI) above;
> OpenD6 trademark and OpenD6 logo (as displayed on this document cover page).

The later books (D6 Space, D6 Space Aliens Vol. I, D6 Legend) move the "OpenD6" name into Product
Identity instead:

> Product Identity: The D6 System; the D6 trademark, the D6 and related logos; OpenD6 and any
> derivative trademarks; and all cover and interior art and trade dress are designated as Product
> Identity (PI) and are properties of Purgatory Publishing Inc. Use of this PI will be subject to the
> terms set forth in the D6 System/OpenD6 System Trademark License (D6STL).
> Open Game Content: All game mechanics and materials not covered under Product Identity (PI) above.

**Not found:** the text of the D6STL trademark licence. The books name it but do not print it, and no
copy was found on the web or in the Internet Archive. chat-table therefore holds no trademark licence.

**Not found:** any statement on the open rules from Nocturnal Media, which bought West End Games in
April 2016 (news, secondary:
<https://www.icv2.com/articles/news/view/34218/nocturnal-media-purchases-west-end-games>).

**Our choice:** chat-table copies its rules from **D6 Adventure only**, and uses the D6 Adventure
Section 15 lines. Because the books disagree about the "OpenD6" name, chat-table treats it as a
trademark it may not use (see section 4).

## 2. "Wild Die" is a mechanic, not Product Identity

No book lists "Wild Die" as Product Identity. Every Product Identity list names only the D6 System,
the D6 trademarks and logos, derivative trademarks, the art and the trade dress (and, in the later
books, the OpenD6 name). Every book then makes "all game mechanics and material not covered under
Product Identity" Open Game Content, and the Wild Die is a mechanic printed in the rules and in the
books' Key Terms glossary ("Wild Die: A six-sided die, of a different color or size from other...").

This is settled by omission: no source names the Wild Die as Open Game Content in so many words, and
no trademark search was made. Mini Six, a published game under the same Open Game Content, keeps the
name: "One die rolled is always the Wild Die."

chat-table uses the name, and writes it in exactly one place (`SPECIAL_DIE_NAME` in
`src/engine/terms.ts`; FR-009), so it can be renamed in one edit if that ever changes.

## 3. The Section 15 notice

OGL Section 6 says to copy "the exact text of the COPYRIGHT NOTICE of any Open Game Content You are
copying" and to add our own title, date and holder. Section 10 says to include the licence with every
copy. D6 Adventure prints its first line as "v 1.0", not "v 1.0a"; we copy it as printed.

```text
15. COPYRIGHT NOTICE
Open Game License v 1.0 Copyright 2000, Wizards of the Coast, Inc.
D6 Adventure (WEG51011), Copyright 2004, Purgatory Publishing Inc.
West End Games, WEG, and D6 System are trademarks and properties of Purgatory Publishing Inc.
chat-table, Copyright 2026, TortoiseWolfe (Jonathan Pohlner).
```

This block lives in [OGL.md](../OGL.md) with the full licence. It must be in the Docker image too
(the Dockerfile copies `OGL.md`, `LICENSE` and `docs/licensing.md` into `/app`). If rules are ever
taken from another book, add that book's own line here; D6 Space's is
"D6 Space (WEG 51012), Copyright 2004, Purgatory Publishing Inc".

OGL Section 8 says to mark which parts are Open Game Content: that is the table at the top of this
page and the "Product Identification" section of OGL.md.

## 4. What Section 7 forbids

> 7\. Use of Product Identity: You agree not to Use any Product Identity, including as an indication
> as to compatibility, except as expressly licensed in another, independent Agreement with the owner
> of each element of that Product Identity. You agree not to indicate compatibility or
> co-adaptability with any Trademark or Registered Trademark in conjunction with a work containing
> Open Game Content except as expressly licensed in another, independent Agreement with the owner of
> such Trademark or Registered Trademark. [...]

Section 11 adds: "You may not market or advertise the Open Game Content using the name of any
Contributor unless You have written permission from the Contributor to do so."

So, in the name, README, docs, code, chat lines, overlay and image labels, chat-table never:

- says it is compatible with, for use with, or powered by any trademarked game system, the D6
  System, or the OpenD6 name;
- puts "D6" or "OpenD6" in its name, tagline or a title;
- shows the D6, D6 System or OpenD6 logos, or the West End Games or WEG marks;
- implies endorsement by West End Games, Purgatory Publishing or Nocturnal Media.

Allowed: the Section 15 lines above, inside OGL.md and this page, and "D6" meaning the die itself
("roll 3D6"), which a fan guide (secondary, June 2010, not reviewed by a lawyer) calls ordinary game
language: <https://web.archive.org/web/2020/https://ogc.rpglibrary.org/images/e/e7/OpenD6_And_OGL_-_Rules_Of_Thumb.pdf>.
In the README, the rules are described as "Open Game Content used under the Open Game License 1.0a;
see OGL.md".

The content guard (docs/content-guard.md) also fails CI on a line that pairs "compatible",
"compatibility", "for use with" or "powered by" with a D6 name, outside OGL.md and this page.

## 5. The OGL 1.0a still stands

In January 2023 Wizards of the Coast said: "We are leaving OGL 1.0a in place, as is. Untouched."
(Kyle Brink, "OGL 1.0a & Creative Commons", 27 Jan 2023:
<https://www.dndbeyond.com/posts/1439-d-d-open-game-license-ogl-1-0a-and-the-system-reference-document>).

## 6. Rules numbers used by the engine

All from D6 Adventure v2.0. Page numbers are the printed ones. The chat-table decisions built on them
are in `features/core/001-chat-table-v1/research.md`.

| Rule | Book text | Page |
| ------ | ----------- | ------ |
| Wild Die explodes | "If the player rolls a 6 on the Wild Die [...] she may add the 6 to her total and roll the Wild Die again." | 46 |
| Wild Die 1 on the first roll | GM picks: "1. The Critical Failure cancels out the highest roll [...] 2. Add the dice results normally, but a complication occurs." Later 1s in the chain do nothing. The introductory adventure (p. 3) uses option 1. | 46 |
| Difficulty | Very Easy 1-5, Easy 6-10, Moderate 11-15, Difficult 16-20, Very Difficult 21-25, Heroic 26-30, Legendary 31+. "Ties generally go to the initiator of the action." | 52-53 |
| Combat difficulty | Base 10 (passive defence); never below 3. | 58-59 |
| Multiple actions | "for each action taken beyond the first, the player must subtract 1D from all skill or attribute rolls (but not damage, damage resistance, or initiative rolls)." | 49 |
| Initiative | Perception rolls; ties go to Perception, then search, Reflexes, dodge. | 48 |
| Wounds | Damage total beats the Physique (+ armor) resistance total by: 1-3 Stunned, 4-8 Wounded (Severely Wounded if already Wounded), 9-12 Incapacitated, 13-15 Mortally Wounded, 16+ Dead. "Any additional damage less than the character's current level moves the character up by one level." Penalties: Stunned -1D, Wounded -1D, Severely Wounded -2D; not cumulative; not applied to resistance rolls. | 62 |
| Character Points | One extra Wild Die per point, "a Critical Failure counts as a 1"; maximum per roll set by the GM ("For adventures with easy challenges, the maximum is two"). Not on the same roll as a Fate Point. | 46-47 |
| Fate Points | "double the number of dice she normally gets for that roll. However, the player only rolls one Wild Die." Weapon damage and equipment bonuses are not doubled; spent before the roll; one per roll per round. | 47 |
