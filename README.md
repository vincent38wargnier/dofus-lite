# 🏟️ Dofus Koliséum

**Une arène tactique locale inspirée de Dofus Retro.** Préparez votre personnage,
enregistrez vos stuffs et jouez contre un bot. Les outils de programmation,
de simulation et de tournoi restent accessibles dans le menu **Outils**.

## Lancer le projet

```bash
yarn install
yarn start        # http://localhost:3000
yarn test         # suite de tests (moteur, sandbox anti-boucle, mode Jouer)
yarn build        # build de production
```

## Préparer son personnage

L’accueil **Jouer** présente trois panneaux, accessibles dans n’importe quel ordre :

| Panneau | Réglages |
|---|---|
| Personnage | 12 classes illustrées, niveau, apparence et répartition manuelle des caractéristiques |
| Stuff et sorts | Équipements autour du personnage, catalogue, comparaison, caractéristiques détaillées et barre de sorts |
| Combat | Aperçu du terrain, galerie des 21 cartes, classe et comportement de l’adversaire |

Le bouton **Jouer** utilise la préparation courante. Les erreurs d’équipement
bloquent le lancement et donnent accès au combattant concerné. L’équipement
adverse se modifie depuis **Combat → Modifier son équipement**.

**Mes stuffs** conserve les variantes nommées, y compris l’apparence, les jets,
les caractéristiques et les sorts. Les brouillons restent propres à chaque classe
et combattant. Le choix de classe, d’adversaire et de carte est également mémorisé
dans ce navigateur. Les anciennes sauvegardes de stuffs restent compatibles.

Les flèches du clavier permettent de changer d’onglet de préparation. La galerie
des cartes conserve le focus et se ferme avec **Échap**. Sur téléphone, le bouton
de combat reste au bas de l’écran. Les réglages des bruitages sont dans **Son**.

```bash
yarn proof:setup     # parcours navigateur, sauvegardes, carte, combat, clavier et 4 largeurs
yarn proof:loadouts  # bibliothèque, variantes, annulations et équipement utilisé en combat
```

## Habillage du client Retro installé localement

Le jeu utilise maintenant les bibliothèques Flash de votre installation locale
pour les personnages, leurs animations, les portraits, les icônes et effets de
sorts et les décors de dix-huit cartes décodées. Ruffle est installé avec le
projet et servi localement : aucun CDN ni compte Ankama n’est requis pour jouer.

```bash
yarn import:client   # importer puis préparer les images ; Python 3 et Chrome requis
yarn import:spells   # catalogue complet et sorts jouables depuis la base locale
yarn import:maps     # 18 cartes du jeu, décodage puis rendu des décors
yarn start          # Jouer, Grimoire ; bibliothèque des personnages dans Outils
```

L’import lit par défaut
`/Applications/Ankama/Retro/Dofus Retro.app/Contents/Resources/app/retroclient`.
Pour une autre installation :

```bash
python3 scripts/import_retro_client.py --client "/chemin/retroclient"
yarn render:client
```

Les fichiers importés et générés sont dans `public/dofus-local/`, ignoré par Git.
Le build local inclut ce dossier. Les scripts d’import ne modifient pas le client
installé et n’accèdent pas au processus du jeu. Sans import, le plateau SVG et
les émojis restent disponibles.

| Élément | Utilisation |
|---|---|
| 12 classes, 24 apparences | Choix masculin/féminin dans Jouer et Arène |
| Bibliothèques de personnages | Clips vectoriels originaux : marche, course, sorts, impacts, mort, émotes |
| Invocations | Apparence associée au `gfxID` du monstre dans la base existante |
| Portraits et icônes | PNG transparents rendus depuis les symboles originaux |
| 18 cartes originales + 3 arènes | Galerie avec aperçus, recherche et choix dans Jouer et Arène |
| Effets de sorts | Timelines originales, grade du sort, positions de départ et d’arrivée |
| Grimoire | 2 141 définitions et 10 686 grades, contraintes, effets normaux/critiques et prévisualisation |
| Audio | 905 enregistrements, 766 noms de sons reliés aux timelines de sorts/personnages, 48 musiques dans Personnages |
| Équipements | 6 419 modèles, 145 panoplies, 2 386 icônes originales ; sélection avant les matchs Jouer et Arène |
| Autres fichiers | Bibliothèque locale conservée dans `raw/`, inventaire dans `inventory.json` |

Il s’agit du moteur Koliséum avec les ressources du client : pas d’une copie
complète du MMO. L’interface générale reste celle du projet. Les quêtes,
l’économie, les serveurs et les règles manquantes ne sont pas fournis par cet
import. Les autres cartes du client restent archivées ; les dix-huit cartes
sélectionnées disposent des données décodées et des graphismes reliés au plateau.
Les accessoires portés sur les personnages, certains paramètres d’effets et les
couleurs personnalisées ne sont pas encore pilotés. La compatibilité d’un clip dépend de
Ruffle ; l’import de la bibliothèque entière ne garantit pas que chaque effet
spécial se comporte exactement comme dans le client complet.

Les bruitages sont activés à 35 % par défaut. Le menu **Son** en haut de l’écran
contient le bouton des bruitages et le curseur de volume. Les sons suivent
les images des animations originales, dans les combats et dans le Grimoire ;
les onglets masqués ne jouent pas de bruitages. Les volumes individuels viennent
des définitions audio du client. Les bibliothèques de projectiles démarrent
leurs clips de vol et d’impact avec un trajet local de 300 ms. Les animations
sans appel audio propre (par exemple Flèche Magique) restent silencieuses ;
la réaction de la cible fournit séparément son bruitage en combat.

L’import audio lit `lang/swf/audio_*.swf`, ou sa copie dans le cache du jeu sur
macOS, puis conserve uniquement cette ressource dans le dossier local ignoré
par Git. Sur une autre machine, fournissez ce fichier explicitement :

```bash
python3 scripts/import_retro_client.py --audio-only --audio-data /chemin/audio_fr_VERSION.swf
```

```bash
yarn test:client
yarn test:combat-data
yarn test:audio
CI=true yarn test --watchAll=false --runInBand
# Avec le serveur local démarré sur 3012 :
yarn proof:client
yarn proof:combat
yarn proof:audio
# Autre port : RETRO_URL=http://127.0.0.1:3000 yarn proof:client
```

