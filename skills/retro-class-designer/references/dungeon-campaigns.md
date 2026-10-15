# Donjons à plusieurs salles

Un donjon de l’Atelier peut contenir **1 à 20 salles ordonnées**. Dans **Mes donjons**, « Ajouter une salle » crée une salle vide ; les flèches changent l’ordre. Chaque salle possède son nom, son texte avant/après combat, sa carte, ses placements, ses adversaires et, éventuellement, son mode armée. Le groupe de héros « Prêt à jouer » est partagé par toutes les salles.

## Progression

- Seule une victoire réelle du camp A débloque la salle suivante : tous les ennemis doivent être morts et au moins un héros non invoqué doit survivre. La chute d’un commandant fait bien mourir ses troupes selon les règles du mode armée.
- Une défaite, un abandon ou une limite de tours ne débloque rien. On peut réessayer.
- Les salles déjà battues sont rejouables. La progression est conservée dans `dofus-lite-dungeon-progress-v1`, dans ce navigateur et pour cette adresse de jeu.
- Chaque salle lance un nouveau combat : PV, PA, PM, relances, effets temporaires et invocations sont remis à leur état initial. Les niveaux et équipements fournis ne changent pas.
- Modifier les salles ou les héros fournis invalide l’ancienne progression. Importer le ZIP crée une nouvelle copie qui commence à la première salle. Le ZIP transporte le contenu, pas les victoires de son auteur.
- En réseau, l’hôte choisit la salle débloquée. Après la victoire, « Préparer la salle suivante » retrouve le même salon et les mêmes attributions de héros. Les invités confirment à nouveau leur préparation. La progression appartient au navigateur de l’hôte.

## Extension de l’archive Atelier

Cette extension concerne **`atelier.json`**, version 1. Le format déclaratif **`content.json`** reste limité à une classe ou une salle. Ne mélangez pas ces deux schémas.

Un objet donjon peut posséder `rooms`, une liste complète incluant la première salle. Chaque entrée accepte exactement :

| Champ | Règle |
| --- | --- |
| `id` | Identifiant ASCII unique dans le donjon, 1–100 caractères |
| `name` | Nom de la salle, maximum 200 caractères |
| `mapId` | Carte native valide ou identifiant du `battlefield` embarqué |
| `members` | Même contrat que les groupes des donjons simples |
| `battlefield` | Facultatif ; terrain original avec géométrie et images |
| `encounter` | Facultatif ; armée et commandant, règles existantes |
| `intro`, `outro` | Textes facultatifs, maximum 3 000 caractères chacun |

Les autres propriétés du donjon (`id`, `name`, `description`, `adventure`) sont communes. `adventure` ne peut pas être redéfini dans une salle. Les anciennes propriétés de première salle à la racine sont conservées pour les aperçus ; l’éditeur les synchronise avec `rooms[0]`. Le moteur lit la salle sélectionnée dans `rooms`.

Exemple structurel, à compléter avec des membres et cartes valides :

```json
{
  "id": "my-campaign",
  "name": "Les deux portes",
  "mapId": "arene",
  "members": [{ "monsterId": 494, "grade": 1, "count": 1 }],
  "rooms": [
    {
      "id": "gate-one", "name": "La première porte", "mapId": "arene",
      "members": [{ "monsterId": 494, "grade": 1, "count": 1 }],
      "intro": "Le premier gardien vous attend.", "outro": "La seconde porte s’ouvre."
    },
    {
      "id": "gate-two", "name": "La seconde porte", "mapId": "arene",
      "members": [{ "monsterId": 494, "grade": 2, "count": 2 }],
      "intro": "Deux gardiens défendent la sortie.", "outro": "Le donjon est terminé."
    }
  ]
}
```

Les budgets restent identiques : 10 sorts par propriétaire, 100 points par sort, 650 par kit, 100 par équipement créé, 1 650 par stuff concerné hors Dofus. Chaque salle respecte sa propre limite : 8 ennemis, ou 32 en mode armée explicite. L’équipe alliée reste limitée à 8.

## Dépendances et validation

L’export parcourt **toutes les salles**, y compris celles encore verrouillées : héros, personnages ennemis, équipements et FM, monstres créés, sorts, portraits, icônes, fonds et props. Une aventure prête à jouer invalide dans une salle future est refusée avant l’import ou le lancement. Les limites habituelles du ZIP s’appliquent à la somme des fichiers.

```bash
node retro-class-designer/scripts/validate.cjs package my-campaign.zip
```

Le rapport contient `roomCount` et un contrôle `rooms` distinct pour chaque salle. La campagne **Les Huit Mémoires** fournit un exemple complet dans `examples/thrones-campaign/atelier.json` ; son builder utilise le même exporteur que l’interface. Le fichier jouable est `public/adventures/thrones-eight-memories.zip`.
