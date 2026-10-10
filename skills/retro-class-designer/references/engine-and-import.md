# Engine adapter and proposed import contract

**Legacy design-kit format.** The current browser importer uses `content.json`, with optional artwork and stronger numeric guardrails. Use [the runtime ZIP contract](runtime-zip.md) and `assets/content.schema.json` for new importable class/dungeon packages. This page documents the separate `class.json` compiler retained for design experiments.

The authoring schema is intentionally narrower than the entire combat engine. It is executable data, not a programming language. The CLI compiles to the current `loadout.spells.custom` raw shape for mechanical testing. It does not write browser saves or implement the game's ZIP-import button.

## Manifest fields

See `assets/class.schema.json` for exact numeric bounds and required fields. The schema rejects additional properties at every object level. All text is plain text; never insert it as HTML.

| Field | Meaning |
| --- | --- |
| `format`, `schemaVersion` | `dofus-lite-class`, `1` |
| `id`, `version` | Stable class slug and semantic version |
| `name`, `description`, `author`, `credits` | Human-readable identity and attribution |
| `baseClass` | Native characteristic/equipment profile, not merely appearance |
| `profile` | `retro-200-v1`; grade 6, level 200 |
| `design` | Role, theme, strengths, weaknesses, elements, three-turn loop |
| `artwork` | Exact filenames for three required and up to six optional sheets |
| `spells` | 1–10 fully specified, unique definitions |

Presentation and design metadata do not execute game logic. In particular, a description claiming “charges” or “marks” adds no charge or mark to the engine.

## Supported effect vocabulary

Every effect declares `kind`, `target`, and `zone`. Numeric effects also declare `min`, `max`, and `duration`. Values are nonnegative; debuff kinds supply the negative sign. Zero-duration direct damage/healing is immediate. Timed buffs apply immediately and persist according to duration; zero-duration buffs last the current turn under the current engine. Do not use a duration on damage to simulate a poison.

| Kinds | Additional fields | Semantics |
| --- | --- | --- |
| `damage`, `lifeSteal` | `element`, `min`, `max`, `duration: 0` | Elemental line; life steal returns half actual damage |
| `heal` | `min`, `max`, `duration: 0` | Immediate intelligence-scaled healing |
| `buffPa`, `buffPm` | `min`, `max`, `duration` | AP/MP bonus, applied immediately |
| `buffPower`, `buffDamage`, `buffCrit`, `buffRange` | Same | Power, per-line flat damage, critical bonus, adjustable range |
| `buffStat` | Same, plus `stat` | One of force/intelligence/chance/agilite/sagesse |
| `buffVitality` | Same | Temporary max/current HP; expiration removes max HP |
| `armor` | Same | Generic all-element, recipient-stat-scaled armor |
| `resistBuff`, `resistDebuff` | Same, plus `element` | Percentage resistance points, not fixed resistance |
| `removePa`, `removePm` | `min`, `max`, `duration` | Dodgeable removal; verify next-turn and expiry behavior |
| `debuffRange` | Same | Reduces adjustable spell range |
| `push`, `pull` | `distance` | Axis-aligned displacement from/toward caster; push may cause collision damage |
| `teleport` | No numeric payload | Sole effect, self target, free-cell cast; distance from spell range |

The compiler does not expose `raw` dice strings, probabilistic effect branches, native IDs, negative AP costs, or arbitrary triggers. Rolls use uniform integer `min`–`max`. Effects execute in array order. Four effect rows maximum per normal/critical variant are a technical authoring limit, not four free power bonuses.

Crit rate is a divisor: `50` means base 1/50 before agility and +critical adjustments; `0` disables criticals. With criticals enabled, `critEffects` must be the **complete** replacement list. Failure rate is also a divisor; `0` means none. Failure is not an adequate excuse for an otherwise oppressive spell.

