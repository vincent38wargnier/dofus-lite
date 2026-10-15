import { createGame, getView } from '../engine/engine';
import { CLASSES, CLASS_IDS } from '../engine/classes';
import { makeFlow, visualBotPackage, parseVisualBot, flowErrors, FLOW_METRICS, FLOW_OPERATORS, FLOW_WEIGHTS, PLAN_KINDS } from './visualGraph';
import { MAISON_CONTROLS } from './maisonStages';
import { aiFighterReference } from './aiFighterReference';

export const AI_STARTERS = [
  { id: 'maison', name: 'Équilibrée', detail: 'Attaquer, se protéger et exploiter ses sorts.', icon: 'balance' },
  { id: 'aggressive', name: 'Offensive', detail: 'Mettre la pression et finir les cibles.', icon: 'attack' },
  { id: 'prudent', name: 'Protectrice', detail: 'Soigner un allié en danger avant de reprendre le combat.', icon: 'shield' },
];
export function aiFighterChoices(profiles = [], characters = []) {
  return [
    ...profiles.map(p => ({ id: `profile:${p.id}`, name: p.name, classId: p.classId, loadout: p.loadout, group: 'Mes personnages' })),
    ...characters.map(p => ({ id: `creation:${p.id}`, name: p.name, classId: p.classId, loadout: p.loadout, group: 'Mes créations' })),
    ...CLASS_IDS.map(id => ({ id, name: CLASSES[id].name, classId: id, group: 'Classes du jeu' })),
  ];
}

// Resolve exactly the same fighter used by the laboratory, including equipment,
// common and authored spells. Do not silently substitute a class's default kit.
export function aiFighterSnapshot(fighter) {
  const { state } = createGame({ seed: 1, mapId: 'arene', fighters: [
    { id: 'A', name: fighter.name, classId: fighter.classId, loadout: fighter.loadout },
    { id: 'B', name: 'Référence', classId: 'IOP' },
  ] });
  return getView(state, 'A').you;
}

export function parseAiResponse(text) {
  if (typeof text !== 'string' || text.length > 250000) throw new Error('Réponse limitée à 250 Ko.');
  const clean = text.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, '$1');
  return parseVisualBot(clean);
}

export function aiReportSummary(report) {
  if (!report?.games?.length) return null;
  return {
    test: { name: report.test.name, mine: report.test.mine, opponent: report.test.opp, opponentAI: report.test.opponentName, seed: report.test.seed, at: report.test.at },
    games: report.games.map(g => ({ map: g.mapId, side: g.side, seed: g.seed, outcome: g.outcome, turns: g.turns,
      remainingHp: g.remainingHp, opponentHp: g.opponentHp, stats: g.stats, errors: g.events })),
    testedStrategy: report.test.graph ? visualBotPackage(report.test.name, report.test.graph) : { code: report.test.code },
  };
}

