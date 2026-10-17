import { DEFAULT_CLASS_ID } from '../engine/classes';
import { createGame, getView } from '../engine/engine';
import { aiFighterReference } from './aiFighterReference';
import { aiFighterSnapshot } from './aiAuthoring';
import { inspectAiSource } from './aiCodeTesting';
import { writeContentZip } from '../content/zip';

export const AI_STORAGE = { saved: 'koliseum.bots.v1', drafts: 'koliseum.ai-studio.v1' };
export const AI_TEST_COMMANDS = [
  { name: 'Vérifier', command: 'node test.cjs check bot.js', detail: 'Syntaxe et actions légales dans 10 situations.' },
  { name: 'Jouer un duel', command: 'node test.cjs duel bot.js --against maison', detail: 'Un combat complet avec le vrai moteur.' },
  { name: 'Comparer', command: 'node test.cjs benchmark bot.js --against maison --report results.json', detail: '6 combats, 3 cartes, côtés inversés.' },
];

export const CODING_API = `# API de combat

Écrire un script JavaScript sans import/export, avec function decide(view, api).
Une action synchrone par appel ; la vue est relue après chaque action. Une fonction indépendante par combattant et par match ; les variables déclarées hors de decide peuvent mémoriser votre plan. N'utilisez pas les données privées du moteur, le réseau, le DOM, Date.now() ou Math.random() : api.random() est reproductible.

## Vue publique

example-view.json est un vrai exemple du personnage sélectionné. Les champs principaux :
- view.you : id, team, classId, level, pos={x,y}, hp, maxHp, pa, pm, basePa, basePm, stats, resistances, resistancesFixed, maxSummons, effects, usedOnTarget, spells.
- view.allies : alliés vivants sauf soi ; view.enemies : ennemis vivants, invocations comprises. view.enemy est une référence historique au premier ennemi : privilégiez enemies pour les groupes.
- Chaque combattant expose ses spells, son ownerId, isSummon, staticSummon, hidden. Une position hidden est une dernière position connue, jamais une position actuelle garantie.
- view.turn, maxTurns, isMyTurn ; board={width,height,obstacles:[{x,y,type,blocksMove,blocksLos}]} ; hazards visibles.
- Chaque sort : key, name, pa, range=[min,max] effective (PO déjà incluse), effects, critEffects, cooldownLeft, usesLeft, usesPerTurn, usesPerTarget, targetMode, needsLos, lineOnly, requiredStates, forbiddenStates.
- critEffects remplace tous les effets normaux. usesPerTurn=0 signifie sans limite spécifique. critRate est un dénominateur, pas un pourcentage. Les boosts appliqués sont immédiatement actifs. Les invocations disparaissent avec leur maître et jouent avec l'IA du jeu, pas votre decide.

## Actions et helpers

| Appel | Résultat |
| --- | --- |
| api.cast(key, {x,y}) | {type:'CAST', spell:key, target:{x,y}} ; cible par défaut = soi |
| api.move({x,y}) | {type:'MOVE', to:{x,y}} |
| api.endTurn() | {type:'PASS'} |
| api.say(text) | {type:'SAY', text} ; 80 caractères, 2 bulles visibles par tour |
| api.canCast(key, target) / api.canMove(pos) | {ok,reason} : tester .ok, pas l'objet |
| api.castTargets(key) | Cases légalement visables maintenant |
| api.reachable() | [{pos,cost,path}] : cases atteignables avec les PM restants |
| api.pathTo(pos) | Chemin sans limite de PM, ou null |
| api.moveToward(pos) / api.moveAway(pos) | Action MOVE, ou null |
| api.dist(a,b) / api.aligned(a,b) | Distance de Manhattan / même ligne ou colonne |
| api.hasLos(from,to) / api.isFree(pos) | Ligne de vue / case libre |
| api.canCastFrom(key,target,from) | Légalité depuis une case hypothétique ; vérifier aussi qu'on peut l'atteindre |
| api.canCastAfter(firstKey,firstTarget,nextKey,nextTarget,from?) | Prévision limitée aux PA, relances et boosts immédiats du lanceur ; pas une simulation complète |
| api.simulatePush(from,victim,cells) | {to,moved,blocked}, sans modifier le combat |
| api.tackleInfo() | {inContact,escapeChance,paIfTackled} |
| api.random() / api.pick(array) | Aléatoire déterministe |
| api.maison() | Choix du planificateur Maison, bon repli |
| api.maisonWeights() / api.suggest(weights) | Poids de Maison / décision avec poids personnalisés |
| api.plan(config) / api.maisonPipeline(config) | Plans visuels ; lire engine-source/src/bots/visualPlanner.js |
| api.rememberDecision(action) | Mémorise un choix dans l'API pour éviter de répéter une action refusée |

Les créateurs d'actions ne valident pas leur légalité : utilisez canCast/canMove avant.
Le tour a un budget de 25 actions ; 3 actions invalides font passer le tour. Une exception fait passer le tour aussi. PASS est une décision valide même si elle est mauvaise stratégiquement. Des corps invisibles peuvent contredire la vue publique : ne répétez pas une action refusée à l'identique.
Le test portable refuse api.neural() et api.strategeNet() car il n'embarque pas leurs modèles/workers de navigateur. api.stratege() existe en recherche synchrone, avec un coût de calcul plus élevé.

## Tests ciblés supplémentaires

Le kit exporte aussi des fonctions, utilisables avec node:test et node:assert/strict :

\x60\x60\x60js
const { checkAiCode, aiTestCases, checkAiAction, benchmarkAiCode } = require('./runtime.cjs');
const fighter = require('./fighter.json');
const code = require('node:fs').readFileSync('bot.js', 'utf8');
const cases = aiTestCases(fighter); // {name,view} ; ajouter vos cas ici
const result = checkAiCode({ code, fighter, cases });
require('node:assert/strict').equal(result.ok, true, JSON.stringify(result.errors));
\x60\x60\x60

Ces fonctions s'exécutent dans le processus appelant. Le CLI test.cjs les lance dans un worker interrompu après 180 secondes (modifiable avec --timeout). Ce n'est pas un bac à sable de sécurité : n'exécutez que du code local choisi pour vos tests.
`;

