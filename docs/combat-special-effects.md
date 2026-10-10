## Effets spéciaux de combat — règles 7

Les nombres, durées, coûts et grades proviennent des SWF du client Retro installé.
Le calendrier et les réactions sont testés en lançant les vrais sorts puis en
jouant les tours suivants. Le client ne contient pas les règles du serveur :
les comportements reconstitués ne constituent pas une validation exhaustive
contre un serveur officiel Ankama.

### Corrections et contrôles par classe

| Classe | Sorts ou mécanismes contrôlés | Résultat |
| --- | --- | --- |
| Féca | Immunité, Renvoi de Sort, glyphes, Mise en garde | Protection au tour adverse, renvoi de Punition, dégâts de glyphe depuis son centre, durée de l’interdiction d’arme |
| Osamodas | Cri de l’Ours, Piqûre, Soin Animal | Valeurs et durées distinctes pour personnages et invocations ; attaques des invocations exécutables |
| Enutrof | Chance, Corruption, Retraite anticipée | Bonus actif au bon tour ; un tour passé conserve poisons, régénérations et glyphes ; blocage des déplacements |
| Sram | Poison Insidieux, Invisibilité, pièges, Poisse | Poisons indépendants de plusieurs lanceurs ; révélation par attaque ; pièges à l’entrée ; minimisation des jets |
| Xélor | Contre, Raulebaque, remboursement de PA | Renvoi lors d’un coup, y compris Punition ; retour aux positions initiales ; probabilité de remboursement conservée |
| Ecaflip | Chance d’Ecaflip, Bluff | Réaction soin/dégâts sur le coup reçu, y compris Punition ; une seule branche aléatoire de Bluff |
| Eniripsa | Mot de Régénération, Mot Lotof, Mot Stimulant | Nombre de soins périodiques ; déclenchement au tour suivant ; bonus de PA immédiat et durable |
| Iop | Mutilation, Puissance, Colère, Brokle | Cumul dans le tour et expiration de Mutilation ; durée de Puissance ; charge de Colère ; maximisation des jets |
| Crâ | Tir Puissant, Flèche Explosive | Durée du bonus ; coefficient selon la distance à la case visée, puis résistances |
| Sadida | Puissance Sylvestre, Tremblement, Vent Empoisonné | Protection contre ses poisons ; régénération et retrait complet de PA/PM pendant la même durée, même si les points étaient déjà dépensés |
| Sacrieur | Dérobade, Furie, Châtiments, Punition, Sacrifice | Esquive au contact ; cumul immédiat ; perte de vie réactive ; plafond par tour de combattant et durée propre des gains ; protections et redirection |
| Pandawa | Picole, Lait de Bambou, Karcham/Chamrak | Durées alignées de l’état, des résistances et du malus PM ; désenvoûtement immédiat des bonus/malus ; portage et lancer |

Furie au grade 5 ajoute **8 dommages par lancer**, immédiatement, soit **16 après
deux lancers**. Le bonus s’applique aux lignes de dégâts suivantes, armes comprises.
Trois Furies dans le même tour utilisent donc respectivement **0, +8 et +16**
dommages déjà acquis, puis laissent **+24** pour l’attaque suivante. Chaque Furie
inflige ses dégâts avant d’ajouter son nouveau bonus, dans l’ordre du client.
Les jets aléatoires, la zone et les résistances expliquent pourquoi le total
visible ne progresse pas nécessairement de huit points entre deux coups.

`immediateBoosts.test.js` contrôle l’activation sans changement de tour pour les
12 classes : dégâts de l’attaque suivante, critiques, PA/PM utilisables, portée,
soins, vitalité, résistances, caractéristiques volées, capacité d’invocation et
bonus des invocations. `scripts/proof_immediate_boosts.cjs` vérifie trois Furies
par des clics dans le Kanojedo, les calculs exportés et l’affichage +8/+16/+24.

L’effet de perte de vie de Furie est une réaction aux coups reçus, pas un poison de début
de tour. Les gains de Châtiment conservent la durée `p3` du client même lorsque le
Châtiment qui les a produits arrive à expiration.

Dérobade évite les dégâts d’une attaque au contact pendant sa durée et fait reculer
d’une case. Un recul bloqué peut produire des dégâts de poussée. Les attaques à
distance et la stabilisation restent des exceptions. Le journal distingue
l’esquive de l’éventuelle collision.

### Zones et armes Retro

| Attaque | Case centrale | Une case plus loin | Deux cases plus loin |
| --- | --- | --- | --- |
| Dégâts directs de sort / glyphe | 110 % | 100 % | 90 % |
| Marteau / bâton | 100 % | 100 % | Selon la géométrie de l’arme |
| Sort ponctuel | 100 % | Hors zone | Hors zone |