export function buildAiPrompt({ fighter, snapshot, goal = '', graph, name = 'Mon IA', report, reference }) {
  if (!snapshot?.spells?.length) throw new Error('Choisissez un combattant valide avec des sorts.');
  const character = reference || aiFighterReference(snapshot);
  const json = v => JSON.stringify(v, null, 2);
  return `Tu es le concepteur de mon IA de combat pour le Koliséum. Aide-moi à battre d'autres IA avec ${fighter.name} (${CLASSES[fighter.classId]?.name || fighter.classId}).
OBJECTIF PERSONNEL : ${goal.trim() || 'Construire une stratégie polyvalente, efficace en dégâts et prudente dans ses placements.'}

MON COMPORTEMENT SOUHAITÉ
Traduis mon objectif en priorités observables : ouverture, cible prioritaire, placement, boosts/invocations, seuils de soin ou de repli et solution de secours si une action est impossible. Respecte les exceptions que j’ai décrites. S’il manque une précision indispensable, pose au maximum trois questions avant la version finale ; sinon fais des choix raisonnables.

LIVRABLE FINAL : retourne uniquement un objet JSON complet au format koliseum-visual-ai ci-dessous, sans JavaScript ni commentaire. Le jeu compile ce graphe en code exécutable ; ce parcours crée une stratégie visuelle, pas un nouvel algorithme JavaScript libre. Je le collerai dans « Importer la réponse » du Studio IA. Donne un nom court et descriptif à la stratégie et des labels lisibles aux blocs. La validation confirme sa structure, pas sa force : je la testerai en combat.

PÉRIMÈTRE DES DONNÉES
Ce dossier décrit uniquement le combattant sélectionné, au niveau et aux grades réellement utilisés, avec son arme et ses sorts communs ou personnalisés équipés. Il ne contient pas les douze classes ni tous les grades. Les classes de référence du Studio sont niveau 100 ; un personnage sauvegardé fournit son vrai niveau et son équipement. N’ajoute pas un sort connu d’une autre version de DOFUS ou un sort absent du grimoire ci-dessous.
Les caractéristiques incluent déjà l’équipement et la forgemagie : ne les additionne pas une seconde fois. Les adversaires, leurs sorts visibles, obstacles et positions sont consultés par Maison pendant le combat ; un ennemi invisible ne révèle pas sa position réelle. Ce dossier n’est pas le scénario d’un match fixé.

COMBATTANT RÉEL
${json(character)}
Les clés de sorts sont exactes. N'invente aucun sort, aucune ressource ni un pouvoir absent. Les valeurs des effets sont des valeurs de base, avant caractéristiques, résistances et critiques. Un équipement ou un boost peut modifier le résultat. Les effets unsupportedEffects sont signalés comme non simulés : ne fonde pas la stratégie dessus. Consulte aussi auditNotes et missingSummons. Les descriptions sont une aide de lecture ; les champs du moteur font foi.

LECTURE DES SORTS ET INVOCATIONS
- range est la portée effective, bonus de PO déjà inclus. pa et cooldown incluent les modificateurs d’équipement. usesPerTurn/usesPerTarget à 0 signifie sans limite spécifique, pas un sort inutilisable. critRate et effectiveCritRate sont des dénominateurs : 2 signifie 1/2 ; 0 désactive les critiques. critEffects remplace toute la liste normale, ne s’y ajoute pas.
- Chaque effet possède sa propre zone, durée, probabilité et ses destinataires. readableEffects et readableCriticalEffects les traduisent en français, avec les effets secondaires des glyphes, pièges et déclenchements. Les lignes d’un sort sont appliquées dans l’ordre.
- targetMode détermine la case visable, pas tous les bénéficiaires. targetMask est un masque de bits cumulables : 1 exclut les alliés, 2 exclut le lanceur, 4 exclut les ennemis, 8 exige une invocation, 16 exclut les invocations, 32 vise uniquement le lanceur. Le masque 0 n’exclut personne. Pour l’Osamodas, certaines lignes de boost visent seulement les invocations, d’autres les combattants non invoqués avec des valeurs différentes.
- summons décrit les créatures réellement invoquées : sources indique le sort et la variante ; grade désigne leur grade ; hp et stats sont déjà ajustés au niveau de l’invocateur. Leurs propres sorts, PA/PM et résistances sont inclus, ainsi que leurs éventuelles invocations. Leurs clés de sorts appartiennent à ces créatures : ne les utilise pas comme spellKey de mon personnage.
- Une invocation mobile joue automatiquement après son invocateur, avec l’IA des invocations du jeu ; ce graphe commande mon personnage seulement. Il décide quoi invoquer, où, quand et comment soutenir la créature, pas ses actions futures exactes. Les invocations statiques ne jouent pas de tour et ne comptent pas dans la limite d’invocations mobiles. Les créatures disparaissent à la mort de leur maître. Les unités marquées unavailable ne sont pas des options fiables.

ACTIONS À COUVRIR
- Dégâts et arme : choisir les bons éléments, finir une menace et éviter le sur-dégât inutile.
- Boosts : actifs immédiatement ; comparer boost + attaques et attaques directes avec les PA restants.
- Soins, vol de vie, protections, renvois et invisibilité : compter leur utilité réelle et le danger.
- PA/PM, poussée, téléportation, zones et invocations : seulement si le grimoire les propose ; tenir compte des alliés, du feu allié, des obstacles et du tacle.
- Invocateurs : leur mort retire leurs invocations ; une invocation menaçante ou bloquante peut toutefois être prioritaire.
- Déplacement : approcher pour débloquer une attaque, ou garder la bonne distance et se couvrir. Éviter les allers-retours sans gain.
- Fin de tour : passer si aucune action utile n'est possible. Respecter PA, PM, portée minimale/maximale, ligne de vue, relances, états et limites de lancer. Ne jamais utiliser une position invisible.

COMMENT LE GRAPHE JOUE
Un appel retourne UNE action, puis tout le graphe est relu après son application. Le moteur Maison cherche des actions légales, évalue les effets/risques et anticipe les enchaînements. Les poids changent ses priorités, jamais les caractéristiques du personnage.
Un bloc plan kind=auto compare sorts ET déplacements. Les catégories de sorts et spell lancent depuis la case actuelle ; elles ne se rapprochent pas. advance/retreat appliquent une règle de distance simple. Si aucun choix n'est trouvé (PASS), la sortie fallback est suivie. Évite une attaque inconditionnelle avant le plan général : elle pourrait empêcher tous les boosts. Une condition de soin avec repli auto est un bon point de départ. N'utilise pas un sort de boost répété sans limite comme première règle.
LIMITES À RESPECTER : les seuls tests exacts sont les conditions listées ci-dessous. Les poids influencent le choix de Maison ; ils ne garantissent pas une cible nommée ni un ordre fixe de sorts. Un bloc spell impose un sort, mais Maison choisit sa cible. Le graphe n’a pas de mémoire personnalisée pour une séquence arbitraire et ne sait pas tester toute propriété d’un allié. Si mon objectif exige une règle que ces blocs ne peuvent pas exprimer, explique la limite avant de fournir la version finale et propose une alternative ou l’éditeur JavaScript avancé. N’invente pas de condition ou de champ JSON et ne prétends pas avoir implémenté exactement une simple approximation.

CONTRAT JSON EXACT
Racine : { "format":"koliseum-visual-ai", "version":1, "name":"Nom", "graph":{"version":1,"nodes":[...]}}.
Chaque bloc : id unique [a-zA-Z0-9_-] de 1 à 60 caractères ; x et y entre 0 et 12000 ; label facultatif (80 caractères max) ; type ; links ; config selon le type. Maximum 32 blocs. Un seul start, au moins un end, toutes les sorties reliées, aucune boucle ni retour au start.
- start : links={"next":"id"}, pas de config.
- end : links={}, pas de config.
- condition : config={"metric":"hp","operator":"<","value":40}, links={"yes":"id","no":"id"}.
- plan : config={"kind":"auto","base":"maison","weights":{}}, links={"fallback":"id"}. Pour kind=spell, ajouter spellKey avec une clé du grimoire. base=maison est recommandé ; cortex est aussi accepté.
Types de plan : ${json(PLAN_KINDS)}.
Conditions (valeur numérique >=0, maximum indiqué) : ${json(Object.fromEntries(Object.entries(FLOW_METRICS).map(([key,v]) => [key, { description:v.label, max:v.max }])))}.
Opérateurs : ${Object.keys(FLOW_OPERATORS).join(', ')}.
Poids facultatifs (nombres >=0, pas des pourcentages) : ${json(FLOW_WEIGHTS.map(w => ({ key:w.key, max:w.max, description:w.hint })))}.
Les poids non fournis héritent de Maison selon les classes. healThreshold et retreatHp sont des ratios de 0 à 1. Des poids extrêmes ne garantissent pas une meilleure IA.
Réglages de recherche facultatifs dans config.pipeline (les nombres suivent min/max/step) : ${json(MAISON_CONTROLS.map(({key,default:value,min,max,step,choices,hint})=>({key,default:value,min,max,step,choices,hint})))}.
Utilise seulement les types start, condition, plan, end dans ta réponse ; si la stratégie fournie contient des étapes maison-stage, réunis les étapes d'un même group en un bloc plan avec les kind/base/weights du profile et tous leurs settings dans config.pipeline. Conserve les branches externes et le fallback du choose. Ne modifie pas les sorts.

EXEMPLE IMPORTABLE
${json(visualBotPackage('Ma sentinelle', makeFlow('prudent')))}

STRATÉGIE ACTUELLE À AMÉLIORER
${graph ? json({format:'koliseum-visual-ai',version:1,name,graph}) : 'Crée un graphe à partir du contrat ci-dessus.'}
${graph && flowErrors(graph).length ? `Ce brouillon est incomplet. Corrige aussi ces erreurs : ${flowErrors(graph).join(' ')}` : ''}
${report ? `\nMESURES DU DERNIER TEST (la stratégie testée peut différer de l'actuelle)\n${json(aiReportSummary(report))}\nAnalyse victoires, tours, dégâts, erreurs et pertes de PV. Ne prétends pas avoir simulé : propose une hypothèse à comparer sur les mêmes personnages, cartes et graines.` : '\nJe commencerai par un duel, puis six duels sur trois cartes avec les côtés inversés. Prévois une stratégie qui ne dépende pas d’une seule position de départ.'}
`;
}
