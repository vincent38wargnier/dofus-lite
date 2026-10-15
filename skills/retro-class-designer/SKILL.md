---
name: retro-class-designer
description: Design themed custom classes, dungeon rooms and new declarative spells for the local dofus-lite Retro combat engine. Use for a class or encounter design, spell kit, balance audit, artwork brief, or importable JSON-and-images ZIP. Respect ten spells per owner and eight enemies per room, compare the Retro baseline, validate the current content.json runtime contract, and distinguish technical validity from tested balance. Not for unrelated games or general image generation.
---

# Retro class designer

Create a coherent class with **at most 10 spells plus the equipped weapon**. A theme changes names and presentation; it does not grant extra AP, stats, or exceptions to combat rules.

The game offers **Atelier → Mes classes → Créer un sort** and **Créer avec une IA → Copier le prompt IA / Importer un ZIP**. New runtime ZIPs use `content.json` (`dofus-lite-content`, version 1), optional character/creature PNGs and spell icons. The older `class.json` design-kit schema below is a different, legacy format and cannot be imported directly.

For an importable deliverable, first read [the runtime ZIP rules](references/runtime-zip.md), use `assets/content.schema.json` and the self-contained class/dungeon prompt from the builder. In the repository, run `node scripts/content-pack.cjs validate package.zip` or `pack folder package.zip`. Runtime limits are stronger than the legacy design-kit numeric bounds. The browser and CLI share their validator. The runtime accepts one class (10 spells plus weapon) or one room (8 enemies total, 10 spells each); creature stats derive from native references, while their own spellbooks replace the original ones. Images are optional, but every declared file must exist and validate. Custom Flash effects/audio, new summons, traps and scripted triggers are not part of v1. Never claim theme art exists when only native fallback visuals or mannequins were supplied.

## Start with the brief

Read [the specification](references/class-design-spec.md). Infer a sensible theme and role from the request; ask only for preferences that materially change the design. For a fictional theme, translate motifs into combat choices instead of making every named power a separate mechanic.

Produce an identity sentence, one primary role, one secondary role, one or two damage elements, two meaningful weaknesses, and a three-turn decision loop. Explain how an opponent can respond. Do not fill every weakness with another spell.

## Build and compare the kit

Read [the balance reference](references/balance-reference.md). Consult `references/baseline.json` for exact spell rows or `references/baseline.csv` for comparisons; do not load the entire JSON unnecessarily. They are a frozen census of the local imported client, not an official balancing formula. In the repository, regenerate them with `node scripts/audit_class_balance.cjs` if the source hash differs.

For each spell, specify cost, target, range, line of sight, area, damage/heal values, critical variant, duration, cooldown, limits, role, counterplay, and interactions. Keep the example's complete fields. Compare against at least two original spells with similar constraints. Never use the highest value in the catalogue as a general allowance.

Read [the engine and import contract](references/engine-and-import.md) before inventing a mechanic. Version 1 of the authoring kit covers a conservative subset of existing effect primitives at **level 200 / grade 6**. Unsupported mechanics require an explicit implementation proposal; do not disguise them as metadata the engine will execute. For summons, traps, resource meters, states, or conditional finishers, follow the extension contract rather than writing arbitrary JavaScript.

Evaluate at least three legal turn sequences: unprepared damage, prepared burst, and recovery/control. Include 10, 12, and 15 AP, immediate boosts, critical gear, flat damage per hit, area placement, resistance, weapon use, and the opponent's response. Inspect cross-spell loops and team stacking, not only individual spells.

## Apply the current spell and equipment budgets

The portable kit includes the current engine validators and data, with no npm dependencies. Read [validation.md](references/validation.md), then run `node scripts/validate.cjs package final.zip` from this skill directory. Use `equipment item.json` or `character character.json` during design. A nonzero exit means the artifact is not ready; an importable Atelier draft can still fail combat admission. Deliver the JSON report with the package. `manifest content.json` does not check images. Do not replace these checks with hand-calculated estimates or the legacy validator.

Runtime spell requirements, exact formulas and critical consistency rules are in [runtime-zip.md](references/runtime-zip.md). New spells must fit **100 points each**, and the complete spellbook **650 including synergies**, with ten spells maximum. Read [spell-balance.md](references/spell-balance.md) for the calibration and its limits. The legacy compiler below is not a substitute for runtime admission.

For themed equipment or class build comparisons, read [equipment-rules.md](references/equipment-rules.md). Custom items have **100 points each**, normalized by family and required item level; outfits containing custom gear have **1650 points**, allowing optimized gear with legal exos. Dofus are excluded from those budgets, but still affect combat. Spell and equipment budgets cannot subsidize each other. Exact equipment allowances for every level are bundled in `references/equipment-limits.json`; the audit and rationale are in [equipment-balance.md](references/equipment-balance.md). The level-200 reference table is also embedded in both AI prompts.