The profile gives explicit limits: 1–3 casts per turn and per target, AP 1–8, range 0–12, cooldown 0–10, duration up to 5. These are conservative authoring bounds. Native spells are not rewritten to fit them. `initialCooldown` is reserved at **0**: although the current spell builder retains that field, the combat engine does not initialize it. A nonzero value is rejected until that behavior is implemented and tested.

`maxPerTarget` counts the fighter on the aimed cell, not every victim caught by an area. An empty-center cast can still hit someone who was hit before. Use `maxPerTurn` as the reliable cap on area repetition; do not claim a per-victim hit limit that the engine does not enforce.

### Aim versus recipients

`targetMode` determines the legal aimed cell. Each effect's `target` determines who receives it. They are separate concepts. The general v1 adapter does not provide an ally-only aiming mode: a `fighter` cast with an `ally` effect can waste AP if aimed at an enemy. The graphical editor warns about this; an ally-only aiming mode would require a validated targeting extension.

| Effect target | Runtime mask | Meaning |
| --- | ---: | --- |
| `self` | 32 | Caster, regardless of aimed cell; point area required |
| `ally` | 4 | Same team, including caster if inside the area |
| `otherAlly` | 6 | Same team, excluding caster |
| `enemy` | 1 | Opposite team |
| `fighter` | 0 | Any living fighter in the area, including friendly fire |

| Zone | Shape | Size |
| --- | --- | --- |
| `Pa` | Point | 1 cell |
| `Cb`, `Cc` | Manhattan diamond | Radius 1 or 2; 5 or 13 cells |
| `Xb`, `Xc` | Cross | Radius 1 or 2; 5 or 9 cells |
| `Lb`, `Lc` | Line from aimed cell away from caster | 2 or 3 cells total |
| `Tb` | Perpendicular staff bar | 3 cells |

Spell range and area radius are distinct. The preview must use the same `spellZoneCells` function as hit resolution. Do not require an occupied center for area spells intended to hit from an empty cell.

### Native special cases

Some native spells have ID-specific logic: elemental Féca armor, displacement origins, targets, reactions, or animations. Copying an effect kind while changing its native ID does not copy every native special case. The adapter uses high, namespaced numeric IDs and the generic effect behavior only. In particular, generic `armor` is not a renamed elemental Féca armor.

The compiler hashes `class-id:spell-key` into a reserved high range, checks within-package collisions and keeps IDs stable across revisions. This is not a collision-proof universal registry. This legacy compiler is separate from the current runtime importer, which allocates fresh high numeric spell IDs and stores the compiled book in each creation snapshot. Native keys and native IDs must never be accepted from an untrusted manifest.

## Extension requirements

The engine has more mechanics than v1 exports. Do not assume a new package can use them just because `creationCatalogue.js` lists them.

| Extension | Required before accepting it |
| --- | --- |
| States / marks | Scoped IDs, visibility, ownership, duration, consumption and targeting tests |
| Custom resource | Gain/spend/cap rules, deterministic order, death/reset rules, AI view |
| Poison / regeneration | Tick boundary, stacking, dispel, mitigation, source-death behavior |
| Trap / glyph | Nested effect validation, area preview, trigger timing, owner/team rules |
| Summons | Creature schema, spellbook, cap, lifespan, scaling, owner death, AI tests |
| Reactions / delayed spells | Bounded trigger depth, proc conditions, no recursive action loop |
| Immunity / reflect / revive | Duration semantics, counters, kill interactions, stall tests |
| Full progression | Six explicit grades, unlock rules, loadout validation and breakpoint benchmarks |
| Opening cooldown | Initialize each spell's cooldown at combat start, accounting for the first-turn decrement |
| Custom spell FX / audio | Renderer-safe format, bounded length, anchors, orientation, fallback |

Every extension needs schema version/capability negotiation, compiler changes, engine tests, AI-visible semantic fields, tooltip/preview/log support and balance tests. Unknown capabilities must be rejected with a clear message. No handwritten class-specific AI branch should be needed for ordinary effect primitives.

