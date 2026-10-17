# MongoDB community and labelled demonstration

## Storage

The application uses the native MongoDB driver when `MONGODB_URI` is configured. The database name is `arenaforge`, selected explicitly with `MONGODB_DB`. The private `.env` is ignored by Git and excluded from the Docker build; the URI never enters browser bundles or API responses.

Accounts, hashed passwords, recovery hashes, sessions, library metadata, forum topics/replies, reactions, subscriptions, notifications, moderation reports, bots and match results have dedicated collections and indexes. Sessions have a TTL index. Published ZIPs use persistent file storage under `DATA_DIR/uploads` by default, including the complete optional Retro catalogue. This keeps large archives out of the supplied cluster’s 512 MB storage quota. Optional `LIBRARY_FILE_STORE=gridfs` stores them in MongoDB GridFS instead, with a regenerable local worker cache. The configured website uses `filesystem`.

Without a configured URI, SQLite and local uploads remain available for development. A failed MongoDB connection does not silently switch the deployed application to an empty SQLite database.

A library is installed separately in each player's browser. Public community storage does not replace or erase private IndexedDB, Cache Storage or character saves.

## Forum features

- General and library-specific discussions, category filters and search.
- Replies, quoted replies, reversible likes, own-message editing and removal.
- Public profiles with editable short bios.
- Followed discussions and private in-site notifications.
- Account recovery, CSRF protection, origin checks and rate limits.
- Reporting and moderator removal.
- Published libraries retain exact ZIP bytes and immutable version hashes.
- Public AI rankings contain actual server-calculated matches only.

## Demo dataset

Run deliberately after preparing the private libraries:

```bash
python3 scripts/platform/package_legacy_library.py
npm run demo:build
node scripts/platform/seed_demo_community.cjs
npm run demo:decorate
```

These commands are not part of application startup or the production build. They use the private `.env` when run locally. The seeder adds only `demo-*` records, is idempotent, never deletes unrelated data and never creates login credentials for a demo profile.

| Resource | Demo count |
| --- | ---: |
| Fictitious profiles | 300 |
| Playable libraries | 14 |
| Discussion topics | 62 |
| Replies | 357 |
| Fake votes, downloads or ranked results | 0 |

Displayed dates cover June through October 2026 and are explicitly simulated. All seeded identities and messages carry `isDemo: 1`. Example cards use a compact `Exemple` badge. Fictional authors, dates and simulated totals remain identified; a short contextual notice explains them. Real members, discussions and ranked results are counted separately. Real visitors may reply to a demo conversation using their own account; those new messages are not marked fictitious.

The selection order is editorial demo ordering, not manufactured popularity. Game of Thrones is first and Dofus eighth. New real publications are kept separate in sorting. The twelve other themes now contain illustrated, three-room campaigns. Each supplies three equipped heroes with eight spells, four enemy archetypes, 42 authored spell definitions and 24 equipment pieces. Their source, generated artwork, final prompts, static balance reports and combat trials are in `examples/worlds-v2/`. The old prototype ZIPs remain backed up.

The existing Game of Thrones campaign was made independent of the native catalogue: equipment references use construction templates and creatures carry their own base stats. Creature levels cap at 200 and elemental resistance at 50 under the standalone authoring rules. Its eight rooms were replayed after conversion. No Dofus library is required to import it.

## Language references

