# AI prompts and importable class / dungeon ZIPs

In **Atelier → Mes classes** or **Mes donjons**, enter your theme in **Créer avec une IA** and click **Copier le prompt IA**. The theme is at the top; the rest includes the exact schema, engine semantics, valid references, artwork requirements, rejection limits, balance guidance and a runnable example. Paste it into any AI that can handle the full prompt. A file-capable AI can return a ZIP; a text-only AI is instructed to return a complete script that creates it.

Choose **Importer un ZIP** to install the resulting creation. The importer validates every file before saving. The creation opens in the corresponding builder and is available for manual play and **Tester avec l’IA**. Imported creature spellbooks can also be edited in the dungeon builder.

## Format and rules

| Resource | Purpose |
| --- | --- |
| [Complete rules](../public/templates/content-packages/rules.md) | Targeting, costs, limits, balance and image requirements |
| [JSON Schema](../public/templates/content-packages/content.schema.json) | Exact `content.json` structure |
| [Full specification and catalogue](../public/templates/content-packages/spec.json) | Schema, effect limits, maps, monster stats and original spell grades |
| [Class prompt](../public/templates/content-packages/prompt-class.txt) | Self-contained copyable instructions |
| [Dungeon prompt](../public/templates/content-packages/prompt-dungeon.txt) | Includes the monster reference catalogue |
| [Class example](../public/templates/content-packages/example-class.zip) | Playable, reuses native appearance |
| [Dungeon example](../public/templates/content-packages/example-dungeon.zip) | Three enemies, two custom spellbooks |
| [Class with artwork](../public/templates/content-packages/example-class-with-artwork.zip) | Mannequin animation strips and a custom spell icon |
| [Dungeon with artwork](../public/templates/content-packages/example-dungeon-with-artwork.zip) | Custom boss sprite, icon and native companion models |
| [Complete authoring kit](custom-class-authoring-kit.zip) | Skill, prompts, visual templates, map guides, spell/equipment rules and audits |
| [Visual AI guide](../public/templates/ai-design/index.html) | 24 prompts, character templates and 77 map geometry guides; also works offline |
| [Spell animation workshop](../public/templates/ai-design/spell-fx/index.html) | 6 effect templates, 4 animated examples, JSON schema and local preview; design-only |
| [Equipment restrictions](../public/templates/content-packages/equipment-rules.md) | Level scaling, stat/weapon limits, individual and outfit budgets |
| [Equipment level tables](../public/templates/content-packages/equipment-limits.json) | Exact family allowances and stat caps at every level 1–200 |

The downloadable examples contain demonstration art and modest example spell kits, not completed theme artwork or certified balanced content.

## Generate every visual element with AI

The complete kit has a root `START-HERE.md`. Open `retro-class-designer/assets/ai-design/index.html` after extracting it. This offline guide includes the asset checklist, a common art-direction prompt, individual prompts for all nine character/creature images, spell icons, equipment, complete maps, map layers, isolated scenery, an adventure cover and effect/audio briefs. The copied class/dungeon prompts also contain these production instructions.

Character SVG guides and blank PNGs preserve the 256×256 frames and `(128,224)` foot anchor. The same contract applies to every custom monster and boss. `scripts/check-visuals.cjs` checks an artwork folder or spell icon without installing the game or dependencies; visual review is still necessary for anchors, perspective and motion.

Each `assets/ai-design/maps/<mapId>/` contains a map-specific prompt, `guide.png` / `guide.svg` with coordinates and placements, `clean.png` / `clean.svg` without annotations, and `geometry.json`. These references preserve the engine's cells, movement/LoS obstacles, starts, native projection and elevations. The guide contains original diagrams, not copies of the client backgrounds. Choose a map before requesting scenery; attach its PNGs and JSON to the image tool. A generated image must preserve the footprint and leave playable cells readable.

**Production prompts do not extend import support.** Characters and spell icons are importable. Map art, arbitrary equipment PNGs, cover images and custom FX/audio are design sources only, and belong outside both playable ZIP formats. Equipment definitions, their built-in shape/colour and complete loadouts can already be shared through Atelier exports. Map source layers named `background`, `ground` and `scenery` are an authoring convention, not accepted manifest fields. Keep the native map ID in the playable package. The kit itself is documentation and should not be imported into the game.

