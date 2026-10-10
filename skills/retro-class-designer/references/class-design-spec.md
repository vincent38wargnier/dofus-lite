# Custom class specification

Version 1 · 10 October 2026 · target: this repository's imported Retro data and combat engine.

**Goal:** one theme, a readable and interesting kit of at most 10 spells, and one self-contained ZIP. Its rules must be explicit, executable by the general AI, and testable against the original classes.

**Delivery status:** the game has a graphical new-spell editor and a one-file class/dungeon ZIP importer, including optional character/creature artwork and spell icons. Importable packages use `content.json`; see [the runtime ZIP contract](runtime-zip.md). The older `class.json` schema and example described in this document remain a separate design-kit format, not directly browser-importable. Their design principles and frozen Retro comparison data still apply. Custom Flash effects/audio are not imported. Technical validation is not a certification of balance.

## 1. Separate three questions

| Gate | Question | Evidence |
| --- | --- | --- |
| Technical validity | Can this package be parsed and its declared mechanics executed? | Schema, assets, references, engine tests |
| Conservative guardrails | Does it avoid obvious excessive values and combinations? | Static warnings, comparison spells, legal turn calculations |
| Balance evaluation | Does it have fair strengths, weaknesses, and matchups? | Reproducible combat matrix and human playtests |

Passing the first two gates never proves the third. Existing spells are examples with context, not a menu of maximum allowances. A class built from the strongest ten original spells is not necessarily fair.

The game currently allows much stronger combinations through its unrestricted workshop. These proposed rules govern the **new authoring package**, not a retroactive deletion or weakening of existing creations. A future importer should distinguish an experimental class from an evaluated class; the package author cannot grant themselves an evaluated badge.

## 2. Class design brief

Write these before choosing numbers:

| Field | Required decision |
| --- | --- |
| Identity | “This class wins by … but struggles when …” |
| Theme | Visual motifs, tone, names, silhouette, animation language |
| Primary role | Damage, control, protection, healing, or summons |
| Secondary role | Exactly one useful complement |
| Elements | Start with one or two; equipment investment must matter |
| Effective distance | Melee, medium, or long range; define the unsafe distance |
| Strengths | Two or three specific advantages |
| Weaknesses | At least two weaknesses an opponent can actually exploit |
| Core loop | Setup → choice of payoff → recovery or repositioning |
| Counterplay | How to interrupt, avoid, punish, or outlast that loop |
| Team value | What allies gain and what stacks across multiple copies |
| Complexity | Recommended beginner/intermediate/expert, with explanation |
| Reference classes | Two or three original classes for comparison |

Useful tradeoffs include exposed melee damage, range that requires a clear line, healing that sacrifices offensive AP, and a burst window followed by low output. “Costs AP” alone is not a weakness: every class pays AP. A long-range class with unrestricted escape, strong healing, hard control, and top melee damage has probably erased its counterplay.

A themed skin can reuse a tested kit unchanged. Changing target filters, damage lines, duration, cooldown, or inherited base class changes balance and requires a new evaluation.

## 3. The 10-spell kit

Ten is a maximum, not a reason to add filler. Keep the equipped weapon separate and first in the spell bar; it does not consume a spell slot. The package must not append free common spells or the original class's spellbook behind the scenes.

One reasonable starting allocation is:

| Slots | Purpose | Design test |
| --- | --- | --- |
| 1–2 | Reliable attacks | Different range/element decisions, not duplicates |
| 3 | Area attack | Useful on a group; weaker value on one easy target |
| 4 | Conditional or limited burst | Clear cost, exposure, or recovery window |
| 5 | Setup / boost | Improves another decision without being compulsory every turn |
| 6 | Movement / placement | Creates options without deleting all positional risk |
| 7 | Defense or sustain | Trades damage or tempo for survival |
| 8 | Control | Creates an opening; does not permanently remove the opponent's turn |
| 9 | Signature interaction | Expresses the class identity |
| 10 | Complement | Resolves an awkward choice, not every remaining weakness |

