# Générer des animations de sorts avec une IA

Ce dossier fournit un **format de sources de design**, des prompts, six gabarits, quatre exemples et un lecteur hors ligne. Il permet de produire et de vérifier les fichiers d'un nouvel effet de sort. **Le jeu ne charge pas encore ces animations en combat.** Les deux importeurs actuels (`content.json` et `atelier.json`) continuent d'utiliser les animations existantes via `visualSpellId`.

## Partir d'un seul prompt

1. Ouvrez `assets/ai-design/index.html` depuis le kit décompressé, puis **Animations de sorts**.
2. Copiez `prompts/17-animation-sort-complete.txt` dans votre IA. Remplacez le thème et la description du sort en tête ; joignez la référence visuelle approuvée et les gabarits nécessaires. Le prompt contient le schéma complet et un exemple JSON.
3. Faites produire un dossier `effect.json` + PNG. Les prompts `18-fx-cast.txt` à `23-fx-beam.txt` détaillent chaque partie ; ils servent aussi à corriger une seule planche.
4. Ouvrez `assets/ai-design/spell-fx/index.html`, puis **Ouvrir mes fichiers**. Sélectionnez ensemble le manifeste et tous ses PNG. Vérifiez les directions, distances et fonds clair/sombre.
5. Exécutez le vérificateur ci-dessous, corrigez ses erreurs et conservez le rapport à côté du dossier de sources.

Une IA disposant d'outils de fichiers et d'images peut suivre ce prompt pour produire l'ensemble. Une IA textuelle doit fournir les instructions de production et indiquer les images restant à générer. Les dimensions, l'alpha et la continuité des images nécessitent une vérification ; un prompt ne garantit pas ces résultats.

## Ce que reprend cette organisation du client

Le client Retro sépare le geste du lanceur et les effets Flash du sort. Il charge des fichiers `clips/spells/<gfx>.swf`, utilise les cellules source/cible, l'orientation, le grade, les couches devant/derrière et, selon l'effet, des séquences `move`, `shoot` ou des répétitions `duplicate`. Les sons peuvent être déclenchés depuis l'animation.

Nous reprenons cette **séparation des rôles**. Le format PNG/JSON ci-dessous est une nouvelle convention de création, pas une copie du format SWF ni une prise en charge déjà présente dans le moteur. Les gestes `cast-front.png` / `cast-back.png` d'un personnage restent distincts de `cast.png`, qui ne contient que la magie autour du lanceur. La courbe de l'aperçu est définie ici ; elle ne prétend pas reproduire toutes les trajectoires Flash.

## Fichiers à livrer

```text
design-sources/spell-fx/mon-sort/
├── effect.json
├── cast.png          # seulement si cette couche est déclarée
├── projectile.png
├── trail.png
└── impact.png
```

Chaque effet contient **1 à 6 couches**, une par rôle au maximum. Une aura ou un impact seul n'a besoin que d'un PNG. Aucun fichier non déclaré, sous-dossier ou lien symbolique n'est accepté dans le dossier d'effet. Gardez les guides, rapports, références et prompts à côté. Ce dossier peut être partagé dans un ZIP de sources, **séparé du ZIP jouable**. Le vérificateur reçoit le dossier décompressé.

| Partie | Rôle / attachement | Origine par défaut | Dessin attendu |
| --- | --- | --- | --- |
| Lancement | `cast` / `caster` | `(128,128)` | Accumulation puis libération ; sans personnage |
| Projectile | `projectile` / `projectile` | `(128,128)` | Objet animé sur place, orienté vers la droite |
| Traînée | `trail` / `path` | `(128,128)` | Une particule qui se dissipe ; sans trajet dessiné |
| Impact | `impact` / `target` | `(128,128)` | Contact, expansion, puis disparition |
| Aura | `aura` / `caster` ou `target` | `(128,128)` | Boucle compacte ; anneau au sol en ellipse 2:1 |
| Rayon | `beam` / `path` | `(0,128)` | Bande horizontale, étirable du lanceur à la cible |

