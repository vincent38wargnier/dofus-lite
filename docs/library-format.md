# User libraries, version 1

## Outer ZIP

```text
library.json
atelier.zip                 # existing complete Atelier export
catalogue.json              # optional catalog data, independent of the engine
assets/...                  # optional catalog media
cover.png                   # optional world cover, independent of shared media
```

At least `atelier.zip` or `catalogue.json` is required.

| Use | ZIP | Expanded | Files |
|---|---:|---:|---:|
| Local import/export | 512 MiB | 640 MiB | 24,000 |
| Public publication | 512 MiB | 640 MiB | 24,000 |

Large private catalogues can be imported in one file. Progress is shown while the browser checks and stores their media. Nothing is uploaded. Publishing is a separate, authenticated action. The server validates one upload at a time and stores published ZIPs on persistent disk, or in GridFS when explicitly configured. No URL downloads, JavaScript, HTML, executable code, symbolic paths or parent-directory paths are allowed in a library.

```json
{
  "format": "arena-forge-library",
  "version": 1,
  "name": "My original world",
  "description": "Its story and the experience it offers.",
  "release": "1.0.0",
  "kind": "adventure"
}
```

`kind`: `adventure`, `characters`, `equipment`, `mixed`, `catalogue`. Name: 2–100 characters. Description: at most 5000. Semantic numeric version required.

## Creator exports

Both **Mon espace → Partager mes créations** and **Publier ma bibliothèque** offer an image picker with a live preview and drag-and-drop. PNG, JPEG and WebP input up to 12 MiB is decoded locally, resized to at most 1600 × 1000 and saved as a PNG. The image is included in the library ZIP. Packages without a cover remain valid.

To supply a cover in an authored ZIP, add `"cover": "cover.png"` to `library.json` and put that PNG at the root. It must be a static, valid PNG of at most 4 MiB, at least 320 × 160, at most 4096 pixels on either axis and at most 8 megapixels. A landscape image around 2:1 works best. Missing, undeclared, corrupt, animated and oversized covers are rejected. Publication also decodes the pixels on the server.

Published cover images are stored under `DATA_DIR/covers` and served as inert PNGs. The author can change the page's cover without modifying the immutable published game ZIP. Installing from a world page retains that latest presentation cover in IndexedDB; exporting the installed library includes it. Covers use their own namespace and cannot collide with map or character images.

Use **Atelier → Exporter** for a selection, or **Mon espace → Partager mes créations** for the complete local workshop. `atelier.zip` includes the existing validated `atelier.json` contract and all artwork referenced by classes, rooms, supplied heroes, custom equipment and spells. Historical inner format names are retained for compatibility, not as preinstalled content.

The platform's “Créer avec une IA” prompt includes a self-contained original example, the exact selected theme, spell limits and artwork requirements. A new creature supplies its own `base` stats; a custom class uses `CREATOR` plus its authored spell list. Generic equipment construction IDs are `-100000 - type` (for example `-100016` for a hat). No catalog ID needs to be guessed or borrowed.

Imports retain drafts with validation warnings, but invalid spells/equipment cannot enter combat. Created spell budgets are 100 per spell, 650 per spellbook, ten spells per owner. Custom equipment has a 100-point budget and outfits with custom gear have a 1650-point limit, excluding artifacts. Maps/room progression/army rules use existing engine validation. Technical validity is not proof of balance.

## Optional catalog libraries

A creator can package a complete data catalog using `catalogue.json` with these collections:

| Key | Contents |
|---|---|
| `spellLibrary` | Classes, common spells, spell definitions and summons |
| `monsterData` | Monsters, boss lists and grades |
| `equipmentData` | Item definitions, families, sets and class characteristic costs |
| `classData` | Class names, builds and spell metadata |
| `dungeonData` | Encounters and their members |
| `dungeonMaps` | Dungeon map geometry |
| `outdoorMaps` | Other map geometry |

All seven are required (empty collections are allowed). Catalog IDs must be stable; an incompatible duplicate ID prevents installation. Identical shared definitions can coexist. A catalog cannot override the engine's numeric balance rules. The private repository's `src/engine/legacyCatalogue.js` documents the existing import adapter, but no catalog is packaged or published by the platform owner.

Older exports may refer to a class, item, monster or map that used to ship with the game. Those dependencies must now be explicitly included in the library's catalog (or installed separately for private editing). They are never downloaded implicitly from the website. Public publication validates the ZIP on its own, so it cannot rely on the publisher's browser having another library installed.

Optional `assets/` files can be PNG, WebP, JPEG, JSON, SWF, MP3 or OGG. They are installed in local Cache Storage under the legacy renderer's media namespace; the website does not provide that namespace with themed assets. Imported SWFs use a restricted bridge: they can report a sound cue and expose the four animation/inspection callbacks, but cannot evaluate JavaScript or call arbitrary page functions. The pinned Ruffle adapter fails the build if these bridge points change. Files remain part of re-exported content. The site ships a generic Ruffle renderer, not any native game animation.

## Storage and sharing

- Libraries install into browser IndexedDB. Installing does not publish.
- Imported catalog data is loaded before the combat engine initializes.
- Imported characters/rooms/items become independent editable copies in the Atelier.
- ZIP exports include snapshots, images and installed catalog/media dependencies, never the site's source or private server data.
- Reimporting an identical version is refused to avoid accidental duplicates. Different versions create new editable copies; they do not overwrite previous creations.
- Public libraries are validated on the server before storage and attributed to their submitting account. A download works without an account.
- Private libraries can be exchanged directly as files or used in friend games without community publication.

Catalogs may also supply an optional `forging` object containing only `runes`, `potions` and `nonMageableIds`. These are content definitions (names, images, legal infusion amounts and conversion references), not numeric engine rules. Potion conversion ratios remain 50/65/85% at levels 1/25/50. Stat weights, limits and outfit budgets cannot be overridden. This keeps imported elemental FM snapshots meaningful without shipping themed reagents by default.

## Discovery categories

The `kind` field supplies the publication's main label. Discovery tabs filter by server-validated contents, so an adventure with supplied characters and equipment is also discoverable in those sections. The inventory covers every campaign room and embedded character, deduplicates shared definitions, and includes custom spells, maps and creatures. This metadata does not install anything in the visitor's game.

`npm run library:reindex` refreshes stored counts from the validated, checksum-verified ZIPs. It does not modify the archives, publication dates, owners or activity records.
