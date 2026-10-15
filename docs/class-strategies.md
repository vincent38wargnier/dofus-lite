# Dofus Retro (1.29) class strategies — reference for the bot

Built 2026-10-13 from French Dofus Retro sources (129dofus wiki for 1.29 numbers/formulas;
guidactik / millenium / breakflip / gamosaurus for roles & meta), cross-checked to exclude
modern Dofus 2.x spells. Companion to [docs/value-search-audit.md](value-search-audit.md).

## Why this doc exists (the one bot-actionable principle)

The in-game champion is the **search calculator** (`src/bots/searchBrain.js`, bench
`scripts/rl/search_bot.cjs`): it enumerates the turn, simulates the opponent's reply ~2–3
turns deep, and scores leaves with a 4-term hand judge (HP diff, threat diff, ±lethal).
The learned value net reached only *parity* with that judge and never beat it (V3/V4/V5), so
the judge is the champion and ML at the leaf seat is closed.

The calculator's **only systematic weakness is the search horizon**. A mirror-vs-maison sweep
(l100, budget 2000) showed it cleanly:

| Class | vs maison | Why |
|---|---|---|
| **FECA** | **16/16 (100%)** | mitigation + glyphs pay off *inside* the 2–3-turn rollout |
| IOP | 13/16 (81%) | win-condition is **inside** the horizon |
| SRAM | 13/16 (81%) | burst-on-reveal lands inside the horizon |
| OSAMODAS | 13/16 (81%) | the summon fights inside the horizon |
| ENIRIPSA | 11/16 (69%) | attrition mirror → long games, small edge |
| **SACRIEUR** | **6/16 (38%)** | châtiment payoff is beyond-horizon AND conditional |
| XELOR | 2W-2L, running | PA-removal payoff is on the opponent's future turns |

**The rule (v2 — corrected by measurement):** the first draft of this doc predicted "any
beyond-horizon kit underperforms". **FECA refuted that at 16/16.** The real blind spot is
narrower — a class fails only when its signature payoff is **all three** of:
1. **beyond the horizon** (lands >2–3 turns out), AND
2. **conditional on the opponent's choices** (pays only *if* they hit you / move there), AND
3. **anti-correlated with the judge's HP term** (the stance/low-HP state the judge penalizes
   is exactly what powers the class).
Féca escapes because armour mitigation shows up in the simulated HP exchange and glyphs
trigger on the opponent's *very next* turn — both inside the rollout. Sacrieur hits all three.

So every class below is tagged with a **payoff timing** per signature spell and a **bot
verdict**:

- **STRONG** — win-condition inside horizon; calculator already ~81%, no work needed.
- **FIXABLE GAP** — beyond-horizon win-condition the judge misses; add a targeted judge term
  (gated so it can't regress the STRONG classes — the judge is shared).
- **STRUCTURAL 1v1 LIMIT** — the class's win-condition doesn't exist in a 1v1 mirror (team-only
  value, or pure attrition that stalls to draws). Not a bot bug; routing/mode decision.

---

## Per-class reference

Each entry: role · element · dommage-vs-poussé · kite/chase · **signature spells with payoff
timing** · **bot verdict**.

### IOP — melee bruiser  ·  Feu/Intelligence  ·  dommage  ·  chases
Simplest class. **Puissance** (+% dmg) and **Bond** (gap-closer) are **IMMEDIATE** — cast then
hit the same turn. Signature **Tempête de Puissance** (feu AoE, 3×/turn at 9 PA). Only
**Vitalité** is mildly beyond-horizon (defensive). **Verdict: STRONG** — everything is
in-horizon; the 81% is expected and needs nothing.

### CRA (Crâ) — ranged kiter  ·  Feu/Int (power) or Air/Agi (mobility)  ·  dommage + poussé  ·  kites
Attacks and buffs (**Tir Puissant**, **Maîtrise de l'Arc** 2 turns) are **IMMEDIATE**. Kiting
tools are **BEYOND-HORIZON**: **Œil de Taupe** (−6 range to target, 3 turns), **Flèche
Cinglante** (−PM) — they buy tempo on the opponent's *future* turns. Push (**Flèche de Recul**)
is both damage-now and kite-setup. **Verdict: STRONG** (the project's home matchup). Minor
latent gap: the judge under-values −range/−PM kiting setups, but the immediate arrow damage
carries it.

### SRAM — trap/invisibility assassin  ·  Terre/Force (burst) or Air/Agi  ·  dommage (+poussé secondary)  ·  hybrid, sets the board
Core rule (verbatim-sourced): **direct damage breaks invisibility; non-damaging actions
(traps, poison, moving) keep it.** So the loop is *go invisible → set traps/poison over 1–2
turns → reappear by bursting* (**Attaque Mortelle**, scales with Force + crit). Traps, poison,
**Double** are **BEYOND-HORIZON** (trigger on the opponent's later movement). **Verdict:
STRONG** (81%) — the burst is the win-condition and it lands inside the horizon; the 1–2 turn
invisibility setup also fits. Watch item: traps laid for *much* later aren't valued.

### SACRIEUR — berserker who wants to be hit  ·  Eau/Chance + heavy Vitalité  ·  dommage + positioning  ·  melee (pulls enemy to him)
Class passive: **1 Vitalité = 2 PV**. The 5 **châtiments** (stances) are **BEYOND-HORIZON AND
conditional**: after casting, he gains the stat *each time he's hit* over the following turns —
**zero payoff the turn you cast if nobody hits you**. The designer's trade-off is real and
sourced: **Furie** is a self-driven damage ramp over 3 turns that does *not* need to be hit —
so *if you expect the opponent won't hit you this turn, skip châtiment and pump Furie.*
**Attirance/Transposition/Projection** (pull/swap/push) are IMMEDIATE positioning.
**Verdict: FIXABLE GAP** — measured 38% at l100. The judge sees 0 value in a châtiment cast
(no immediate damage) and the search can't see the opponent's future hits that pay it off; it
also *penalizes* the low HP that powers punishment. This is the one class that most needs a
judge term, and the engine does store it (`fighter.effects[].kind==='punishment'`, `gained`).
**Level nuance (Vincent):** Sacrieur is strongest at *low* level, where its outsized HP pool
(1 Vita = 2 PV + class HP) is a game changer by itself. The 38% was measured at l100 only —
how the gap moves with level is **not verified**; a low-level and l200 mirror would show it.

### FECA (Féca) — protection/zone tank  ·  Feu/Intelligence  ·  dommage (zones)  ·  semi-kiting controller
The mirror image of IOP: **almost everything is BEYOND-HORIZON**. **Armures** (4 elements) and
**Bouclier Féca** reduce damage on hits that land *after* the cast; **Glyphes** damage the enemy
when it *starts its turn* on them (opponent's next turn); **Immunité / Renvoi de Sorts** pay
off only if the opponent attacks afterward. Only **Téléportation** and direct attacks are
IMMEDIATE. **Verdict: STRONG — measured 16/16 (100%), the sweep's best score, refuting this
doc's own "FIXABLE GAP" prediction.** Why the prediction was wrong: armures/Bouclier change the
*simulated HP exchange* the judge already scores (mitigation is visible in rollouts), and
glyphs fire on the opponent's *next* turn — inside the horizon. Unlike SACRIEUR, Féca's payoff
is unconditional (armour works whether or not the enemy commits) and never anti-HP.

### XELOR (Xélor) — PA-removal / time controller  ·  Feu/Intelligence  ·  dommage + retrait PA  ·  pure kiter
Fire spells **Sablier** and **Poussière Temporelle** do damage *and* remove PA; **Ralentissement**
is dedicated PA-removal. The damage is immediate but the **control payoff is BEYOND-HORIZON**:
a PA-starved opponent can't act on *their* next turn. High mobility (**Fuite**, **Téléportation**,
**Cadran** to block LoS). **Momification** (5 turns: less dmg taken, more dealt, immune to
PA-removal) is beyond-horizon. **Verdict: open — 2W-2L at 4/16 games, validation still
running.** The hypothesis ("the judge doesn't value *the enemy skips its turn*") stays a
prediction until the run lands; note it passes tests 1–2 of the rule but not 3 (PA-removal
isn't anti-HP), so mid-pack is plausible.

### ENUTROF — PM/range-denial zoner  ·  Eau/Chance  ·  dommage + control  ·  zoner (doesn't kite on foot)
Removes the *enemy's* ability to move/reach: **Maladresse** (−PM), **Clé Réductrice** (−range,
3 turns), **Pelle du Jugement** (−PM on hit). **Corruption** = neutralize an enemy turn
(Pacifiste **+ Invulnérable**, so a pure stall, not a burst setup). Summons (**Sac/Pelle/Coffre
Animé**) body-block. All denial is **BEYOND-HORIZON** (cripples the opponent's future turns).
*Correction to the brief: Enutrof does NOT reduce resistance in 1.29 — that's modern 2.x.*
**Verdict: likely FIXABLE GAP / partial** — similar horizon issue to Xélor, but the water-shovel
damage is immediate so it may land mid-pack. Needs a baseline run.

### SADIDA — controller / debuffer / poison-turtle  ·  Terre/Force (or flat-dmg poison)  ·  dommage  ·  kites, denies space
Few direct hits, best dispel in the game (**Ronce Insolente**). Dolls summoned directly:
**La Folle** (−PA), **La Bloqueuse** (blocks), **La Sacrifiée** (grows each turn), **La
Surpuissante** (−PM + spawns more). **Arbre** blocks LoS. Dolls and **poisons** (Tremblement,
Vent Empoisonné) are **BEYOND-HORIZON** (recurring/accreting value); direct ronces + dispel are
IMMEDIATE. **Verdict: likely FIXABLE GAP + partial STRUCTURAL** — its control/debuff shines in
team play; 1v1 it's a horizon-dependent attrition class. Earlier diagnostic had SADIDA ~15%
even for maison → partly structural. Needs a baseline run with the net-summon path.

### OSAMODAS — summoner, buffs the summon  ·  Feu/Intelligence  ·  dommage  ·  stays back behind its army
Win-condition = field a tanky summon then **compound its output**: **Piqûre Motivante** (+PA to
summon), **Crocs du Mulou** (+power), **Déplacement Félin** (+PM), **Soin Animal** (heal),
**Bénédiction Animale** (more summons). The summon + boosts are **BEYOND-HORIZON compounding**.
**Verdict: STRONG** (81%!) — and this is the key nuance: the summon *fights inside the horizon*,
so the search sees its value even though the judge is blind to the boost loop. The boost-the-
summon optimization is latent headroom, not a loss.

### PANDAWA — team positioner & resistance-breaker  ·  Terre/Force or Feu/Int  ·  **dommage poussé (the archetype)**  ·  manipulator
THE push-damage class: **Karcham** (carry) + **Chamrak** (throw) hurl enemies into walls/other
fighters for collision damage; **vulnérabilité** spells strip enemy resistance. Signature
mechanic confirmed. **Verdict: STRUCTURAL 1v1 LIMIT** — its value is *team-realized*:
vulnérabilité and placement produce nothing on the caster's own scoreboard (the payoff is
*allies* hitting harder). This explains the earlier diagnostic (PANDAWA ~18% even for maison in
1v1). Not a bot bug — its win-condition is absent from a 1v1 mirror. Best addressed by team
modes, not a judge term.

### ECAFLIP — gambler  ·  Terre/Force  ·  dommage  ·  chaser/bruiser
~Half the kit is a literal 50/50 (Bluff, Esprit Félin self-hit, Rekop fail, Pile ou Face can
heal the enemy). Base crit only 2% (1/50), hard cap 50%. **Roue de la Fortune** (+100% dmg
2 turns) is the one reliable amp and is **BEYOND-HORIZON** (buff → burst next turns).
**Verdict: STRONG (expected)** — Terre burst is immediate; the search handles variance by
averaging over dice samples (CRN), which is exactly how our bench already evaluates. The
anti-self/anti-team RNG spells (Roulette, Tout ou Rien) should be *avoided*, which a
simulating judge does automatically (it sees the bad outcomes in rollouts).

### ENIRIPSA — healer/attritionist  ·  Feu/Intelligence  ·  **not a damage class in 1.29**  ·  kiter
*Correction to the brief: the Eniripsa does NOT hit hard in 1.29 — "heal + hit" is the modern
rework.* Win-condition is **attrition**: **Mot Stimulant** (+2 PA, 5 turns — the best PA boost
in 1.29), **Mot de Régénération** (HoT, stack for "God Mode"), **Mot de Prévention** (shield).
All **BEYOND-HORIZON**. Damage (Mot Interdit/Blessant/Vampirique) is among the weakest in the
game. **Verdict: STRUCTURAL 1v1 LIMIT (partial)** — a healer mirror stalls to long games/draws
(seen: slow, near-parity). Its support kit is team-realized. Judge term for +PA/shield value
could help the mixed matchups but won't make a mirror decisive.

---

## Cross-cutting mechanics (1.29, sourced)

### Elements — each tied to one stat (+1% elemental dmg/pt), chosen for the side-benefit too
| Element / stat | Side-benefit | Favored by |
|---|---|---|
| Terre / Force | +5 Pods/pt (carry) | Iop, Sacrieur(alt), Ecaflip, Sadida, Pandawa, Cra(power) |
| Feu / Intelligence | +1% soin/pt, +réductions | Eniripsa, Osamodas, Féca, Xélor, Cra(fire), Sadida |
| Eau / Chance | +1 Prospection/10pt (drop) | Enutrof, Sacrieur, Sram(alt) |
| Air / Agilité | esquive/tacle/fuite + crit + initiative | Cra(kite), Sram, lockers |
Per-class soft caps + single-element 50% resist cap → Retro rewards **mono-element** builds.

### Dommage poussé (push damage) — exact 1.29 formula
`push_damage = (8 + 1d8 × level/50) × blocked_cells` — scales with the **pusher's level** and the
**number of cells the target couldn't travel** (blocked by wall / obstacle / another fighter),
**NOT** with element or damage stats (it's static — unbuffable). Into another fighter: ÷2. In
open terrain with nothing to collide with: **0 damage** (pure positioning). Leveraged by
PANDAWA (archetype), CRA (Flèche de Recul), SRAM (push into traps), SACRIEUR, ECAFLIP (Destin on
crit). Beats raw damage vs high-resist/high-HP targets, in corners/walls, and for push-into-trap
combos. **Bot note:** the engine already computes collision damage in simulation, so the search
*sees* push damage when a wall/fighter is behind the target — this is in-horizon and handled.

### The lockdown meta — Sagesse, tacle/fuite, retrait PA/PM
- **Sagesse**: +1% resist to PA-removal AND PM-removal per 4 pts (cap 200%@800), and raises your
  *own* chance to strip PA/PM. The two-way stat of the PA/PM war.
- **Retrait PA/PM**: "Perd X (resistable)" can be dodged via Sagesse; "−X (certain)" always lands.
  Certain-strip spells: Ecaflip Odorat/Griffe de Ceangal, Sadida Puissance Sylvestre, Cra Flèche
  Cinglante, Enutrof Déterrage, Xélor Brume.
- **Tacle/fuite**: Agilité-based dodge when leaving a cell adjacent to an enemy; fail = lose all
  PM + PA proportional to the dodge%. High Agi = flee freely AND lock enemies.
- **Meta loop**: lock (Agi) + strip PA/PM (Sagesse + Xélor/Enutrof) → enemy can't act or reach →
  Iop/Cra burst → Eni heals/shields. **All of this is beyond-horizon** — the central reason a
  3-turn-horizon judge under-rates control classes.

### Team compositions (3v3)
Roles: DPT/burst (Iop, Cra), heal/support (Eniripsa), tank (Féca, Sacrieur), entraveur (Xélor
retrait-PA, Enutrof retrait-PM, Pandawa placement+vuln). Team config flips individual play:
Ecaflip drops its defensive RNG and pure-bursts (Eni covers sustain, +2 PA chains spells); Eni
flips from self-sustain to protecting the carry. Several classes (Pandawa, Eniripsa, Sadida,
Enutrof) are **far stronger in team than 1v1** — relevant to which modes the bot is judged in.

---

## What this means for the bot — improvement map

1. **STRONG, no work** (payoff visible to the rollout): **FECA (16/16 measured)**, IOP, SRAM,
   OSAMODAS (13/16 each, measured), CRA, ECAFLIP (expected). Ship as-is (Stratège already
   reads the kit from the view).
2. **FIXABLE GAP** (add a *gated, mechanic-conditional* judge term — must not regress group 1):
   - **SACRIEUR** (6/16 measured): reward active châtiment stances + furie-vs-châtiment timing
     (value a châtiment when the opponent is likely to hit next; engine stores
     `effects[].punishment`). Make the term level-aware — the class's HP edge peaks at low level.
   - **XELOR / ENUTROF** (XELOR run pending): value enemy PA/PM/range denial (the opponent
     loses a future turn) — *if* the final numbers confirm the gap.
   The confirmed gap category is narrower than first thought: beyond-horizon **+ conditional
   + anti-HP** (see rule v2). FECA needed nothing.
3. **STRUCTURAL 1v1 LIMIT** (not a bot bug): PANDAWA (team-only vuln/placement), ENIRIPSA
   (attrition mirror stalls), partly SADIDA. Addressed by team modes, not judge terms.

Honest caveat: group-2 judge terms re-introduce the per-class hand-tuning treadmill maison
already walks. maison *has* these rules (it scores 54 effect kinds) and wins the SACRIEUR mirror
62–38. So the cheapest "control any class well" answer may be **per-class routing** (use maison
where it's stronger, the calculator elsewhere), with judge terms added only where neither wins.

## Sources
129dofus wiki (1.29 numbers/formulas): https://129dofus.fandom.com/wiki/ (Class, Characteristic,
Damage, Dodging, AP_and_MP_loss, per-spell pages). Community guides: guidactik.com/dofus-retro/,
millenium.org (Dofus Rétro guides), breakflip.com/guides/, gamosaurus.com. Spell-identity
mechanics: dofus.jeuxonline.info. Modern-2.x spells (Flamiche, transformation whips, modern
châtiments, heal-type Mot de Jouvence) excluded as non-1.29.