export function buildCodingPrompt({ name, fighter, goal = '' }) {
  return `Je veux améliorer « ${name} » pour ${fighter.name || fighter.classId} dans Koliséum.

COMPORTEMENT SOUHAITÉ : ${goal.trim() || '[Décrire ici l’ouverture, les cibles prioritaires, les invocations/boosts, la distance, les seuils de soin/repli et les exceptions.]'}

Travaille dans ce dossier. Lis README.md, API.md, fighter-reference.json et example-view.json, puis bot.js. fighter.json est la préparation exacte, avec équipements, forgemagie et sorts personnalisés. fighter-reference.json contient le vrai grimoire et les caractéristiques des invocations avec leurs propres sorts : aucune connaissance d'une autre version de DOFUS ne doit remplacer ces données.

Modifie uniquement bot.js et ajoute si utile des tests ciblés. Écris function decide(view, api), une action synchrone par appel, sans dépendance npm, import/export, DOM ou requête réseau. Les variables au niveau du script peuvent garder une mémoire par combattant/match. Ne change ni fighter.json, ni les références, ni runtime.cjs pour améliorer les résultats artificiellement. Les sources lisibles dans engine-source/ sont des références : les modifier ne modifie pas le jeu ni le runtime.

Traduis mon intention en règles concrètes, avec des seuils et un repli si aucune action prioritaire n'est légale. Si une précision essentielle manque, demande-la. Utilise api.canCast(...).ok et api.canMove(...).ok ; considère PA/PM, relances, limites par cible, zones, alliés, tacle, résistances, états et danger. Les boosts agissent immédiatement. Le maître contrôle ses sorts d'invocation mais pas les décisions futures de la créature.

Avant toute modification, conserve bot.js dans baseline.js. Exécute :
node test.cjs check bot.js
node test.cjs benchmark baseline.js --against maison --seed 12000 --report baseline-results.json

Après la modification :
node test.cjs check bot.js
node test.cjs benchmark bot.js --against maison --seed 12000 --report results.json
node test.cjs benchmark bot.js --against maison --seed 23000 --report validation-results.json

Compare les résultats avec les mêmes personnages, cartes et graines. Corrige les actions invalides et erreurs ; un match perdu ou un nul n'est pas une erreur de code. Teste des adversaires/classes supplémentaires avec --against et --opponent si mon plan doit être généraliste. Les six duels d'un lot restent un petit échantillon : ne promets pas que cette IA est imbattable. Une durée dépassée ne valide pas le code.

Livraison : bot.js modifié, tests ajoutés et rapports JSON réels. Explique brièvement les règles, les limites, les résultats observés et les commandes exécutées. N'invente pas de simulations. Je réimporte bot.js dans Studio IA → Importer une IA, je teste puis j'enregistre la nouvelle copie.
`;
}

