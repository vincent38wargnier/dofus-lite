# Illustrated worlds, second edition

Twelve complete introductory campaigns replace the earlier single-hero prototypes. These are original side stories inspired by the named universes. Game of Thrones and the optional Dofus catalogue are separate libraries and remain unchanged.

## Play

On the Arena Forge homepage, choose a world and press **Jouer**. The first visit installs the ZIP locally and opens that world's adventure with its supplied team. Later visits use the saved version. A public update installs a new copy without overwriting an older adventure's progress or edits.

Each campaign provides three complementary heroes with eight spells each, eight equipped items per hero, three successive rooms, four enemy archetypes and a story with tactical advice. Room groups contain four, six and eight enemies. Defeat unlocks nothing; victory unlocks the following room. The party recovers between rooms. The optional challenge is to finish with all three heroes standing.

| Theme | Tactical identity |
| --- | --- |
| Harry Potter | Ranged duelling, disarming and roots |
| Brice de Nice | Pushes, collisions and opening passages |
| Astérix | Strong contact blows, a short potion window |
| Kaamelott | Costly protection, uncertain shots and food recovery |
| Star Wars | Two-hit blasters, jamming and fixed-damage support |
| Lord of the Rings | Shared guard and long straight-line shots |
| One Piece | Pulling enemies into directional area attacks |
| Dragon Ball | Expensive burst attacks and critical preparation |
| Pokémon | Elemental guards and air vulnerability combinations |
| Les Visiteurs | Cheap hindrance and a long-cooldown jump |
| Naheulbeuk | AP support and a two-turn vulnerability window |
| Wakfu | Pulling and water attacks along a line |

## Files and reproducibility

| Path | Contents |
| --- | --- |
| `worlds.cjs` | Stories, names, hero briefs, palettes and setting descriptions |
| `build.cjs` | Actual spells, equipment, enemies, maps and ready-to-play teams |
| `enemy-spells.cjs` | Themed ability names for each world's four enemy archetypes |
| `art/` | Generated source paintings and their exact final prompts |
| `assets/` | Runtime PNGs framed from those source paintings |
| `reports/*-design.json` | Mechanics, equipment budgets, combinations and comparison references |
| `calibration-combats.json` | 72 tuning fights, seeds 19 and 41 |
| `validation-combats.json` | 144 separate validation fights, seeds 211, 397, 809 and 1297 |
| `package-report.json` | Validated ZIP locations, inventories and arena characters |
| `browser-proof.json` | Twelve manual imports/casts, browser restart, three complete campaigns and authenticated ratings |

The built-in image generation tool produced the artwork. Canvas scripts only crop and register the generated atlases. Each world has seven portrait/front/back sets, twelve used ability icons, a painted floor and a three-prop atlas. The ZIP contains 35 runtime images plus its cover. Unused source icons and spare atlas characters are not packaged.

All battlefields use the same coordinates for scenery, movement, targeting and tactical mode. Decorative background buildings stay outside the fighting floor. Three room geometries share the world's background painting. Props are anchored to blocked cells. Character art has front/back poses; the game supplies motion transitions, not hand-drawn animation sheets. Spells use the engine's original visual effects, with world-specific colours, instead of native catalogue animations.

From the repository root:

```bash
node examples/worlds-v2/build.cjs
node examples/worlds-v2/prepare-art.cjs
node examples/worlds-v2/prepare-props.cjs
node examples/worlds-v2/package.cjs
node examples/worlds-v2/simulate.cjs --all
node examples/worlds-v2/simulate.cjs --all --validation
```

Packaging uses the real engine's spell, kit, equipment, outfit, map, image and archive validators, then validates each finished library in the publication worker. There is no installed native catalogue dependency. Import limits remain ten spells per owner and eight enemies per room.

## Pacing and balance limits

All 144 held-out fights ended in victory without illegal actions or AI errors. Median rounds were **2 / 4 / 7**, with ranges **2 / 3–5 / 6–9**. These are complete team rounds, not individual character turns. Some final fights lost a hero. Simulations use Maison controlling both camps and the supplied equipment; they measure legality and pacing, not whether every human finds the adventure fun or whether these kits are competitively balanced against every imported class.

The budgets are enforced independently: 100 per spell, 650 per custom spellbook, 100 per item and 1,650 per outfit containing custom gear, excluding Dofus. Area attacks can hit allies; healing has per-turn limits; burst attacks and support have cooldowns. The starter rooms teach mechanics rather than demanding optimized play.

For deployment, run the deliberate maintenance command described in `docs/community-demo.md`. The world ZIPs remain optional downloads, never default engine content. Example authors and discussions stay labelled. Ratings are real authenticated account votes, not generated activity.
