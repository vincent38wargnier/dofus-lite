# Winterfell — Le Dernier Rempart

A playable fan adaptation of the battle of Winterfell: six supplied heroes defend a barricaded courtyard against the Night King and 31 undead. Defeating the Night King kills the surviving army. It is a turn-based encounter, not a real-time battle or a frame-for-frame reconstruction of the television episode.

## Play

Import `public/adventures/winterfell-last-stand.zip` in **Atelier → Importer un ZIP**, then **Jouer l’aventure**. Local browser storage retains the imported room, equipped heroes, spells, original artwork, geometry and objective. No existing custom content is required. The separate `winterfell-last-stand-creator.zip` also adds the six characters and 48 items to editable libraries.

| Content | Included |
|---|---|
| Map | Original 32×32 flat isometric courtyard, 1,024 cells |
| Heroes | Jon, Arya, Melisandre, Brienne, Jaime, Tormund |
| Enemies | Night King, 3 White Walkers, 8 archers, 16 wights, 4 hounds |
| Equipment | 48 fixed-roll authored items, embedded in hero loadouts |
| Images | 51 PNGs, including background, props, icons and character views |
| Effects | Original vector spell effects and synthesized audio |
| Camera | Fit–400% zoom, wheel, drag, touch pinch, active-fighter centring |
| Victory | Kill Night King; surviving army collapses immediately |

Characters use three-view original PNG artwork with procedural movement/casting motion; no six-frame authored walking strips are claimed. Existing original Winterfell artwork is reused for Jon, Arya, Melisandre and the four enemy families. New artwork supplies Brienne, Jaime, Tormund, the Night King and the battlefield. `sources/` preserves generated masters; canvas scripts only crop, resize and anchor them.

Combat rules and numerical monster/item references come from the existing engine. No Dofus scenery, character art, native spell animation or native audio is used for this encounter. Painted boundary scenery is outside the playable grid; the explicitly placed pillars and barricades define collisions. Brazier props are decorative movement blockers, not damage-over-time hazards.

## Build and verify

Run from the repository root:

```bash
node examples/winterfell-last-stand/build.cjs
node examples/winterfell-last-stand/verify.cjs
node skills/retro-class-designer/scripts/validate.cjs package public/adventures/winterfell-last-stand.zip
npm run build
node examples/winterfell-last-stand/browser-proof.cjs
```

Building the PNGs uses installed Chrome and `puppeteer-core`; `--skip-art` rebuilds only packages and reports. Simulations can use `ARMY_SEEDS=25101,25102`. The validator itself remains portable, without Chrome, npm or repository dependencies.

Reports are in `public/adventures/winterfell-last-stand/`: numerical `balance-report.json`, portable `validation.json`, seeded `combat-report.json`, and browser `proof/report.json`. Browser proofs use a fresh isolated Chrome profile and never modify the user's saves. They cover import, desktop/mobile fitting, zoom, drag, touch pinch, a real zoomed cell click, spell casting, reload, AI combat, re-export and all 51 images.

## Army format

This uses `atelier.json`, with `encounter: { version: 1, mode: "army", commander: 0 }`. Commander zero is the first member row and has quantity one. Ordinary rooms retain an eight-enemy maximum; the explicit army mode permits 32, with at most eight allies. Custom maps support 5–40 cells per side. All spell, equipment and character budgets remain enforced.

See `docs/original-battlefields.md` for the full contract. The legacy `content.json` room format still permits eight enemies. The authoring kit contains the current validator and the army contract.

The four initial simulations won in 11–16 rounds without illegal actions or engine errors. That is reproducible local testing, not a promise of competitive balance or universal device/network performance. Hitting the turn limit does not count as conquering the room. The optional challenge is to keep every hero alive.
