# Budgets des sorts personnalisés

Version de calcul : **1**. Le calcul commun se trouve dans `src/engine/spellBalance.js`. Le créateur, l’import ZIP, les profils sauvegardés et le lancement des combats utilisent les mêmes budgets.

## Limites

| Contrôle | Limite | Ce qui est compté |
| --- | ---: | --- |
| Sort | 100 points | Tous les effets normaux et critiques |
| Classe ou monstre créé | 650 points | Somme des sorts, synergies et rotation des relances |
| Nombre de sorts | 10 | L’arme reste supplémentaire |
| Critique créé | Variante complète | Même action, élément, zone, destinataires ; valeurs et durée au moins égales |

650 autorise une moyenne de 65 points sur dix emplacements : quelques sorts forts, complétés par des outils moins coûteux. Ce choix conservateur empêche d’empiler dix sorts à 100. Ce n’est pas une formule officielle Ankama ni une preuve d’équilibre compétitif.

Les kits d’origine restent inchangés. Un sort exact du catalogue des classes ou des sorts communs conserve ses contraintes et ses effets particuliers ; son coût de sélection est plafonné à 100. Une copie modifiée, un sort inventé ou un sort de monstre ne bénéficie pas de cette admission des sorts d’origine. Les sorts de boss peuvent ainsi dépasser largement le budget d’un personnage personnalisé.

## Origine des repères

Le recensement couvre **264 sorts au grade 6, dans les 12 classes**, issus de `spellLibrary.json`. Il conserve les coûts, portées, restrictions, effets et critiques. Le sous-ensemble comparable contient 39 attaques simples, immédiates, sans condition d’état, ciblage des seules invocations ou longue relance.

| Attaques simples | Médiane des dégâts moyens bruts / PA | 90e percentile |
| --- | ---: | ---: |
| À distance, une cible | 4,5 | 8,767 |
| Au contact, une cible | 8,25 | 10,975 |
| Zone, par victime avant coefficient | 6,5 | 8,25 |

Ces ratios ne suffisent pas à classer la puissance d’un sort. Fouet, limité aux invocations, ne constitue pas un plafond de dégâts générique. Colère de Iop coûte 7 PA, porte à une case et possède une relance de quatre tours ; sa charge est un gain différé, pas des dégâts disponibles à chaque action. Son estimation comprend les dégâts de départ et la charge différée, avec un crédit de relance plafonné. Les estimations des invocations, réactions et états natifs restent approximatives.

Reproduire le recensement et son empreinte de source :

```bash
node scripts/audit_class_balance.cjs
node scripts/audit_spell_budgets.cjs
```

Le second script fournit les valeurs de chaque sort, les cinq plus faibles et les cinq plus élevés en dégâts bruts par PA du sous-ensemble comparable. Il sépare ce classement descriptif du score d’admission.

## Calcul

Le modèle exprime les effets en équivalents de dégâts bruts, avec un personnage de référence à 600 de caractéristique et +56 dommages. Les huit points ajoutés à **chaque ligne** représentent l’intérêt des dommages fixes. Le score ne dépend pas du stuff momentanément équipé dans l’atelier : enlever son équipement ne permet pas de valider un sort plus fort.

Les formules exactes, coefficients et poids sont inclus dans le prompt IA copiable et dans `public/templates/content-packages/rules.md`. `packageSpecDocument()` expose également la version, les plafonds et les poids.

| Dimension | Traitement |
| --- | --- |
| Jets | 32,5 % du minimum + 67,5 % du maximum |
| Coût | Puissance divisée par les PA |
| Critique | Maximum du normal, de la moyenne normal/critique et du critique divisé par 1,35 |
| Probabilité critique | Évaluation à équipement critique élevé ; pas de remise pour 1/100 |
| Relance | Crédit progressif, plafonné à ×2 ; ne justifie jamais une frappe arbitraire |
| Portée | Grande portée, portée modifiable et absence de ligne de vue coûtent davantage |
| Zone | Surface et possibilité de toucher plusieurs cibles ; supplément si les alliés sont épargnés |
| Lignes multiples | Chaque ligne paie son potentiel de dommages fixes |
| Vol de vie | Dégâts et soin comptés ensemble |
| Boosts, armures, retraits | Valeur, durée et possibilité de cumul |
| Ordre des effets | Un boost personnel placé avant les dégâts augmente aussi le coût de la frappe |
| Lancers limités | Réduction bornée ; pas de réduction par cible pour une zone visant le vide |
| Échecs | Pas de remise pour permettre des valeurs extrêmes |

Les PA gagnés doivent, au total, rester inférieurs au coût du sort. Le sort doit avoir un lancer par tour et une relance supérieure à la durée du bonus. Additionner plusieurs lignes de PA ne contourne pas cette règle.

Le budget du kit ajoute aux scores individuels une surcharge pour les boosts de dégâts, caractéristiques, puissance, PA et vulnérabilités qui amplifient ses attaques. L’arme compte comme débouché offensif, même sans sort de dégâts. Les gains de PA cumulés au-delà de deux reçoivent en plus une surcharge quadratique : plusieurs petits générateurs ne peuvent pas contourner le budget. Plusieurs grosses attaques à relances indépendantes coûtent aussi davantage : les alterner réduit leur véritable temps d’attente.

## Édition et anciennes sauvegardes

Le lecteur conserve les anciennes créations, même hors budget ou avec un critique trop faible. Elles sont modifiables et ne sont ni supprimées ni affaiblies en silence. Le lancement d’un nouveau combat explique les dépassements ; les parties déjà lancées restent inchangées.

Dans l’éditeur :

1. Les deux budgets se recalculent à chaque changement.
2. Un critique encore identique au normal suit automatiquement ses modifications.
3. Un critique personnalisé inférieur au normal bloque la validation ; **Aligner sur les effets normaux** rétablit une variante complète.
4. **Rééquilibrer les valeurs** propose une réduction des valeurs et, si nécessaire, une hausse des PA. Le nom, l’identité, les images, les éléments, la zone et l’ordre des effets restent attachés au même sort. Les règles des gains de PA sont corrigées aussi.
5. La proposition ne remplace la sauvegarde qu’après **Enregistrer**. Un ancien kit trop fort peut être corrigé progressivement ; chaque correction doit réduire son dépassement. Le combat reste bloqué jusqu’à validation de l’ensemble.

## Vérifications et limites

Les tests couvrent le cas signalé d’Argent russe (quatre lignes 149–150 pour 1 PA, critique resté à 18), les critiques incomplets, les coûts et relances, la zone, les boosts avant dégâts, les cumuls, les lignes multiples, les boucles de PA, les budgets complets, l’import ZIP et la conservation des sauvegardes. Des lancers réels contrôlent le résultat normal et critique après correction.

Un score reste une estimation de conception. L’efficacité de l’IA, les positions, l’équipement, les résistances, les invocations et les combinaisons entre plusieurs alliés demandent toujours des essais en combat. Les poids et le budget portent une version afin de pouvoir être révisés avec ces observations.
