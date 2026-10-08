# 🏟️ Dofus Koliséum

**L'arène de bots tactique inspirée de Dofus.** Au lieu de jouer vous-même, vous programmez
la logique de combat de votre champion — puis vous l'envoyez affronter les bots des autres.
Le meilleur code gagne.

## Lancer le projet

```bash
yarn install
yarn start        # http://localhost:3000
yarn test         # suite de tests (moteur, sandbox anti-boucle, mode Jouer)
yarn build        # build de production
```

## Ce qu'on y fait

- **⚔️ Arène** — opposez deux bots (intégrés ou les vôtres), choisissez classes, carte et seed,
  puis regardez le replay animé coup par coup (vitesse réglable, timeline scrubbable).
- **🎮 Jouer** — affrontez un bot vous-même : cases vertes pour bouger, sort puis case rouge
  pour lancer, chrono de tour 30 s. Vos invocations sont autonomes, comme en 1.29.
- **🤖 Éditeur** — écrivez votre bot en JavaScript (`decide(view, api)`), vérifiez-le,
  faites-le sparrer en 6 matchs contre un bot intégré, sauvegardez-le (localStorage).
- **🏆 Tournoi** — round-robin entre tous les bots sélectionnés, classement aux points,
  chaque match rejouable dans l'arène.
- **📜 Règles & API** — les mécaniques et la référence complète de l'API des bots.

## L'IA Maison — la référence à battre

Le bot **🏛️ IA Maison** joue chaque classe avec un jeu de poids réglé **par matchup**
(un Iop ne joue pas contre un Cra comme contre un Sacrieur). Le cerveau
(`src/bots/utilityBrain.js`) évalue toutes les actions — sorts × cibles avec zones réelles,
déplacements avec lookahead « quelle case débloque quel sort », menace par chemin BFS,
détection d'enchaînements létaux — et les 144 vecteurs de poids sont réglés par
**CEM (cross-entropy method) en auto-jeu massif** (`src/tuning/`, plusieurs centaines de
milliers de combats headless en parallèle). Votre bot peut réutiliser tout ça :
`api.suggest(poids)`, `api.maison()`, `api.maisonWeights()`.

Un bot en boucle infinie ne gèle jamais un match : le code est instrumenté à la
compilation (budget d'itérations par `decide()`), l'arbitre passe son tour et le combat
se termine toujours.

**Comment chaque classe apprend, et comment ré-entraîner après un changement de sort
ou de caractéristiques → [`src/tuning/README.md`](src/tuning/README.md).**

## Mécaniques de combat — les vraies formules 1.29

Les sorts sont extraits de la **vraie base de données du jeu** (table `sorts` de
l'émulateur AncestraRemake, 1 882 sorts) et les formules recoupées dans le code de
4 émulateurs (AncestraRemake, CodeBreak, GDCore, Shivas) :

| Mécanique | Implémentation (authentique 1.29) |
|-----------|----------------|
| PA / PM | 8 PA, 4 PM (niveau 100 équipé) ; 1 PM = 1 case |
| Éléments | terre/neutre→force, feu→intelligence, eau→chance, air→agilité ; `jet × (100+carac+puissance)/100` puis résistances |
| Critiques | `max(2, floor(taux × 2.9901 / ln(agi+12)))` — vraies lignes d'effets critiques |
| Échecs critiques | 1/100 : PA dépensés, aucun effet, certains sorts terminent le tour |
| Tacle / fuite | jet : `floor(300×(agi+25)/(agi+agiEnnemis+50))−100` borné [10,90] ; échec = move annulé, PM à 0, −chance% des PA |
| Esquive PA/PM | sagesse/4 ; par point `ceil((esqA/esqD)×(restants/max)×50)%` |
| Poussée | dégâts bruts `floor((1d8+8) × niveau/50 × cases bloquées)` |
| Érosion PvP | chaque coup ronge `dégâts/10` PV max — l'anti-tortue |
| Initiative | `(vitalité/4 + caracs) × ratio de vie`, sans jet |
| Zones | cercle, croix, ligne (Ralentissante est une vraie zone cercle −2 PA) |
| Fin | K.O., ou après 40 tours : % PV **sur les PV max d'origine** |

Régénérer les sorts depuis le dump : `python3 scripts/extract_spells.py generate`.

## Architecture

```
src/
├── engine/            # moteur PUR (aucune dépendance React)
│   ├── engine.js      #   createGame / applyAction / validateAction / getView
│   ├── classes.js     #   les 3 classes et leurs sorts (data-driven)
│   ├── maps.js        #   cartes et obstacles
│   ├── geometry.js    #   distances, lignes de vue (supercover)
│   ├── pathfinding.js #   BFS, cases atteignables
│   └── rng.js         #   PRNG seedé → matchs 100% reproductibles
├── bots/
│   ├── api.js         #   l'api donnée aux bots (validation = celle de l'arbitre)
│   ├── compile.js     #   code utilisateur → decide()
│   └── builtins.js    #   Brutus, Plume, Toubib, Pantin (exemples vivants)
├── arena/
│   ├── runner.js      #   l'arbitre : budget d'actions, erreurs, frames de replay
│   └── tournament.js  #   round-robin, classement
└── ui/                # React : Arène, Éditeur, Tournoi, Docs
```

## Vraies cartes Dofus (import OblivionRetro)

Cinq cartes du vrai jeu (Territoire des Dopeuls, Amakna, Brâkmar, Bonta, Île des
Wabbits) sont décodées depuis l'émulateur `OblivionRetro/` — format MapData 1.29 :
10 caractères par cellule, alphabet 6 bits, flags actif / marchable / ligne de vue,
coordonnées en losange où le combat est exactement du Manhattan 4-directions.

```bash
python3 scripts/import_dofus_maps.py report            # classer les 7 770 cartes
python3 scripts/import_dofus_maps.py show 5383         # aperçu ASCII
python3 scripts/import_dofus_maps.py generate 5383 …   # régénérer src/engine/dofusMaps.js
```

**Le principe clé** : le moteur est une fonction pure `(état, action) → nouvel état`.
Les bots reçoivent une **copie** de l'état et leurs actions passent par la **même
validation** qu'un joueur humain — impossible de tricher. Chaque match est déterministe
à partir de son seed, donc rejouable à l'identique.

## Écrire un bot en 30 secondes

```js
function decide(view, api) {
  // Taper si possible…
  for (const s of view.you.spells) {
    if (api.canCast(s.key, view.enemy.pos).ok) {
      return api.cast(s.key, view.enemy.pos);
    }
  }
  // …sinon avancer, sinon finir le tour.
  return api.moveToward(view.enemy.pos) || api.endTurn();
}
```

L'onglet **Règles & API** documente `view` et `api` en détail (ligne de vue, tacle,
`castTargets`, `moveAway`, aléa déterministe…).
