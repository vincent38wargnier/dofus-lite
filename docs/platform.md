# Arena Forge — hosted platform

The default build is a content-neutral website. **No themed catalogs or adventures are installed or bundled by default.** Accounts and community data begin empty unless the explicit, labelled demo seeder is run. The original local project and its assets remain private in this repository; they are excluded from the deployed artifact.

## Run locally

Requires Node.js 22.13+ (tested with 22.23), npm and a persistent writable directory.

```bash
npm ci
npm run build
npm start
```

Open `http://127.0.0.1:3013`. The default public directory is `build-platform`, not `public` or the old `build`. `npm run build:legacy` and `npm run start:legacy` are explicit private development commands; never deploy their output for the neutral website.

## Deployment

The repository and server source are private deployment inputs. Visitors receive browser bundles and user libraries, not a source checkout or an engine SDK. Browser-executed JavaScript is necessarily downloadable; minification is not source-code confidentiality.

```bash
# Set DOMAIN and MONGODB_URI in your private environment first.
docker compose up --build -d
```

Point the domain to the server first. Caddy terminates HTTPS; the app port is internal. `PUBLIC_ORIGIN` must match the browser's HTTPS origin exactly. For a native/systemd deployment set `HOST`, `PORT`, `PUBLIC_ORIGIN` and `DATA_DIR` explicitly, with a trusted HTTPS reverse proxy. `TRUST_PROXY=1` trusts exactly one proxy and should not be enabled when serving the Node port directly.

The Docker recipe is supplied. Actual deployment and certificate issuance require the owner's domain/server; no external deployment was performed by this change.

### Persistent data

| Location | Contents | Public access |
|---|---|---|
| MongoDB `arenaforge` collections | Accounts, sessions, publications, discussions, notifications, AI versions, results | API only |
| Persistent `DATA_DIR/uploads` | Complete validated published ZIPs | Download route |
| MongoDB GridFS, optional | Alternative ZIP storage when `LIBRARY_FILE_STORE=gridfs` | Download route |
| `DATA_DIR/community.sqlite` plus WAL | Offline development fallback when no MongoDB URI is configured | API only |
| `DATA_DIR/uploads/<uuid>.zip` | SQLite development upload storage | Download route |
| `DATA_DIR/worker-cache` | Regenerable ZIP cache for match workers | None |
| Browser IndexedDB | Imported library ZIPs and custom images | That browser only |
| Browser localStorage, `arena-forge:` prefix | Characters, equipment, dungeon progress, teams, AI drafts | That browser only |
| `build-platform` | Compiled UI, engine runtime, blank templates, generic renderer dependencies | Static site |

Back up MongoDB collections and the persistent upload directory together for deployed storage. If GridFS is selected, include its files and chunks collections. For SQLite development, back up the whole data directory with the app stopped, or use SQLite's backup API and a coordinated copy of `uploads`. Restore to the same directory, preserving ownership. Do not copy a live SQLite file without its WAL. A restart marks unfinished public matches failed; they never count as wins. Local user content is not a cloud backup: users should export ZIPs.

## Player flow

- **Private:** choose a world → install once → play its adventure. **Mes jeux** lists installed worlds. **Créer** opens the optional creators. No account required. Old local saves use a separate namespace and are not deleted or automatically migrated into the empty platform.
- **Public:** register → keep the recovery key → publish a ZIP → discuss, download, install and rate libraries.
- **Competition:** choose a published version and a supplied character → register AI JavaScript → challenge another author's AI. Both sides use the same character and arena, with two seeds and reversed starting sides (four games).
- Catalog classes also become competition choices at level 200 with their catalog spells and no equipment. Saved supplied characters retain their exact gear and spell selections instead.
- **Rankings:** UTC day/month/year, three points per win and one per draw. No client-submitted result endpoint. Every completed public match exposes its actual event journal. Rank context includes library version and fighter; a universal “strongest AI” across incompatible worlds is not inferred.

An optional labelled demo dataset provides 300 fictitious profiles, 14 playable libraries and forum conversations. It is installed only by an explicit command, never by startup or build. Demo identities cannot log in. No votes, downloads or ranked results are fabricated. See `docs/community-demo.md`.

### World selection and free combat

A published world's **Jouer** link opens its installed version by archive hash. It explicitly replaces any previous encounter selection. Every world opens the same **Combat libre** setup: a catalogue such as Dofus selects its dungeon list, while a packaged adventure selects its encounter. Neither replaces the player's team. Supplied heroes are available under **Mon équipe → Classes**, alongside installed class templates. The **Monde** selector also appears in character, creature, spell and map catalogues.

**Combat libre** uses the shared installed collection. Choose **Tous mes mondes** to mix native classes, imported heroes and authored creatures. Each ally has its own manual or AI control; opening a world does not change those choices. **Personnaliser** opens the existing equipment, characteristics and spell editor, then **Retour au combat** restores the preparation.

**Changer de carte** or **Modifier les adversaires** copies the current room into an independent fight, retaining every enemy, its spellbook and any army commander objective. Editing this copy does not alter the installed library or unlock campaign rooms. Unmodified dungeon encounters still use campaign progression. Teams, map snapshots, controls and army settings survive reloads. Free maps do not overwrite the native map registry, even if two archives reuse an ID.