The conversations are original fictional examples. The 419 messages are distinct. No real usernames or posts were copied. Public French player discussions were consulted for practical, informal phrasing and the kinds of questions players ask, including [this dungeon discussion](https://www.reddit.com/r/DOFUS_FRANCE/comments/1u8a6kw/les_donjons_en_monocompte_au_niveau_100_quoi/) and [team composition discussion](https://www.reddit.com/r/DOFUS_FRANCE/comments/1w6an51/duo_a_team_de_4/).

All forum copy lives in `scripts/platform/demo_conversations.cjs`, separately from the playable world metadata. Messages use varied lengths, player shorthand, occasional spelling mistakes and disagreements. There is no random typo generator or imitation of a specific real participant. Keep costs, targeting, storage behavior and other game facts accurate even in informal replies. Example labels stay visible.

To update existing examples without recreating profiles or importing ZIPs:

```bash
node scripts/platform/refresh_demo_text.cjs
node scripts/platform/refresh_demo_text.cjs --apply
node --test scripts/platform/test_demo.cjs scripts/platform/test_demo_text.cjs
```

The first command only previews the number of changed records. Applying writes a private copy backup under the data directory before updating any text. Only existing visible `isDemo: 1` posts with the expected author are eligible. Real messages, authors, dates, votes, downloads and notifications are preserved. Concurrent edits are reported as conflicts instead of being overwritten. The older `demo:seed -- --refresh-text` command now uses this same text-only path.

## Illustrated covers and activity preview

The fourteen demo worlds have original raster covers in `examples/community-covers/`. `prompts.json` records each final generation prompt and filename. They were generated with the built-in `image_gen` tool, then copied into the repository. They are explicitly applied by `demo:decorate`, not included in the default engine or served as default game assets.

World cards expose the existing discussions and their actual message count. The **Activité simulée** switch shows illustrative `demoActivity.likes` and `demoActivity.downloads` alongside a separate real-count line. Demo posts can also display `demoLikes`, labelled as simulated. These values never create rows in `votes`, `downloads` or `post_votes`, never add real members and never enter sorting or AI rankings. Real publications ignore these demo fields. The preference is remembered in the browser.

The decoration script modifies only existing `demo-*` publications and posts with `isDemo: 1`. Its updates are deterministic and repeatable. It preserves the published ZIP bytes, game definitions and all real user data. Use `--activity-only` to refresh the activity preview without touching covers.

## Checks

```bash
node --test scripts/platform/test_platform.cjs scripts/platform/test_legacy_library.cjs scripts/platform/test_community.cjs
TEST_MONGO=1 node --test scripts/platform/test_community.cjs
node scripts/platform/audit_public.cjs
```

The MongoDB test creates temporary `proof_*` collections inside the selected database, verifies record and file persistence through a new connection, then removes only those test collections. It never drops the database or other collections.

## Discovery and forum categories

Library filters use the server-validated contents, including supplied heroes, their equipment, custom creatures and all campaign rooms. A complete world can appear under Adventures, Classes, Equipment and Worlds. Cards show the matching content counts; a failed search offers a reset instead of claiming that the whole site is empty.

Existing package bytes, dates, ownership and activity are preserved. Recompute metadata after a content-index change with:

```bash
npm run library:reindex
```

The help and getting-started discussions are categorized under `help`; the gathering thread is under `looking`. All six forum categories contain relevant example discussions, without adding posts, invented real identities or artificial ranking results. `demo:seed -- --refresh-text` also refreshes their categories. The API returns visible thread counts for each forum section.

## Real world ratings

Anyone can read a world’s average and vote count. Only authenticated accounts can submit an integer from 1 to 5. One rating per account and world is enforced by a unique index and atomic upsert, even under concurrent requests. Members may edit or delete their rating, but cannot rate their own publications. Demo activity does not create ratings. The “Les mieux notés” sort uses only actual ratings.

## Upgrading the example worlds

```bash
node examples/worlds-v2/prepare-art.cjs
node examples/worlds-v2/package.cjs
node scripts/platform/upgrade_demo_worlds.cjs
node scripts/platform/upgrade_demo_worlds.cjs --apply
```

The last command is deliberate maintenance, never a startup action. It validates all twelve archives, backs up publication rows, writes immutable files, then updates their file references. It preserves existing discussions, authors, dates, votes and ratings. It refuses to upgrade a world already used by a ranked bot or match, to avoid changing ranked rules retrospectively. Game of Thrones and Dofus are not modified. Already installed versions remain playable; the public Play button downloads the current version when needed.