This is a design scaffold, not a mandatory quota. A specialist healer or summoner needs another allocation. Original kits have 22 entries in the imported class lists, including special spells and the Dopple summon; a compact custom kit can lack options without deserving twice the numerical power.

### Spell design card

Every spell needs the following information in its manifest or design notes:

| Group | Required information |
| --- | --- |
| Identity | Stable key, name, description, icon, primary role |
| Cost | AP, failure probability, whether failure ends the turn |
| Aim | Self, fighter, enemy, cell, or empty cell; min/max range |
| Constraints | Line only, line of sight, adjustable range, empty-cell rule |
| Limits | Casts per turn, casts per target, cooldown, initial cooldown |
| Effects | Ordered list; each effect's target filter and area |
| Numbers | Element, base min/max, duration, stat or movement distance |
| Critical | Full alternative effect list and base critical divisor |
| Timing | Immediate, recurring, turn boundaries, expiration, dispel |
| Interactions | Which spells it enables; which effects stack or consume a state |
| Counterplay | How the target avoids or punishes it |
| References | At least two comparable native spells, with IDs and grades |
| Presentation | Cast animation reference, impact, sound, preview and log behavior |

Keep rules in declarative fields. A description saying “only once per target” is not enforcement. A claimed stack cap is not real unless the engine implements it.

## 4. Measured reference and starting values

The reproducible audit reads `src/engine/spellLibrary.json`: **12 classes, 264 class-spell entries, 528 rows at grades 5 and 6**. The source records the imported SWF filenames, versions, and SHA-256 hashes. Exact rows are in [baseline.json](baseline.json); the compact table is [baseline.csv](baseline.csv).

The following is grade 6, one immediate ordinary damage line, positive AP cost, no random effect branch, summon-only filter, required state, initial cooldown, or cooldown longer than one turn. It still contains different ranges and casting limits, so compare the actual spell rows too. Percentiles use linear interpolation.

| Sample | Count | Median raw damage / AP | Middle 50% |
| --- | ---: | ---: | ---: |
| All qualifying attacks | 39 | 5.50 | 4.15–7.44 |
| Single target, all ranges | 28 | 5.08 | 4.09–7.50 |
| Single target, max range ≤ 2 | 5 | 8.25 | 6.25–8.50 |
| Single target, max range > 2 | 23 | 4.50 | 4.00–6.17 |
| Area, per target before zone coefficient | 11 | 6.50 | 5.31–7.25 |

These are **observations, not official balance limits**. The area sample is not controlled for range or target cap; it does not establish that every area spell should hit harder than a point spell. Five melee examples are a small sample. Utility, life steal, poison, multi-hit attacks, chance branches, and conditional bursts need separate comparisons.

### Proposed conservative starting envelope

These house guidelines deliberately start below some powerful original outliers. The validator flags exceptions for review; it does not automatically grant balance approval to everything inside the envelope.

| Mechanic | Initial design recommendation |
| --- | --- |
| Reliable ranged point attack | About 4–6 base damage/AP, one line |
| Exposed short-range point attack | About 6–8 base damage/AP, with a real positional cost |
| Small area attack | About 3–5 base damage/AP per target before zone coefficient |
| Damage plus meaningful utility | Lower damage than a comparable damage-only spell |
| Life steal | Count both damage and actual healing; reduce the damage budget |
| Boost | One modest primary offensive boost; avoid overlapping copies |
| Flat damage | Start at +5 to +10 for a limited window; inspect every damage line |
| Power | Start around +50 to +80 for 1–2 turns with downtime |
| AP generation | Exclude from a first kit; otherwise inspect every resource loop |
| MP boost | Start at +1 or +2, short duration, real downtime |
| Teleport | Start around 3 AP or more, 1–3 cells, cooldown ≥ 2 |
| Heals | Limited sustain with AP/tempo cost; test at high intelligence and +heals |
| Hard control / immunity | Specialist mechanic requiring custom tests and counterplay |
| Summons | Price their future turns, blocking and utility, not just summon AP |

