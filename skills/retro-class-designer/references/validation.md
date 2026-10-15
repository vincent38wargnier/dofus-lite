# Portable validation with the game's calculations

The kit includes `scripts/validate.cjs`, `scripts/validation-runtime.cjs` and `scripts/validation-build.json`. Keep those three files together. **Node.js 20+ is sufficient**: no npm install, game repository, browser, network or API key is required.

The runtime bundle contains the actual game validators and reference data. `validation-build.json` records the source and bundle SHA-256 fingerprints. It is a snapshot of the rules when this kit was built; download a newer kit when the game changes its rules.

## Commands

Run these from the extracted `retro-class-designer` directory. Inputs are read only; no creation is repaired, imported or overwritten.

```bash
node scripts/validate.cjs package my-package.zip > validation-report.json
node scripts/validate.cjs package my-package-folder
node scripts/validate.cjs equipment my-equipment.json
node scripts/validate.cjs character my-character.json
node scripts/validate.cjs manifest content.json
```

| Mode | Input | Checks |
| --- | --- | --- |
| `package` | ZIP or directory with `content.json` or `atelier.json` at root | Import rules, files, PNGs, references and combat admission for every creation |
| `equipment` | One custom equipment definition | Required level, family, stat caps, weapon lines, criticals, individual budget |
| `character` | `{ "name": "Hero", "classId": "IOP", "loadout": { ... } }` | Whole spellbook, equipped items, FM, item requirements, stats and outfit budget |
| `manifest` | AI `content.json` | Schema, references, spell/creature numbers and limits; images unchecked |

Use `package` for final delivery. The other commands are design checks; passing them does not mean the complete ZIP or its images exist. The old `class-kit.cjs` validates a legacy design format and is **not** the current numerical admission check.

## Included examples

```bash
node scripts/validate.cjs equipment assets/validation-equipment.json
node scripts/validate.cjs character assets/validation-character.json
node scripts/validate.cjs package assets/runtime-class.zip
node scripts/validate.cjs package assets/runtime-dungeon.zip
```

`validation-character.json` contains two original spells and a complete custom hat definition in `loadout.customEquipment`, referenced by its ID in `loadout.slots.hat`. It is a test input, not a new import format. For playable exports, use an Atelier ZIP or the supported `content.json` format. These commands do not expand either import schema.

## What the numbers enforce

| Check | Current rule |
| --- | --- |
| Each custom spell | At most 100 points; normal and critical variants checked |
| Custom class/creature spellbook | At most 10 spells and 650 points including synergies and rotation |
| Each created item, before FM | At most 100 points plus individual stat and weapon caps |
| Item level | Required item level and family determine raw allowances; pets, mounts and shields have family envelopes |
| Complete outfit containing custom gear | At most 1650 points, using the character's level, actual rolls, FM, sets and resource synergies |
| Dofus | Excluded from equipment scores; still obey equip rules and affect combat |
| Native class / all-native gear | Keep native admission rules; the custom spellbook budget is not imposed on a native class, and an all-native outfit score is informational |
| Dungeon | At most 8 enemies; valid native references, creature tuning, spellbooks and map |
| Equipped adventure | Checks enemy characters and every supplied hero, including embedded equipment, spells, FM and party rules |

The script also checks duplicate or incompatible equipment, character/item level requirements, characteristic allocation, forged-item legality, and missing custom item definitions. It reports the numerical spell factors, class synergies, item allowances and outfit components. Imported drafts do not bypass these checks.

Full formulas: [spell budgets](spell-balance.md), [equipment budgets](equipment-balance.md), [required-level allowances](equipment-limits.json).

## Read the result

The output is JSON. **Exit code 0** means the requested checks passed; **exit code 1** means an error was found. The root `valid` value and `errors` explain that result.

For packages, `importable` records whether the import checks completed, and `readyForCombat` records whether every supplied creation passes admission. An Atelier backup may have `importable: true` but `readyForCombat: false`: it is an editable draft. A ready-to-play adventure has stricter import checks and cannot contain invalid supplied heroes. `imagesChecked` counts decoded images, not generated or visually inspected artwork.

Character reports include `spellbook`, `equipment` and `outfit`; dungeon reports include embedded `characters`, `monsters` and `adventure.heroes`. The outfit reports `baseScore`, `setScore`, `synergy` and `enforced`. Native-only outfits can exceed 1650 without being blocked, matching the game.

The portable PNG decoder checks non-interlaced **8-bit RGBA**, dimensions, CRCs, actual decompression, visible content in every frame and transparent backgrounds for combat sheets. This is the AI kit's PNG format. Older Atelier artwork in other browser-supported encodings must be re-exported as RGBA for this offline check; the tool reports that limitation explicitly.

`balanceTesting: "not-run"` is intentional. These are the game's mathematical guardrails, not proof of competitive balance, fair dungeon difficulty or correct sprite alignment. Test whole turns and matchups in combat before claiming balance.

## For AI authors

Attach the full kit alongside the copied prompt. Tell the AI to generate files, run `package` on the final ZIP, read the JSON errors, adjust the design and repeat until it exits 0. Ask it to deliver the ZIP and the report together. An AI without code execution must say that validation was not run; estimating a score is not equivalent to executing the validator.