Pour les sorts, la distance se mesure depuis la **case visée**, pas depuis le
lanceur. Le coefficient est appliqué aux dégâts avec leurs bonus fixes avant les
résistances et protections. Les glyphes et pièges conservent leur centre de pose.
Un renvoi conserve le coefficient de la case initialement touchée.
Les soins et les poisons périodiques ne passent pas par ce multiplicateur de dégâts directs.

Le marteau vise une case à sa portée propre, même vide, et touche les quatre cases
de sa zone sans toucher son lanceur. Le clic direct sur un ennemi peut choisir une
case de visée légale ; cliquer une case de visée légale conserve ce choix exact.
Une frappe dont la zone est entièrement vide consomme normalement les PA.

### Affichage des pertes et gains de vie

Chaque action affiche un total de dégâts par cible et un total de soins séparé.
Les totaux additionnent les `amount` résolus : caractéristiques, résistances,
protections, arrondis, PV restants et soins plafonnés sont déjà appliqués à chaque
ligne. Le vol de vie conserve son arrondi par ligne ; il ne se recalcule pas sur
la somme. Deux actions rapides gardent deux nombres espacés, visibles pendant
1,1 seconde, même après un déplacement ou un changement de tour.

Le journal compact affiche les mêmes totaux. « Détails des jets » et l’export
JSON conservent toutes les lignes et leurs calculs. `actionId` identifie une
action complète, réactions incluses, et évite de fusionner deux coups successifs.
Les anciens événements sans cet identifiant restent lisibles grâce aux marqueurs
de lancer et de changement de tour.

La comparaison porte sur le client installé :

| Unité AS2 du client | Comportement observé |
| --- | --- |
| `init-20926`, actions 100/108/110 | Sépare pertes et gains de PV, transmet les valeurs au tampon de messages |
| `init-20553`, `FightEventsMessagesBuffer` | Regroupe les messages et les imprime après 50 ms |
| `init-21089`, `FightEventMessage` | Additionne les lignes de PV par combattant et conserve leur détail |
| `init-20732`, `_aPointsList` | Met les nombres flottants en file par combattant |

Le jeu local utilise ses limites d’action explicites pour les totaux demandés,
sans dépendre du délai de réception du client réseau. Les calculs sont contrôlés
sur la Terps, le Lahre, la Masse du Corailleur Magistral et le Kidorteau, en coups
normaux et critiques, avec plusieurs cibles. `healthChanges.test.js` couvre aussi
les résistances, les vols de vie, les plafonds et les actions rapprochées.
`node scripts/proof_health_totals.cjs` vérifie les clics dans le Kanojedo et
rapproche les nombres affichés du journal exporté et des variations de PV/PA.

### Sources et portée de la vérification

| Source | Usage |
| --- | --- |
| `public/dofus-local/spells/source/spells_fr_1387.swf` | Tous les champs numériques des 1 692 grades, coûts, durées et déblocages |
| [Guide des sorts communs de Salakiss](https://dofusretro.jeuxonline.info/article/14791/sorts-communs) | Recoupement des grades communs, dont Cawotte au grade 6 dès le niveau 100 |
| [Devblog Ankama sur les armes, reproduit par JeuxOnline](https://dofus.jeuxonline.info/actualite/39346/devblog-equilibrage-armes) | Introduction en 2.11 de la réduction à 75 % hors cellule visée ; distinction avec Retro |
| [Guide historique Féca](https://dofus-infos.webnode.page/les-classes-des-personnages/feca/) | Règle historique de zone : 110 % au centre puis dix points de moins par case ; source communautaire |
| [Discussion contemporaine sur Furie](https://www.dofux.org/topic-4231-Caracteristique-selon-les-classes-pex-d-un-sacrieur.dx) | Bonus cumulable et perte de vie liée aux coups reçus ; source communautaire |
| [Guide Sadida Retro de JeuxOnline](https://dofusretro.jeuxonline.info/article/14842/guide-classe-sadida) | Combo Tremblement et Puissance Sylvestre ; source communautaire |
| `emulators/Nao/org/spell/SpellEffect.java` | Recoupement de Dérobade, collision, stabilisation et réactions aux coups |
| `emulators/codebreak/src/Codebreak.Service.World/Game/Fight/Effect/Type/PunishmentBuff.cs` | Plafond de Châtiment par combattant actif et durée propre des gains |

Les tests exécutables se trouvent dans `specialMechanics.test.js`,
`combatAudit.test.js`, `spellExpansion.test.js` et `weaponTargeting.test.js`.
`scripts/test_client_spell_audit.py` confronte les données importées au SWF original.
Les preuves navigateur utilisent `scripts/proof_special_mechanics.cjs` et
`scripts/proof_weapons.cjs`, des profils Chrome temporaires et les journaux exportés.

Les limites déjà indiquées dans le README restent applicables : statistiques et
IA des invocations communautaires, certains soins allié/ennemi particuliers et
ordre exact de combinaisons complexes de protections à comparer au serveur
officiel. Les captures d’âmes et de montures restent hors du périmètre de l’arène.