The live engine, automatic referee and shared lobby honor an explicitly composed team. Packaged `adventure.heroes` remain a fallback for older callers that omit a team, rather than replacing the UI's choices.

**Nouveau personnage** offers installed classes and imported heroes. **Atelier → Mes classes → Partir d’une classe existante** creates an independent editable copy. For native classes, choose up to ten spells from the prefiltered catalogue; ordinary characters retain their original full class spellbook. The app remains empty before installing content.

## Accounts and moderation

### Forum

The community view uses a compact post feed, world thumbnails, topic categories,
search, and three server-side sorts: recent activity, newest topics, or real likes.
The followed-discussions feed is private to the current account. Filters are kept
in the tab's session storage so returning from a discussion preserves its context.
Creating a discussion preselects the current category and world; both can be changed.

Replies can target another message and appear in collapsible branches. Deleting a
parent does not delete its descendants. Posting, liking, following, quoting, editing,
reporting and sharing work from the discussion. The menu keeps secondary actions
out of the reading column. Text stays plain text and cannot inject HTML. New replies
appear only after the server has saved and acknowledged them.

Fictional examples remain labelled. Their simulated metrics never enter the real
vote count or the popular sort. Readers can hide examples with one checkbox.

Forum checks:

```bash
node --test scripts/platform/test_forum.cjs
TEST_MONGO=1 node --test scripts/platform/test_forum.cjs
CI=true npm test -- --watchAll=false --runInBand src/__tests__/forum.test.js
node scripts/platform/forum_browser_proof.cjs
```

The browser proof uses two accounts in a temporary SQLite database. The MongoDB
check uses unique temporary collections and removes only those test collections.
`forum_screenshots.cjs` captures the installed forum without changing its data.

Passwords use scrypt and per-account salts. Session tokens are random, hashed in the database, HttpOnly, SameSite=Strict and Secure on HTTPS. Mutations require the configured Origin and a per-session CSRF token. Recovery uses a once-displayed random key, not email; rotating it revokes previous sessions.

Create a normal account in the UI, then grant moderation access on the server:

```bash
DATA_DIR=/absolute/persistent/path node server/admin.cjs grant your_handle
# Docker:
docker compose exec app node server/admin.cjs grant your_handle
```

Reported libraries/topics/replies can be hidden by a moderator. Hidden libraries are excluded from discovery, downloads and rankings; copies already downloaded are not remotely deleted. The author can unpublish their own library. Reports preserve the submitted reason. Publication requires explicit confirmation of authorization to share the contents; this is a product control, not a legal guarantee. The service does not automatically approve third-party rights.

## Content format

See `docs/library-format.md`. Public/private imports share the current engine validators. Every publication is immutable and has a SHA-256 identity. A revised ZIP is a new version. Files containing website source, executable scripts or HTML are not accepted as library content. User-authored AI code has a separate validated registration route.

Numeric balance limits remain fixed engine rules; installing a catalog cannot replace the reference budget curves. These checks do not certify competitive balance.

## AI isolation and resource limits

Private browser AI scripts and public server AI scripts execute inside QuickJS WebAssembly. The bridge passes JSON only; no browser/Node objects, cookies, filesystem or network are exposed. The visual graph's planner pipeline and recorded traces use the same bridge. Time, memory and API-call limits stop runaway scripts.

Public calculations additionally run in bounded worker threads: two concurrent jobs, queue of twelve, 120-second validation / 120-second match limit. Source versions stay private; public data includes source hashes and results. Current public competition supports the generic planner/search APIs, not trained-network model loaders.

The first deployment is a single Node process with SQLite and local files. Horizontal scaling requires a shared job queue/database/object store. Rate limits, per-day publication caps, same-author/repeat match restrictions and ZIP size limits are present; they do not constitute sophisticated anti-collusion or multi-account detection.

## Verification

```bash
npm run build
npm run test:platform
node scripts/platform/audit_public.cjs
node scripts/platform/browser_proof.cjs
node scripts/platform/deployment_smoke.cjs
# With npm start running:
node scripts/platform/manual_creation_proof.cjs
```

The browser proof uses an isolated test server/database and temporary browser profiles. It uses separate test namespaces and does not alter the installed community. Source paths and `/adventures`, `/dofus-local`, old authoring SDK ZIPs and private files must return 404 on a fresh installation.

The deployment smoke test copies only the runtime files to a temporary directory outside the repository, installs the locked server dependencies, validates an original library, runs four sandboxed matches and checks the empty website. This passed on Node 22.23. The container recipe itself has not been executed here because the local Docker daemon is unavailable.

The engine remains browser-side for free private play and host-authoritative friend lobbies. The server is authoritative for public ranked games. Friend lobbies still need WebRTC connectivity and the offer/answer exchange; deploying the site does not add a TURN relay or automatic matchmaking.

### Deployment references

- [Node.js SQLite API](https://nodejs.org/download/release/latest-jod/docs/api/sqlite.html)
- [Caddy reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)
- [Caddy request-body limits](https://caddyserver.com/docs/caddyfile/directives/request_body)
- [QuickJS WebAssembly isolation](https://github.com/justjake/quickjs-emscripten)
