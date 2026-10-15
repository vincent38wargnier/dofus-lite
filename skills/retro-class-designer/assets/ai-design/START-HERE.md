# Générer tous les visuels avec une IA

Ouvrez **index.html** : le guide fonctionne aussi hors ligne, sans compte ni accès au dépôt. Choisissez votre thème, puis utilisez les prompts avec une IA qui sait créer des images. Ce dossier contient des gabarits techniques, pas des illustrations de thème déjà produites.

## Parcours

1. Utilisez prompts/00-direction-artistique.txt pour la palette, les silhouettes et la liste de fichiers. Les règles mécaniques restent dans les prompts runtime-class/runtime-dungeon du kit.
2. Pour chaque classe ou monstre DISTINCT, validez d'abord idle-front.png. Donnez cette image de référence à l'IA pour le dos, le portrait et les animations : les prompts 01–09 détaillent chaque fichier. Utilisez les guides et canevas dans character/. Les doublons d'un monstre peuvent partager leurs images.
3. Créez une icône par sort avec le prompt 10 et spell-icon-guide.svg. Le nom de fichier doit correspondre au chemin icon déclaré ; les animations et sons des sorts restent ceux du visualSpellId choisi.
4. Pour le décor, choisissez le terrain dans la galerie. Joignez maps/<mapId>/guide.png, clean.png et geometry.json. Le prompt.txt de ce dossier fixe les dimensions du terrain choisi. Les prompts 12–14 couvrent la carte complète, les couches et les objets isolés.
5. Le prompt 11 couvre chaque famille d'équipement, y compris familiers et montures ; le prompt 15 produit une couverture facultative, et le 16 un brief d'effets/sons. Les tailles d'équipement/couverture sont des conventions de travail, pas des formats d'import.
6. Pour les animations de sorts originales, le prompt 17 décrit un effet complet ; les prompts 18–23 détaillent lancement, projectile, traînée, impact, aura et rayon. Ouvrez spell-fx/index.html pour l'aperçu animé hors ligne. Le dossier contient six gabarits, un schéma JSON et quatre exemples complets. Ces sources ne sont pas encore importables en combat.
7. Vérifiez chaque image, puis les fichiers et les règles avant livraison. Livrez le ZIP jouable et les sources de design séparément. Pour une aventure avec héros équipés, préparez les héros dans l'Atelier, activez « Prêt à jouer », puis utilisez « Exporter l’aventure ». Le guide complet est dans ../../references/content-packages.md dans le kit portable.

## Ce qui s'importe aujourd'hui

| Élément | Sortie | Statut |
| --- | --- | --- |
| Classe / monstre / boss | 3 PNG de 256×256, plus 6 planches facultatives | Importable |
| Icône de sort | PNG 64×64, chemin déclaré | Importable |
| Équipement | Statistiques + forme/couleur intégrées | Export Atelier ; PNG libre non importable |
| Décor et couches de carte | PNG aux dimensions de geometry.json | Design préparatoire |
| Effet de sort original | effect.json + 1–6 planches PNG ; aperçu fourni | Design préparatoire |
| Illustration ou son original | Sources séparées | Design préparatoire |

Le ZIP content.json ne doit contenir que son manifeste et les PNG de personnages/sorts déclarés. Le ZIP atelier.json vient de l'export du jeu et conserve aussi les héros, règles et équipements. **Aucun de ces ZIP ne charge un décor de carte ou une image d'objet libre.** Ne mettez donc ni les guides, ni les sources, ni cette documentation dans un ZIP jouable. Le kit de création complet n'est pas lui-même un package à importer.

## Cartes : le visuel ne définit pas les règles

geometry.json reprend les cellules du moteur, leurs obstacles, leurs blocages de déplacement/ligne de vue, les départs A/B et la projection utilisée par le rendu. Les trois arènes procédurales utilisent leur projection de repli ; les autres gardent les dimensions et reliefs importés. Les illustrations du client ne sont pas redistribuées dans ces gabarits.

La légende est disponible dans geometry.json : sol clair = praticable, gris sombre = obstacle bloquant la vue, bleu-gris = obstacle laissant passer la vue, transparent = hors terrain. Les lettres A/B et coordonnées doivent disparaître du rendu final. Chaque contour de case et chaque passage doivent rester au même endroit ; une jolie image ne suffit pas à vérifier cet alignement. Superposez guide.svg à l'image et contrôlez toutes les zones de départ et tous les couloirs. Évitez les objets hauts devant les cases jouables. background/ground/scenery sont des noms de travail pour les sources, pas des champs reconnus par le moteur.

## Contrôle des PNG

Dans le kit décompressé, depuis le dossier retro-class-designer :

```bash
node scripts/check-visuals.cjs character /chemin/vers/artwork/mon-heros
node scripts/check-visuals.cjs icon /chemin/vers/icons/mon-sort.png
node scripts/check-spell-fx.cjs /chemin/vers/design-sources/spell-fx/mon-sort
```

Le contrôle vérifie dimensions, alpha, images non vides par frame, encodage et limites de taille. Il ne juge pas le style, la stabilité des pieds, la continuité du mouvement ni l'équilibre du personnage. Examinez face/dos, les quatre directions par miroir, les six pas, les six poses de lancer et les trois réactions, en taille réelle. Un personnage mort disparaît : aucune image de mort n'est requise.

Les outils d'image ne garantissent pas la taille exacte ou les vrais fonds transparents. Corrigez les sorties avant import ; n'inventez pas de réussite. Les fichiers blank/ sont volontairement vides et le vérificateur doit les refuser comme images finales.