L’adaptateur SWF préserve les définitions et les timelines imbriquées, remplace
uniquement la timeline racine des personnages pour choisir les clips exportés,
et fournit les rappels nécessaires aux effets. Le moteur de combat reste
indépendant de Flash. Les durées incluent les clips imbriqués : un effet ne
disparaît plus au bout de la seule image de son conteneur. Chaque couche de
carte est rendue avec un lecteur neuf, après chargement de ses bibliothèques,
et un export entièrement transparent fait échouer l’import. Référence du lecteur :
[API publique de Ruffle](https://ruffle.rs/js-docs/master/index.html).

## Ce qu'on y fait

- **⚔️ Arène** — opposez deux bots (intégrés ou les vôtres), choisissez classes, carte et seed,
  puis regardez le replay animé coup par coup (vitesse réglable, timeline scrubbable).
- **🎮 Jouer** — affrontez un bot vous-même : cases vertes pour bouger, sort puis case rouge
  pour lancer, chrono de tour 30 s. Vos invocations sont autonomes, comme en 1.29.
- **Grimoire** — consultez les sorts de classe et de monstres, leurs six grades lorsqu’ils
  existent et leurs animations. Les mécaniques incomplètes sont signalées.
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

Les poids existants de l’IA Maison n’ont pas été réentraînés après la révision
des règles ci-dessous. La validation et les estimations de dégâts utilisent les
mêmes règles que le moteur ; cela ne garantit pas une stratégie optimale.

**Comment chaque classe apprend, et comment ré-entraîner après un changement de sort
ou de caractéristiques → [`src/tuning/README.md`](src/tuning/README.md).**

## Mécaniques de combat — modèle local, version 4

Les valeurs des sorts proviennent désormais du fichier `spells_fr_1387.swf` du client
Retro installé ; `classes_fr_1391.swf` définit les rosters. Les masques de cible et
les statistiques d’invocation viennent séparément des émulateurs et de corrections
explicites dans `scripts/import_client_spells.py`. Les formules initiales s’appuyaient sur les sources locales d’AncestraRemake,
CodeBreak, GDCore et Shivas. L’audit français ci-dessous les recoupe avec les
notes officielles Ankama de Dofus 1 et des résultats des calculateurs DofuX.
Cela vérifie des règles documentées historiquement, sans garantir une identité
avec le serveur Retro actuel. Aucun journal provenant du serveur officiel n’a
été fourni pour cet audit.

| Mécanique | Comportement du moteur |
|-----------|----------------|
| PA / PM | Jouer / Arène : 7 PA, 3 PM de base au niveau 100, plus équipement et panoplies ; anciens kits sans loadout : 8 PA, 4 PM |
| Éléments | terre/neutre→force, feu→intelligence, eau→chance, air→agilité ; jet, caractéristiques, bonus fixes, résistances fixes puis %, armure |
| Soins | `floor(jet × (100 + intelligence) / 100) + soins` ; les dommages fixes et % ne les augmentent pas |
| Résistances / armures | Résistances % des joueurs plafonnées à 50 ; armures Féca limitées à leurs éléments ; caractéristique d’armure `max(carac élément, (intelligence + carac élément)/2)` |
| Renvoi d’équipement | Renvoi fixe, sans bonus de sagesse ; ne réduit pas les dégâts reçus |
| Critiques | `b = max(2, taux - bonus CC)`, puis `max(2, min(b, floor(b × e × 1.1 / ln(max(0, agi)+12))))` ; vraies lignes d’effets critiques |
| Échecs critiques | 1/100 : PA dépensés, aucun effet, certains sorts terminent le tour |
| Tacle / fuite | `300 × (agiA+25)/(agiA+agiB+50) - 100`, bornée [0,100] ; échec = arrêt sur cette case, PM à 0, perte de `floor(PA × chance / 200)` |
| Esquive PA/PM | Attaque : sagesse/4 ; défense : sagesse/4 + bonus d’esquive ; par point `ceil((attaque/défense)×(restants/max)×50)%`, bornée [10,90] |
| Poussée | dégâts bruts `floor((8 + 1d8 × niveau/50) × cases bloquées)` |
| Érosion PvP | chaque coup ronge `dégâts/10` PV max — l'anti-tortue |
| Initiative | `(force + intelligence + chance + agilité + bonus initiative) × ratio de vie`, arrondie à l’inférieur ; ni sagesse ni vitalité |
| Zones / cibles | Rayon complet du dump, masques alliés/ennemis/lanceur/invocations, cible libre, états requis/interdits |
| Limites de lancer | Limites par tour et par cible distinctes ; l’identité de la cible reste suivie après son déplacement |
| Aléatoire | Un tirage partagé pour les branches exclusives : Bluff eau ou air, remboursement de 1 PA du Xélor à 10 % |
| Effets durables | Bonus/malus, vols de caractéristiques/portée, régénération, poisons, charge de Colère et flèches chargées |
| Pièges / glyphes | Sort lié et grade source ; pièges déclenchés par déplacement/téléportation/poussée, glyphes en début de tour ; pièges adverses masqués dans la vue du bot |
| Vol de vie | Soin calculé sur les PV réellement perdus, sans excédent de dégâts sur une cible presque morte |
| Fin | K.O., ou après 40 tours : % PV **sur les PV max d'origine** |

### Audit des sorts et préparation (2026-10-09)

Le catalogue de joueur comprend **282 sorts et 1 692 grades** : 22 par classe
(20 ordinaires, le Dopeul de niveau 200 et le sort de temple) et **18 sorts communs**.
Le Grimoire affiche tous les grades, les descriptions du client et les limites connues.
Le fichier local `public/dofus-local/spell-audit.json` contient une fiche par sort,
les empreintes SHA-256 des sources, les écarts avec l’ancien SQL, la couverture des
handlers directs/indirects, les sélecteurs reconstruits et les animations disponibles. Les 282 icônes de joueur sont associées via l’index
`i.up` du client (différent de l’ID du sort pour les Pandawas, Dopeuls et sorts
communs), puis rendues depuis leurs SWF originaux.

Avant le match, choisissez le niveau 1–200, les sorts communs appris et le grade
de chaque sort. Faites glisser les raccourcis ou utilisez les flèches pour déplacer
les sorts et l’arme. L’ordre, les grades et les choix sont sauvegardés par camp et
par classe et sont conservés dans le journal exporté. Les points de sorts
supplémentaires sont supposés obtenus par parchemins : préparation libre,
sans progression ni inventaire de parchemins. Les grades 6 communs sont accessibles
au niveau 100 ; ceux des classes suivent les niveaux requis du client. Le réglage
**Auto** choisit cependant le grade **5 avant le niveau 200**, puis **6 au niveau
200**, pour tous les sorts disponibles, communs inclus. Les grades explicitement
choisis restent prioritaires ; « Rétablir les niveaux par défaut » réactive ce
réglage pour tous les sorts sans changer l’ordre ni les sorts communs appris.

| Correction | Effet en combat |
|---|---|
| Piqûre et autres lignes Osamodas | Séparation personnage/invocation ; plus de double application des deux lignes |
| Folie sanguinaire | Réintégration, dégâts fixes et soin selon les PV réellement perdus |
| Châtiments, effet 776 | Érosion supplémentaire, sans multiplication des dégâts directs |
| Sorts de placement | Peur, Double, porter/lancer, Raulebaque, état pesanteur, stabilisation |
| Sorts spéciaux | Poisse, Brokle, Mot Lotof et sa zone en anneau, Retraite, Douleur, Mise en garde, résurrection |
| Protections | Dérobade au contact, Sacrifice, renvois de sorts, Chance d’Ecaflip |
| Invisibilité | Positions adverses masquées dans la vue du joueur/bot ; révélation par attaque/détection |
| Dés et armes | Conservation de la distribution des dés ; maîtrise limitée au type d’arme correspondant |
| Sorts communs | Flamiche, Libération, Cawotte, Foudroiement, Moon, Boomerang, invocations et huit maîtrises |

**Portée de la vérification :** les tests confrontent tous les champs numériques
et payloads des 1 692 grades aux SWF originaux et exécutent chaque grade sur une
cible valide. Des scénarios dédiés vérifient les interactions corrigées. Cela ne
constitue pas une comparaison exhaustive avec les résultats d’un serveur Ankama.
L’audit n’appelle jamais un handler présent une « fidélité officiellement prouvée ».

Les 42 modèles d’invocations utilisent des statistiques serveur communautaires,
qui comportaient des fiches vides. Les remplacements de SunDofus et les
rattachements d’attaques reconstitués sont tracés par grade ; l’IA reste celle du
projet. Les soins particuliers allié/ennemi (Corruption, Pile ou Face, Tout ou rien,
Ronce Apaisante), les renvois et certains calendriers de durée demandent encore
une comparaison avec le serveur officiel. Capture d’âmes et Apprivoisement sont
sélectionnables, mais l’arène n’a ni capture de monstres ni élevage. Les changements
d’apparence des transformations ne sont pas pilotés. Le journal exporté reste
omniscient pour l’audit, même si le plateau masque les positions invisibles.

Le client n’inclut pas les décisions de son serveur : les métadonnées d’animation
restent issues du SQL existant. Certaines lignes n’ont pas d’effet SWF associé ;
le Grimoire et l’audit ne présentent donc pas toutes les animations comme identiques.

Références : [sorts communs, guide de Salakiss](https://dofusretro.jeuxonline.info/article/14791/sorts-communs),
données SWF locales, `emulators/Nao/ressources/RubrumBDD.sql` pour recouper
certains sélecteurs, `emulators/sundofus/SunDofus/Databases/sundofus.sql` pour les
fiches d’invocations vides. Les contradictions des sources restent documentées.

### Audit des formules : sources françaises

Les règles ci-dessous sont vérifiées par des archives des publications d’Ankama
ou par des entrées envoyées directement aux calculateurs DofuX. Les tests de
régression correspondants sont dans `src/__tests__/formulaAudit.test.js`.

| Sujet | Source | Résultat de l’audit |
|---|---|---|
| Initiative | [Ankama, version 1.28](https://web.archive.org/web/20091002010716/http://forum.dofus.com/fr/le-carnet-de-bord-f2/version-1-28-t286170.html) | Retrait du bonus de vitalité hérité de la 1.27 |
| Retrait PA/PM | [Ankama, version 1.25](https://web.archive.org/web/20080927211957/http://forum.dofus.fr/topic.php?id=176947&lang=fr) | Bornes 10–90 % ; les bonus d’esquive protègent uniquement la cible |
| Tacle | [Ankama, version 1.27, page 2](https://web.archive.org/web/20090629221326/http://forum.dofus.com/fr/le-carnet-de-bord-f2/version-1-27-0-t242641-p-20.html) | Bornes 0–100 % ; perte de PA divisée par deux |
| Armures | [Ankama, version 1.27, page 1](https://web.archive.org/web/20090627051553/http://forum.dofus.com/fr/le-carnet-de-bord-f2/version-1-27-0-t242641.html) | Prise en compte du maximum entre la caractéristique élémentaire et la moyenne avec l’intelligence |
| Renvoi Prespic | [Notes Ankama 1.17 reproduites sur JoL](https://dofus.jeuxonline.info/actualite/13512/nouvelle-version-117) | Le renvoi d’équipement ne prévient plus les dégâts reçus |
| Critiques | [Calculateur DofuX](https://www.dofux.org/calcul-cc.dx) | Une faible agilité ne dégrade plus le taux obtenu après les bonus CC |
| Dégâts | [Calculateur DofuX](https://www.dofux.org/calcul-sort.dx) | Formule existante conforme aux exemples testés |
| Soins | [Calculateur DofuX](https://www.dofux.org/calcul-soin.dx) | Formule existante conforme aux exemples testés |

Pour une ligne de dégâts, avant les protections :

```text
dégâts = floor(jet × (100 + caractéristique élémentaire + % dommages) / 100)
         + dommages fixes
soin = floor(jet × (100 + intelligence) / 100) + soins fixes
```

Ainsi, les « % dommages » s’ajoutent à la caractéristique dans le multiplicateur.
Ils ne multiplient pas les dommages fixes et n’améliorent pas les soins.
Les dommages fixes s’appliquent à chaque ligne de dégâts. Le bonus aux dégâts
d’un coup critique d’arme est distinct du bonus à la probabilité de critique.

| Entrées du calculateur | Résultat DofuX et moteur |
|---|---|
| Jet 10–20 ; force 300, intelligence 200, chance 100, agilité 50 ; +7 dommages, +20 % dommages | Terre 49–91 ; feu 39–71 ; eau 29–51 ; air 24–41 |
| Soin 10–20 ; intelligence 300 ; +7 soins | 47–87 |
| Critique de base 1/40 ; +10 CC ; agilité 0 | 1/30 |
| Taux après bonus 1/3, 1/4, 1/5, 1/6 ; agilité 8, 42, 134, 384 respectivement | 1/2 ; un point d’agilité de moins laisse 1/3 |

L’exemple officiel de tacle est aussi testé : à 50 % de chance de fuite, un
échec fait perdre 2 PA, que le personnage possède 8 ou 10 PA.

**Limites conservées explicitement :** l’ordre exact entre résistances fixes,
résistances %, armures et renvois n’est pas confirmé par une référence primaire
Retro. Le moteur conserve « fixes puis %, puis armure ». Pour le retrait PA/PM,
l’arrondi supérieur du pourcentage et le plancher de 1 des scores d’attaque et de
défense restent des choix locaux à vérifier. Le cumul de plusieurs tacleurs
somme encore leurs agilités sans validation officielle. Les renvois de sorts
(Contre, Mot d’Épine, etc.) restent incomplets et ne sont pas assimilés au
renvoi d’équipement. La formule historique de poussée
`(8 + 1d8 × niveau/50) × cases bloquées` est maintenant appliquée : au niveau
100 sur deux cases bloquées, elle produit 20 à 48 dégâts, au lieu de 36 à 64.

### Mode tactique

Le bouton « Mode tactique », en haut à droite de la carte, remplace les décors
par une grille sobre inspirée des tuiles du client local (`clips/gfx/tactic.swf`).
Les cases hachurées bloquent le déplacement ; les blocs gris bloquent aussi la
ligne de vue. Ces indications utilisent les obstacles du moteur de combat.
Personnages, invocations, effets, portées et fiches au survol restent disponibles.
Un second clic rétablit le décor. Le choix est conservé pour les prochains
combats et partagé avec les replays ; il ne modifie pas l’état du combat.

### Journal et vérification

« Détails des jets » affiche le tirage de branche et le calcul des dégâts.
« Exporter le journal » produit un JSON `dofus-lite-combat` contenant la version
des règles, la carte, le seed, les événements numérotés et l’état courant.
Il permet d’inspecter un combat ; ce n’est pas un importateur des journaux Ankama.

Les tests couvrent notamment les branches aléatoires, limites par cible, masques
d’effets, armures, vol de vie, retraits après dépense des PM, régénération,
charges, états, tacle en cours de trajet, pièges/glyphes et l’accessibilité des
départs sur toutes les cartes. Les preuves navigateur vérifient les animations,
la galerie, le catalogue et l’export sans requête externe.

| Règle auditée | Référence locale |
|---|---|
| Champs de grade 12/13 : tour/cible | `emulators/AncestraRemake/revision55/src/game/common/SQLManager.java`, chargement de `sorts` |
| Branches et masques d’effets | `emulators/AncestraRemake/revision55/src/game/objects/Sort.java`, `applySpellEffectToFight` |
| Résistances et armures | `emulators/AncestraRemake/revision55/src/game/common/Formulas.java` |
| Pièges, glyphes, durées | `emulators/AncestraRemake/revision55/src/game/objects/Fight.java` et `SpellEffect.java` |

## Architecture

```text
src/
├── engine/            # moteur PUR (aucune dépendance React)
│   ├── engine.js      #   createGame / applyAction / validateAction / getView
│   ├── classes.js     #   les 12 classes et leurs sorts (data-driven)
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
└── ui/                # React : Arène, Jouer, Grimoire, Personnages, Éditeur, Tournoi, Docs
```

## Vraies cartes Dofus (import OblivionRetro)

Dix-huit cartes (Dopeuls, Amakna, Brâkmar, Bonta, Wabbits, Astrub, Bworks, forêt des
Abraknydes, Pandala, prison, Sufokia, Tainéla) sont décodées depuis
`OblivionRetro/` — format MapData 1.29 :
10 caractères par cellule, alphabet 6 bits, flags actif / marchable / ligne de vue,
coordonnées en losange avec déplacements Manhattan à quatre directions.
Elles s’ajoutent aux trois arènes synthétiques. Les noms sont les zones de la
base, et peuvent désigner une salle intérieure. Les départs choisis sont
marchables et reliés ; les décors proviennent du client local.

Dans **Jouer**, une phase de placement précède chaque combat : cases bleues
pour votre camp, rouges pour l’adversaire, puis **Prêt**. Les déplacements de
placement ne coûtent aucun PA/PM ; ni le bot ni le chrono ne démarrent avant
validation. Le moteur refuse toute case hors de la zone attribuée et verrouille
le placement dès que le combattant est prêt. Les combats automatiques tirent
leurs positions dans les mêmes zones, de façon reproductible avec le seed.

Les 18 SWF de cartes installées ne contiennent pas les départs : le serveur les
envoie par paquet `GP` (`SocketManager.java`, `GAME_SEND_FIGHT_PLACES_PACKET_TO_FIGHT`
dans AncestraRemake ; décodage dans `CryptManager.java`). Le relevé versionné
`scripts/map_placements.json` conserve les chaînes `places`, leur provenance,
les dimensions et les motifs de rejet. Huit listes historiques de GDCore sont
compatibles avec les terrains : **952, 1571, 1735, 2073, 7423, 8313, 9750 et 4**.
Elles sont importées intégralement, sans filtrage silencieux des cases. Cela ne
certifie pas leur correspondance avec les placements officiels de Retro actuel.

Les dix autres cartes conservent leurs deux positions locales fixes, signalées
dans le sélecteur et pendant le placement. Les bases AncestraRemake, Nao, gofus,
Shivas et SunDofus ont des données absentes, génériques répétées ou incompatibles
pour ces terrains ; la liste distincte de GDCore pour Dopeuls comprend sept cases
bloquées sur notre version du terrain. Les trois arènes synthétiques conservent
leurs départs propres. Aucun de ces départs locaux n’est présenté comme officiel.
Pour compléter les cartes manquantes, il faudra des listes serveur `GP` fiables
correspondant aux mêmes versions de cartes.

Les deux terrains PvP sont disponibles en décor normal et en mode tactique :

| Terrain | Coordonnées | ID source |
|---|---|---|
| Astrub PvP | `[5,-23]` | `7423` |
| Amakna PvP | `[-1,0]` | `952` |

La recherche accepte aussi les coordonnées avec un point-virgule (`5;-23`,
`-1;0`). Le cadrage de ces cartes extérieures suit les cases affichées ; les
coordonnées du moteur et les obstacles restent ceux de la carte décodée.
Le fond herbeux partagé (`backgroundNum: 71`) est lu dans les deux fichiers
de carte du client installé et rendu sous les décors, y compris les cases sans
tuile de sol propre.

```bash
python3 scripts/import_dofus_maps.py report            # classer les 7 770 cartes
python3 scripts/import_dofus_maps.py show 5383         # aperçu ASCII
python3 scripts/import_dofus_maps.py generate 5383 …   # régénérer src/engine/dofusMaps.js
yarn test:maps                                      # décodage et conformité des listes archivées
yarn proof:placement                               # Chrome isolé, app sur 127.0.0.1:3013
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

## Équipement avant combat

Dans **Jouer** ou **Arène**, choisissez le combattant, puis un emplacement.
Recherchez un objet ou filtrez les bonus, inspectez ses jets et cliquez sur
**Équiper**. Une panoplie peut être équipée d’un seul clic. Les deux
combattants commencent avec une panoplie du Bouftou ; les choix sont sauvegardés
par classe et par camp dans le navigateur et partagés entre les deux écrans.
Le match conserve une copie indépendante des équipements choisis.

L’atelier sépare **Équipements**, **Caractéristiques** et **Sorts & raccourcis**.
Les emplacements entourent le personnage ; le catalogue propose une recherche
par nom/panoplie, un filtre de bonus, une plage de niveaux et un tri.
Sélectionner un objet affiche les écarts de caractéristiques après remplacement,
y compris les bonus de panoplie perdus ou gagnés. Un double-clic l’équipe directement.

**Enregistrer ce stuff** crée une version nommée. **Enregistrer sous…** conserve
une nouvelle variante ; **Mettre à jour** remplace uniquement la version active.
**Mes stuffs** permet de rechercher, charger, renommer, dupliquer et supprimer
les versions enregistrées (suppression annulable). Le chargement rapide affiche
les stuffs de la classe choisie. Depuis la bibliothèque, charger un stuff d’une
autre classe change la classe du combattant concerné.

Chaque stuff conserve le niveau, les 16 emplacements, les jets et leur graine,
les points de caractéristiques, le profil JcJ, les sorts communs, leurs grades
et l’ordre de la barre. Les modifications restent dans un brouillon automatique
jusqu’à l’enregistrement explicite de la version. Les anciennes configurations
par classe et camp sont conservées. La bibliothèque est locale à ce navigateur
et à cette adresse du jeu, commune à **Jouer** et **Arène** ; elle n’est pas synchronisée
avec un compte Dofusbook.

Le niveau se choisit de 1 à 200. Les PV de base valent `55 + 5 × (niveau − 1)`,
les PA 6 avant le niveau 100 puis 7, et les PM 3. Le budget de caractéristiques
vaut `5 × (niveau − 1)`, avec les paliers de classe du client. Les meilleurs jets naturels sont le
réglage initial (malus minimaux), avec des modes moyen ou aléatoire sauvegardé.
Les dégâts des armes conservent leurs jets de combat : le réglage des objets
ne transforme pas les attaques en dégâts maximaux garantis.

Les six caractéristiques se modifient directement dans **Personnage**, par saisie
numérique ou boutons `−` / `+`. Le coût du prochain ajout, le capital investi,
les points disponibles, les bonus du stuff et le total sont affichés séparément.
`Max` dépense seulement le capital disponible dans la ligne choisie ; les autres
caractéristiques et les éventuels points restants sont conservés. La remise à
zéro est annulable. Une baisse de niveau conserve la répartition et bloque le
combat si le budget est dépassé, jusqu’à correction manuelle. Les stuffs
enregistrent aussi les répartitions mixtes. Chaque joueur et adversaire reçoit
**101 gratuits dans les six caractéristiques avant les boosts**, y compris au
niveau 1. Les valeurs saisies représentent les boosts supplémentaires :
`total = 101 + boosts + équipement`. Les paliers utilisent `101 + boosts`,
et seuls les boosts consomment du capital. Par exemple, passer de 101 à 102 en
force coûte 2 points à un Iop ; passer de 200 à 201 coûte 3 points. Le Sacrieur
conserve +2 vitalité par point investi au-dessus de ses 101 initiaux.
Une remise à zéro conserve les 101 gratuits. Les anciennes répartitions sont
conservées ; celles qui dépassent le budget avec les nouveaux coûts doivent
être corrigées avant le combat. Le journal utilise la version de règles 5.

Les 72 tables (12 classes × 6 caractéristiques) ont été comparées au fichier
[officiel Ankama `classes_fr_1391.swf`](https://dofusretro.cdn.ankama.com/static-data/612/lang/swf/classes_fr_1391.swf),
SHA-256 `139d553423734cd1ecd320d8bd83437eabeffc9fb2d9eb2b05bdee2d392349f5`.
`yarn audit:characteristics` refait la comparaison en téléchargeant cette version.
Les tests couvrent les seuils propres aux 12 classes, les remboursements,
la sagesse à 3 pour 1 et la vitalité du Sacrieur à 1 pour 2.
`yarn proof:characteristics` vérifie les saisies dans Chrome, les sauvegardes,
le changement de niveau, quatre largeurs d’écran et le journal du combat.
`yarn proof:parchottage` vérifie les 101 gratuits des deux camps, les grades
automatiques 5/6, les choix manuels et la persistance sans double comptage.

| Donnée | Comportement |
|---|---|
| Caractéristiques élémentaires | Force : terre/neutre ; intelligence : feu/soins ; chance : eau ; agilité : air/critiques/tacle |
| Bonus permanents | PA, PM, PV, PO ajustable, critiques, dommages, puissance, soins, initiative, invocations, esquive et pièges |
| Résistances | Fixes puis pourcentage, plafond joueur de 50 % ; bonus JcJ contre les joueurs |
| Panoplies | Un seul palier, calculé sur les pièces distinctes équipées |
| Armes | Coût PA, portée, coups critiques/échecs, dégâts élémentaires, vol de vie, soins, retrait PA, zones marteau/bâton et animation d’attaque |
| Objets de classe | Portée, coût PA, relance, critiques, ligne de vue, lancer en ligne, limites par tour/cible, dommages et soins du sort concerné |
| Contraintes | Emplacements, niveau, doublons de panoplie/Dofus, arme à deux mains et bouclier, points disponibles, conditions reconnues |
| Journal / replays | Configuration, jets et bonus permanents conservés dans l’état et la configuration du match |

Sources locales : `items_fr_1393.swf`, `itemstats_fr_1392.swf`,
`itemsets_fr_1387.swf`, `effects_fr_1391.swf`, `classes_fr_1391.swf`.
Leurs versions et empreintes SHA-256 sont consignées dans
`src/engine/equipmentData.json`. Le lecteur décode seulement les affectations
linéaires de données ; il n’exécute pas de code client et ne lit aucun compte.

```sh
yarn import:equipment        # modèles locaux, panoplies, icônes
yarn render:equipment        # reprendre les icônes manquantes
yarn test:equipment-data
CI=true yarn test --watchAll=false --runInBand
RETRO_URL=http://127.0.0.1:3013 yarn proof:equipment
RETRO_URL=http://127.0.0.1:3013 yarn proof:loadouts
yarn build                  # actualiser le jeu servi depuis build/
```

Limites explicites : les effets spéciaux inconnus (par exemple le Dofus
Tacheté) et les conditions hors simulation bloquent le lancement. Les
caractéristiques acquises par entraînement des familiers, les montures et
l’usure entre combats ne sont pas simulées. Les exos, surjets et conversions
élémentaires disposent maintenant d'un atelier de simulation (voir ci-dessous).
Les informations hors combat (pods, prospection, titres, liens
au compte) restent visibles mais ne modifient pas les combats. Neuf objets
n’ont pas d’icône disponible dans cette installation et affichent un symbole
de remplacement. Les chapeaux/capes/armes portés ne sont pas encore attachés
aux sprites des personnages. Les limitations de sorts décrites plus haut
restent applicables ; ce simulateur ne prétend pas reproduire le serveur à
l’identique.

### Complétude des équipements

`python3 scripts/audit_equipment_catalogue.py` contrôle les 6 419 objets et les
145 panoplies. 140 panoplies ont toutes leurs pièces présentes ; aucune pièce
présente ne référence une autre panoplie que celle qui la contient. Les 20
références absentes appartiennent à Givranoplie, Rapine, Phong Huss, Hectaupe et
Paniop ; leurs définitions manquent déjà dans la table objets du client installé.
L’interface les affiche et empêche de prétendre équiper une panoplie complète.

Le filtre de niveau 100 cachait les équipements supérieurs. Le niveau configurable
et la liste de toutes les pièces permettent maintenant de préparer, par exemple,
la panoplie Meulou complète au niveau 143. Les restrictions de grade, de
caractéristiques et d’arme à deux mains restent appliquées.

| Comparaison de composition Barbok | Pièces client / site |
|---|---|
| [Bouftou](https://barbok.fr/index.php?type=bouftou) | 7 / 7 |
| [Feudala](https://barbok.fr/index.php?type=feudala) | 8 / 8 |
| [Meulou](https://barbok.fr/index.php?type=meulou) | 6 / 6 |
| [Kwak de Terre](https://barbok.fr/index.php?type=kwakterre) | 8 / 8 |

Barbok comporte également du contenu Dofus 2. Le client installé reste la source
retenue pour les objets Retro et les bonus ; par exemple le Bouftou complet y
donne 5 dommages, contre 4 sur Barbok. Ces quatre contrôles de composition ne
valident pas toutes les statistiques de tout le site. Les bonus entraînés des
familiers restent indisponibles dans les templates installés.
Le rapport détaillé est `public/dofus-local/equipment-audit.json`.

## Recherche sur la forgemagie et observation du client

`scripts/extract_forgemagie_client.py` conserve les données statiques du client
installé, les empreintes SHA-256, le conteneur `loader.swf` complet et ses 760
unités ActionScript racine/initialisation séparées. L'extraction du 9 octobre
2026 contient **57 définitions de runes**. Le catalogue peut inclure des objets
inactifs sur le serveur utilisé. Les résultats restent dans
`local-observations/forgemagie/client/`, exclu de Git.

33 unités utiles ont été décompilées localement avec
[JPEXS FFDec](https://github.com/jindrapetrik/jpexs-decompiler), dont
`ForgemagusCraft`, `SecureForgemagusCraft`, `Exchange`, `Items`, le répartiteur
des messages, le transport XMLSocket et le pont Electron. Les noms obfusqués
restent en partie présents ; ceci n'est pas le code source original complet.

### Ce que le client confirme

| Élément | Constat |
|---|---|
| Fo / Pa Fo / Ra Fo | Puissances 1 / 3 / 10 |
| Vi / Pa Vi / Ra Vi | Puissances 3 / 10 / 30 |
| Rune Ga Pa / Ga Pme | Puissance 1 ; poids d'inventaire 1 pod |
| Fusion simple | L'interface appelle `Exchange.ready()`, qui envoie `EK` |
| Ingrédients | Demandes `EMO`, variantes de coopération `EFa` / `EFm` / `EFr` |
| Répétitions | `EMR`, interruption `EMr`, coopération `EFl` |
| Résultat | Réponse `EcK;...` ou `EcEF` ; nouvelles caractéristiques dans les messages d'objets |
| Information 117 | Échec et diminution de puissance |
| Information 183 | Échec de transformation |
| Information 194 | Transformation avec baisse d'une caractéristique |
| Transport | XMLSocket, messages terminés par NUL ; encodage optionnel et post-traitement Electron présents |

`EcK` signifie réussite, sans démontrer à lui seul un succès critique. Le poids
`w` des modèles d'objets est le poids d'inventaire, **pas le poids de forgemagie**.
Les poids de FM, les règles du puits et les taux publiés dans les
[observations Retro de Dofuzion](https://dofuzion.wordpress.com/forgemagie/tableau-poids-des-runess-retro-2/)
et le [guide 1.29 d'Alterya](https://alterya.over-blog.com/2017/11/tout-sur-la-forgemagie-en-1.29.html)
restent des sources communautaires : aucune formule serveur de probabilité ou
de sélection des pertes n'a été récupérée dans les composants inspectés.

La session sur le Blopanneau Griotte Royal a été observée visuellement : échecs
avec pertes et transformations accompagnées de pertes. Elle n'avait pas de
capture réseau en cours. Les deux captures d'écran ne donnent ni le nombre
total d'essais, ni tous les jets intermédiaires, ni un puits initial connu.
Elles ne constituent donc pas un échantillon permettant de vérifier les taux.

Une capture réseau ultérieure sur le **Blopanneau Coco Royal** contient 40
tentatives : 25 réussites et 15 échecs. Les jets avant/après peuvent être reliés
pour 39 tentatives ; le jet précédant le premier essai n'a pas été observé.
Le serveur remplace l'identifiant de l'objet après chaque fusion observée.
`scripts/summarize_forgemagie.py` suit le retrait de l'ancien objet et l'ajout
du nouveau dans le lot du résultat, en laissant les associations ambiguës
indéterminées. Il retrouve aussi une diminution de quantité pour 39 essais.
Ces nombres décrivent cette session ; ce ne sont pas des probabilités générales.

Cette capture s'est terminée le 9 octobre 2026 à 22:22:35 UTC. Les réponses du
serveur sont lisibles. Les demandes sortantes n'ont pas été décodées : leurs
corps opaques ont été omis du journal et ne sont donc pas récupérables depuis
ce fichier. Le pont JavaScript Electron déobfusqué appelle
`api.security.applyPacketToSendPostProcessing` ; l'implémentation de cette
transformation n'a pas été récupérée. Le puits initial reste inconnu.

### Enregistrer une prochaine session

Le script `scripts/observe_retro.py` écoute uniquement la connexion de jeu
sélectionnée. Il n'envoie aucun paquet et ne modifie pas le client. Il reconstitue
les flux TCP, décode les messages connus et enregistre un journal JSONL privé.

```bash
cd /Users/vincent/Documents/code/dofus/dofus-lite
python3 scripts/observe_retro.py discover
sudo /opt/homebrew/bin/python3 scripts/observe_retro.py capture --seconds 900 --scope all
```

macOS impose normalement les droits administrateur pour accéder à BPF.
La capture s'arrête après 900 secondes ou avec `Ctrl+C`. Les fichiers
`local-observations/forgemagie/network-*.jsonl` sont lisibles par l'utilisateur
qui a lancé `sudo` et exclus de Git. Aucun fichier PCAP brut n'est conservé.
S'il existe plusieurs clients/connexions, préciser `--pid`, `--server IP:port`
et éventuellement `--local IP:port` d'après la commande `discover`.

Le journal conserve les directions, demandes de fusion, mouvements d'ingrédients,
résultats, identifiants des objets, effets et différences entre jets **observés**.
Les différences ne prouvent pas qu'une seule tentative sépare deux observations.
Les messages privés et d'authentification ne sont pas conservés. `--scope all`
ajoute seulement les métadonnées des messages inconnus. Les flux TLS ou encodés
sont signalés ; leur contenu n'est pas déchiffré. Une capture démarrée après une
connexion ou interrompue peut manquer des états initiaux ou des messages.

```bash
# Lire un PCAP classique déjà disponible (pcapng non pris en charge).
python3 scripts/observe_retro.py read --pcap session.pcap --server 192.0.2.1:443

# Résumer le dernier journal, y compris pendant une capture active.
python3 scripts/summarize_forgemagie.py

# Refaire l'extraction et vérifier le lecteur sur des fixtures synthétiques.
python3 scripts/extract_forgemagie_client.py
python3 -m unittest discover -s scripts -p test_observe_retro.py
python3 -m unittest discover -s scripts -p test_summarize_forgemagie.py
```

Les tests de protocole ne valident pas les probabilités du serveur officiel.
### Atelier local : utilisation

Dans **Jouer → Stuff et sorts → Forgemagie**, sélectionner un équipement porté,
puis cliquer sur une rune dans la grille. Les caractéristiques naturelles de
l'objet (même tombées à zéro) et ses exotiques présents sont affichés automatiquement.
Les colonnes **Simple / Ga**, **Pa** et **Ra** ne proposent que les variantes
existantes. **Ajouter des runes** permet de chercher et cocher d'autres bonus
(par exemple PA / Ga Pa ou PM / Ga Pme). Choisir une rune ne lance pas de fusion.
Le bouton **Forgemager cet objet** dans la
fiche d'équipement ouvre aussi l'atelier. Il est également disponible dans l'Arène.

- 52 runes de caractéristiques : normales, Pa et Ra quand elles existent dans
  le client, ainsi que PA, PM, portée, dommages, soins, résistances, etc.
- Fusion unique ou séries de 10, 50 ou 100, arrêt manuel et arrêt au succès
  critique. Une série s'arrête aussi quand l'atelier devient invisible.
- Case **Succès critique garanti · 100 %**, désactivée par défaut et mémorisée
  dans le navigateur : toute fusion autorisée réussit sans perte ni consommation
  de puits. Les plafonds, exclusions et contraintes des potions restent appliqués.
  Les séries continuent jusqu'au nombre demandé ou au plafond ; changer de mode
  arrête la série. Le journal identifie les succès obtenus en mode garanti.
  Les probabilités affichées restent celles du mode normal, même quand cette
  case est cochée ; seule l'issue de la fusion est forcée.
- Jets naturels et actuels, surjets/exotiques, poids, puits, chances **estimées**,
  variations par essai et consommation des runes. Les runes sont libres dans
  cette simulation : aucun inventaire ni coût en kamas n'est imposé.
- Le jet, le puits, le générateur aléatoire et le journal sont conservés dans
  le brouillon et dans chaque stuff nommé. Deux sauvegardes sont indépendantes.
  Les changements de qualité des jets ne reroulent pas les objets forgemagés.
- Les bonus arrivent dans le moteur de combat, pour les deux joueurs et les
  bots. Les panoplies gardent leur composition ; une conversion d'arme change
  ses dégâts de corps-à-corps, pas l'élément des sorts de classe.
- Le journal conserve les 100 derniers essais détaillés et les compteurs
  complets. Il est exportable en JSON. Les sauvegardes restent locales au navigateur.
- « Jet de départ » permet de préparer un jet naturel et un puits de simulation,
  ou de reprendre le dernier jet capturé de l'objet. Un jet capturé démarre à
  **0 de puits supposé**, jamais à un puits présenté comme récupéré du serveur.

### Provenance et limites du modèle

| Partie | Source | Niveau de certitude |
|---|---|---|
| Identifiants, noms, gains des runes, bornes naturelles, exclusions `fm=false` | Client installé, empreintes conservées | Données extraites |
| 40 résultats sur le Blopanneau Coco Royal | Capture serveur terminée le 9 octobre à 22:22:35 UTC | 39 transitions avant/après ; état initial incomplet |
| Poids Retro, arrondis des runes, puits, plafond de puissance | Dofuzion, Alterya, discussion Retro JoL | Règles communautaires |
| Repères SC/SN/EC | Texte historique du devblog 1.27 et copies archivées | Repères, pas une formule complète |
| Possibilité d'épargner un effet lourd, neutre sans effet | Devblog historique reproduit ; guide pratique Papycha | Mécanisme décrit, probabilité numérique non publiée |
| Priorité des overs/exos par rapport au puits ; exo lourd parfois épargné | Papycha, Tofus, pratique publiée par Adyxion | Priorités documentées ; fragilité numérique estimée |
| Interpolation des chances et choix des lignes perdues | `src/engine/forgemagie.js` | Reconstitution locale explicite |
| Conversion élémentaire et chance des potions | AncestraRemake, `Metier.java` et `Formulas.java` | Variante d'émulateur, non vérifiée en session officielle |

Le client envoie des demandes et affiche des réponses. Il ne nous a pas livré
les formules autoritaires du serveur. Les 25 réussites et 15 échecs observés
portent sur des jets et des runes changeants ; **25/40 n'est pas utilisé comme
probabilité globale**. L'identité exacte des runes sortantes et le puits initial
ne sont pas établis. Les essais après la fin de capture ne sont pas inventés.

Les données de `forgemagieObservations.json` sont anonymisées : aucun compte,
adresse réseau, identifiant d'objet individuel, nom de personnage ou chat.
Les tests rejouent leurs jets dans le résolveur d'équipement ; ils ne prétendent
pas prédire les tirages aléatoires ni valider les probabilités officielles.

### Règles déterministes du simulateur

`forgedItems.js` conserve une instance par emplacement, séparée du modèle
catalogue. Les deux anneaux d'un même type peuvent avoir des jets distincts.
Remplacer un objet enlève le jet de cet emplacement, sans toucher aux copies
déjà enregistrées dans la bibliothèque. Les bonus non modifiables et les effets
spéciaux d'origine sont conservés. Une sauvegarde incohérente bloque le combat.

Le poids d'une rune vaut `ceil(gain × poids unitaire)` : Vi/Pa Vi/Ra Vi pèsent
1/3/8 ; Pod/Pa Pod/Ra Pod pèsent 3/8/25. Les pods d'inventaire ne sont pas utilisés.

| Issue | Gain | Coût |
|---|---|---|
| SC | Gain complet | Aucun puits consommé, aucune perte |
| SN financé | Gain appliqué après les pertes ; la ligne améliorée peut elle-même perdre des points | Poids de la rune |
| Neutre sans effet | Aucun gain, aucune perte, puits conservé | Rune consommée |
| EC | Aucun gain | Poids de la rune, dans la limite des jets disponibles |

Pour SN/EC, les overs/exos des autres lignes sont exposés avant le puits.
Le puits passe ensuite avant l'over/exo de la ligne travaillée, puis les
caractéristiques naturelles. Une ligne lourde peut être épargnée. Si elle
tombe, l'excédent crée du puits. Une rune Sa échouée qui fait perdre 1 dommage
crée ainsi `20 - 3 = 17` de puits ; si ce dommage est épargné, aucune réserve
n'est créée.

Les pertes sont comptées en vingtièmes de poids pour éviter les erreurs
flottantes, puis leur poids total est arrondi au supérieur une fois par essai.
Pour un SN financé ou un EC, le nouveau puits est
`max(0, ancien puits + poids perdu arrondi - poids rune)`.
Un résultat neutre insuffisamment financé ne change ni les jets ni le puits.
Cet arrondi des pertes et le poids des lignes négatives restent des choix de
reconstitution ; les captures disponibles ne suffisent pas à les certifier.

Au sein d'une phase, le choix d'une ligne utilise un poids de sélection inverse
à la racine du poids unitaire, avec un coefficient 0,35 pour la ligne travaillée.
Ces coefficients sont **des paramètres du simulateur**, pas des constantes
Ankama. Une ligne over/exo sélectionnée peut absorber toute la perte de la
tentative ; les lignes naturelles sont tirées à chaque point retiré. Les lignes
négatives ne descendent pas sous leur minimum naturel.

### Effets lourds épargnés : correction du modèle de pertes

La [copie du devblog historique](https://bieresexeandfun.forumactif.org/t497-tuto-forgemagie)
décrit une chance d'épargner un effet dont le poids unitaire dépasse le poids
total à retirer. Elle cite précisément le risque de faire tomber systématiquement
un PA lors de l'ajout d'un autre effet. Elle décrit aussi un résultat neutre
sans effet si aucune compensation suffisante ne peut être prélevée.
Le [guide Papycha](https://papycha.fr/guide-la-forgemagie/) rapporte des échecs
sans perte sur Gelano. Ce guide concerne Touch : il corrobore ici le mécanisme,
pas les valeurs de runes Retro. Aucune exception liée à l'identifiant du Gelano
n'est ajoutée au moteur.

La protection des lignes naturelles introduite dans `retro-reconstruction-v2`
est conservée : un tirage suit la sélection d'une ligne plus lourde que la
dette restante. Sa formule **choisie pour le simulateur, et non récupérée du
serveur**, est :

```text
probabilité de retirer un point = min(1, poids restant à compenser / poids unitaire)
```

| Poids restant | Ligne naturelle sélectionnée | Risque conditionnel dans le modèle |
|---|---|---|
| 1 | PA, poids 100 | 1 % |
| 3 | PA, poids 100 | 3 % |
| 10 | PA, poids 100 | 10 % |
| 90 | PA, poids 100 | 90 % |

Ces taux concernent **le tirage de perte sur cette ligne**, pas l'ensemble des
fusions : un SC ne retire rien, le puits peut tout couvrir pour un effet naturel et une autre ligne
peut payer. Le rapport 1/100 concorde avec l'estimation d'expérience du joueur,
mais n'est pas validé par les 40 captures disponibles ni par une formule publiée.

Une ligne épargnée est exclue du reste de cette tentative ; la retirer à nouveau
au hasard jusqu'à la faire tomber annulerait sa protection. Les autres lignes
restent candidates. Les pertes sont évaluées sur le jet avant l'ajout du bonus.
Si un résultat neutre ne peut pas être financé, ses pertes provisoires, son
gain et sa consommation de puits sont annulés. La rune est consommée et le
générateur aléatoire avance quand même. Un EC peut aussi finir sans aucune
perte ; la dette non payée ne se reporte pas à la tentative suivante.

Le journal exporté conserve chaque tirage d'épargne dans `loss.checks`, avec
la dette restante, le poids unitaire, la probabilité estimée et le résultat.
`neutralized` distingue un neutre sans effet. Les sauvegardes précédentes
conservent leurs jets et leur historique ; seules les nouvelles tentatives
utilisent le modèle révisé. La suite teste les mêmes règles sur PA, PM, portée,
critiques et dommages, ainsi que le parcours perte du PA → utilisation du
puits → remise du PA sur Gelano.

### Overs et exos : priorité et fragilité distinctes

Le modèle `retro-reconstruction-v3` corrige la même protection appliquée
auparavant à un PA naturel et à un PA exotique. Le coefficient 4 de sélection
des anciennes versions n'agissait pas sur le tirage d'épargne ; de plus,
consommer le puits avant tous les effets cachait leur priorité.

Le [guide Papycha](https://papycha.fr/guide-la-forgemagie/) distingue la ligne
travaillée des autres lignes. [Tofus](https://www.tofus.fr/fiches/forgemagie)
confirme l'exposition des effets non naturels avant le puits. Le simulateur
applique désormais les phases suivantes, en ne passant à la suivante que si
la perte reste à compenser :

| Ordre | Source de compensation |
|---|---|
| 1 | Overs/exos déjà présents sur les autres lignes |
| 2 | Puits disponible |
| 3 | Over/exo de la ligne que la rune tente d'augmenter |
| 4 | Caractéristiques naturelles encore disponibles |

Une ligne épargnée n'est pas réessayée dans une phase ultérieure. Un succès
critique, y compris en mode garanti, contourne l'ensemble des pertes.

Pour un point lourd non naturel sélectionné, la fragilité reste une hypothèse :

```text
p_naturel = min(1, poids restant / poids unitaire)
p_over_exo = p_naturel + 0,8 × (1 - p_naturel)
```

`0,8` est un **paramètre local provisoire**, pas un taux trouvé dans le client,
un guide, ou mesuré sur les captures. Il réduit la protection d'un effet lourd
non naturel tout en conservant des cas où il survit. Ainsi, face à 1 de poids,
le modèle utilise 1 % pour un PA naturel sélectionné et 80,2 % pour un PA exo
sélectionné. Ces deux chiffres sont conditionnels au traitement des pertes,
pas les chances globales d'une fusion. Une calibration officielle n'est pas
revendiquée. Les valeurs Retro des runes restent inchangées.

[Adyxion](https://adyxion.wordpress.com/2013/01/10/forgemagie-over-et-exo/)
rapporte avoir conservé un PA exo pendant la perte d'autres caractéristiques :
le modèle n'impose donc pas 100 % de chute sur chaque SN/EC. Le même auteur
illustre qu'une ligne over sélectionnée peut payer plus que son seul excédent :
65/60 force peut descendre à 57 pour une perte de poids 8, même avec du puits.
Cette priorité est limitée à la tentative ; à la suivante, la ligne à 57/60
est à nouveau naturelle. Les détails des pertes par phase sont exportés dans
`loss.steps`. `loss.checks` identifie aussi le type de ligne et le coefficient
de fragilité employé. Les sauvegardes v1/v2 restent lisibles sans rerouler leurs jets.

Les exotiques et surjets partagent un budget de 101. Une ligne dépassant son
maximum naturel respecte aussi le plafond de ligne, diminué des autres excès.
Un maximum naturel plus élevé reste restaurable. Exemples sans autre excès :
33 sagesse, 404 vitalité, 101 force ; le deuxième PA d'un Gelano est impossible.
Le même plafond s'applique au chargement d'un stuff, pas seulement aux boutons.

### Contre-exemple observé : sagesse sur un Gelano vide

Le relevé de la capture du 10 octobre 2026 (UTC) contient 125 tentatives sur Gelano.
Une même pile de runes est consommée 52 fois, avec une seule réussite finale
de +10 sagesse : cela identifie probablement une Ra Sa à partir de son gain
client, sans décodage de la demande sortante. La première de ces tentatives
part de 3 sagesse ; les 51 suivantes commencent sur un objet sans bonus.
Les autres piles de runes intercalées sont exclues de cette comparaison.

| Mesure | Résultat |
| --- | --- |
| Tentatives de cette pile sur un objet vide | 51 |
| Réussites observées | 1 (+10 sagesse) |
| Fréquence observée | 1,96 % |
| Modèle v3, Ra Sa sur Gelano vide, puits nul, maître 100 | 14,22 % SC, 0 % SN |
| Probabilité de 25 échecs indépendants à 14,22 % constants | 2,16 % |

Cet écart contredit la confiance accordée à l'interpolation, qui n'avait pas
été ajustée sur ces essais. Il ne fournit pas à lui seul une nouvelle formule
générale : le niveau de métier reste à confirmer, le puits n'est pas observé,
et 1,96 % est une fréquence de session, pas un taux serveur établi. Cette
comparaison ne modifie pas les coefficients de passage et n'ajoute aucune
exception au Gelano. Les détails anonymisés sont conservés localement dans
`local-observations/forgemagie/gelano-sagesse-audit-20261010.json`.

### Probabilités : interpolation versionnée

Le modèle `retro-reconstruction-v3` conserve l'interpolation SC/SN/EC de la
version précédente ; cette correction porte sur les pertes. Il suppose un
maître de niveau 100 et tient
compte du niveau de l'objet, du nombre de lignes, de leur poids, de la qualité
des autres jets, du franchissement de 80 % du jet naturel et des over/exos.
Les petites runes sont pénalisées progressivement au-delà de 20 fois leur gain.

L'interpolation combine les repères historiques suivants : jusqu'à 66 % de SC
en remontage simple, 43 % sur un jet parfait simple, 15 % sur un objet complexe,
et au maximum 50 % de SN. La création d'un effet léger part d'un SC allant
jusqu'à 32 %, réduit par la pression des excès. Les coefficients exacts sont
visibles dans `forgeChances`, avec les facteurs de chaque essai dans son journal.
Le puits sert de réserve : il n'est pas un bonus direct de probabilité.

Pour les exotiques/surjets lourds (poids unitaire ≥ 30), cette version adopte
la convention **1 % SC / 0 % SN / 99 % EC**. Le remontage d'un PA naturel ne
prend pas ce taux. Cette convention et l'interpolation entière demandent
encore validation sur Retro.

Les 12 potions élémentaires utilisent explicitement la variante Ancestra :
50/65/85 % avec arrondi inférieur de chaque borne (minimum 1), toutes les
lignes de dégâts directs neutres converties, vols de vie conservés. La chance
est `floor(10000 / (K + niveau objet))`, bornée à 5–95 %, avec K=100/175/350.
L'échec retire 10 % des bonus positifs, au moins 1, sans générer de puits.
Les sources historiques divergent sur ces conversions ; elles ne sont pas
annoncées comme confirmées par le client ou les captures.

Les cinq runes spéciales non vérifiées (Vie, chasse et trois Gata), la signature,
le brisage, la progression des métiers et l'économie ne sont pas simulés.
Les Dofus, familiers, boucliers, outils et objets exclus par le client ne peuvent
pas être modifiés dans cet atelier.

```bash
# Regénérer le catalogue et importer toutes les captures locales disponibles.
yarn import:forgemagie
CI=true yarn test --watchAll=false --runInBand
yarn build
yarn proof:forgemagie
```
