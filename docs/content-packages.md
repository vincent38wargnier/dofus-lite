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

The downloadable examples contain demonstration art and modest example spell kits, not completed theme artwork or certified balanced content.

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
| Balance checks | Damage/PA ceilings, summed effect limits, stacking / PA-loop restrictions |
| Archive | STORE or DEFLATE, ≤32 MiB packed / 48 MiB expanded / 180 entries |
| Files | JSON ≤512 KiB; each PNG ≤2 MiB; each character artwork set ≤12 MiB |

See the full rules for exact variant budgets, effect ceilings and semantic requirements. JSON Schema alone cannot check all of them.

## What is and is not supported

New spells use the existing engine's damage, healing, buffs, armor, resistance, PA/PM removal, range reduction, push/pull and teleport primitives. Effects execute in order and boosts apply immediately. Each creature has its own complete replacement spellbook, and a native reference never silently imports that monster's special ID mechanics. Artwork and spell icons remain independent of mechanical IDs.

Choose an existing map; the ZIP does not import new terrain or background art. Custom spell animations and sound files, new summons, traps, poisons, state machines and JavaScript are not supported by this format. Native catalogue spells still exist in the UI separately. Optional artwork lets an AI without image tools deliver a playable package immediately.

**Accepted does not mean balanced.** The numeric checks are broad guardrails. Warnings identify high efficiency and synergy risks; compare several equally equipped native classes, different maps and seeds, normal/critical builds and complete enemy teams. Neither the importer nor a package author awards an “evaluated” badge.

Imports create new immutable asset IDs and a new creation, including when the same ZIP is imported twice. Images live in IndexedDB; creations live in localStorage in this browser. A failed save rolls back the new image batch. Keep the original ZIP for backups and other browsers.

## Validate and package from the repository

```bash
node scripts/content-pack.cjs validate path/to/creation.zip
node scripts/content-pack.cjs validate path/to/folder
node scripts/content-pack.cjs pack path/to/folder path/to/creation.zip
node scripts/build_content_templates.cjs
```

The CLI and browser share the same manifest and archive rules. CLI PNG checks decode every frame; the browser checks decoding, dimensions, transparency and visible content. Both reject missing, undeclared, empty or corrupt assets.

The older `skills/retro-class-designer/assets/example/class.json` and its `class-kit.cjs` validator remain a **legacy design-kit format**. Their ZIPs cannot be imported directly. For new deliverables use the builder's `content.json` prompt and this runtime contract; do not mix the two schemas.