A damage ceiling cannot balance healing, movement, or control. Damage-per-AP is a diagnostic, not a universal power currency. Do not add arbitrary “healing points” and “range points” and label the resulting score scientific.

### Calculate actual combat value

In this engine, before special reactions, a direct damage line approximately follows:

```text
line = floor(baseRoll × max(0, 100 + elementalStat + power) / 100) + flatDamage
zoneLine = floor(line × zonePercent / 100)
afterResistance = floor(max(0, zoneLine − fixedResistance) × (100 − percentResistance) / 100)
actualLostHP = min(remainingHP, damageAfterProtectionAndReactions)
```

The engine is the authority for rounding, critical variants, armor, reflection, target displacement, and death. Earth/neutral scale with strength; fire with intelligence; water with chance; air with agility. Intelligence also scales healing. Wisdom affects removal; agility also affects critical probability and tackle. A multi-element stat therefore has more value than one isolated damage multiplier suggests.

Important consequences:

- **Flat damage applies to each line.** Three lines with +30 damage gain up to +90 before reductions; one line gains +30. Do not split an attack into three cosmetic lines for free.
- **Boosts apply immediately in effect order.** “Damage, then +8 damage” boosts later spells; reversing the order also boosts the same action. Two Furies can prepare +16 flat damage, but the full kit and its costs must be considered.
- **Critical effects replace normal effects.** Include the boost/control rows again if they should still happen on a critical. Test both natural critical probability and equipment that approaches 1/2.
- **Spell areas are 110% at the aimed cell, then −10 percentage points per Manhattan step, floored at 10%.** Point spells and weapons use 100%. Evaluate one, two, and four victims; do not assume every geometric cell is occupied.
- **Life steal heals half the HP actually removed**, rounded down and capped by missing HP. A 500-point overkill against 20 HP does not give 250 healing.
- **Heals scale with intelligence plus flat heals.** Power and flat damage do not substitute for these bonuses.
- **Current temporary buffs stack.** There is no general `maxStacks` field. Cooldown and duration constrain repetition, but other spells and other casters can still stack bonuses.
- **Friendly-fire filters are real power.** An enemy-only area is better than one that hits allies at the same damage and cost.
- **Per-target limits count the aimed fighter, not every area victim.** Use a per-turn limit to bound repeated hits from different empty centers.
- **Cooldown and duration boundaries matter.** Self-buffs include internal bookkeeping for the current turn. Verify expiration through actual end/start-turn actions, not a guessed countdown.

Example using fixed midpoint rolls without resistances: two 4 AP attacks with a base roll of 20, 600 elemental stat, and +30 flat damage deal 170 each. A 3 AP +60 power boost followed by two attacks costs 11 AP and deals 182 each. When cast limits permit, the same 12 AP could instead fund three unboosted attacks for 510. The boost may repay its cost across later turns or allies; it is not automatically the best opening. For the actual example kit and its specific restrictions, see [the walkthrough](example-walkthrough.md).

## 5. Kit interactions and abuse review

For each class deliver a small interaction table, with both intended combos and deliberately unsupported interactions.

| Check | What to simulate |
| --- | --- |
| Burst | Best legal first-turn and prepared 10/12/15 AP sequences |
| Sustain | Five-turn damage/healing/mitigation with real AP costs |
| Duration overlap | Normal and critical durations, self and ally casts, duplicate classes |
| Resource loops | AP gain/refund exceeding cost, summon refunds, cooldown resets |
| Multi-hit | High flat damage, reflection, on-hit effects, resist per line |
| Zones | Off-center aiming, friendly fire, empty cells, displacement between effects |
| Movement | Escape plus long range, repeated push into walls, unreachable kite loops |
| Control | Multiple spells removing all useful AP/MP every turn |
| Healing/protection | Infinite stall, healing through immunity, damage converted to healing |
| Summons | Simultaneous cap, chain summons, owner death, blocking, inherited stats |
| Triggers | Recursive proc chains, same-action recursion, self-triggering damage |
| Death | Overkill, life steal, dead target effects, simultaneous deaths, cleanup |
| Equipment | Weapon attacks, AP/MP exos, critical builds, range, resist and +damage |

