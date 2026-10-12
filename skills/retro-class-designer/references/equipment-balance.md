# Équipements personnalisés : création et équilibre

Le créateur est disponible dans **Atelier → Mes équipements** et depuis **Stuff → Créer un équipement**. Les objets enregistrés apparaissent dans le filtre **Mes créations** du catalogue et s’équipent par clic ou glisser-déposer. Les profils, stuffs, adversaires, simulations et replays transportent leur définition complète.

## Périmètre et données

L’audit utilise `src/engine/equipmentData.json`, importé du client Retro installé. Il conserve les versions et SHA-256 des fichiers du client ainsi que le SHA-256 du catalogue analysé. **Les 14 Dofus sont exclus de l’analyse, du créateur, du score de stuff et de ses pénalités de cumul.** Leurs effets de jeu restent inchangés.

| Population | Nombre | Usage |
| --- | ---: | --- |
| Objets hors Dofus | 6 476 | Recensement complet |
| Équipements ordinaires avec bonus de combat | 1 951 | Candidats à la comparaison |
| Références distinctes retenues | 1 917 | Étalonnage des budgets |
| Armes éthérées | 3 504 | Auditées séparément, durabilité non valorisée |
| Sans bonus de combat | 789 | Hors budget de combat ; bornes utilitaires conservées |
| Réservés ou inaccessibles | 88 | Pas de référence de création |
| Effets spéciaux ou non reproduits | 66 | Pas de référence de création |
| Outils et armes spéciales | 74 | Hors créateur de combat |
| Valeurs exceptionnelles | 3 | Exclusion des objets de test/admin |
| Niveau hors 1–200 | 1 | Hors progression jouable |

Les variantes partageant type, graphisme, niveau, caractéristiques et profil d’arme sont regroupées ; la plus forte sert de référence. Les alternatives d’un familier entraînable ne sont jamais additionnées. Les montures sont évaluées avec leurs bonus au niveau 100.

L’audit complet est dans `public/dofus-local/equipment-balance-audit.json`. Le fichier `docs/equipment-balance-census.csv` contient une ligne par objet hors Dofus, avec son niveau, sa famille, ses scores et son éventuel motif d’exclusion. Le JSON donne aussi les distributions par tranches de 50 niveaux et par famille.

## Budget par objet : 100 points

Le calcul partagé par l’éditeur et le moteur est dans `src/engine/equipmentBalance.js`. Il s’agit d’une **politique locale de création**, pas d’une formule officielle récupérée chez Ankama ni d’une garantie de victoire équitable.

### Bonus permanents

Le poids de forgemagie existant sert d’unité de départ. Il est ensuite normalisé par la famille et le niveau.

| Bonus | Poids brut par point |
| --- | ---: |
| Vitalité | 0,25 |
| Force, intelligence, chance, agilité | 1 |
| Sagesse | 3 |
| PA / PM / portée | 100 / 90 / 51 |
| Dommages / soins / critiques | 20 / 20 / 30 |
| Puissance / dommages physiques | 2 / 20 |
| Résistance fixe / résistance en % | 5 / 4 |
| Invocation / renvoi | 30 / 30 |
| Initiative | 0,1 |
| Dommages pièges / puissance pièges | 15 / 2 |
| Esquive PA ou PM | 6 |
| Pods / prospection | 0 dans ce simulateur de combat |

Les valeurs utilitaires ont néanmoins des plafonds numériques tirés du catalogue. Les résistances JcJ restent des résistances JcJ ; elles ne se transforment pas en protection contre les monstres.

Un objet combinant PA et PM reçoit **40 de poids brut supplémentaire**. Chaque PA au-delà du premier ajoute encore 100, chaque PM au-delà du premier 90. Les malus n’offrent **aucun crédit**, car leur coût réel dépend trop du personnage : un malus intelligence peut être gratuit pour un personnage terre. Conditions, appartenance à une panoplie, échecs critiques et utilisation à deux mains ne donnent pas de réduction.

### Armes

La puissance de frappe additionne toutes les lignes, puis prend en compte les PA, les coups normaux et un scénario à **1/2 critique**, le vol de vie, les soins, le retrait/vol de PA, la portée et la zone.

