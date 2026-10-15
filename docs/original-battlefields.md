# Original battlefields and spell visuals

The Winterfell v2 adventure demonstrates a complete original visual set: new flat isometric geometry, AI-painted scenery and props, custom character art and icons, and original vector spell effects with synthesized audio. It still uses the game's combat rules and numerical balance references.

## Supported import formats

| Feature | `content.json` | `atelier.json` |
|---|---|---|
| Character sheets and spell icons | Yes | Yes |
| Original vector spell effect | `spell.visualEffect` | Raw authored spell `visualEffect` |
| Original weapon effect | No equipment in this format | `weapon.visualEffect` in custom item |
| Original map geometry and background | No | Dungeon `battlefield` |
| Arbitrary spell PNG sequences / `effect.json` | Design source only | Design source only |
| Arbitrary equipment PNG / audio file | No | No |

## Original spell effect

Use `visualEffect` instead of `visualSpellId`. The renderer creates its own SVG particles and its own Web Audio cues. No native SWF, image or sound is referenced. This descriptor is cosmetic; damage, zones, friendly fire, costs and targeting still come from the spell's effects.

```json
{
  "version": 1,
  "kind": "ice-lance",
  "color": "#66bde6",
  "accent": "#e3fbff",
  "durationMs": 1100
}
```

All five fields are required; additional fields are rejected. `durationMs` is an integer from 250 to 1500. Colours are six-digit hexadecimal. Supported kinds: `slash`, `thrust`, `arrow`, `ice-lance`, `shatter`, `fireball`, `fire-wave`, `shield`, `embers`, `raven-step`, `fang`, `rally`, `bell`. The spell editor exposes these under **Animation originale**. Effects orient and travel between the actual caster and target and never lock the controls. The normal sound toggle and volume apply.

The PNG spell-FX authoring kit is a separate, more general design format. Its `effect.json` is still not a runtime field.

## Embedded battlefield

An Atelier dungeon may supply `battlefield`; its `mapId` must equal `battlefield.id`. Its geometry is local to that package and does not alter the global Dofus map catalogue. Original maps use flat 2:1 projection; imported elevation systems are not supported by this contract.

| Field | Contract |
|---|---|
| `version` | `1` |
| `id` | `custom-` followed by 1–80 lowercase letters, digits or hyphens |
| `name` / `description` | Nonempty name ≤120 characters; description ≤800 |
| `width` / `height` | Integer grid dimensions, 5–40 each |
| `background` | Projection and stored image reference, below |
| `startingCells` | Two arrays of 8–32 distinct, free `{x,y}` cells |
| `obstacles` | Unique `{x,y,type,prop?}` cells inside the grid |

Both camps must be connected by a walkable route. Obstacle types: `WALL`, `ROCK` (block movement and sight), `BUSH`, `HOLE`, `WATER` (block movement), `VOID`. Optional `prop`: `pillar` on a WALL/ROCK, `barricade` or `brazier` on a BUSH. These props do not add damage, hazards or scripted victory conditions.

```json
{
  "artworkId": "winterfell-battlefield-v2",
  "file": "courtyard.png",
  "propsFile": "props.png",
  "width": 1536,
  "height": 1024,
  "hw": 48,
  "top": 200,
  "originX": 16
}
```

`propsFile` is optional; other fields are required. Both filenames are simple lowercase PNG names, not paths or URLs. `artworkId` follows the archive's normal ID/remapping rules. Background dimensions: width 256–2048, height 256–1536; `hw` 8–128; `top` 0–image height; `originX` 1–100. All are integers. Every projected cell must fit inside the image. The PNG must match these declared dimensions and contain visible pixels. Backgrounds can be opaque.

Cell centres before display scaling:

```text
cx = (x - y + originX) * hw
cy = top + (x + y + 1) * hw / 2
```

A tile extends `hw` horizontally and `hw/2` vertically around its centre. Attach a geometry guide to image generation. Paint passable paving inside the footprint; place decorative scenery outside it. Put depth-sensitive obstacles in the separate props atlas, not on walkable cells in the background.

The optional props atlas is **768×256**, three horizontal 256×256 frames: pillar, brazier, barricade. Each frame needs visible pixels and transparent surroundings. Ground anchor `(128,224)` in each frame. The engine draws props at their obstacle cells in the same depth order as fighters. Without the atlas, original vector props are used.

## Assets, storage and sharing

Declare the background and optional props atlas in the usual `atelier.json.artwork` record. Each logical filename maps to its ZIP entry `assets/aN/<filename>.png`. Map PNGs are limited to 8 MiB each; characters and spell icons retain their 2 MiB limit. Other archive limits remain unchanged. The importer verifies dimensions and PNG contents, stores images locally, and remaps image IDs. Re-export includes all referenced map assets. P2P transfers the terrain independently of the roster, so removing a fighter cannot remove the shared map.

Run the portable validator on the final ZIP:

```bash
node scripts/validate.cjs package winterfell-adventure-v2.zip
```

Then check the imported map, starting cells, obstacles, targeting, original effects, sound/mute, responsive layout, replay and re-export in the game. Image validation cannot determine whether painted walls visually match collision.

The complete reproducible example is `examples/winterfell/`: `battlefield.cjs`, `visuals.cjs`, `definition.cjs`, original generated masters, `build.cjs`, and browser/engine verification scripts.

## Army encounters and camera

The Workshop offers **Mode armée** for Atelier dungeons. Ordinary rooms retain eight enemies; an army room permits 32. The allied team remains limited to eight. To author one, add this optional field to the dungeon in `atelier.json`:

```json
"encounter": { "version": 1, "mode": "army", "commander": 0 }
```

`commander` is a zero-based index into `members`, before expanding quantities. That member must have `count: 1`. Its death kills every surviving member of its army immediately, removes their effects and resolves victory normally. These combatants remain ordinary fighters, not summons. Use `commander: null` or omit it for a battle that requires eliminating the whole army. Deleting the commander in the editor clears the objective; deleting an earlier member adjusts the index. Each owner's ten-spell and numerical budgets still apply. The legacy `content.json` room format still permits only eight enemies.

Army enemies use their start-zone cells in roster order, allowing ranks and a protected commander. On existing maps with too few departures, army mode expands placement to reachable free cells; ordinary dungeon placements are unchanged. Supply 32 explicit departures on a custom army map for exact placement.

Combat and replay cameras support 100–400% zoom with buttons, wheel, or touch pinch. Dragging pans and never casts or moves a fighter. **Ajuster** resets to the complete map; the reticle centres the active fighter. Zoom changes presentation only: range, line of sight, pathfinding and targeting still use the same cells. Camera state resets for a new battlefield and is local to each participant.

`examples/winterfell-last-stand/` builds a complete 32×32 battlefield with six supplied heroes against 32 enemies, original art, a Night King objective and portable ZIP validation. The playable ZIP is `public/adventures/winterfell-last-stand.zip`.