Do not balance around the observed median equipment alone. This game has allowed 15 AP preparations; retain that stress case even if the central tuning point is 10–12 AP.

For a new resource mechanic, document state ownership, gain/spend rules, caps, reset timing, death/dispel behavior, and AI observability. A powerful payoff must consume the resource atomically. Do not implement a custom mechanic by assigning an unexplained native spell ID: some original IDs have special behavior.

### Summoner extension

The v1 package deliberately excludes authoring new summons. A future summoning profile must include the creature's HP, AP, MP, resistances, stats, complete spellbook, AI-visible actions, level scaling, lifespan, simultaneous cap, summon cooldown, team and owner links. An existing dungeon boss is not a balanced player summon. Compare total damage/control over at least three turns, and ensure killing the summoner removes owned summons correctly.

## 6. Base stats and progression

A class is more than its spell list. The current custom system inherits a native `baseClass`: characteristic investment caps, base profile, and default appearance. Declare it and compare using that same profile. It is not only a portrait selector. Do not silently inherit Sacrier vitality economics for a ranged high-sustain kit and assume the same spells remain fair.

| Property | Version 1 decision |
| --- | --- |
| Target level | 200 only; grade 6 fixed |
| Base stats | Inherit the declared native base class |
| Base AP | Native rule: 6 before level 100, 7 from level 100 |
| Base MP | Native 3, before equipment/effects |
| Spellbook | 1–10 authored spells, no automatically added common spells |
| Equipment | Chosen separately; never bundled hidden bonus stats |
| Scaling | No invented automatic grade or level scaling |
| Low-level availability | Future importer must enforce level 200 for this profile |

The raw compiler sets `requiredLevel: 200` but the current custom-spell resolver does not enforce authored progression. This is an importer/runtime integration requirement, not protection already provided by a JSON field.

For a later progression profile, require explicit rows for grades 1–6, unlock levels, legal costs/ranges/limits, and tests around every breakpoint. Do not multiply grade-6 damage by `level/200`: AP, range, cooldown, and power spikes need independent design. Existing special/common spell rules are not a universal level-101 rule for every new spell.

## 7. Art and presentation

All character PNGs use 256 × 256 frames. Ground anchor: **(128, 224)** in each frame. Frame order is left to right. Preserve scale, feet position, costume, and silhouette across poses.

| File under `artwork/` | Size | Frames / rate | Required |
| --- | --- | --- | --- |
| `portrait.png` | 256 × 256 | 1 | Yes |
| `idle-front.png` | 256 × 256 | 1, southeast | Yes |
| `idle-back.png` | 256 × 256 | 1, northwest | Yes |
| `walk-front.png`, `walk-back.png` | 1536 × 256 | 6 at 12 fps | Recommended |
| `cast-front.png`, `cast-back.png` | 1536 × 256 | 6 at 10 fps | Recommended |
| `hit-front.png`, `hit-back.png` | 768 × 256 | 3 at 10 fps | Recommended |
| `icons/<spell-key>.png` (outside `artwork/`) | 64 × 64 | 1 per spell | Yes |

Other directions mirror the appropriate front/back sheet. Do not supply eight independent directions or a death sheet unless the renderer is extended. Missing action sheets fall back to idle. Every frame must contain visible pixels; all non-portrait sheets need transparency. The package profile accepts 8-bit RGBA, non-interlaced PNGs so the validator can inspect every frame consistently.