Pour une ligne de dégâts, on évalue la moyenne de ses bornes, plus un équivalent de dommages fixes par ligne. Au niveau `L`, le scénario utilise `100 + 2L` caractéristiques et `10 + 0,15L` dommages fixes. Ainsi, ajouter des lignes faibles n’est pas gratuit. Le vol de vie reçoit un coefficient de 1,5 ; les soins à la cible un coefficient de 1 ; un PA retiré/volé vaut 24 unités de base. Les armes en zone reçoivent un coefficient de 1,35 ; chaque case de portée maximale au-delà de la première ajoute 3,5 %. Le résultat par PA est multiplié par 16 pour rejoindre l’échelle des poids permanents.

Ces coefficients sont explicites et ajustables. Ils ne constituent pas une prédiction exacte des dégâts : résistances, placement, nombre de cibles, maîtrise, dommages fixes élevés et équipement critique doivent encore être testés.

Le critique ne possède pas une seconde liste indépendante : **le bonus critique s’ajoute automatiquement à chacune des lignes de dégâts, vol de vie ou soin**. Il ne peut donc pas oublier les lignes du coup normal.

### Étalonnage

Pour un équipement de niveau `L`, on prend les références de la même famille entre `L−30` et `L`. Si ce groupe compte moins de 12 objets, on utilise les références de cette famille jusqu’à `L`. Aucun objet d’un niveau futur ne débloque de bonus à bas niveau. Les enveloppes sont monotones : monter de niveau ne réduit jamais un plafond.

Les plafonds de puissance combinée, de caractéristiques et de frappe utilisent le **90e percentile des valeurs positives**. Le score affiché est le maximum de ces trois ratios, exprimé sur 100. Chaque caractéristique possède aussi une borne indépendante au **95e percentile des lignes positives**, arrondie à l’entier supérieur. PA et PM sont plafonnés à un chacun sur les créations ordinaires. Les familiers, montures et boucliers possèdent des enveloppes propres, indépendantes du niveau du joueur.

Une enveloppe par famille évite, par exemple, d’accorder le budget d’une coiffe complète à un familier. Les boucliers conservent les conditions de grade du modèle natif. Une monture nécessite au moins le niveau 60.

Les objets natifs exceptionnels, comme le Solomonk ou le Voile d’encre, peuvent dépasser les budgets de création à leur niveau. Ils restent jouables sans modification. Leur existence n’autorise pas toutes les nouvelles pièces à cumuler leurs meilleurs avantages.

## Budget du stuff : 1 650 points

Chaque emplacement compte, y compris les deux anneaux. Les scores de puissance combinée sont recalculés au niveau du personnage ; les bonus du palier de panoplie porté sont ajoutés une fois. Pour ne pas pénaliser arbitrairement les exceptions natives, la contribution individuelle au stuff est plafonnée à 100. Les objets créés doivent déjà avoir passé tous leurs contrôles individuels.

Le stuff reçoit ensuite **175 points par PA d’équipement au-delà de 3**, **175 par PM au-delà de 2**, et **15 par portée au-delà de 5**. Les Dofus ne participent ni aux sommes ni aux seuils. Les PA/PM de base du personnage et les boosts temporaires ne participent pas à ce budget.

Le plafond de **1 650 points** prend comme repère un stuff natif de niveau 200 aux jets maximaux avec des exos autorisés par le moteur de forgemagie. Son score est de **1 606,5 points** : 884,3 pour les objets, 22,2 pour la panoplie et 700 pour le cumul des PA. La marge restante est de 43,5 points. L’ancien plafond de 850, fondé sur des assemblages sans exos, était trop restrictif pour ce cas. Cette révision change uniquement le plafond du stuff : les scores, enveloppes par niveau/famille et limites de **100 points par objet créé** restent identiques.

Ce plafond s’applique aux stuffs contenant au moins une création. Les stuffs entièrement natifs gardent leur admission habituelle ; leur score est informatif. Les effets de panoplies sont inclus lorsqu’ils se traduisent en caractéristiques, mais les modificateurs spécifiques de sorts des panoplies de classe ne sont pas précisément valorisés par ce modèle. Les objets natifs forgemagés respectent leurs propres contrôles ; le nouveau plafond n’autorise ni un surjet illégal ni la forgemagie des créations à jets fixes.

