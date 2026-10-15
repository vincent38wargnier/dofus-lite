// A stable execution contract for the real Maison planner. These stages share
// one decision-local session; their order follows the planner's dependencies.
export const MAISON_STAGES = [
  { id: 'profile', title: 'Adapter les priorités', short: 'Profil du combattant et de son adversaire', description: 'Charge les poids généraux, puis le profil Maison appris pour ces classes. Vos priorités remplacent uniquement les valeurs modifiées.', input: 'Classes et réglages du graphe', output: 'Poids utilisés pour cette décision' },
  { id: 'observe', title: 'Lire le terrain', short: 'Occupants, obstacles et lignes de vue', description: 'Construit la carte connue du combattant. Les positions cachées ne deviennent pas visibles. Les règles du moteur restent la référence pour valider les actions.', input: 'Vue publique du combat', output: 'Cases occupées et règles de visibilité' },
  { id: 'target', title: 'Évaluer les menaces', short: 'Danger, invocateurs et cibles fragiles', description: 'Estime les attaques adverses et la menace des invocations dépendantes. Choisit une cible de placement ; les autres ennemis restent candidats aux attaques.', input: 'Ennemis, leurs sorts et leurs dépendances', output: 'Cible prioritaire et valeur des victimes' },
  { id: 'spells', title: 'Noter les sorts', short: 'Dégâts, soins, boosts, zones et risques', description: 'Évalue les effets utiles, les protections, les critiques et le feu allié. Essaie aussi des cases vides pour les zones. Ce sont des scores de décision, pas des dégâts annoncés.', input: 'Grimoire, PA, relances et cibles', output: 'Couples sort / case avec un score immédiat' },
  { id: 'combos', title: 'Anticiper les enchaînements', short: 'Meilleure suite avec les PA restants', description: 'Garde la meilleure visée légale de chaque sort, puis estime les attaques suivantes et les boosts immédiats. La recherche est bornée ; elle ne déroule pas toutes les suites possibles.', input: 'Sorts candidats et PA disponibles', output: 'Meilleur lancer immédiat, suite comprise' },
  { id: 'movement', title: 'Comparer les placements', short: 'Attaques débloquées, danger et tacle', description: 'Présélectionne les cases accessibles, puis vérifie les attaques depuis les meilleures. Compare le gain du déplacement avec le lancer déjà disponible.', input: 'PM, danger, meilleurs lancers et chemins', output: 'Meilleur déplacement légal' },
  { id: 'choose', title: 'Jouer la meilleure action', short: 'Lancer, se déplacer ou passer', description: 'Compare les scores, retourne une seule action et mémorise la décision. Après son application, tout le graphe recommence avec le nouvel état du combat.', input: 'Meilleur lancer et meilleur déplacement', output: 'Une action contrôlée par le moteur' },
];
export const MAISON_CONTROLS = [
  { key: 'targetPolicy', stage: 'target', label: 'Cible de placement', default: 'threat', choices: { threat: 'Menace et invocations · Maison', nearest: 'Adversaire visible le plus proche', weakest: 'Adversaire visible avec le moins de PV' }, hint: 'Change la destination et la distance idéale ; toutes les victimes restent évaluées.' },
  { key: 'friendlyFire', stage: 'spells', label: 'Pénalité des dégâts aux alliés', default: 1.1, min: .25, max: 3, step: .05, hint: 'Multiplicateur de risque pour les dégâts infligés aux alliés. Les dégâts réels restent inchangés.' },
  { key: 'freeCellAims', stage: 'spells', label: 'Visées libres examinées', default: 3, min: 1, max: 6, step: 1, hint: 'Téléportations, invocations et pièges ; une case défensive peut s’ajouter.' },
  { key: 'combosEnabled', stage: 'combos', label: 'Anticiper les attaques suivantes', default: true, hint: 'Désactivé : seuls les effets immédiats comptent dans les lancers.' },
  { key: 'continuationWeight', stage: 'combos', label: 'Poids des attaques suivantes', default: .85, min: 0, max: 2, step: .05, hint: 'Ajouté au score immédiat : poids × valeur de la suite estimée.' },
  { key: 'forecastTargets', stage: 'combos', label: 'Victimes suivies dans les enchaînements', default: 3, min: 1, max: 5, step: 1, hint: 'Les effets immédiats comptent toujours toutes les victimes de la zone.' },
  { key: 'movementEnabled', stage: 'movement', label: 'Évaluer les déplacements', default: true, hint: 'Désactivé : l’IA ne choisit pas de marche dans ce pipeline. Un sort de déplacement reste possible.' },
  { key: 'moveCells', stage: 'movement', label: 'Cases vérifiées en détail', default: 6, min: 1, max: 12, step: 1, hint: 'Après la présélection de toutes les cases accessibles. Plus de cases = plus de calcul.' },
  { key: 'moveAims', stage: 'movement', label: 'Visées par sort après déplacement', default: 4, min: 1, max: 8, step: 1, hint: 'Limite les visées à comparer depuis chaque case retenue.' },
  { key: 'moveFollowups', stage: 'movement', label: 'Lancers anticipés par case', default: 3, min: 1, max: 5, step: 1, hint: 'Nombre de lancers dont la suite est évaluée après déplacement.' },
  { key: 'castFloor', stage: 'choose', label: 'Score minimum d’un lancer', default: .012, min: 0, max: 2, step: .001, hint: 'Seuil utilisé dès la sélection des lancers. Un score n’est pas une quantité de dégâts.' },
  { key: 'preferCast', stage: 'choose', label: 'À égalité, lancer avant de marcher', default: true, hint: 'Maison lance d’abord puis recalcule le déplacement après l’action.' },
];
export const MAISON_DEFAULTS = Object.fromEntries(MAISON_CONTROLS.map(c => [c.key, c.default]));
export function maisonSettingsErrors(settings = {}, stage) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return ['Réglages Maison invalides.'];
  return Object.entries(settings).flatMap(([key,value]) => {
    const c = MAISON_CONTROLS.find(c => c.key === key && (!stage || c.stage === stage));
    const valid = c && (c.choices ? typeof value === 'string' && Object.hasOwn(c.choices,value) : typeof c.default === 'boolean' ? typeof value === 'boolean'
      : Number.isFinite(value) && value >= c.min && value <= c.max && (c.step !== 1 || Number.isInteger(value)));
    return valid ? [] : [`Réglage Maison invalide : ${key}.`];
  });
}
