# Studio IA

The Studio is a working visual programming interface, not an automatic diagram
of arbitrary JavaScript. It compiles graphs into `decide(view, api)` functions,
using the same bot compiler and referee as ordinary combat and tournaments.
Existing JavaScript bots remain intact and editable.

## Player workflow

1. Open **Studio IA** from the main navigation.
2. **Mon combattant**: select a saved character, a custom class, or one of the
   twelve level-100 baselines. Saved characters keep their actual spells and
   equipment; the prompt and laboratory resolve the same character.
3. **Ma stratégie**: name the AI and choose Équilibrée, Offensive or Protectrice.
   Four priorities adjust useful damage, danger, healing and combat distance.
   These are planner weights, not extra character power. Changing a starter
   resets its weights; Undo restores the preceding version. Hand-built and
   imported graphs do not offer this replacement shortcut.
4. **Le défi**: run one duel or six mirrored duels, then read wins, losses,
   turns and action errors. The default opponent uses the same character and
   equipment. Challenge presets select Pantin, Brutus or Maison; the AI picker
   also lists saved creations, so versions can compete against each other.
5. Save the bot to use it in **Combat** or **Tournoi**. **Regarder le duel** opens
   the ordinary combat viewer with the selected fighters, published AI and
   test settings; returning to Studio preserves the laboratory results.
   Drafts are saved locally, separately from the published bot used by fighters.
6. Optional: open **Ouvrir les blocs et le code** for advanced editing. Add and
   connect blocks. Drag nodes to arrange them; click an output then an
   input, drag between connectors, or use the destination selectors. Shift and
   the arrow keys move a focused node. Drag the background to pan; the zoom
   buttons or Ctrl/Cmd + wheel change the view. **Ajuster** fits the graph.
   Narrow screens initially center the selected block at a readable scale;
   pan the background to explore the rest or fit it explicitly.
   Configure conditions and priorities. **Code généré** shows the code actually
   used in combat. A JavaScript copy leaves the visual original available.
   **Explorer les IA du jeu** opens the protected references, including Maison's
   seven executable stages. Existing JavaScript bots remain editable.
7. Under **Comprendre les combats et leurs décisions**, choose a decision to highlight
   its executed path, inspect the public view and compare planner scores.
8. **Partager mon IA** exports the graph as JSON, or the free-code bot as JavaScript. Graph imports
   create new drafts; they do not replace saved bots. The JSON importer never
   evaluates supplied JavaScript. Use the code editor for free-code imports.

## Optional ChatGPT coaching

**Préparer mon prompt** accepts a personal goal and creates a complete prompt
from the played fighter's actual spell keys, grades, effects, critical effects,
costs, ranges, states, equipment-derived stats and permanent bonuses. It covers
damage, immediate boosts, healing, summons, positioning, zones, friendly fire,
summoner priority and invisibility. The complete graph contract, weight bounds,
search settings and an importable example are included.

The brief asks the player to describe opening moves, target priorities,
positioning, support, danger thresholds and fallback behavior. A contextual
example can be inserted without overwriting existing text. Briefs stay with
the local AI draft, separately for each chosen fighter, including after closing
the dialog or importing the proposed strategy.

The prompt contains **the selected fighter at its actual level and spell grades**,
not all twelve class catalogues or every grade. A saved character includes its
common/authored spells and equipped weapon; native Studio baselines are level 100.
Equipment/FM stats and effective range are already included and must not be
added again. Each effect has its numerical data plus the same readable target,
duration, area and effect explanations as the combat spellbook. Normal and
critical lists remain separate; unsupported effects and audit notes are exposed.

Summoning spells include their reachable creature templates, resolved at the
actual summon grade and summoner level, with HP, stats, AP/MP, resistances and
their full spellbooks. This also covers summons of summons, static creatures,
doubles and monster-catalogue spells equipped by custom classes. For example,
the level-100 Osamodas dossier includes its seven summon types and distinguishes
boost effects for summons from effects for non-summons. Summons act with the
game's autonomous summon AI; the character's visual program does not directly
command their turns.

