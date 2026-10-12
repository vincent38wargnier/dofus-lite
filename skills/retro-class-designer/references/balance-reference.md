# Reading the Retro baseline

The audit is a local census of imported client definitions, not a reproduction of a proprietary server balancing formula. Client spell tables provide effects and restrictions; they do not provide an official universal “power budget.” Engine approximations remain relevant to every comparison.

## Provenance

| Source | Imported version | Purpose |
| --- | --- | --- |
| `spells_fr_1387.swf` | 1387 | Spell definitions and grades |
| `classes_fr_1391.swf` | 1391 | Class spell lists |
| `src/engine/spellLibrary.json` | Hash in `baseline.json` | Exact local audit input |
| `src/engine/formulas.js` | Current repository | Actual scaling and mitigation |
| `src/engine/geometry.js` | Current repository | Areas and damage coefficients |
| `src/engine/engine.js` | Current repository | Targeting, timing, reactions and special cases |

Regenerate with `node scripts/audit_class_balance.cjs`. Grade-5 and grade-6 rows retain complete effects, critical effects, ranges, limits and exclusion reasons. Common spells and monster spells are not part of the 264-entry original-class comparison panel. They can inspire mechanics, but boss stats/costs are not a player balance standard.

## Useful comparisons at grade 6

These are raw imported values. `0` in native cast limits means unlimited, not unusable. Native exceptions are intentionally broader than the conservative authored profile.

| Spell / ID | AP | Range | Relevant values | Why context matters |
| --- | ---: | --- | --- | --- |
| Fouet / 30 | 1 | 1–10 | 301–305 neutral | Summons only; exclude from normal damage budgets |
| Attaque Mortelle / 76 | 4 | 1–2 | 41–60 earth; critical 131–150 | Very short range, 2 per target; unusual critical ceiling |
| Tempête de Puissance / 156 | 3 | 3–5 | 36–40 fire | Minimum range, narrow range window, 3 per target |
| Épée de Iop / 160 | 4 | 1–4 | 13–39 earth, cross radius 3 | High variance, area/friendly-fire considerations, 2 per turn |
| Flèche Explosive / 179 | 4 | 1–8 | 20–24 fire, diamond radius 3 | Area and range matter as much as per-victim damage |
| Furie / 447 | 3 | 1–3 | 9–13 water, cross 1; +8 damage, 4 turns | Damage precedes buff; reactive HP-loss effect also exists |
| Maîtrise de l'Arc / 180 | 2 | 0–6 | +60 damage, 2 turns; cooldown 5 | Multi-line attacks exploit flat damage; kit-wide interaction |
| Puissance / 153 | 4 | 0–2 | +100 power, 5 turns; cooldown 5 | Critical duration 7; compare complete uptime |
| Bond / 142 | 5 | 1–6 | Empty-cell teleport, no LoS | Consumes most of a basic turn; positional states restrict it |
| Mot Curatif / 121 | 3 | 0 | 17–25 self heal | 1 per turn; intelligence and critical build change sustain |
| Mot Soignant / 124 | 2 | 1–8 | 11–14 heal | Cannot aim at self; 3 per target |
| Mot de Frayeur / 128 | 1 | 1–5 | Push 1 cell | Cell displacement and collision can outweigh raw damage |
| Bouclier Féca / 7 | 3 | 0–1 | +45% all-element resistance, 4 turns | Cooldown 6, resistance caps, strong specialist role |

Do not combine Fouet's number, Bond's targeting freedom, Explosive's area, and Mot Soignant's low cost into a “comparable” new spell. Each belongs to a different cost/constraint structure.

## Class identities worth preserving

This table is a design interpretation of the kits, not a measured power ranking. Read exact rows before copying a mechanic.

| Class | Main kit lesson | Dangerous transplant |
| --- | --- | --- |
| Féca | Protection and control of occupied space | Strong armor without a defensive opportunity cost |
| Osamodas | Future value through creatures and creature support | Full-strength boss summons, unbounded simultaneous units |
| Enutrof | Range, disruption, situational tools | Cheap removal plus universal high damage |
| Sram | Setup, traps, threat of close burst | Invisibility plus safe ranged burst with no reveal/counterplay |
| Xélor | AP management and denial | Self-funding casts or perpetual AP lock |
| Ecaflip | Conditional results and critical spikes | Taking the best outcomes without their uncertainty/cost |
| Eniripsa | Healing and support trades | Top offensive output while retaining best healing |
| Iop | Damage windows and commitment | Melee burst values on unrestricted ranged attacks |
| Crâ | Range and positioning | Perfect kiting plus strong melee and sustain |
| Sadida | Persistent effects and summon interactions | Free pressure every turn with no board vulnerability |
| Sacrieur | Exposure, placement and HP-related tradeoffs | Borrowed vitality economics without the exposure |
| Pandawa | States and placement choices | State-restricted effects made unconditional |

## Comparison worksheet

For each candidate spell, select two native rows of the same grade and role. Record:

| Axis | Candidate | Reference A | Reference B |
| --- | --- | --- | --- |
| Effective damage / AP | After build and resistance | Same calculation | Same calculation |
| Range and LoS | Actual constraints | Actual constraints | Actual constraints |
| Area / targets | 1, 2, 4 victims | Same scenarios | Same scenarios |
| Reliability | Variance, failure, critical | Full branches | Full branches |
| Utility | Heal, push, boost, removal | Value and limits | Value and limits |
| Uptime | Five-turn legal sequence | Same AP budget | Same AP budget |
| Exposure | Opponent's counterattack | Same map | Same map |

Record a conclusion in plain language: “Less damage than A, but safer range and enemy-only area; reduce damage or increase cooldown.” A single ratio is insufficient.

When comparisons use different stats, equipment, turn horizons, or target positions, state that limitation. Spell definitions alone cannot establish how competent human players will use them.


## Enforced runtime budgets (version 1)

The editor, ZIP importer and combat admission share `src/engine/spellBalance.js`: 100 points per spell and 650 per kit, including synergy and cooldown rotation. See the runtime ZIP rules for exact formulas and the repository `docs/spell-balance.md` for rationale. `node scripts/audit_spell_budgets.cjs` audits all 264 class grade-six entries. Native class/common spells retain their exact mechanics and spend at most 100 points in a custom kit; this exception never applies to edited copies or monster spells. New authored criticals must preserve every normal effect, element, area and recipient, with nondecreasing values/duration. Existing out-of-budget saves remain editable, with an explicit repair proposal.

## Equipment controls

Use [equipment-rules.md](equipment-rules.md) when selecting a comparison build or designing themed items. Each custom item is limited to 100 points normalized by its family and required level; outfits with custom items are limited to 1650, excluding Dofus, to accommodate optimized gear with legal exos. Exact family/level caps are in `equipment-limits.json`. A weapon remains an offensive outlet for the class's boosts, even if the spellbook contains no attacks. Spell and equipment scores are independent gates; competitive comparisons still require matched builds and combat tests. Equipment is created separately in the UI, not imported by the class ZIP.