Use a distinct silhouette, readable poses at the real game scale, no clipped weapons/hair, and icons understandable at about 40 pixels. Let the spell bar apply element color; do not encode a contradictory element in the icon. A theme should remain recognizable without obscuring cells or targeting previews.

Custom artwork currently supplies the whole character appearance. Layered hats/capes/pets and custom animation attachments need a separate renderer contract; statistics from equipped items still apply. Do not promise automatic equipment overlays on arbitrary imported sprites.

For v1, `presentation.animationSpellId` references an existing local client spell animation and its sound behavior. The proposed importer must verify the reference and bind it separately from the custom spell's logical ID. No arbitrary SWF, JavaScript, remote URL, executable asset, or custom sound file is accepted by this ZIP contract. New bespoke spell FX/audio require a future version with explicit duration, anchoring and sound limits.

Keep an art rights/attribution statement in `credits`. The included example uses the repository's neutral demonstration character, not a newly generated finished themed character. Its repeated placeholder icon is deliberate; create distinct final icons before publication.

## 8. One-ZIP contract

```text
my-class.zip
├── class.json
├── artwork/
│   ├── portrait.png
│   ├── idle-front.png
│   ├── idle-back.png
│   └── ...optional action sheets
└── icons/
    ├── cinder_shard.png
    └── ...one PNG for each spell
```

The manifest contains all metadata and spell definitions; no downloaded dependency or manual database edit is needed for the **future importer**. See [the schema](../assets/class.schema.json) and [complete example](../assets/example/class.json). Names and descriptions are plain text. Keys and references are stable identifiers, independent of translation.

| Layer | Rule |
| --- | --- |
| Manifest | UTF-8 `class.json` at root; format/version fixed; ≤ 128 KiB |
| Archive | ZIP stored or deflate; no encryption, ZIP64, symlinks, traversal, or duplicates |
| Contents | Only manifest, known artwork, and exact referenced icons; ≤ 24 files |
| Limits | ≤ 20 MiB archive, ≤ 16 MiB expanded, ≤ 2 MiB per PNG |
| Spells | Unique keys, 1–10 entries, finite bounded integers, supported effects |
| IDs | Compiler namespaces keys; importer allocates/checks numeric IDs against all content |
| Versioning | Stable class ID plus semantic package version; immutable combat snapshots |
| Changes | A new package must not silently replace another creator's class or active replay |
| Failure | Validate fully before persistence; preserve prior saves on every error |

Recommended future flow: **Atelier → Importer une classe → choose ZIP → one result panel**. A valid new package imports in one operation. If the same ID/version already exists, report that it is already installed; a different version gets a deliberate update/duplicate choice. There is no editing JSON or importing PNGs separately for the player.

The result shows name, portrait, spell count, inherited class profile, technical status, and balance status. Technical errors block installation; conservative warnings can offer experimental installation. A shipped evaluation badge must come from locally trusted benchmark results tied to content and engine hashes, not from self-asserted text in `class.json`.

Commit the manifest, compiled spellbook, artwork and icon blobs as one logical transaction. Prefer one IndexedDB transaction; if metadata remains in localStorage, stage the import and implement rollback. Check quota before committing; do not display success with only some images saved. Keep browser saves and server identities out of the ZIP.

## 9. Balance validation protocol

### Mechanical acceptance

Before evaluating win rates, test each spell's legal/illegal targets, AP cost, critical/failure paths, cooldown, per-turn/per-target limits, AoE preview versus actual hit cells, friendly fire, immediate buffs, turn expiration, healing caps and effect order. Exercise all 10 spells. Test custom spell names in compact logs, sound/animation fallback, no disappearing actors, no animation input lock, save/reload, and ZIP export/reimport.

The authoring validator checks data and image mechanics. It cannot verify animation appearance or AI competence. Use the actual engine for effects and a browser for presentation. Unsupported fields must fail validation, not be silently ignored.

### Combat matrix