### Generate original spell animations

The complete prompt `assets/ai-design/prompts/17-animation-sort-complete.txt` includes the exact design JSON schema and a coherent timeline. Prompts 18–23 describe each effect part: caster effect, projectile, trail particle, impact, aura and beam. Use the same theme and approved references, then produce `effect.json` plus the declared PNGs in `design-sources/spell-fx/<spell-key>/`.

Open `assets/ai-design/spell-fx/index.html` offline to play the four technical examples or select your own manifest and PNGs. Check direction, distance, timing and contrast. Default sheets have eight 256×256 frames at 24 fps; SVG guides and blank PNGs are included. From the extracted `retro-class-designer` folder run:

```bash
node scripts/check-spell-fx.cjs design-sources/spell-fx/my-spell
```

This Node-only checker verifies the closed schema, attachment/timing relationships, PNG dimensions, encoding, alpha and nonempty frames. The full rules are in `references/spell-fx-design.md`. It returns `runtimeImportable: false`: **the new effects are not loaded by either game importer yet**. Keep an existing `visualSpellId` for the playable spell. This visual check is independent of the bundled spell, equipment and class balance validators.

## Playable content package

```text
my-theme.zip
├── content.json                 # required, directly at the root
├── artwork/warden/              # optional; declare the folder in artwork
│   ├── portrait.png             # 256 × 256
│   ├── idle-front.png           # 256 × 256, transparent
│   ├── idle-back.png            # 256 × 256, transparent
│   └── ...                      # optional walk/cast/hit strips
└── icons/ember.png               # optional; 64 × 64 RGBA PNG
```

| Limit | Rule |
| --- | --- |
| Player class | 1–10 spells, plus equipped weapon; level 200 / grade 6 |
| Dungeon | One room, up to 8 enemies total, up to 10 spells per creature |
| Effects | 1–4 per normal / critical variant; supported declarative primitives only |
| Creatures | Exact native stat reference, 25–150% HP/stats, PA/PM offsets −2…+2 |
| Cost / range | 1–8 PA; 0–12 PO; coherent targeting and duration |
| Spell budgets | 100 per spell; 650 per complete kit, including synergies and rotation |
| Critical effects | Same effect order/kinds, elements, zones and targets; values/durations ≥ normal |
| Equipment design | 100 per custom item, 1650 per outfit with custom gear; Dofus excluded |
| Archive | STORE or DEFLATE, ≤32 MiB packed / 48 MiB expanded / 180 entries |
| Files | JSON ≤512 KiB; each PNG ≤2 MiB; each character artwork set ≤12 MiB |

See the full rules for exact variant budgets, effect ceilings and semantic requirements. JSON Schema alone cannot check all of them.

Equipment rules are included in both copied prompts and the downloadable kit. An item's 100-point ceiling stays fixed while its raw allowance grows with **required item level** within its family; progression can plateau. Pets, mounts and shields use family envelopes without level scaling. The prompt includes level-200 caps; the full specification includes exact caps at every level. Spell and equipment budgets are separate and do not offset one another.

**Equipment is not imported by the class/dungeon ZIP.** Create it in **Atelier → Mes équipements** or **Stuff → Créer un équipement**, then equip the imported class. Keep equipment proposals outside `content.json` and its ZIP. All-native outfits retain their existing admission rules, and Dofus still affect combat despite being excluded from equipment scoring.

## What is and is not supported

New spells use the existing engine's damage, healing, buffs, armor, resistance, PA/PM removal, range reduction, push/pull and teleport primitives. Effects execute in order and boosts apply immediately. Each creature has its own complete replacement spellbook, and a native reference never silently imports that monster's special ID mechanics. Artwork and spell icons remain independent of mechanical IDs.

Choose an existing map; the ZIP does not import new terrain or background art. Custom spell animations and sound files, new summons, traps, poisons, state machines and JavaScript are not supported by this format. Native catalogue spells still exist in the UI separately. Optional artwork lets an AI without image tools deliver a playable package immediately.