Les coordonnées d'origine sont mesurées depuis le coin supérieur gauche de chaque image. Les autres directions sont calculées par le lecteur ; il ne faut pas dessiner le trajet dans la planche. Les effets asymétriques complexes ou occultations par le décor ne sont pas simulés par cet aperçu.

## Images et limites

| Paramètre | Règle |
| --- | --- |
| Format | PNG RGBA 8 bits, non entrelacé, sans APNG |
| Taille d'une image | `256 × 256` pixels |
| Planche | Une ligne de `frames × 256` pixels de large ; aucun espacement |
| Nombre d'images | `1…16` ; gabarits par défaut : `8` |
| Cadence | `8…60` images/s ; défaut : `24` |
| Fond | Véritable alpha ; des pixels transparents dans chaque image |
| Contenu | Chaque image doit contenir des pixels visibles, y compris la dernière |
| Taille maximale | `2 MiB` par PNG ; `12 MiB` par dossier, JSON compris |
| Manifeste | JSON UTF-8 de `64 KiB` maximum |
| Durée de l'effet | `100…2000 ms` ; exemples : `1500 ms` |

Les gabarits font donc **2048 × 256**. Les fichiers `blank/` sont volontairement vides et doivent être refusés tant que rien n'a été dessiné. Les guides SVG ont un groupe de dessin par image et un calque de repères à masquer. Le lecteur accepte aussi d'autres nombres d'images autorisés par le schéma.

Évitez le texte, les numéros, les personnages, le décor, les damiers peints et les effets coupés aux bords. Gardez la taille et l'origine stables. Une dernière image très faible convient ; une image totalement vide ne convient pas. Vérifiez les effets à petite échelle et en présence d'autres personnages, sans masquer le ciblage.

## Manifeste et lecture

Le schéma exact est `assets/ai-design/spell-fx/fx.schema.json`. Les quatre dossiers `examples/projectile`, `examples/impact`, `examples/aura` et `examples/beam` contiennent des manifestes complets avec tous leurs PNG. Ce sont des formes techniques dessinées par code, pas des illustrations finales produites par une IA.

| Champ racine | Valeurs / sens |
| --- | --- |
| `format` | `dofus-lite-spell-fx-design` |
| `version` | `1` |
| `runtimeImportable` | Obligatoirement `false` |
| `id` | 1–60 caractères ; lettre minuscule puis minuscules, chiffres ou tirets |
| `name` | Nom non vide, 80 caractères maximum |
| `durationMs` | Durée entière de l'aperçu ; aucune incidence sur un buff |
| `travel` | `kind`, `startMs`, `endMs`, `arcHeightPercent` |
| `layers` | 1–6 couches, sans rôles ni fichiers dupliqués |

| Champ de couche | Valeurs / sens |
| --- | --- |
| `role`, `attachment` | Couple prévu dans le tableau des parties |
| `file` | Nom simple, ex. `impact.png` ; minuscules, chiffres, tirets |
| `frames`, `fps`, `frameSize` | Nombre, cadence ; `frameSize` vaut `256` |
| `anchor` | `{ "x": 128, "y": 128 }` ; coordonnées entières `0…255` |
| `startMs`, `endMs` | Début inclus, fin exclue ; fenêtre positive dans `durationMs` |
| `loop` | Booléen ; `false` obligatoire pour `cast`, `impact` et `trail` |
| `depth` | `behind` ou `front`, par rapport aux silhouettes de référence |
| `rotation` | `none` ou `path` ; `path` réservé aux projectiles et rayons |
| `scalePercent` | Entier `25…200` ; pour le rayon, règle seulement l'épaisseur |
| `blend` | `normal` ou `add` ; ce dernier additionne les lumières |