Equipment is created in the UI and equipped after class import. **The current content.json ZIP does not accept items or loadouts.** Deliver equipment designs outside the importable ZIP when requested; do not invent schema fields or claim the item designs have been imported. Test the class with comparable equipment and identical Dofus, including immediate boosts and multi-line weapon interactions.

For complete exports and ready-to-play adventures, read [content-packages.md](references/content-packages.md). The separate `atelier.json` export includes equipment, FM, supplied heroes and rules. Obtain validated snapshots from the editor; do not confuse that archive with the stricter AI `content.json` contract.

## Generate the visual assets

Use [the visual production guide](assets/ai-design/START-HERE.md) and its offline [prompt and template gallery](assets/ai-design/index.html). `assets/ai-design/prompts/` contains a separate prompt for art direction, every character/creature sheet, spell icons, equipment, map rendering/layers/props, a cover and FX/audio briefs. Use one identity reference across all poses. The character templates and file inventory come from the current runtime artwork spec.

For a map design, attach `assets/ai-design/maps/<mapId>/guide.png`, `clean.png` and `geometry.json`; they preserve the actual projection, elevations, collisions and starting cells. Do not invent geometry from a painted image. **For wholly original visuals**, read [original-battlefields.md](references/original-battlefields.md): Atelier archives support new flat battlefield geometry, painted backgrounds and prop atlases. Both import formats support original vector `visualEffect` descriptors and synthesized audio. The legacy map-layer guides, arbitrary equipment PNGs, covers and spell PNG/audio sequences remain design sources; do not insert them as undeclared archive files. Built-in equipment shapes/colours and statistics remain exportable in `atelier.json`.

Run `node scripts/check-visuals.cjs character <artwork-folder>` or `icon <icon.png>` from this skill directory for portable PNG checks. Inspect anchors, all animation frames and small-size readability visually; this checker does not certify alignment, gameplay balance or a whole package. The repository refreshes all generated guides/prompts with `npm run templates:authoring` after local map data has been imported.

For original spell animations, read [spell-fx-design.md](references/spell-fx-design.md). Start with `assets/ai-design/prompts/17-animation-sort-complete.txt`, then the six per-layer prompts 18–23. Use the SVG/PNG templates and offline [animation viewer](assets/ai-design/spell-fx/index.html); deliver `effect.json` and its declared PNGs as separate design sources. Run `node scripts/check-spell-fx.cjs <effect-folder>`, then visually inspect four directions, near/far targets and both backgrounds. This checks design assets only: **neither importer plays that PNG/effect.json format yet**. Playable spells may use a native `visualSpellId` or the original vector `visualEffect` contract above. Do not confuse the character's casting pose with magic attached to the caster.

## Legacy design-kit package (not browser-importable)

Start from `assets/example/class.json`; author new spell values and text. Read [the example walkthrough](references/example-walkthrough.md) for its decisions, legal combos and limitations. Use the schema at `assets/class.schema.json`. Required art and the exact animation dimensions are in the specification; `assets/artwork-spec.json` is the current game's contract. Use the image-generation skill when producing new bitmap art, then validate dimensions, orientation, transparency, and every frame. Do not generate portraits instead of usable sprite sheets.

Run:

```bash
node scripts/class-kit.cjs validate path/to/class.json
node scripts/class-kit.cjs pack path/to/class-folder path/to/class.zip
node scripts/class-kit.cjs validate path/to/class.zip
```

Paths above are relative to this skill directory. The scripts use Node's standard library. They also support `compile` to produce raw spell data for an engine integration test. The compiler does **not** install a class in the browser and does **not** implement its visual references.

Package success means manifest, image, archive, and supported-effect checks passed. Report static warnings separately. Never call a class balanced solely because its JSON validates or its damage falls under a threshold.

## Evaluate and report

Follow the benchmark protocol in the specification. Use held-out seeds, both starting sides, several map shapes, equal equipment budgets, original-class controls, and the same general AI. Report human testing separately from bot testing. A timeout is not a cleared dungeon. A poorly supported mechanic can make a powerful class look weak to the AI.

Deliver the design, full spell table, combo/counterplay notes, ZIP, validation report, and balance evidence or an explicit **untested** status. Identify which requirements are implemented, proposed, or blocked by an engine limitation. Do not edit saves, install a class, or announce a working one-click importer unless the user asked for that work and it has actually been implemented and verified.