**Accepted does not mean balanced.** The numeric budgets reject overpowered definitions under the local model; warnings identify remaining matchup and synergy risks. Compare several equally equipped native classes, different maps and seeds, normal/critical builds and complete enemy teams. Neither the importer nor a package author awards an “evaluated” badge.

Imports create new immutable asset IDs and a new creation, including when the same ZIP is imported twice. Images live in IndexedDB; creations live in localStorage in this browser. A failed save rolls back the new image batch. Keep the original ZIP for backups and other browsers.

## Validate from the downloaded kit

The complete kit includes **the current game calculations and reference data**, bundled as a standalone Node.js 20+ tool. No npm install, repository or network is needed. From its `retro-class-designer` directory:

```bash
node scripts/validate.cjs package my-creation.zip
node scripts/validate.cjs equipment my-equipment.json
node scripts/validate.cjs character my-character.json
```

The JSON report checks spell scores (100 each / 650 per custom spellbook), item scores (100), full outfits (1650 when custom gear is present), required levels, critical variants, stat caps, FM and combat requirements. `package` also checks assets and embedded heroes/characters in Atelier archives. Importable drafts can fail combat admission. Exit code 0 means the requested checks passed; 1 means errors. Mathematical admission does not establish competitive balance.

See the kit's `references/validation.md` for formats, examples and the distinction between package, character, equipment and manifest-only checks. The PNG decoder expects the kit's non-interlaced RGBA 8-bit format; other browser-supported PNG encodings need re-export for offline validation.

## Validate and package from the repository

```bash
node scripts/content-pack.cjs validate path/to/creation.zip
node scripts/content-pack.cjs validate path/to/folder
node scripts/content-pack.cjs pack path/to/folder path/to/creation.zip
node scripts/build_content_templates.cjs
npm run templates:authoring
```

The CLI and browser share the same manifest and archive rules. CLI PNG checks decode every frame; the browser checks decoding, dimensions, transparency and visible content. Both reject missing, undeclared, empty or corrupt assets.

The older `skills/retro-class-designer/assets/example/class.json` and its `class-kit.cjs` validator remain a **legacy design-kit format**. Their ZIPs cannot be imported directly. For new deliverables use the builder's `content.json` prompt and this runtime contract; do not mix the two schemas.

`templates:authoring` refreshes runtime templates, synchronizes the skill's generated references/prompts/examples and rebuilds the complete documentation ZIP in `docs/` and `public/templates/`. That authoring kit is documentation, not a class to import. Use its `assets/runtime-class.zip` or `assets/runtime-dungeon.zip` as playable package examples.

## Ready-to-play adventures (Atelier ZIP)

**Atelier → Mes donjons → Prêt à jouer** adds optional rules to a room. Ordinary rooms still accept freely configured parties. An adventure instead supplies complete hero snapshots: class, level, characteristics, equipped items, exact FM rolls, pet specialization, spellbook and artwork.

1. Prepare characters in **Jouer**, or equip custom classes in **Atelier**.
2. Create the room with its map and enemies, then enable **Prêt à jouer**.
3. Add equipped heroes and choose **Équipe imposée** (everyone plays) or **Héros au choix** (choose an exact party size from the supplied pool).
4. Optionally add a short introduction and disallow automatic play.
5. **Exporter l’aventure** creates one ZIP. After **Importer**, the recipient can press **Jouer l’aventure** immediately.

Hero cards expose the included equipment and spells; playing does not equip or overwrite the recipient's personal profiles. Updating an original character after adding it to an adventure does not alter the supplied copy. To update that copy, remove it and add the revised character.

### Two complementary package contracts

| Manifest | Use | Equipment / prepared heroes |
| --- | --- | --- |
| `content.json` (`dofus-lite-content`, schema 1) | Author new declarative spells/classes/creatures with the AI prompt | Import first, then prepare equipment in the Atelier |
| `atelier.json` (`dofus-lite-atelier`, version 1) | Export complete creations, individually or in bulk | Full snapshots, FM, custom gear, artwork and adventure rules included |

The `content.json` restrictions above do not apply to equipment snapshots in `atelier.json`. Do not add adventure fields to a `content.json` package: that schema still rejects unsupported fields. Import that creation, compose its adventure in the UI, then export the complete Atelier ZIP.