export function codingProjectFiles({ name, code, fighter, goal = '', graph, origin = '' }, assets) {
  const check = inspectAiSource(code); if (!check.ok) throw new Error(check.error);
  const snapshot = aiFighterSnapshot(fighter), reference = aiFighterReference(snapshot);
  const { state } = createGame({ mapId: 'arene', seed: 12000, fighters: [
    { ...fighter, id: 'A' }, { id: 'B', classId: DEFAULT_CLASS_ID },
  ] });
  const json = value => JSON.stringify(value, null, 2) + '\n';
  const files = new Map([
    ['bot.js', code + '\n'], ['fighter.json', json({ name: fighter.name, classId: fighter.classId, ...(fighter.loadout ? { loadout: fighter.loadout } : {}) })],
    ['fighter-reference.json', json(reference)], ['example-view.json', json(getView(state, 'A'))],
    ['PROMPT.md', buildCodingPrompt({ name, fighter, goal })], ['API.md', CODING_API],
    ['README.md', `# ${name} — projet IA\n\n## Démarrer\n\n1. Décompressez le ZIP et ouvrez ce dossier dans Claude Code, VS Code ou votre éditeur.\n2. Lisez PROMPT.md, précisez le comportement voulu, puis modifiez bot.js.\n3. Installez Node.js 20+ si nécessaire. Aucun npm install, dépôt du jeu ou accès réseau n'est nécessaire.\n4. Exécutez les commandes ci-dessous depuis ce dossier.\n5. Dans le jeu, Studio IA → Importer une IA → choisissez bot.js, testez puis Enregistrer. L'import crée une nouvelle copie.\n\n## Tester\n\n\x60\x60\x60bash\n${AI_TEST_COMMANDS.map(c => c.command).join('\n')}\n\x60\x60\x60\n\nnode test.cjs --help décrit --fighter, --opponent, --against ./baseline.js, --seed, --timeout et --report. La comparaison utilise par défaut le même personnage des deux côtés. Un personnage de niveau/équipement différent demande un autre fichier --opponent. Les invocations gardent leur IA autonome.\n\nLes rapports JSON donnent les erreurs, actions invalides, victoires/défaites/nuls, tours, dégâts et empreintes des fichiers testés. Un code de sortie 1 signale une erreur technique ou une comparaison invalide, pas une défaite. Un code de sortie 0 n'est pas une preuve de qualité ni un audit de sécurité. Le moteur et les données correspondent à runtime-version.json ; téléchargez un nouveau kit après une mise à jour du jeu.\n\n## Où sont mes IA ?\n\nAdresse du jeu lors de l'export : ${origin || '(adresse du jeu)'}\n\nLes IA du Studio sont stockées dans localStorage de ce navigateur et de cette adresse, clés ${AI_STORAGE.saved} (enregistrées) et ${AI_STORAGE.drafts} (brouillons). Elles ne sont pas automatiquement écrites dans le dépôt. Ce dossier est une copie indépendante, à l'endroit où vous avez extrait le ZIP. Il n'y a pas de synchronisation automatique : réimportez bot.js après modification. Conservez ce dossier comme sauvegarde.\n\n## Fichiers\n\n| Fichier | Rôle |\n| --- | --- |\n| bot.js | Votre code exécutable, à modifier |\n| fighter.json | Préparation complète servant aux tests ; conserver pour comparer |\n| fighter-reference.json | Sorts, équipement déjà appliqué et invocations |\n| example-view.json | Exemple réel des données reçues par decide |\n| API.md / PROMPT.md | Contrat des fonctions / consigne pour l'assistant |\n| test.cjs / runtime.cjs | CLI / moteur réel, lisible et non minifié |\n| engine-source/ | Sources lisibles du moteur et de Maison, pour comprendre |\n\nLe kit n'exporte pas les images : elles ne participent pas aux calculs. Pour partager le personnage jouable avec son apparence, utilisez l'export de l'Atelier. L'import de bot.js ne modifie pas les personnages. ${graph ? 'original-flow.json sauvegarde les blocs d’origine. Après édition de bot.js, ils ne sont plus automatiquement équivalents : importez uniquement bot.js pour utiliser vos modifications.' : ''}\n\n## Dans le dépôt du jeu\n\n- src/ui/botsStore.js : stockage des IA enregistrées.\n- src/ui/AiStudio.js : brouillons, éditeur et import.\n- src/bots/api.js : fonctions accessibles à decide.\n- src/bots/compile.js : compilation et garde de boucles.\n- src/bots/maison.js, utilityBrain.js, tactics.js : logique de Maison.\n- src/arena/runner.js : arbitre des combats automatiques.\n- src/bots/aiCodeTesting.js : fonctions de validation et comparaisons.\n- scripts/build_ai_coding_kit.cjs : construit le moteur portable.\n\nDepuis le dépôt : npm run ai:kit pour reconstruire les outils, puis npm run ai:test -- check /chemin/du/projet/bot.js. Le jeu continue d'utiliser les IA enregistrées dans le navigateur jusqu'à leur réimportation.\n`],
  ]);
  if (graph) files.set('original-flow.json', json({ format: 'koliseum-visual-ai', version: 1, name, graph }));
  for (const key of ['test.cjs', 'runtime.cjs', 'runtime-version.json']) {
    if (!assets?.[key]) throw new Error(`Outil manquant : ${key}. Rechargez le jeu puis réessayez.`);
    files.set(key, assets[key]);
  }
  const sources = JSON.parse(new TextDecoder().decode(assets['sources.json']));
  for (const [file, source] of Object.entries(sources)) {
    if (!/^src\/(bots|engine|arena)\/[a-zA-Z]+\.js$/.test(file) || typeof source !== 'string') throw new Error('Références de code invalides.');
    files.set(`engine-source/${file}`, source);
  }
  return files;
}

export async function downloadAiCodingProject(config, fetchFile = fetch) {
  const names = ['runtime.cjs', 'test.cjs', 'runtime-version.json', 'sources.json'];
  const assets = Object.fromEntries(await Promise.all(names.map(async name => {
    const response = await fetchFile(`${process.env.PUBLIC_URL || ''}/templates/ai-coding/${name}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Téléchargement impossible : ${name}. Relancez la compilation du jeu.`);
    return [name, new Uint8Array(await response.arrayBuffer())];
  })));
  const files = codingProjectFiles(config, assets);
  const bytes = writeContentZip(files), url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
  const link = document.createElement('a'); link.href = url; link.download = `${config.name.replace(/[^a-z0-9_-]/gi, '-') || 'mon-ia'}-code.zip`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1500);
  return files.size;
}