### Contrôle sur 800 assemblages natifs

Le script tire 200 assemblages à chacun des niveaux 60, 100, 150 et 200, dans les 20 % de références les plus fortes disponibles par emplacement. Il inclut arme, compagnon, bouclier si compatible et palier de panoplie. La graine est fixe : `73121`. Ces échantillons servent à situer le budget, **ce ne sont ni des stuffs optimisés ni des simulations de victoire**. Les conditions de caractéristiques et de grade ne sont pas vérifiées dans ces assemblages statistiques.

| Niveau | Score médian | 90e percentile | Assemblages ≤ 1 650 |
| --- | ---: | ---: | ---: |
| 60 | 860,8 | 922,2 | 200 / 200 |
| 100 | 741,8 | 818,4 | 200 / 200 |
| 150 | 742,8 | 846,9 | 200 / 200 |
| 200 | 830,5 | 904,8 | 200 / 200 |

Ces assemblages sans forgemagie situent la puissance des équipements naturels ; le repère à 1 606,5 complète ce contrôle avec un stuff optimisé et des exos. Ce repère n’est pas une preuve d’équilibre pour toutes les combinaisons possibles. L’interface affiche toujours les dépassements avant combat. Les combinaisons de sorts, retraits, résistances, critiques et soins requièrent des essais en jeu pour juger l’équilibre compétitif.

## Règles du créateur et sauvegardes

- Nom de 1 à 80 caractères ; niveau requis de 1 à 200.
- Coiffes, capes/sacs, amulettes, anneaux, ceintures, bottes, huit familles d’armes, boucliers, familiers et montures.
- Bonus permanents pris en charge par le moteur ; valeurs entières, jets fixes.
- Jusqu’à quatre lignes de frappe, de 2 à 7 PA. Portée de 1 pour la mêlée ; arcs et baguettes jusqu’à 10, avec minimum ≤ maximum.
- Dégâts/soins de 1 à 80 par ligne, retrait/vol de PA de 1 à 2, toujours sous les budgets calculés. Critique désactivé ou de 1/20 à 1/100 ; bonus de 0 à 20.
- Apparence et animation issues du modèle natif. Le modèle d’arme impose sa zone et son utilisation à une ou deux mains. Les montures gardent la limite actuelle : pas d’animation montée ajoutée.
- Aucun bonus de panoplie, chemin de fichier, script ou effet arbitraire injecté dans une définition. Dofus et outils spéciaux ne sont pas créables.
- La forgemagie reste disponible pour les objets natifs. Les créations se règlent dans l’atelier pour ne pas contourner le budget par un surjet ajouté ensuite.
- « Réduire les valeurs au budget » propose une réduction dans le brouillon. Rien n’est enregistré avant validation explicite.
- Modifier un objet enregistré crée une nouvelle version. L’ancienne reste attachée aux profils/stuffs/replays qui la portent. Retirer la bibliothèque n’efface pas les exemplaires équipés.
- Les erreurs de stockage sont signalées ; aucune réussite ni équipement automatique n’est annoncé si la sauvegarde échoue.

La bibliothèque locale utilise `dofus-lite-custom-equipment-v1`. Les configurations emportent `loadout.customEquipment`, indexé par identifiant d’objet. Les définitions sont revalidées par le moteur : modifier le stockage ou passer par un duel automatique ne contourne pas les plafonds. Ce format est interne ; l’import ZIP des classes/donjons n’est pas étendu aux équipements dans cette version.

## Reproduction des vérifications

```bash
npm run audit:equipment-balance
npm test -- --watch=false --runInBand src/__tests__/customEquipment.test.js src/__tests__/equipmentWorkshopUi.test.js src/__tests__/equipmentDrag.test.js
npm run build
npm run proof:custom-equipment
```

La preuve Chrome utilise un profil isolé et ne modifie pas les sauvegardes du joueur. Elle vérifie création, refus d’un bonus excessif, sauvegarde/rechargement, glisser-déposer, totaux appliqués, présence de l’arme au Kanojedo et affichage mobile. Les tests moteur vérifient les dégâts normaux et critiques, le transport des définitions dans les simulations et les règles d’admission.
