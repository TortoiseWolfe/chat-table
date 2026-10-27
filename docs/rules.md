# Rules

This page describes the rules chat-table plays by, in our own words. The code that carries them out
is in `src/engine`. These mechanics are Open Game Content, as set out under "Product Identification"
in [OGL.md](../OGL.md). The Frontier setting in `packs/frontier` is not part of that content.

## Dice codes

Every attribute, skill, weapon and piece of armor has a dice code such as `3D+2`: three six-sided dice
plus two. The part after the plus sign is a pip (a flat bonus). Three pips make one die, so `3D+3` is
written `4D`. A code is always kept in that tidy form, and a code can never fall below `0D`.

Adding two codes adds the dice and the pips, then tidies. Removing dice (for a wound) takes whole
dice away and leaves the pips alone, unless no dice are left, in which case the pips go too.

## The special die

Every roll with at least one die sets one of those dice apart as the special die. The name is kept
in one place in the code (`SPECIAL_DIE_NAME` in `src/engine/terms.ts`); a pack may rename it, and
every chat line and page reads the name from there.

- **Exploding.** The special die is re-rolled and added each time it shows a 6, with no limit. The
  other dice are rolled once.
- **A 1 on the first throw.** Only the first face of the special die counts for this, and the host
  picks one option for the whole night:
  - `drop-highest`: the special die's 1 is removed, and so is the highest of the other dice. A roll
    of a single die loses only the 1. This is the default.
  - `complication`: nothing is removed. The roll is marked so the narration can say something went
    wrong, but the total is not changed.
  - `none`: the 1 counts as an ordinary 1.
- The total is the sum of the dice kept, plus the pips, and never below zero.

## Difficulties and checks

A check compares a roll total with a target number. The named difficulties are:

| Name           | Number |
| -------------- | ------ |
| very easy      | 5      |
| easy           | 10     |
| moderate       | 15     |
| difficult      | 20     |
| very difficult | 25     |
| heroic         | 30     |

A pack may give a plain number instead of a name. A check succeeds when the total meets or beats the
target. The margin is the total minus the target; a negative margin is a failure.

In an opposed check, two characters roll and the second total becomes the first one's target. A tie
goes to the one who started the action.

A character with no skill in something rolls the attribute the skill belongs to.

## Wounds

When damage is rolled against a target, the target resists by rolling its Physique plus any armor.
Wound penalties do not apply to that roll. If the damage total beats the resistance total, the
margin sets the wound:

| Margin     | Wound            |
| ---------- | ---------------- |
| 1 to 3     | stunned          |
| 4 to 8     | wounded          |
| 9 to 12    | incapacitated    |
| 13 to 15   | mortally wounded |
| 16 or more | dead             |

A margin of zero or less does nothing.

**Stacking.** A healthy character takes the wound as it comes. A character who is already hurt and
takes a hit of the same level or a lower one moves up one level (a wounded character hit again lightly
becomes severely wounded). A hit that is worse than the current level replaces it.

**Penalties.** Wounds remove dice from skill and attribute rolls (not from damage, resistance or
initiative), and the penalties do not add up: stunned and wounded take away 1D, severely wounded
takes away 2D. Incapacitated, mortally wounded and dead characters are out of the scene. A stun wears
off at the end of the next combat round, unless a worse wound has replaced it. All wounds clear when
the adventure ends.

## Character Points and Fate Points

- **Character Points** are spent before a roll. Each one adds an extra die that explodes on a 6 and
  counts a 1 as a 1. A host setting caps how many may go on one roll (two by default).
- **A Fate Point** doubles the dice and the pips of the attribute or skill code being rolled, before
  any wound penalty. Damage and armor are not doubled. Only one may be used per roll, and not on a
  roll that also uses Character Points.

Points are spent when the action is declared, because chat cannot spend them after seeing a roll. An
adventure ends with an award of Character Points to each viewer who took part.

## Initiative

At the start of each combat round everyone in the fight, players and non-player characters, rolls
Perception. The highest total goes first. Ties are settled by the Perception code, then the Reflexes
code, then by identifier, so the order is always the same for the same inputs.

## Several actions in one round

A character may declare more than one action in a round. Each action after the first costs 1D on
every action that round, so two actions are each rolled one die lower, and three are each two dice
lower.

## Attacks in chat-table

An attack is a roll of the weapon's skill against a difficulty. The difficulty is the weapon's range
band, or the target's dodge total for the round if that is higher, and never less than 3. A hit then
rolls the weapon's damage code against the target's resistance, as described under wounds. The dodge
rule is a simplification of our own. Non-player characters act in initiative order using the tactic
their pack gives them, and they do not dodge.