| Axis | Minimum development coverage |
| --- | --- |
| Opponents | All 12 original classes and a custom mirror |
| Maps | Open, obstructed, narrow; both starting sides |
| Builds | 10/12 AP representative, 15 AP stress; primary-stat and hybrid variants |
| Gear extremes | High flat damage, critical 1/2 when reachable, resist, range, wisdom |
| Randomness | 20 seeded mirrored pairs per original class/map/build for screening |
| Team stacking | Duplicate custom classes; support effects on allies and summons |
| PvE | Dummy, melee pack, ranged pack, summoner room, resistant boss room |
| Human review | At least an experienced player on each side for key matchups |

At three maps and two representative builds, 12 classes × 3 maps × 2 builds × 20 seeds × 2 sides gives **2,880 screening duels**. The 15 AP, special equipment, team and PvE checks are additional. This is a proposed protocol, not a run already performed for the example.

First run original-class controls under the same conditions. Use equal item budgets and each class's appropriate element build; forcing every class into fire equipment is not a fair benchmark. Also run a normalized-stat laboratory to isolate spell behavior, clearly separate from legal equipment matches. Record seeds, engine/data hashes, AI version, class package hash, loadouts, starting positions and termination reasons.

Measure wins, losses, draws, turn-limit results, turns to kill, actual enemy leader damage, healing, mitigation, AP/MP denied, summon contribution, invalid actions, errors, and decision time. A turn-limit points win is not a dungeon clear. Break results down by matchup, map, build and starting side; a single average can hide an oppressive counter matchup.

Use a general AI for both sides. Class-specific trained heuristics may favor the native class or misread the new kit. If a signature spell is rarely used, inspect decisions and run scripted combo tests before concluding that the class is weak. Do not increase damage to compensate for an AI bug. GPU training is not required for this process; ordinary seeded engine simulations are sufficient to start.

### Proposed release criteria

| Criterion | Initial policy, subject to calibration |
| --- | --- |
| Technical | No unsupported effects, crashes, corrupted saves, or unexplained invalid actions |
| Aggregate duel score | Aim near 50%; investigate outside 45–55% on the representative panel |
| Matchup extremes | Investigate persistent < 30% or > 70%; allow documented specialists |
| Burst/sustain | Investigate > 115% of a comparable native role at equal opportunity/cost |
| Loops | No infinite action loop, unavoidable repeated turn denial, or indefinite immunity |
| PvE | Comparable room performance to intended role; not universal solo domination |
| Readability | Opponent can identify setup, threat, target area and recovery window |
| Holdout | Retest on new seeds and maps after tuning |

These percentages are **proposed review triggers**, not official Retro rules or measured guarantees. Estimate uncertainty: mirrored matches share seeds and conditions, so resample paired-seed blocks (stratified by matchup/map/build) for confidence intervals. Do not count two mirrored games as fully independent observations. A wide interval requires more games; results confined to one AI policy do not certify human balance.

For tuning, change one lever at a time: range/LoS/limits before raw damage if the problem is safety; cooldown before damage if the problem is constant uptime; target filters before damage if the problem is team multiplication. Keep validation and tuning seeds separate. Recheck the full kit after any change.

## 10. Required deliverable for every finished class

1. One-page identity and theme brief, including weaknesses and counterplay.
2. Complete spell table and manifest, at most 10 spells plus weapon.
3. Comparison notes with native IDs/grades and provenance.
4. Three legal combo sequences and a full abuse/stacking review.
5. Character PNGs, unique final spell icons and attribution.
6. A valid self-contained ZIP and machine-readable validation output.
7. Engine tests, browser presentation checks and benchmark report, or explicit untested status.
8. Package version, engine/data hashes and change notes sufficient to reproduce evaluation.

The standard is **interesting decisions with visible tradeoffs**, backed by measurements. A mechanically correct spell list and attractive art are necessary parts of a class; they are not the whole class.
