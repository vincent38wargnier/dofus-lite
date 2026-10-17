# Private catalogue import

The website starts with an empty catalogue. The migration tool packages the legacy data already present in this working copy as an optional library:

```bash
python3 scripts/platform/package_legacy_library.py
```

The generated ZIP is `var/private-libraries/dofus-retro.arena-library.zip`. It is outside every public build directory. The script refuses a public output directory. It copies data and media, without adding application source code.

| Included collection | Count |
| --- | ---: |
| Classes | 12 |
| Player spells | 282 |
| Monsters and summons | 325 |
| Complete final-room encounters | 55 |
| Imported maps | 74 |
| Equipment, pets and mounts | 6,490 |
| Sets | 145 |
| Runes | 57 |
| Forging potions | 12 |
| Media files | 13,457 |

Three neutral engine maps remain available separately. Existing simulation limitations of native dungeon mechanics are unchanged. This is the previously imported catalogue, not every map or monster ever released by the original game.

## Install once

Open **Mon espace → Importer une bibliothèque**, select the ZIP without extracting it, and wait for validation and installation. The game opens with the new catalogue. No account or publication is needed.

- IndexedDB stores the library archive, catalogue and imported creations.
- Cache Storage stores native media, served locally by the service worker.
- Character preparations, equipment and Forgemagie remain in the platform's local save namespace.
- The importer requests persistent storage when the browser supports it. A refusal does not prevent ordinary local saving.
- Closing and reopening the same browser at the same origin preserves these records.
- Browser data deletion, private browsing expiration, storage eviction or changing origin can remove or isolate local content. Keep the ZIP and export personal creations as backups.

Importing a catalogue does not merge personal saves from the earlier standalone game's storage namespace. Those older browser records are not deleted. Personal profiles and creations are distinct from the catalogue.

## Verification

```bash
node --test scripts/platform/test_legacy_library.cjs scripts/platform/test_platform.cjs
node scripts/platform/legacy_browser_proof.cjs
```

The browser proof imports into a new profile, creates a character, forges an item, closes Chrome completely, then reopens it. It checks the same library, media, profile and FM records, launches a nine-fighter final room, and checks animated accessories, a boost, damage and audio. Its server has no public library publication.
