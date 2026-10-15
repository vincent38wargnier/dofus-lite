# Game of Thrones — Les Huit Mémoires

Une campagne de huit salles, une par saison. Le récit de Bran réunit six « échos » — Jon Snow, Arya Stark, Melisandre, Brienne, Jaime et Tormund — sans prétendre que ces personnages ont participé ensemble à tous les événements. Le résumé de la série reste distinct de cette adaptation tactique. Révélations jusqu’à la fin de la saison 8.

## Jouer

Télécharger [le ZIP complet](http://127.0.0.1:3013/adventures/thrones-eight-memories.zip), puis **Atelier → Importer un ZIP → Jouer l’aventure**. Aucun personnage ou équipement préexistant n’est nécessaire. Les imports créent des copies et la progression reste locale au navigateur. [Récit illustré](http://127.0.0.1:3013/adventures/thrones-campaign/).

| Saison | Salle | Adversaires | Tours médians | Tours observés | Approche |
| --- | --- | ---: | ---: | --- | --- |
| 1 | Baelor | 4 | 3 | 2–4 | Boucliers et tirs de couverture |
| 2 | La Néra | 5 | 4 | 3–5 | Dispersion face au feu grégeois |
| 3 | Les Jumeaux | 6 | 5 | 4–6 | Piliers et tirs croisés |
| 4 | Châteaunoir | 8 | 5 | 4–6 | Deux brèches à défendre |
| 5 | Durlieu | 10 | 5 | 4–6 | Ralentissements et retraite à dégager |
| 6 | Winterfell | 12 | 7 | 6–10 | Formation de piquiers à percer |
| 7 | Au-delà du Mur | 16 | 7 | 6–10 | Deux fronts sur un lac figé |
| 8 | La Longue Nuit | 32 | 6 | 4–12 | Tuer le commandant pour briser l’armée |

La victoire sur le groupe débloque la salle suivante. La dernière utilise la règle de chute du commandant. Les autres salles exigent de vaincre tous les ennemis ; aucune résurrection, arrivée de renforts ou règle d’évacuation cachée n’est simulée. Les éléments de ce type appartiennent au récit, pas aux objectifs mécaniques.

L’équipe retrouve tous ses PV et capacités entre les salles. La première salle sert de prise en main ; les suivantes introduisent progressivement zones, tirs croisés, poussées, ralentissements et encerclement. Le joueur peut essayer de conserver ses six héros dans chaque salle.

## Rythme et validation

Les mesures ci-dessus portent sur **128 combats, 16 tirages par salle** : quatre tirages de réglage et douze tirages indépendants réservés à la validation, soit 96 combats de validation. Les héros utilisent l’IA Maison ; les ennemis utilisent l’IA normale des monstres. Les mêmes six héros et leurs équipements sont utilisés dans toutes les salles. Un tour désigne un cycle d’initiative complet ; chaque héros peut donc jouer une fois. La dernière ronde peut s’arrêter avant que tous aient joué.

- **Baelor : 3 tours médians**, contre 7 avant correction. Sur les mêmes quatre tirages, les actions de héros (sorts, armes et déplacements, hors « Fin de tour ») passent de 137,5 à 54 en médiane, soit **61 % de moins**.
- Les placements rapprochent les deux camps des objectifs. La carte reste grande ; on ne passe plus les premiers cycles à traverser sa moitié vide.
- Les premiers groupes ont moins d’ennemis et moins de PV. La difficulté augmente avec la composition, les attaques combinées et les menaces simultanées.
- Les tireurs du Nord ont 3 PM et une portée limitée à 6 pour éviter la poursuite interminable du dernier survivant. Les brèches Bolton sont élargies.
- Le Roi de la Nuit avance avec une portée limitée à 4. Le tuer fait tomber son armée : la finale peut être plus courte qu’une salle précédente, mais elle est plus dangereuse. Les PV restants de l’équipe sont de **64,5 % en médiane** à la fin, contre 98,4 % à Baelor ; cinq des seize finales ont coûté au moins un héros.
- **128 victoires**, aucune action illégale, erreur d’IA ou fin par limite de tours. Le premier échange de dégâts arrive au premier tour dans tous ces combats.

Ce sont des mesures d’IA, pas des minutes de jeu humain ni une garantie de plaisir. Les décisions, placements manuels et temps de lecture peuvent changer la durée. Le contrôle navigateur vérifie séparément l’import, les vrais combats, le déblocage et les sauvegardes.

Les rapports [`baseline-combat-report.json`](../../public/adventures/thrones-campaign/baseline-combat-report.json), [`calibration-combat-report.json`](../../public/adventures/thrones-campaign/calibration-combat-report.json), [`validation-combat-report.json`](../../public/adventures/thrones-campaign/validation-combat-report.json) et [`combat-report.json`](../../public/adventures/thrones-campaign/combat-report.json) contiennent les tirages, tours individuels, lancers, déplacements, PV, survivants et dégâts par ronde. `pacing-report.cjs` refuse une première salle dépassant 5 tours ou 75 actions de héros dans la suite de référence ; il contrôle aussi les limites des salles suivantes et l’augmentation du danger. Les empreintes des définitions empêchent de présenter un ancien rapport comme validation d’une nouvelle configuration.

`baseline-dungeon.json` conserve la définition antérieure pour reproduire la comparaison avec `CAMPAIGN_INPUT=examples/thrones-campaign/baseline-dungeon.json`. Il ne contient que les créations de cette aventure, aucune sauvegarde personnelle.

**Pour obtenir ce rééquilibrage, réimporter le ZIP mis à jour.** Une ancienne copie déjà importée conserve sa définition et sa progression. Le nouvel import ajoute une copie sans remplacer les sauvegardes.

## Contenu et provenance

- 8 terrains originaux de 18×18 à 32×32 cases, avec obstacles et placements propres.
- 6 héros équipés et 48 équipements originaux embarqués.
- 50 définitions de sorts personnalisés distinctes, plus les armes ; effets visuels originaux et sons synthétisés.
- 74 PNG : personnages, ennemis, icônes, terrains et props. Pas de modèle, décor ou animation Flash natifs utilisés par ces combats.
- Les caractéristiques et budgets utilisent les références du moteur Retro, conformément au contrat des créations. Réemployer un étalon de caractéristiques ne reprend pas son grimoire ou ses images.
- Les sources générées sont conservées dans `sources/`. Les héros, morts et assets du dernier rempart sont réutilisés depuis `examples/winterfell` et `examples/winterfell-last-stand`, deux créations originales du même projet. Le builder collecte leurs fichiers et les incorpore au ZIP : aucune de ces aventures n’a besoin d’être installée au préalable.

Les repères narratifs ont été vérifiés dans les résumés des saisons, consultés le 13 octobre 2026 : [1](https://en.wikipedia.org/wiki/Game_of_Thrones_season_1), [2](https://en.wikipedia.org/wiki/Game_of_Thrones_season_2), [3](https://en.wikipedia.org/wiki/Game_of_Thrones_season_3), [4](https://en.wikipedia.org/wiki/Game_of_Thrones_season_4), [5](https://en.wikipedia.org/wiki/Game_of_Thrones_season_5), [6](https://en.wikipedia.org/wiki/Game_of_Thrones_season_6), [7](https://en.wikipedia.org/wiki/Game_of_Thrones_season_7), [8](https://en.wikipedia.org/wiki/Game_of_Thrones_season_8). Chaque chapitre contient également son lien de référence dans `story.cjs` et la page publique. Dialogues et fiction de liaison sont originaux ; les textes ne reproduisent pas ceux de la série.

## Reproduire

```bash
node examples/thrones-campaign/build.cjs
node examples/thrones-campaign/verify.cjs
CAMPAIGN_SEEDS=47011,58321,68103,74019,81617,90823,105019,117031,123457,138019,149021,158003 CAMPAIGN_REPORT=public/adventures/thrones-campaign/validation-combat-report.json node examples/thrones-campaign/verify.cjs
node examples/thrones-campaign/pacing-report.cjs
node skills/retro-class-designer/scripts/validate.cjs package public/adventures/thrones-eight-memories.zip
npm run build
node examples/thrones-campaign/browser-proof.cjs
```

`--skip-art` reconstruit le ZIP en conservant les PNG déjà générés. `CAMPAIGN_SEEDS`, `CAMPAIGN_ROOMS` et `CAMPAIGN_REPORT` sélectionnent les tirages, les salles et le fichier de mesures ; `CAMPAIGN_INPUT` accepte une définition de donjon JSON pour une comparaison conservant la version précédente. Le vérificateur écrit par défaut les quatre tirages de réglage, sans écraser la validation indépendante. Le format de progression est documenté dans [`docs/dungeon-campaigns.md`](../../docs/dungeon-campaigns.md).

Le contrôle navigateur utilise un stockage neuf : import, lancement manuel, abandon sans déblocage, huit vraies victoires automatiques, sauvegarde/rechargement, mobile, export puis import de cette archive dans un second navigateur vierge. Il vérifie aussi l’ajout, la duplication, l’ordre, la suppression et la conservation des salles de l’éditeur.