## Graphical authoring now available

`src/ui/SpellDesigner.js`, reached from **Atelier → Mes classes → Créer un sort**, creates,
edits and duplicates new spells without JSON editing. It supports this document's 20 effect
kinds, eight zone shapes, recipient filters, ordered normal/critical effects, cast restrictions,
and selection of a native spell's icon, animation and sound. `spellZoneCells` draws the preview.
`src/engine/authoredSpells.js` validates the saved raw data, including level 200 / grade 6,
one to four effects per variant and the ten-spell class limit through the loadout resolver.

Browser-created spells carry `authoringVersion: 1`, a new safe numeric ID and stable key,
and a separate `visualSpellId`. `buildSpell`, combat events, AI views, the icon renderer,
actor gestures, effects and sound lookup preserve that separation. Native special cases
therefore do not execute merely because a new spell borrows their animation. A draft is
stored in the class only when the player saves it; cancelling leaves the spellbook intact.

This UI uses the engine's raw spell shape. The runtime ZIP adapter compiles
`content.json` to that shape, preserves custom icon and artwork references, and
adds stronger import-time damage and stacking guardrails. The older `class.json`
CLI remains a separate design workflow. Technical validity does not certify balance.

## Implemented runtime ZIP integration

Use [the runtime contract](runtime-zip.md), not this page's legacy manifest schema.

| Area | Implementation | Behavior |
| --- | --- | --- |
| Builder | `CreationPackageTools.js` | Theme at top, full AI prompt, downloads, ZIP picker, validation report |
| Contract | `src/content/packageSchema.js`, `contentPackage.js` | Strict manifest, references, effect compatibility, ceilings, warnings, compilation |
| Archive | `src/content/zip.js` | Bounded STORE/DEFLATE, paths, CRC, duplicates, symlinks |
| Import | `contentPackageImport.js`, `CreationsContext.js` | Validate first, immutable asset batch, persist creation, rollback on save error |
| Images | `characterArtwork.js`, `RetroAssets.js` | Character/creature PNGs, spell icon blobs and native fallbacks |
| Creatures | `customMonsters.js`, `customDungeons.js` | Reference stats/model with bounded tuning and complete replacement spellbook |
| Combat / AI | `engine.js`, `bots/api.js` | Custom spellbooks, native visual references, public AI views, normal turn rules |
| CLI | `scripts/content-pack.cjs` | Same runtime schema and archive checks, full PNG decoding, validation and packing |
| Proof | `scripts/proof_content_packages.cjs` | Clipboard, invalid ZIP, images, reload, manual placement and full AI fight |

Imports create a new entry, rather than overwriting the currently selected one. Level 200 /
grade 6 applies to authored player spells; a custom creature retains its stat reference's
level. Runtime artwork is optional; if declared, all three core frames are required.

## Legacy CLI archive validation and tool behavior

`validate <class.json>` checks manifest and semantic rules only. `validate <folder|zip>` also checks exact file membership, PNG dimensions, all frame pixels, transparency, and archive limits. The report's `scope` and `imagesChecked` make this distinction explicit. `pack` requires a fully valid folder and revalidates its own output before writing it.

The tools always report `balanceStatus: "untested"`. `within-conservative-starting-envelope` is a static result, never an evaluation badge. Normal technical failures exit with status 2. Static review warnings remain visible but do not prevent packaging an experimental class.

A folder should contain only the contract's files. The deterministic writer emits file entries without folder entries or operating-system metadata. The reader deliberately rejects `.DS_Store`, `__MACOSX`, extra documentation, hidden files and directory records: use `pack` to build a portable package. ZIP tools that add those entries need their metadata disabled. This is packaging strictness, not manual work for the importing player.

No file is extracted by the validator. Reads and decompression are bounded; paths, methods, CRCs, sizes, duplicates and symlinks are checked. These are basic format robustness checks. Runtime imports add storage rollback and browser checks through the separate content.json path above.