**Tous les champs sont requis. Les champs inconnus sont refusés.** Aucun code, URL, SWF ou déclencheur audio n'est exécuté. L'ordre des couches du manifeste est conservé à l'intérieur de chaque profondeur.

### Durées et déplacements

- Une planche sans boucle joue une fois, puis disparaît. Sa fenêtre doit durer au moins `frames / fps × 1000 ms` ; 8 images à 24 images/s demandent au moins **334 ms entières**. Une fenêtre plus longue ne ralentit pas la planche. Une boucle recommence jusqu'à `endMs`.
- `travel.kind = none` impose les trois nombres de déplacement à zéro et exclut projectile/traînée.
- `line` et `arc` demandent un projectile dont la fenêtre est exactement celle du déplacement. La position va du lanceur à la cible. `line` impose `arcHeightPercent = 0`.
- `arc` ajoute une hauteur de `distance × arcHeightPercent / 100` vers le haut de l'écran, selon `4 × hauteur × progression × (1 − progression)`. Le projectile peut tourner suivant la tangente. Ce n'est pas une simulation de collision.
- La traînée émet une particule immobile toutes les **50 ms** pendant le déplacement. Chaque particule joue une fois. La couche commence avec le trajet et doit finir au moins une vie de particule après son arrivée : `endMs ≥ travel.endMs + frames / fps × 1000`.
- L'impact ne commence pas avant l'arrivée du projectile.
- Le rayon utilise `travel.kind = none`, `rotation = path` et l'origine `(0,128)`. Le lecteur l'étire seulement en X pour joindre les deux points, puis le tourne. Dessinez un motif qui supporte cet étirement.

Le lecteur ajoute une courte pause entre deux relectures. **La durée de l'animation ne doit jamais bloquer les actions du combat.** Le lecteur ne modifie aucun dégât, PA, cible, zone ni score d'équilibrage.

## Validation portable

Depuis le dossier `retro-class-designer` du kit, avec Node.js 20+ :

```bash
node scripts/check-spell-fx.cjs assets/ai-design/spell-fx/examples/projectile
node scripts/check-spell-fx.cjs /chemin/vers/design-sources/spell-fx/mon-sort
```

Le résultat JSON donne `valid`, `runtimeImportable: false`, `visualReview: "not-run"`, les fichiers contrôlés et les erreurs. Le code de sortie vaut `0` si les contrôles réussissent, `1` sinon. Aucun accès réseau ni installation npm n'est nécessaire.

Le script vérifie le schéma fermé, les liens entre les fenêtres de temps, les noms/tailles, les dimensions PNG, l'encodage, les CRC, les pixels visibles et l'alpha de chaque image. Le lecteur vérifie le manifeste et les images chargées, mais **ne remplace pas** ce contrôle complet des PNG. Ni l'un ni l'autre ne certifie la beauté du dessin, la continuité du mouvement ou l'intégration au moteur.

## Contrôle visuel et livraison

1. Comparez l'identité avec les personnages, la carte et l'icône du sort.
2. Parcourez la timeline image par image : origine stable, aucune coupure, aucun saut de taille.
3. Regardez les quatre directions, deux distances et deux fonds ; vérifiez l'arrivée puis l'impact.
4. Pour une boucle, vérifiez le raccord de la dernière image à la première. Pour un impact, la lumière doit se dissiper.
5. Livrez les sources, le rapport technique et une capture de l'aperçu. Distinguez les fichiers réellement générés des simples briefs.

Le ZIP jouable conserve le `visualSpellId` d'un effet existant. Ajouter un champ `effect`, un fichier `effect.json` ou une planche supplémentaire dans ce ZIP ne rendra pas le nouvel effet importable. L'intégration ultérieure demandera son propre stockage, les références d'effets dans les sorts, un lecteur en combat et le transport des assets dans les exports/P2P ; ces fonctionnalités ne sont pas ajoutées par ce kit.