An Atelier archive has root fields `format`, `version`, `characters`, `dungeons`, `equipment`, `artwork`. Each collection is an array. A **dungeon-only export** can have empty `characters` and `equipment` collections: the dungeon's embedded hero loadouts contain the required custom spell and item definitions. Export traverses both enemy characters and supplied heroes, collects PNGs and custom spell icons, deduplicates shared images, and remaps image/item IDs on import without changing their values.

The optional `adventure` property of each dungeon is:

```json
{
  "version": 1,
  "mode": "choice",
  "partySize": 1,
  "allowAI": true,
  "description": "Choose your hero and defend the gate.",
  "heroes": [
    {
      "id": "guardian",
      "character": {
        "name": "Guardian",
        "classId": "IOP",
        "className": "Iop",
        "loadout": {
          "version": 1,
          "level": 200,
          "rollMode": "max",
          "rollSeed": 1,
          "base": {},
          "slots": {},
          "profile": { "sex": 0 }
        }
      }
    }
  ]
}
```

This minimal example uses an existing class. Custom spells belong in `loadout.spells.custom`, custom equipment definitions in `loadout.customEquipment` (keyed by the IDs equipped in `loadout.slots`), and exact FM snapshots in `loadout.forgedItems` (keyed by slot). **Export an equipped character through the UI to obtain current validated snapshots**, rather than approximating derived combat stats. Dofus and natural equipment keep their native references.

| Rule | Enforcement |
| --- | --- |
| Rule version / fields | Exactly version 1; unknown rule fields rejected |
| Hero pool | 1–8 supplied characters; unique hero IDs |
| Hero IDs | 1–100 ASCII letters, digits, `_` or `-` |
| `mode: "fixed"` | All supplied heroes, in author order; `partySize` unused |
| `mode: "choice"` | Exactly `partySize` different supplied IDs, 1–8; no outside hero |
| `allowAI: false` | Manual play only, including shared rooms and simulation APIs |
| Introduction | String, up to 1,200 characters |
| Enemy party | Existing dungeon rules, 1–8 fighters |
| Hero preparation | Existing class, spell, level, item, FM and outfit checks |
| Archive limits | 128 MiB ZIP / 160 MiB expanded; 8 MiB JSON; 2 MiB per PNG; 4,096 files; 200 selected creations |

Incomplete adventures can be saved and edited locally. Declaring a room **Prêt à jouer** requires every supplied hero and enemy to pass combat validation before it can be exported, imported or played. Disabling the option returns the room to ordinary free-party behavior. The spell budgets (100/650) and custom item/outfit budgets (100/1650, excluding Dofus) continue to apply; they estimate power and do not establish encounter difficulty or prove competitive balance.

### Launch and shared play

Manual and automatic launch reconstruct the party from the package's hero IDs. Caller-provided loadouts, outside allies, opponent replacements and a previously selected PvP map cannot override it. Controls and spell-bar order can change during play; equipped items and spell effects come from the package. The ordinary victory condition remains elimination of the opposing team.

**Jouer avec des amis** distributes the selected provided heroes between participants. The host assigns each hero under **Configurer → Joueur**. Joining does not inject the guest's personal character; roster additions/removals, team changes and enemy changes are blocked. Removing a guest returns their provided heroes to the host. The room sends the supplied assets through the existing P2P sharing mechanism and keeps the author's rules.

An empty **user library** is sufficient to import and play. Recipients still need the same game version with its native Retro maps, item catalogue and engine: this ZIP is content for the game, not a standalone game installation. The rules are local gameplay constraints, not cryptographic anti-cheat; an author can edit a copy in the Atelier.

Validation: `src/__tests__/adventures.test.js`, `adventureUi.test.js`, `atelierArchive.test.js`, `p2p.test.js`; end-to-end author/export/empty-browser/import/combat proof: `node scripts/proof_adventures.cjs`.

## Donjons à plusieurs salles

Les archives Atelier peuvent maintenant contenir jusqu’à **20 salles ordonnées**, avec déblocage après victoire, histoire et progression locale. Tous les terrains, monstres et héros des salles futures sont inclus. Le format `content.json` reste limité à une salle. Voir [le contrat des campagnes](dungeon-campaigns.md).