This guided workflow requests **visual JSON**, which the game compiles into
executable JavaScript. It does not request arbitrary source code. The prompt
explicitly lists limits: weights are preferences, named-target policies and
arbitrary memory sequences are not guaranteed by a planner block, and only the
listed conditions are expressible. The assistant should ask for essential
clarifications or explain an unsupported exact rule before its final JSON.
The advanced JavaScript editor remains available for a fully custom algorithm.

Copy the prompt or download it as text, use it in an external assistant, then
paste the returned JSON into **Réponse de ChatGPT**. A single Markdown JSON
fence is accepted. Parsing applies the real graph validator, ignores supplied
JavaScript, rejects invalid links and cycles, and checks specific spell keys
against the selected character. A successful import creates a new draft and
preserves the original. No API key or automatic ChatGPT request is involved.
If clipboard access is denied, the full selectable prompt and download remain
available. The native dialog supports focus containment and Escape.

**Améliorer avec ChatGPT** adds the latest completed experiment's fighter
snapshots, opponent, seeds, results, error events and exact tested strategy.
The current strategy is listed separately because it may have changed since
the test. This is measured evidence, not an assertion that the assistant has
run simulations. The next test determines whether the proposed change helps.

## Execution model

| Block | Behavior |
| --- | --- |
| Start | Runs after each applied action, with fresh combat values. |
| Condition | Compares HP, allied HP, PA, PM, visible enemy distance, enemy count or turn. |
| Planner | Returns a legal, useful action selected by Maison or Cortex with optional weight overrides. |
| Specialized spell | Limits direct casts to damage, healing, protection, control, summons, weapon or one spell key. |
| Movement | Moves toward a visible non-summon when possible, or away from the closest visible enemy. |
| End | Passes the turn. |

Returning an action ends that invocation of the graph. Unavailable or useless
actions follow the **Impossible** edge. Heal blocks select direct heal effects;
life-steal attacks remain available to attack/generalist blocks. Mixed spells
can match more than one category. Specific-spell blocks use the played
fighter's spell key and fall through when it is absent or unusable.

Graphs permit at most 32 nodes, require all branches to be connected, and reject
cycles before publication. Disconnected but otherwise valid nodes are marked
unused. A bounded generated loop is an additional execution guard. Conditions
and numeric settings are whitelisted; negative, nonfinite and excessive values
are rejected. Base Maison/Cortex references are read-only.

## Maison’s executable internal graph

**IA Maison** opens with seven stages of its real planner. Choose **Créer ma
version** to edit it. Existing compact bots keep their saved graphs; **Déplier
le cerveau** expands a planner and **Replier le cerveau** preserves its settings
inside a compact node.

| Stage | Computation | Editable controls |
| --- | --- | --- |
| Profile | Global weights and regularized class matchup profile | Weight overrides, base, action category |
| Observe | Public occupancy, obstacles, lines of sight | Engine rules remain fixed |
| Threats | Expected enemy bursts, dependent summons, target values | Threat / nearest / weakest placement target |
| Spells | Useful expected effects and candidate aim cells | Friendly-fire penalty, free-cell search size |
| Combos | Legal casts and remaining-PA follow-up attacks | Enable, weight, number of forecast victims |
| Movement | Reachable cells, danger, tacle and unlocked attacks | Enable, cells, aim count, follow-up count |
| Choose | Compare cast and movement scores; remember one action | Minimum cast score, tie preference |

These are **executed stages**, not an illustration around one opaque planner
call. Native `utilityDecide` drains `utilitySteps`; the visual program advances
the same generator through `api.maisonPipeline(config, inspect?).step(stage)`.
A session belongs to one decision only. Every applied action restarts the graph.
No additional combat RNG is consumed.

The order is fixed because later stages need earlier variables. External edges
must enter the profile stage; the last stage’s **Impossible** edge may continue
to another branch. Conditions before a pipeline and several alternative
pipelines are supported. Individual internal stages cannot be removed; expensive
combo and movement stages can be disabled through their own controls. Graph
validation rejects missing stages, reordered dependencies and jumps into the
middle. Search controls are bounded to avoid unbounded tree searches.

