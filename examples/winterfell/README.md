# Winterfell — La Dernière Braise

A playable, unofficial Game of Thrones fan adventure for `dofus-lite`. It is a complete final-room encounter, with an imposed party of three equipped heroes and six enemies. The story and descriptions are in French to match the game UI.

## Play

- Story, cast, spellbooks and downloads: `http://127.0.0.1:3013/adventures/winterfell/`
- Ready adventure: `public/adventures/winterfell-adventure.zip`.
- Creator edition: `public/adventures/winterfell-creator.zip`.
- In the game: **Atelier → Importer → select the ZIP → Jouer l’aventure → Lancer le combat**.

The ready adventure exports **only one dungeon**. All three hero snapshots, their items, spells and images are embedded dependencies. It needs no previously saved custom content. The creator edition additionally puts the three classes and 24 equipment definitions into their respective libraries.

## Story and encounter

Winterfell's bells are ringing, but nobody is in the tower. An original White Walker lieutenant, the Bellkeeper, has stolen the bell's clapper and leads the dead through the frozen passages toward the refugees' last brazier. Jon holds the passage, Arya hunts the archers, and Melisandre carries the last ember.

This is an alternate fan story, not a claim about canon. The cover is narrative artwork. The actual battlefield is the original **Winterfell · La cour du dernier brasier**, `custom-winterfell-courtyard`.

### Provided heroes

| Hero | Role | HP | AP / MP | Spells | Spellbook score | Outfit score |
|---|---|---:|---|---:|---:|---:|
| Jon Snow | Close combat, protection, displacement | 2,715 | 9 / 4 | 6 | 222 / 650 | 236.3 / 1,650 |
| Arya Stark | Mobile air duelist, short-range burst | 2,715 | 9 / 4 | 6 | 246 / 650 | 238.6 / 1,650 |
| Melisandre | Fire, limited healing, ally support | 2,715 | 9 / 4 | 6 | 264 / 650 | 227.9 / 1,650 |

Each hero has eight original fixed-roll items, including a weapon. There are no Dofus or unbudgeted stat overrides. Attributes obey the base class's normal level-200 allocation rules. Imported characters have their own six-spell books; they do not secretly retain the base class's full spell list.

### Enemies

| Enemy | Count | HP each | AP / MP | Spells | Purpose |
|---|---:|---:|---|---:|---|
| Le Sonneur de la Longue Nuit | 1 | 4,000 | 10 / 4 | 4 | Water damage, area slow, disruption, ally buff |
| Garde enseveli | 2 | 1,300 | 8 / 3 | 2 | Armored melee obstacle |
| Archer du givre | 2 | 1,050 | 8 / 4 | 2 | Ranged water damage; minimum range 3 |
| Limier des neiges mortes | 1 | 1,320 | 8 / 6 | 3 | Fast melee pursuer |

The boss keeps its validated reference resistances: **53% earth/neutral/water, −5% fire/air**. This gives Arya and Melisandre a useful job against it, while Jon can clear a path or apply his earth vulnerability. Other creatures have different reference resistances, recorded in `balance-report.json`.

### Meaningful decisions

- **Jon:** at nine AP, choose a four-AP attack plus three-AP push and two-AP vulnerability, or spend AP on an immediate power boost/protection. His teleport replaces a substantial part of his attack turn.
- **Arya:** prepare air vulnerability, use the four-AP dragonglass attack when its cooldown permits, then finish with Needle. Getting beside an archer denies its two ranged spells until it moves away. Teleportation does not grant invisibility.
- **Melisandre:** fire damage is valuable against the commander, but she has only one heal per turn. Her fire circle damages friendly fighters too. Aim at empty tiles carefully.
- **Team:** spread against the bell's small area attack; focus a dangerous enemy to reduce its camp's action economy. The boss is not an invocator: killing it does **not** remove the five other enemies.
- **Optional challenge:** win with all three heroes alive. This uses the displayed result, not a hidden achievement script.

The victory condition is the existing elimination of the whole opposing team. There is no fabricated beacon entity, timer, boss phase, resurrection trigger or unsupported custom resource.

## Original visuals (v2)

The map layout, starting cells and painted courtyard are new. Five obstacles use an original three-frame prop atlas. All 29 spells and the three weapons carry `visualEffect` descriptors, with original SVG choreography and synthesized sound. No Dofus map, spell SWF, monster model or client audio is rendered in this adventure. Numerical stat/weapon references remain part of the game’s balance system.

Reimport `winterfell-adventure-v2.zip` after refreshing the game. Import creates a new copy; an older saved v1 adventure still contains its old map/effects.

## Files and assets

| Path | Purpose |
|---|---|
| `battlefield.cjs` / `visuals.cjs` | Original geometry, placements and effect descriptors |
| `definition.cjs` | Human-authored heroes, monsters, spells, equipment, story and immutable adventure |
| `build.cjs` | Mechanical PNG extraction and the game's real Atelier ZIP exporter |
| `verify.cjs` | Actual spell execution, friendly fire, invalid-content checks and 12 complete encounters |
| `browser-proof.cjs` | Fresh Chrome import, manual casting, persistence, automatic combat and UI export |
| `sources/` | Unchanged imagegen master atlases and cover |
| `art-prompts.json` | Exact character, icon and cover generation prompts |
| `artwork-report.json` | Extraction rectangles, scaling and anchors |
| `atelier.json` | Reproducible package manifest from the exporter |
| `../../public/adventures/winterfell/` | Story page, processed PNGs, reports and screenshot evidence |

