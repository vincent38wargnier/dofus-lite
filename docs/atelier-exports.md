# Exporter et partager ses créations

Dans **Atelier**, le bouton **Exporter** ouvre une sélection de toutes les classes, de tous les donjons et des équipements enregistrés. Cochez les éléments voulus puis cliquez sur **Télécharger le ZIP**. Une même archive peut mélanger les trois catégories. La recherche ne modifie pas la sélection.

Pour exporter un seul élément, utilisez l’icône de téléchargement dans l’en-tête de sa classe ou de son donjon, ou **Exporter cet équipement** dans le créateur d’objets. Ce dernier bouton emporte les valeurs actuellement affichées, même avant leur enregistrement. L’export groupé utilise les équipements déjà enregistrés.

## Contenu conservé

| Création | Inclus dans l’archive |
| --- | --- |
| Classe | Nom, modèle, niveau, caractéristiques, apparence, sorts et leur ordre, équipement porté, jets, exos et forgemagie |
| Donjon | Nom, carte, monstres, grades et quantités, monstres personnalisés et copies complètes des personnages du groupe |
| Équipement | Nom, niveau, modèle, forme et couleur, bonus, lignes d’arme et critiques |
| Images | Portrait, poses, animations PNG et icônes de sorts utilisées |

Les images partagées par plusieurs créations sont incluses une seule fois. Les formes et couleurs générées sont conservées par leurs paramètres. Les cartes, monstres, animations et équipements Dofus sont référencés dans les données du jeu ; leurs fichiers du client ne sont pas recopiés dans chaque ZIP.

Une classe garde les versions exactes de ses objets équipés, même si ceux-ci ont depuis été modifiés ou supprimés dans la bibliothèque d’équipements. Ils restent attachés à cette classe. Pour les ajouter aussi à la bibliothèque du destinataire, sélectionnez ces objets dans l’export.

## Ajouter ses personnages à un donjon

Dans **Atelier → Mes donjons → Groupe**, ouvrez **Mes personnages** pour retrouver vos profils de Jouer, ou **Mes classes** pour prendre une création de l’Atelier. Glissez une carte dans la salle, ou cliquez sur **Ajouter au groupe**. La salle peut mélanger personnages et monstres, jusqu’à **8 combattants** au total.

L’ajout enregistre une copie indépendante : nom, classe, niveau, sexe et apparence, caractéristiques, équipements, jets et forgemagie, sorts créés ou natifs, grades, ordre et icônes. Le personnage devient un adversaire joué par l’IA généraliste du donjon. Modifier ou supprimer ensuite son profil d’origine ne change pas la copie. Pour actualiser une copie, retirez-la puis ajoutez la nouvelle version.

**Exporter seulement le donjon suffit.** Le ZIP inclut les définitions des objets personnalisés équipés, les sorts et les fichiers PNG de tous ses personnages. Il se réimporte dans un navigateur sans profils, classes, équipements ni images personnalisées préexistants. Aucun identifiant de profil local ou d’IA personnelle n’est requis. Les personnages restent intégrés au donjon ; l’import ne crée pas de profils supplémentaires dans Jouer.

Une installation du jeu avec son catalogue natif reste nécessaire : le ZIP est un contenu importable, pas une distribution autonome du moteur et des fichiers Dofus. Les budgets et règles de combat s’appliquent aussi aux personnages intégrés au donjon.

## Réimporter

Utilisez **Atelier → Importer un ZIP**, puis déposez ou choisissez le fichier. Le même import accepte les archives Atelier et les anciens ZIP de création IA.

Les créations sont ajoutées comme de nouvelles copies avec leurs propres identifiants. Les éléments existants restent en place. Un rapport indique les catégories ajoutées et permet de les ouvrir directement. Les créations et leurs images sont conservées après rechargement.

Les brouillons et anciennes créations hors budget peuvent être sauvegardés et réimportés. Le rapport indique les ajustements nécessaires. Les règles de l’éditeur, d’équipement et de lancement des combats continuent de s’appliquer : l’import d’une archive n’accorde aucune exception aux budgets.

## Format de sauvegarde

| Propriété | Valeur |
| --- | --- |
| Manifeste racine | `atelier.json` |
| Format | `dofus-lite-atelier` |
| Version | `1` |
| Collections | `characters`, `dungeons`, `equipment` |
| Images | `artwork`, avec fichiers sous `assets/aN/` |
| Nombre de créations | De 1 à 200 par ZIP |
| ZIP / données décompressées | 128 Mio / 160 Mio |
| Manifeste / PNG individuel | 8 Mio / 2 Mio |

Le format restitue les définitions de sauvegarde du moteur et leurs dépendances. Il est généré par l’Atelier. Le format `content.json` décrit dans [les règles des packages IA](content-packages.md) reste le contrat d’écriture de nouvelles créations avec une IA ; ses limites et validations restent inchangées.

Un membre de `dungeons[].members` contient exactement une de ces formes, accompagnée de `count` : une référence native `monsterId` / `grade`, une définition `customMonster`, ou un instantané `character: { name, className, classId, loadout }`. L’export remonte automatiquement les dépendances des `loadout` imbriqués ; l’import remappe leurs identifiants d’images et d’équipements comme ceux des classes exportées séparément.

Les chemins, doublons, références, tailles, CRC et PNG sont contrôlés avant l’enregistrement. Un échec d’écriture des équipements annule la mise à jour correspondante des classes et donjons ; les nouvelles images sont également nettoyées en cas d’échec de sauvegarde.