The target policy changes the **placement target**, not an unconditional attack
order: all victims still enter useful-damage, owner and threat scoring. A chosen
invocation may still be a useful target. Scores are heuristics rather than HP
or win probabilities; the planner does not exhaustively search every combo.
Stage settings such as the cast threshold are shared by the pipeline where
needed, including candidate pruning before the final comparison.

**Code de cette étape** shows the actual source region, with its source file and
line. The viewer includes Maison’s profile resolution and shared tactical
helpers. `scripts/build_maison_source.cjs` regenerates this readable source at
both `npm start` and `npm run build`; `--check` verifies it is current. It is not
JavaScript reconstructed from a diagram. Source is read-only; the free JavaScript
editor remains available for completely different algorithms.

`api.plan(config, inspect?)` continues to support compact planners and old bots.
Diagnostics record the actual stage outputs, effective weights, priority target
and up to twelve scored options during the decision. The debugger highlights
each executed stage and its result. The options are the search’s considered
candidates, not every legal action. Simple movement blocks still use distance
instead of this full planner.

Default expansion was checked against **72 frozen decision scenarios and 211
sequential decisions captured before the refactor**, covering all twelve
classes, low HP, exhausted PA/PM, summons, protections and invisibility. These
checks preserve the existing policy, including its limitations; editing a graph
does not automatically make it stronger.

## Laboratory and reproducibility

- A single analysis uses the chosen map and seed. The six-duel comparison uses
  three maps, two seats per map, and the same seed within a mirrored pair.
- Both bot functions are freshly compiled for each game. Their memories and
  RNG streams remain separate. Saved profiles retain their equipment and
  spells; all twelve native classes are also available as level-100 baselines.
- The first 180 decisions of the studied AI include its public view, traversed
  blocks, planner reports and returned action. The outcome and statistics cover
  the whole fight. Invisible positions are not exposed by the debugger.
- Changing the strategy, fighters, opponent or test settings keeps old results
  labelled as results of the tested version. Two completed consecutive runs
  show a comparison only when characters, equipment, enemy code, seeds, maps
  and match counts agree. Results stay in the current Studio session, not a
  persistent public ranking. Inspection displays the captured graph, read-only. Switching to a
  different AI cancels its previous laboratory job.
- JSON reports include the exact tested graph and code, opponent code,
  characters/loadouts, map, seeds, errors and outcomes. They do not include
  custom image blobs and are diagnostic reports, not character content ZIPs.
- The two asynchronous Stratège variants are tested through **Combat**, not
  this synchronous-decision comparison; treating their waiting messages as
  completed decisions would bias results. Custom scripts using asynchronous
  strategies should likewise be tested in Combat.
- Six games are an exploratory sample. To establish progress, compare different
  classes, equipment, maps and fresh seeds; preserve a previous bot as an
  opponent and reserve unseen scenarios for validation. Static graph validity
  is not evidence of a stronger AI.

## Implementation and checks

- `src/bots/visualGraph.js`: graph contract, templates, compiler and JSON format.
- `src/bots/visualPlanner.js`: strict action categories and planner entry point.
- `src/bots/utilityBrain.js`: shared staged generator for native and visual policies.
- `src/bots/maisonStages.js`: stage contract, search controls and bounds.
- `src/bots/maisonSource.json`: generated readable source for the inspector.
- `src/bots/flowLab.js`: reproducible referee-based experiments and bounded traces.
- `src/ui/AiStudio.js`: drafts, publication, code view, import and export.
- `src/ui/AiGuidedSetup.js`: fighter selection, starting styles, priorities and
  the external-assistant copy/paste workflow.
- `src/bots/aiAuthoring.js`: real fighter snapshots, generated prompts, reply
  parsing and compact measured-test context.
- `src/ui/AiFlowCanvas.js`: connected node editing, keyboard access and camera.
- `src/ui/AiNodeInspector.js`, `AiDecisionInspector.js`, `AiLab.js`: configuration
  and explanation of actual executed decisions.
- `src/__tests__/visualAi.test.js`, `visualAiUi.test.js`: policy equivalence,
  real healing, invalid graphs, import safety, persistence and legacy code.
- `src/__tests__/maisonStages.test.js`: frozen pre-refactor decisions, real stage
  execution, rule changes, dependencies and round-trip preservation.