There are **39 imported PNGs**: seven characters/creature types × three images (portrait, idle front, idle back), plus sixteen spell icons, a 1536×1024 courtyard background and a 768×256 props atlas. Poses are transparent 256 × 256 PNGs with the feet at `(128, 224)`; spell icons are 64 × 64. Opposite orientations are mirrored by the game. The optional walk/cast/hit sprite sheets are not authored here: the supported idle-pose fallback is used. New spell VFX use `visualEffect` and the game’s original vector renderer; sounds are synthesized. The optional PNG `effect.json` design format is not used.

The standalone narrative cover is not counted among imported PNGs and is not an in-game map replacement. Custom equipment uses the game's tintable family shapes, not arbitrary imported item icons.

## Validation

The real current engine validates the definitions and produces the scores. The portable kit validator separately reads the final ZIP and checks its assets, nested heroes, spells, item budgets and total outfits.

| Check | Result |
|---|---|
| Per-spell ceiling | Highest authored spell: 85 / 100 |
| Per-spellbook ceiling | Highest kit: 264 / 650 |
| Per-item ceiling | Highest item: 63.9 / 100 |
| Outfit ceiling | Highest outfit: 238.6 / 1,650 |
| Complete ZIP | Importable, combat-ready, 39 images validated |
| Real-engine spell probes | All 29 spells cast and charge their defined AP |
| Friendly fire | Empty-cell circle damages enemy and ally |
| Budget rejection | Overpowered spell and +10,000-stat item rejected |
| Seeded encounters | 11 / 12 finish by elimination, 13–17 rounds; one reaches the 40-round limit |
| Hero wins | 11 / 12; all three survive in 4 / 12 |
| Illegal AI actions / engine errors | 0 / 0 |
| Fresh Chrome import | 3 heroes, 6 enemies and 39 images restored; no existing creations |
| Browser combat | Manual boost verified; complete AI victories on the original courtyard |
| Persistence / export | Reload preserves the party; UI re-export passes the portable validator |
| Browser errors | 0 |

These results describe this provided party against this provided room. They do not certify the hero classes for competitive PvP or generalize to every possible player strategy. One outcome can report `A3` as the winning fighter when that hero is the last survivor: `verify.cjs` correctly measures the winning **team**.

The JSON reports under the public adventure directory retain every seed, per-fighter statistics, spell scores and equipment definitions used by the checks.

### Native comparison anchors

The custom kits are intentionally conservative rather than attempting to spend their entire allowed budgets. Comparisons use native grade-six spells and account for their costs, ranges and restrictions, not only raw damage.

| Authored abilities | Native comparisons | Design tradeoff |
|---|---|---|
| Jon's main strike / shield | Pression, Concentration; Armure Terrestre, Bouclier Féca | Short range; protection competes with damage |
| Serment / Brise-glace | Puissance, Tir Puissant; Intimidation, Flèche de Recul | Cooldown on power; push limited to one cell |
| Earth/air vulnerabilities | Vulnérabilité Terrestre, Vulnérabilité Venteuse | Small one-turn reduction; three-turn cooldown |
| Jon/Arya teleport | Bond, Téléportation | Short, line-of-sight-bound reach and cooldown |
| Arya's attacks | Arnaque, Assaut; Attaque Mortelle, Concentration | Limited reach; heavy attack only once every two turns |
| Arya's mobility | Accélération, Bond du Félin | Only one MP; costs two AP; no AP refund |
| Melisandre's fire | Flamiche, Attaque Naturelle; Flèche Enflammée, Flèche Explosive | Single-target accuracy versus a smaller area with friendly fire |
| Healing / water ward | Mot Curatif, Mot Soignant; Armure Aqueuse, Bouclier Féca | One modest heal per turn, ward on cooldown |
| Flat damage support | Furie, Maîtrise de l'Arc | One ally, +8, short duration and cooldown |
| Boss/archer water damage and slow | Flèche Glacée, Horloge; Gelure, Flèche d'Immobilisation | No life steal or AP refund; dodgeable single-point removal |
| Boss disruption | Ralentissement, Oeil de Taupe | One AP and one range; cooldown and minimum range |
| Guard / hound | Pression, Concentration; Accélération, Puissance | Contact-only attacks; no healing or summons |

## Reproduce

Run from the repository root with its installed dependencies and Chrome:

```sh
node examples/winterfell/build.cjs
node examples/winterfell/verify.cjs
node skills/retro-class-designer/scripts/validate.cjs package public/adventures/winterfell-adventure.zip
node skills/retro-class-designer/scripts/validate.cjs package public/adventures/winterfell-creator.zip
node examples/winterfell/browser-proof.cjs
```

Use `node examples/winterfell/build.cjs --skip-art` to reuse the processed PNGs. The build does not call image generation or alter the original generated masters. `browser-proof.cjs` expects the same game version at `http://127.0.0.1:3013`; it uses fresh, isolated Chrome storage.
