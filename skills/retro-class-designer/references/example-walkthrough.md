# Example: Ember Warden

This is a complete **technical authoring example**, with ten new spell definitions. It is not a finished themed character and has not been calibrated against the twelve original classes. The mannequin sheets and repeated geometric icon are placeholders for final art.

Its identity is medium-range fire pressure. It can push and escape briefly, but has no alternate damage element, no summons, no AP denial and only a small, limited heal. Its single-element resistance buff deliberately leaves the other elements exposed.

## Spellbook

| Spell | AP | Range | Effect | Main limit |
| --- | ---: | --- | --- | --- |
| Cinder Shard | 4 | 1–7 | 18–22 fire | 2 per target, 3 per turn |
| Hearth Strike | 4 | 1–2 | 24–28 fire | Requires close exposure |
| Crossfire | 4 | 1–5 | 12–16 fire, cross radius 1 | 1 per turn; friendly fire |
| Flare Lance | 4 | 3–8 | 22–26 fire | Line only; 1 per target |
| Heat Focus | 3 | Self | +60 power, 2 turns | Cooldown 4 |
| Ember Wake | 3 | 1–3 | 6–8 fire, then push 2 | Line only; 1 per turn |
| Cauterize | 4 | 0–3 | 10–14 base healing | Cooldown 3 |
| Ash Step | 4 | 1–3 | Teleport, no LoS | Empty cell; cooldown 3 |
| Ember Ward | 3 | Self | +10% fire resistance, 2 turns | Cooldown 4 |
| Last Flare | 5 | 1–4 | 32–36 fire | Cooldown 3 |

All other attacks require line of sight and have non-adjustable range. The example disables criticals and critical failures to make its first mechanical review simple; the schema supports both. Last Flare's 6.8 mean base damage/AP exceeds the validator's conservative ranged starting value of 6, so the validator correctly requests review. Its cooldown is a possible justification to evaluate, not an automatic waiver.

## Three legal choices

These illustrative rolls fix each damage effect at its midpoint, with 600 intelligence, +30 flat damage, 0 resistance and no other effects. They are not exact expected values over random rolls and are not win-rate predictions. AP left can be useful; it need not always be spent.

| Situation | Sequence | AP | Result / tradeoff |
| --- | --- | ---: | --- |
| Need damage immediately; target 4 cells away in line | Cinder Shard → Cinder Shard → Flare Lance | 12 | 170 + 170 + 198 = 538 damage |
| Invest for subsequent attacks; same target position | Heat Focus → Cinder Shard → Cinder Shard | 11 | 182 + 182 = 364 damage; +60 power remains for the next window |
| Under pressure; self is injured, empty escape cell exists | Cauterize on self → Ash Step | 8 | 84 healing, escape up to 3 cells; 4 AP remain, two tools enter cooldown |

At 10 AP, two Shards cost 8; Focus plus one Shard costs 7; Cauterize plus Ash Step costs 8. At 15 AP, Focus plus two Shards plus Flare Lance costs 15 and produces 182 + 182 + 212 = 576 at those same fixed rolls. Extra AP does not remove the two-per-target cap on Shard. The equipped weapon creates additional choices and must be included in real balance testing.

The boost is intentionally not always correct. It loses immediate output when it displaces an attack. Its value depends on remaining AP, future target access, weapon/spell choice, and whether the opponent can deny the boosted turn.

## Interaction and counterplay notes

| Pair | Intended interaction | Counterplay / risk |
| --- | --- | --- |
| Focus → attack | Bonus applies during the same turn | Break line of sight or force recovery actions |
| Wake → Lance | Push may create the minimum range | A failed displacement or different alignment can invalidate the follow-up |
| Crossfire → group | Multiple victims improve total value | Spread out; friendly fighters can make the shot expensive |
| Step → Shard | Reposition to establish a legal shot | Teleport and attack cost 8 AP; escape is then unavailable |
| Ward → fire opponent | Briefly reduce incoming fire | Other damage elements ignore this protection |
| Cauterize → offense | Recover while retaining some AP | Healing is modest and cannot be spammed |

There is no hidden mark, charge, extra summon, passive stat bonus or free common spell. Every effect is in the manifest. Future authors should replace names, art and values deliberately; copying the theme while adding an undocumented passive breaks the contract.

## Verified versus untested

| Status | Evidence |
| --- | --- |
| Manifest / archive | Schema, semantic checks, deterministic ZIP round-trip |
| Images | Nine sheets plus ten icons; dimensions, PNG decoding, visibility and transparency |
| Engine compatibility | All ten spells executed successfully in the real engine |
| Core restrictions | AP, target cap, range, LoS, cooldown, immediate boost and expiration tested |
| Area behavior | Empty-center cast, five-cell cross, friendly fire and damage coefficient tested |
| Balance | **Untested** against the full matchup/build/map matrix |
| Presentation in game | ZIP importer and custom icon/FX bindings still require implementation |

Reproduce the repository checks with `node --test scripts/test_class_authoring_kit.cjs`. Validate the portable package with `node scripts/class-kit.cjs validate assets/example-class.zip` from this skill directory.