- `src/__tests__/aiGuidedStudio.test.js`: actual class/custom spell prompts,
  no-code creation, response import, clipboard fallback and measured improvement.
- `scripts/proof_guided_ai_studio.cjs`: isolated Chrome flow with clipboard,
  real duels, export/import, ordinary combat, reference source and mobile checks.

The interaction is inspired by n8n's [node editor](https://docs.n8n.io/workflows/components/nodes/)
and [recorded execution debugging](https://docs.n8n.io/workflows/executions/debug/).
No n8n server, external account or service is needed.
## Editing an AI with Claude Code or a local editor

Studio IA → **Code & fichiers** downloads a project ZIP for the current AI and
selected fighter. Extract it anywhere, open that folder in your editor, describe
the intended behavior in `PROMPT.md`, and edit `bot.js`. The project contains the
real spellbook, equipment/FM-derived stats, summon spellbooks, a sample public
view, the API contract, readable planner sources and the actual test engine.
Node.js 20+ is required; no repository, npm install or network is needed.

```bash
node test.cjs check bot.js
node test.cjs duel bot.js --against maison
node test.cjs benchmark bot.js --against maison --seed 12000 --report results.json
```

`check` checks syntax and decisions in ten scenarios, including low HP, contact,
allied healing, exhausted resources, cooldowns, terrain and invisibility. It does
not assert that those decisions are strategically good. `duel` runs a complete
match; `benchmark` runs six matches on three maps with starting sides reversed.
The same fighter/loadout is used on both sides by default. Pass another
`--opponent rival-fighter.json` or `--against ./baseline.js` for a different
reference. Matching seeds make `api.random()` reproducible; arbitrary use of
`Math.random()` or wall time cannot be made reproducible by the runner.

Reports include actions rejected by the engine, exceptions, results, turns,
damage, source/fighter hashes and the runtime version. Exit status 1 denotes a
technical error, invalid comparison or timeout; a loss/draw alone does not fail.
The default worker timeout is 180 seconds (`--timeout` can change it). The worker
is for interrupting blocked code, not a security sandbox. Neural helpers requiring
browser models are explicitly rejected, not silently replaced by Maison.

The runtime also exports `checkAiCode`, `aiTestCases`, `checkAiAction` and
`benchmarkAiCode` for additional `node:test` scenarios; see the kit's `API.md`.
The CLI and browser use the same engine, compiler, APIs, referee and equipment
calculations. Re-download after game updates to refresh the runtime.

Return to **Importer une IA** and select the edited `.js`, then test and save.
Import parses without executing the code and opens an independent JavaScript
draft, keeping the currently selected fighter. It never overwrites the original
AI. Visual `.json` imports still work. `original-flow.json`, when included, is a
backup of the original graph; changes to `bot.js` are not converted back to blocks.
The kit includes combat data but not artwork. Sharing the character itself is
still done through Atelier export.

### Where the data lives

| Data | Location |
| --- | --- |
| Saved personal AIs | Browser localStorage: `koliseum.bots.v1` |
| Studio drafts and behavior briefs | Browser localStorage: `koliseum.ai-studio.v1` |
| Editable exported AI | `bot.js` in the extracted project folder |
| Bot persistence | `src/ui/botsStore.js` |
| Studio import/editing | `src/ui/AiStudio.js` |
| Decision API / compiler | `src/bots/api.js`, `src/bots/compile.js` |
| Maison logic | `src/bots/maison.js`, `utilityBrain.js`, `tactics.js` |
| Testing helpers / referee | `src/bots/aiCodeTesting.js`, `src/arena/runner.js` |
| Project exporter | `src/bots/aiCodingProject.js` |
| Portable build / launcher | `scripts/build_ai_coding_kit.cjs`, `scripts/templates/ai-coding/test.cjs` |

Storage belongs to the exact browser and game origin. Personal AIs do not
automatically become repository files. Exported files and the browser do not
synchronize; reimport edited code explicitly. Readable `engine-source/` files in
the kit are reference copies, not patches applied to the real game.

From the repository:

```bash
npm run ai:kit
npm run ai:test -- check /path/to/extracted-project/bot.js
```
