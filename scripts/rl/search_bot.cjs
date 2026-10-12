// Prototype « calculateur » — façon moteur d'échecs, ZÉRO entraînement:
// à chaque décision, il énumère son tour (déplacements + sorts via l'api
// officielle), déduplique les états, puis évalue les meilleures fins de tour
// en simulant la RÉPONSE adverse (profondeur 2) et joue la première action
// de la meilleure ligne. Replanifie après chaque action.
//
// Anti-triche dés: la simulation remplace state.rngState par un flux dérivé
// d'un sel — les jets simulés ≠ jets réels (sinon la recherche « connaîtrait »
// les dégâts exacts avant de choisir).
// Limite v0 assumée: lit l'état complet du match (pas la view) — équivalent à
// la view en 1v1 sans invisibilité (IOP/CRA), à porter sur stateFromView pour
// être un builtin loyal.
//
//   node scripts/rl/search_bot.cjs measure            # combien de combinaisons ?
//   node scripts/rl/search_bot.cjs pilot [N]          # N matchs vs IA Maison (défaut 12)
//   node scripts/rl/search_bot.cjs eval N out.jsonl   # run complet, tally JSONL
require('../ai_runtime.cjs');
const fs = require('node:fs');
const { createGame, applyAction, getView, currentFighter } = require('../../src/engine/engine');
const { createRng, hashSeed } = require('../../src/engine/rng');
const { makeBotApi } = require('../../src/bots/api');
const { utilityDecide } = require('../../src/bots/utilityBrain');
const { maisonDecide } = require('../../src/bots/maison');
const { emptyLoadout } = require('../../src/engine/equipment');
const { spellZoneCells } = require('../../src/engine/geometry');
const { turnResources } = require('../../src/engine/formulas');

// Bump à CHAQUE changement du planificateur — tracé dans les logs de match
// (provenance, audit F13): un résultat sans version de recherche est inexploitable.
const SEARCH_VERSION = 'A1-2026-10-11';

const MAP = 'arene';
const MAX_MATCH_ACTIONS = 800;
const PLAN_MAX_APPLIES = Number(process.env.SB_BUDGET || 8000); // budget d'énumération par décision
const DEPTH2_CANDIDATES = 18; // fins de tour évaluées avec réponse adverse
const OPP_TURN_GUARD = 20;

// ---------------------------------------------------------------- loadouts
const LOADOUTS = {
  l100: () => null, // conditions d'entraînement de Synapse: niveau 100 nu
  l200: (cls) => ({ ...emptyLoadout(cls), level: 200, base: {} }),
  l200gear: (cls) => ({ ...emptyLoadout(cls), level: 200, base: { force: 100 }, slots: { weapon: 2416 } }),
};

function makeFighters(loadoutKey, cA, cB) {
  const mk = (id, cls) => {
    const f = { id, name: id, classId: cls };
    const lo = LOADOUTS[loadoutKey](cls);
    if (lo) f.loadout = lo;
    return f;
  };
  return [mk('A', cA), mk('B', cB)];
}

// ---------------------------------------------------------------- helpers
function hpScore(state, myTeam) {
  let me = 0; let meMax = 0; let opp = 0; let oppMax = 0;
  for (const f of Object.values(state.fighters)) {
    if (f.team === myTeam) { me += Math.max(0, f.hp); meMax += f.maxHp; } else { opp += Math.max(0, f.hp); oppMax += f.maxHp; }
  }
  return (me / Math.max(1, meMax) - opp / Math.max(1, oppMax)) * 1000;
}

function stateKeyOf(state) {
  // Clé d'équivalence sémantique (audit F07): tout ce qui conditionne les
  // transitions futures. L'ancienne clé ne gardait que le NOMBRE d'effets —
  // un buff de 1 tour et le même de 3 tours (ou un +40 et un −40 !)
  // fusionnaient, et la recherche élaguait des plans distincts.
  const parts = [state.turn, state.currentIndex];
  for (const id of Object.keys(state.fighters)) {
    const f = state.fighters[id];
    parts.push(id, f.pos.x, f.pos.y, f.hp, f.pa, f.pm,
      JSON.stringify(f.effects || []), JSON.stringify(f.cooldowns || {}),
      JSON.stringify(f.usedThisTurn || {}), JSON.stringify(f.usedOnTarget || {}),
      f.carriedBy || '');
  }
  if ((state.hazards || []).length) parts.push(JSON.stringify(state.hazards));
  return parts.join('|');
}

// Élagage sémantique AVANT applyAction (audit F02): dans ce moteur, chaque
// effet s'applique aux combattants DANS la zone du sort (effectTargets), sauf
// deux familles: effets « case » (pièges, glyphes, téléportations…) et effets
// caster-only (targetMask & 32). Un lancer dont aucune zone d'effet ne touche
// un combattant vivant ne change donc RIEN — avant ce filtre, l'énumération
// payait des milliers de clones moteur pour des flèches dans le vide et le
// plafond CPU expirait avant tout plan à 2 sorts ou sort-puis-repli.
const CELL_EFFECT_KINDS = new Set(['trap', 'glyph', 'teleport', 'summon', 'staticSummon', 'double',
  'cell', 'freeCell', 'swap', 'swapAlly', 'carry', 'throw', 'fear', 'revive', 'rollback']);
function effectfulTargets(view, spell, cells) {
  const rows = [...(spell.effects || []), ...(spell.critEffects || [])];
  if (rows.some(e => CELL_EFFECT_KINDS.has(e.kind))) return cells; // effets « case »: tout garder
  const bodies = new Set();
  for (const f of [view.you, ...(view.allies || []), ...(view.enemies || [])]) {
    if (f && f.hp > 0) bodies.add(`${f.pos.x},${f.pos.y}`);
  }
  const kept = cells.filter(c => rows.some(e =>
    spellZoneCells(e.zone, c, view.you.pos).some(z => bodies.has(`${z.x},${z.y}`))));
  // Effet caster-only: s'applique même dans le vide — toutes les cases vides
  // étant équivalentes, UNE cible représentative suffit.
  if (!kept.length && cells.length && rows.some(e => (e.targetMask || 0) & 32)) return [cells[0]];
  return kept;
}

function candidateCasts(view, api) {
  const out = [];
  const you = view.you;
  const castable = (s) => s && (s.pa || 0) <= you.pa && (s.cooldownLeft || 0) <= 0 && (s.usesLeft ?? 99) > 0;
  for (const s of you.spells || []) {
    if (!castable(s)) continue;
    for (const c of effectfulTargets(view, s, api.castTargets(s.key))) {
      out.push({ type: 'CAST', spell: s.key, target: { x: c.x, y: c.y } });
    }
  }
  const w = you.weaponSpell;
  if (castable(w)) {
    const r1 = w.range?.[1] ?? 2;
    const { x, y } = you.pos;
    const cells = [];
    for (let dy = -r1; dy <= r1; dy++) {
      const span = r1 - Math.abs(dy);
      for (let dx = -span; dx <= span; dx++) {
        const c = { x: x + dx, y: y + dy };
        if (c.x >= 0 && c.y >= 0 && c.x < view.board.width && c.y < view.board.height && api.canCast(w.key, c).ok) {
          cells.push(c);
        }
      }
    }
    for (const c of effectfulTargets(view, w, cells)) out.push({ type: 'CAST', spell: w.key, target: c });
  }
  return out;
}

function nearestEnemyDist(state, meId) {
  const me = state.fighters[meId];
  let best = 99;
  for (const f of Object.values(state.fighters)) {
    if (f.team !== me.team && f.hp > 0) best = Math.min(best, Math.abs(f.pos.x - me.pos.x) + Math.abs(f.pos.y - me.pos.y));
  }
  return best;
}

function preferredRange(view) {
  let r = 1;
  for (const s of view.you.spells || []) {
    const dmg = (s.effects || []).some(e => e.kind === 'damage' || e.kind === 'lifeSteal');
    if (dmg) r = Math.max(r, s.range?.[1] ?? 1);
  }
  return r;
}

// Api DÉTERMINISTE par état: même position → même comportement du modèle
// adverse simulé, pour TOUS les candidats et échantillons (CRN complet).
// Un compteur global ici = chaque candidat affronte une maison différente.
function freshApi(state, meId) {
  return makeBotApi(getView(state, meId), createRng(hashSeed(`api:${meId}:${stateKeyOf(state)}`)));
}

// Potentiel de dégâts du combattant À SON PROCHAIN TOUR depuis la position
// courante (greedy PA sur ses sorts de dégâts avec cible atteignable) —
// l'équivalent du terme « mobilité/menace » d'une éval d'échecs. Sans lui,
// la recherche hp-seule devient passive (ne jamais approcher = ne jamais
// prendre de dégâts… ni en infliger).
function damagePotential(state, fid, counters) {
  const f = state.fighters[fid];
  if (!f || f.hp <= 0) return 0;
  // Potentiel au PROCHAIN tour, sémantique startTurn du MOTEUR (audit F06):
  // cooldowns −1, usages (globaux ET par cible) remis à zéro, PA/PM = base +
  // effets ACTIFS (turnResources). L'ancien code donnait basePa/basePm secs —
  // un adversaire débuffé −2 PM comptait comme menace pleine (la guerre des
  // PM devenait invisible au juge) et Expiation en cooldown 1 comptait pour 0.
  // Si c'est DÉJÀ son tour, startTurn a tout fait: état pris tel quel.
  const active = currentFighter(state).id === fid;
  let fresh = f;
  if (!active) {
    const cooldowns = {};
    for (const [k, cd] of Object.entries(f.cooldowns || {})) if (cd - 1 > 0) cooldowns[k] = cd - 1;
    fresh = { ...f, ...turnResources(f), usedThisTurn: {}, usedOnTarget: {}, cooldowns };
  }
  const s2 = { ...state, fighters: { ...state.fighters, [fid]: fresh } };
  const view = getView(s2, fid);
  const api = freshApi(s2, fid);
  let pa = fresh.pa;
  let total = 0;
  const options = [];
  for (const s of view.you.spells || []) {
    if ((s.cooldownLeft || 0) > 0) continue;
    const dmg = (s.effects || []).filter(e => e.kind === 'damage' || e.kind === 'lifeSteal')
      .reduce((sum, e) => sum + (e.min + e.max) / 2, 0);
    if (!dmg) continue;
    const targets = api.castTargets(s.key);
    counters.applies++; // comptage grossier du coût
    const hitsEnemy = targets.some(c => Object.values(state.fighters)
      .some(e => e.team !== f.team && e.hp > 0 && e.pos.x === c.x && e.pos.y === c.y));
    if (hitsEnemy) options.push({ pa: s.pa || 1, dmg, uses: s.usesPerTurn === 0 ? 9 : s.usesPerTurn });
  }
  options.sort((a, b) => b.dmg / b.pa - a.dmg / a.pa);
  for (const o of options) {
    let u = o.uses;
    while (pa >= o.pa && u-- > 0) { pa -= o.pa; total += o.dmg; }
  }
  return total;
}

// Joue UN tour complet du camp courant avec la politique maison (poids CEM
// du matchup) — le modèle de rollout des deux côtés.
function simTurn(s, counters) {
  const team = currentFighter(s).team;
  let guard = OPP_TURN_GUARD;
  while (!s.over && currentFighter(s).team === team && guard-- > 0) {
    const f = currentFighter(s);
    const api = freshApi(s, f.id);
    let action;
    try { action = maisonDecide(getView(s, f.id), api) || { type: 'PASS' }; } catch { action = { type: 'PASS' }; }
    const r = applyAction(s, action);
    counters.applies++;
    if (!r.ok) { s = applyAction(s, { type: 'PASS' }).state; counters.applies++; continue; }
    s = r.state;
    if (action.type === 'PASS') break;
  }
  if (!s.over && currentFighter(s).team === team) { s = applyAction(s, { type: 'PASS' }).state; counters.applies++; }
  return s;
}

// Score d'une fin de tour candidate: riposte adverse PUIS un round complet
// supplémentaire en politique maison des deux côtés (quiescence — ne jamais
// juger au milieu de l'échange: une ligne « passive » révèle ici qu'on se
// refait tirer dessus au round suivant), et V juge la position CALME.
function depth2Score(endState, meId, myTeam, counters, judge) {
  let s = endState;
  if (!s.over && currentFighter(s).id === meId) {
    const r = applyAction(s, { type: 'PASS' });
    counters.applies++;
    s = r.state;
  }
  if (!s.over) s = simTurn(s, counters); // leur riposte
  if (!s.over) s = simTurn(s, counters); // mon tour suivant (politique maison)
  if (!s.over) s = simTurn(s, counters); // leur tour suivant
  // Échelle commune avec V (±1000 = issue certaine): un ancien ±1e6 écrasait
  // la moyenne des échantillons — 1 victoire simulée sur 3 battait n'importe
  // quelle position dominante sans terminaison dans l'horizon.
  if (s.over) return s.winner === myTeam ? 1000 : s.winner ? -1000 : 0;
  // Clamp ±999: aucune position ne doit surclasser une ISSUE réelle — sans ça
  // l'heuristique (PV±1000 + menace±350 + létale±300) dépassait ±1000 et le
  // bot préférait une « belle position » à une victoire certaine (régression
  // mesurée: 0/32 au lieu de 59%).
  const v = (judge || leafEval)(s, meId, myTeam, counters);
  return Math.max(-999, Math.min(999, v));
}

// Éval de feuille par défaut (heuristique main): PV + menace. Remplaçable par
// un réseau de valeur appris via setLeafEval (siège TD-Gammon).
function heuristicLeaf(s, meId, myTeam, counters) {
  // Terme de menace (voir damagePotential): pousse à se placer là où l'on
  // menace plus qu'on n'est menacé — c'est lui qui fait engager la mêlée.
  let mine = null; let theirs = null; let myHp = 0; let myMax = 1; let oppHp = 0; let oppMax = 1;
  for (const f of Object.values(s.fighters)) {
    if (f.hp <= 0) continue;
    if (f.team === myTeam) { myHp = f.hp; myMax = f.maxHp; mine = mine ?? damagePotential(s, f.id, counters); }
    else { oppHp = f.hp; oppMax = f.maxHp; theirs = theirs ?? damagePotential(s, f.id, counters); }
  }
  mine = mine || 0; theirs = theirs || 0;
  let score = hpScore(s, myTeam) + (mine / oppMax - theirs / myMax) * 1000 * 0.35;
  if (mine >= oppHp) score += 300; // létale visible à mon prochain tour
  if (theirs >= myHp) score -= 300;
  return score;
}
let leafEval = heuristicLeaf;
function setLeafEval(fn) { leafEval = fn || heuristicLeaf; }

// Plan complet du tour depuis l'état réel; retourne la 1re action de la
// meilleure ligne (ou PASS). stats: applies, ends, ms.
// `judge` (optionnel): éval de feuille PROPRE à cet appel — permet deux bots
// avec deux juges différents dans UN match (audit F12), sans état global.
function searchDecide(realState, counters, judge) {
  const t0 = performance.now();
  const meId = currentFighter(realState).id;
  const myTeam = currentFighter(realState).team;
  // Jets simulés ≠ jets réels: flux rng remplacé (applyAction clone l'état,
  // la copie superficielle est donc sûre). SB_CLAIRVOYANT=1 = sonde de
  // DIAGNOSTIC: planifie avec les vrais dés (borne haute, pas du jeu loyal).
  // Graines dérivées de l'ÉTAT, pas d'un compteur process (audit F13): une
  // partie rejouée seule reproduit exactement ses décisions, quel que soit
  // l'ordre des parties dans le process.
  const rootKey = stateKeyOf(realState);
  const simRng = createRng(hashSeed(`sim:${rootKey}`));
  const root = process.env.SB_CLAIRVOYANT === '1'
    ? realState
    : { ...realState, rngState: simRng.getState() };

  const baseHp = hpScore(root, myTeam);
  const ends = []; // { state, first, moved, depth }
  const seen = new Set([stateKeyOf(root)]);
  const startNodes = [{ state: root, first: null, moved: false, depth: 0, last: null, spells: '', acts: [] }];
  {
    const api = freshApi(root, meId);
    for (const cell of api.reachable()) {
      const a = { type: 'MOVE', to: { x: cell.pos.x, y: cell.pos.y } };
      const r = applyAction(root, a);
      counters.applies++;
      if (r.ok) {
        seen.add(stateKeyOf(r.state));
        startNodes.push({ state: r.state, first: a, moved: true, depth: 1, last: 'MOVE', spells: '', acts: [a] });
      }
    }
  }
  // Clé « effet » = tout SAUF mes compteurs de coût (pa/uses/cooldowns): si un
  // CAST ne change rien d'autre, c'est un sort dans le vide → élagué (état
  // strictement dominé — il polluait les nominations ET le budget).
  const effectKeyOf = (s) => {
    const parts = [];
    for (const id of Object.keys(s.fighters)) {
      const f = s.fighters[id];
      parts.push(id, f.pos.x, f.pos.y, f.hp, JSON.stringify(f.effects || []), f.carriedBy || '');
    }
    if ((s.hazards || []).length) parts.push(JSON.stringify(s.hazards)); // piège/glyphe posé = effet réel
    return parts.join('|');
  };
  let budget = PLAN_MAX_APPLIES;
  const applies0 = counters.applies; // plafond CPU PAR DÉCISION (pas cumulé match)
  // BFS (file FIFO), pas DFS: avec un budget plafonné, un parcours en
  // profondeur dépense tout dans le sous-arbre des DERNIÈRES cases poussées
  // — le bot ne planifiait ses sorts que depuis 2-3 cellules arbitraires.
  // En largeur, chaque case atteignable reçoit sa 1re couche de sorts.
  const queue = [...startNodes];
  let qi = 0; // pointeur FIFO: shift() recopiait le tableau à chaque nœud
  while (qi < queue.length) {
    const node = queue[qi++];
    ends.push(node); // terminer le tour ici est toujours une option
    if (node.state.over || currentFighter(node.state).id !== meId) continue;
    if (budget <= 0) continue;
    const view = getView(node.state, meId);
    const api = freshApi(node.state, meId);
    const parentEffectKey = effectKeyOf(node.state);
    const acts = candidateCasts(view, api);
    // Cibles OCCUPÉES d'abord: le budget part en priorité sur les sorts qui
    // touchent quelqu'un, pas sur des centaines de cases vides.
    const occ = new Set(Object.values(node.state.fighters).filter(f => f.hp > 0).map(f => `${f.pos.x},${f.pos.y}`));
    acts.sort((a, b) => (occ.has(`${b.target?.x},${b.target?.y}`) ? 1 : 0) - (occ.has(`${a.target?.x},${a.target?.y}`) ? 1 : 0));
    // Interleaving: déplacements aussi APRÈS un sort (tirer-reculer, la ligne
    // de base du CRA — invisible si on ne bouge qu'en début de tour). Pas de
    // move→move (équivalent à un seul move, explosion inutile).
    if (node.last === 'CAST' && node.state.fighters[meId].pm > 0) {
      for (const cell of api.reachable()) acts.push({ type: 'MOVE', to: { x: cell.pos.x, y: cell.pos.y } });
    }
    for (const a of acts) {
      if (budget <= 0 || counters.applies - applies0 > PLAN_MAX_APPLIES * 3) break;
      const r = applyAction(node.state, a);
      counters.applies++;
      if (!r.ok) continue;
      const k = stateKeyOf(r.state);
      if (seen.has(k)) continue;
      if (a.type === 'CAST' && effectKeyOf(r.state) === parentEffectKey) continue; // sort dans le vide (ne consomme PAS le budget)
      seen.add(k);
      budget--; // seul un nœud RETENU consomme le budget (bug: les nuls l'épuisaient)
      const spells = a.type === 'CAST' ? [...node.spells.split(','), a.spell].filter(Boolean).sort().join(',') : node.spells;
      queue.push({ state: r.state, first: node.first ?? a, moved: node.moved, depth: node.depth + 1, last: a.type, spells, acts: [...node.acts, a] });
    }
  }
  // Couverture tactique (audit F02): compteurs des motifs qui DOIVENT exister
  // pour que « profondeur 2 » veuille dire 2 sorts / sort-puis-repli.
  for (const e of ends) {
    let casts = 0; let castMove = false;
    for (const a of e.acts) { if (a.type === 'CAST') casts++; else if (casts > 0) castMove = true; }
    if (casts > 0) counters.covCast = (counters.covCast || 0) + 1;
    if (casts >= 2) counters.covTwo = (counters.covTwo || 0) + 1;
    if (castMove) counters.covCastMove = (counters.covCastMove || 0) + 1;
  }

  // Nomination: fins « à dégâts » dédupliquées par (combo, case FINALE) —
  // « tirer sur place » et « tirer puis reculer » d'un même combo sont des
  // plans tactiquement distincts (audit F08): l'un n'écrase plus l'autre.
  const scored = ends.map(e => ({ e, cheap: hpScore(e.state, myTeam) }));
  const byComboCell = new Map();
  for (const x of scored) {
    if (x.cheap <= baseHp + 0.5) continue;
    const me = x.e.state.fighters[meId];
    const key = `${x.e.spells}|${me.pos.x},${me.pos.y}`;
    const prev = byComboCell.get(key);
    if (!prev || x.cheap > prev.cheap) byComboCell.set(key, x);
  }
  const damage = [...byComboCell.values()].sort((a, b) => b.cheap - a.cheap);
  // Fins « sans dégâts »: une seule nomination par case finale (celle qui garde
  // le plus de PA) — sinon les variantes gaspillées étouffent la diversité.
  const byCell = new Map();
  for (const x of scored) {
    if (x.cheap > baseHp + 0.5) continue;
    const me = x.e.state.fighters[meId];
    // Un plan « setup » (a lancé des sorts sans dégâts: buff/poison/debuff)
    // ne doit PAS être dédupliqué contre « ne rien faire » sur la même case —
    // le max-PA écartait systématiquement toute préparation.
    const key = `${me.pos.x},${me.pos.y}|${x.e.spells}`;
    const prev = byCell.get(key);
    if (!prev || me.pa > prev.e.state.fighters[meId].pa) byCell.set(key, x);
  }
  const all = [...byCell.values()];
  const moves = all.filter(x => !x.e.spells);
  // Setup = préparation SANS auto-mutilation (audit F08): une fin qui a lancé
  // des sorts et perdu des PV nets n'est pas une préparation, elle évinçait
  // les vraies (buff/debuff/poison) des nominations.
  const setups = all.filter(x => x.e.spells && x.cheap >= baseHp - 0.5);
  const view0 = getView(root, meId);
  const pref = preferredRange(view0);
  for (const x of moves) x.posGap = Math.abs(nearestEnemyDist(x.e.state, meId) - pref);
  moves.sort((a, b) => a.posGap - b.posGap);
  const far = [...moves].sort((a, b) => nearestEnemyDist(b.e.state, meId) - nearestEnemyDist(a.e.state, meId))[0];
  const near = [...moves].sort((a, b) => nearestEnemyDist(a.e.state, meId) - nearestEnemyDist(b.e.state, meId))[0];
  const nominees = [];
  const pick = (x) => { if (x && !nominees.includes(x)) nominees.push(x); };
  // Par COMBO de sorts: la meilleure ligne au PV ET sa variante la plus
  // REPLIÉE (si différente) — les lignes de debuff (cinglante −PM…) font
  // moins de dégâts bruts mais la guerre des PM décide le miroir CRA.
  const byCombo = new Map();
  const retreatByCombo = new Map();
  for (const x of damage) {
    if (!byCombo.has(x.e.spells)) byCombo.set(x.e.spells, x);
    x.dist = nearestEnemyDist(x.e.state, meId);
    const prev = retreatByCombo.get(x.e.spells);
    if (!prev || x.dist > prev.dist || (x.dist === prev.dist && x.cheap > prev.cheap)) retreatByCombo.set(x.e.spells, x);
  }
  for (const x of [...byCombo.values()].slice(0, 8)) pick(x);
  for (const x of [...retreatByCombo.values()].slice(0, 8)) pick(x);
  // Fins « setup »: meilleures lignes de préparation (1 par combo de sorts,
  // la plus proche de la portée préférée) — invisibles au juge avant ce fix.
  const bySetupCombo = new Map();
  for (const x of setups) {
    x.posGap = Math.abs(nearestEnemyDist(x.e.state, meId) - pref);
    const prev = bySetupCombo.get(x.e.spells);
    if (!prev || x.posGap < prev.posGap) bySetupCombo.set(x.e.spells, x);
  }
  for (const x of [...bySetupCombo.values()].slice(0, 5)) pick(x);
  for (const x of moves.slice(0, Math.max(0, DEPTH2_CANDIDATES - nominees.length - 2))) pick(x);
  pick(far); pick(near);
  // Candidat-TÉMOIN: le tour complet de la politique maison depuis la racine
  // (audit F08) — un « opérateur d'amélioration » doit au minimum évaluer sa
  // ligne de référence au même protocole; sinon il peut faire pire que maison
  // sans jamais le savoir.
  let maisonNom = null;
  try {
    let ms = root;
    const macts = [];
    let g = OPP_TURN_GUARD;
    while (!ms.over && currentFighter(ms).id === meId && g-- > 0) {
      const a = maisonDecide(getView(ms, meId), freshApi(ms, meId)) || { type: 'PASS' };
      if (a.type === 'PASS') break;
      const r = applyAction(ms, a);
      counters.applies++;
      if (!r.ok) break;
      ms = r.state;
      macts.push(a);
    }
    if (macts.length) {
      const spells = macts.filter(a => a.type === 'CAST').map(a => a.spell).sort().join(',');
      maisonNom = { e: { state: ms, first: macts[0], moved: macts.some(a => a.type === 'MOVE'), depth: macts.length, last: macts[macts.length - 1].type, spells, acts: macts }, cheap: hpScore(ms, myTeam) };
      pick(maisonNom);
    }
  } catch { maisonNom = null; }
  // 3 fins aléatoires: diversité hors heuristique (indispensable quand la
  // feuille est un réseau de valeur qui juge autrement que le tri PV).
  const nomRng = createRng(hashSeed(`nom:${rootKey}`));
  for (let r = 0; r < 3 && moves.length; r++) pick(moves[Math.floor(nomRng.next() * moves.length)]);

  // Dés équitables (audit F03): CHAQUE score rejoue le tour proposé depuis la
  // racine sous un flux frais — plus aucun score ne réutilise l'échantillon
  // d'énumération (qui a servi à SÉLECTIONNER la ligne, donc optimiste).
  // Common random numbers: les MÊMES K flux pour tous les candidats d'une
  // décision — la comparaison reflète les lignes, pas la chance du tirage.
  // Un seul échantillon = malédiction du vainqueur (prouvé: 0% → 31%).
  const leafSeeds = [0, 1, 2].map((k) => createRng(hashSeed(`leaf:${rootKey}:${k}`)).getState());
  const replayed = (x, k) => {
    let st = { ...root, rngState: leafSeeds[k] };
    for (const a of x.e.acts) {
      const r = applyAction(st, a);
      counters.applies++;
      if (!r.ok) break;
      st = r.state;
      // Plan en boucle ouverte: si le tour change sous ces dés (mort, fin de
      // tour forcée), on ne joue JAMAIS la suite du plan pour l'adversaire.
      if (st.over || currentFighter(st).id !== meId) break;
    }
    return depth2Score(st, meId, myTeam, counters, judge);
  };
  // Étage 1: un échantillon frais commun par candidat (classement préliminaire).
  const prelim = nominees.map((x) => ({ x, s0: replayed(x, 0) }));
  prelim.sort((a, b) => b.s0 - a.s0);
  // Étage 2: les finalistes reçoivent TOUS 3 échantillons complets, et la
  // sélection finale ne considère QUE les finalistes — un candidat à 1
  // échantillon chanceux ne peut plus gagner (ancienne fuite, audit F03).
  // Le plan maison est toujours finaliste (témoin, audit F08).
  const finalists = prelim.slice(0, 6);
  if (maisonNom) {
    const mc = prelim.find((c) => c.x === maisonNom);
    if (mc && !finalists.includes(mc)) finalists.push(mc);
  }
  let best = null;
  for (const c of finalists) {
    const score = (c.s0 + replayed(c.x, 1) + replayed(c.x, 2)) / 3;
    // Issue terminale (±1000) > toute feuille clampée (±999) — la pénalité de
    // profondeur est sortie du SCORE (audit F04: −0.5×longueur pouvait faire
    // préférer une « belle position » à une victoire certaine). À score égal
    // seulement: plan le plus court (ne gaspille pas de PA).
    if (!best || score > best.score + 1e-9
      || (Math.abs(score - best.score) <= 1e-9 && c.x.e.acts.length < best.len)) {
      best = { score, len: c.x.e.acts.length, first: c.x.e.first, acts: c.x.e.acts };
    }
  }
  counters.planActs = best?.acts || [];
  counters.ms += performance.now() - t0;
  counters.decisions++;
  counters.endsSum += ends.length;
  return best?.first || { type: 'PASS' };
}

// ---------------------------------------------------------------- matchs
// Adversaire-politique optionnel (SB_OPP_MODEL=dir): tête-à-tête contre un
// ancien champion (Synapse iter_0120…) sur le MÊME banc apparié — requis par
// « beats our previous ones », pas seulement maison.
const netOpp = process.env.SB_OPP_MODEL
  ? require('./bot_net.cjs').makeNetBot(process.env.SB_OPP_MODEL, 'opp')
  : null;

function playMatch({ seed, loadoutKey, searchId, cA, cB, map }) {
  let { state } = createGame({ mapId: map || MAP, seed, fighters: makeFighters(loadoutKey, cA, cB) });
  const rngs = {};
  const counters = { applies: 0, ms: 0, decisions: 0, endsSum: 0, invalid: 0 };
  // SB_COMMIT=1: exécute le PLAN entier du tour (file d'actions) au lieu de
  // replanifier à chaque action — sonde anti-« churn » (un replan bruité par
  // action = plans entamés puis abandonnés = tempo perdu).
  const commit = process.env.SB_COMMIT === '1';
  let queue = [];
  let guard = 0;
  while (!state.over && guard++ < MAX_MATCH_ACTIONS) {
    const actor = currentFighter(state);
    const view = getView(state, actor.id);
    const api = makeBotApi(view, rngs[actor.id] ||= createRng(hashSeed(`m:${seed}:${actor.id}`)));
    let action;
    if (actor.id === searchId) {
      if (process.env.SB_MAISON === '1') {
        // Sanité du banc: maison vs maison DANS ce harnais → doit faire ~50%.
        try { action = api.maison() || { type: 'PASS' }; } catch { action = { type: 'PASS' }; }
        counters.decisions++;
      } else if (commit && queue.length) {
        action = queue.shift();
      } else {
        action = searchDecide(state, counters);
        if (commit) {
          queue = [...(counters.planActs || [])];
          queue.shift(); // la 1re action est jouée tout de suite
          queue.push({ type: 'PASS' }); // fin de plan = fin de tour
        }
      }
      if (action.type === 'PASS') queue = [];
    } else if (process.env.SB_SELF === '1') {
      action = searchDecide(state, counters); // miroir bot-vs-bot (test de symétrie)
    } else if (netOpp) {
      try { action = netOpp.decide(view, api) || { type: 'PASS' }; } catch { action = { type: 'PASS' }; }
    } else {
      try { action = api.maison() || { type: 'PASS' }; } catch { action = { type: 'PASS' }; }
    }
    const r = applyAction(state, action);
    if (!r.ok) {
      counters.invalid++;
      queue = []; // plan invalidé par la réalité (tacle…) → abandon propre
      state = applyAction(state, { type: 'PASS' }).state;
      continue;
    }
    state = r.state;
  }
  const searchTeam = searchId; // teams suivent les ids A/B ici
  const result = !state.over || state.winner == null ? 'D' : state.winner === searchTeam ? 'W' : 'L';
  return { result, turns: state.turn, counters };
}

function runEval(n, loadoutKeys, outPath) {
  const tally = {};
  const t0 = Date.now();
  for (const lk of loadoutKeys) {
    tally[lk] = { W: 0, D: 0, L: 0, ms: 0, dec: 0, inv: 0 };
    for (let i = 0; i < n; i++) {
      const searchId = i % 2 === 0 ? 'A' : 'B';
      const [cA, cB] = i % 4 < 2 ? ['IOP', 'CRA'] : ['CRA', 'IOP'];
      const job = { seed: hashSeed(`sb:${lk}:${i >> 1}`), loadoutKey: lk, searchId, cA, cB };
      const r = playMatch(job);
      tally[lk][r.result]++;
      tally[lk].ms += r.counters.ms;
      tally[lk].dec += r.counters.decisions;
      tally[lk].inv += r.counters.invalid;
      const line = { lk, i, ...job, result: r.result, turns: r.turns,
        msPerDecision: +(r.counters.ms / Math.max(1, r.counters.decisions)).toFixed(1),
        searchClass: searchId === 'A' ? cA : cB };
      if (outPath) fs.appendFileSync(outPath, JSON.stringify(line) + '\n');
      const t = tally[lk];
      console.log(`[${lk}] ${i + 1}/${n} ${r.result} (searchClass=${line.searchClass}) W${t.W} D${t.D} L${t.L} | ${line.msPerDecision}ms/déc`);
    }
    const t = tally[lk];
    console.log(JSON.stringify({ lk, n, W: t.W, D: t.D, L: t.L,
      winRate: +(t.W / n).toFixed(3), msPerDecision: +(t.ms / Math.max(1, t.dec)).toFixed(1),
      invalid: t.inv, wallSec: Math.round((Date.now() - t0) / 1000) }));
  }
}

// ---------------------------------------------------------------- measure
function measure() {
  // Combien d'options par décision / par tour / par match ? (maison vs maison)
  for (const lk of ['l100', 'l200gear']) {
    let decisions = 0; let legalSum = 0; let legalMax = 0; let turns = 0;
    const perTurn = [];
    for (let m = 0; m < 4; m++) {
      let { state } = createGame({ mapId: MAP, seed: hashSeed(`measure:${lk}:${m}`), fighters: makeFighters(lk, 'IOP', 'CRA') });
      let guard = 0;
      while (!state.over && guard++ < MAX_MATCH_ACTIONS) {
        const actor = currentFighter(state);
        const view = getView(state, actor.id);
        const api = makeBotApi(view, createRng(hashSeed(`ms:${m}:${guard}`)));
        const legal = 1 + api.reachable().length + candidateCasts(view, api).length;
        legalSum += legal; legalMax = Math.max(legalMax, legal); decisions++;
        // Taille d'UN tour complet: DFS dédupliqué (états distincts) depuis ce point
        if (actor.pa === actor.basePa && actor.pm === actor.basePm && perTurn.length < 6) {
          const c = { applies: 0 };
          const seen = new Set([stateKeyOf(state)]);
          const stack = [state];
          let seqs = 0;
          const cap = 60000;
          while (stack.length && c.applies < cap) {
            const st = stack.pop();
            seqs++;
            if (st.over || currentFighter(st).id !== actor.id) continue;
            const v = getView(st, actor.id);
            const a2 = makeBotApi(v, createRng(hashSeed(`dfs:${c.applies}`)));
            const acts = [];
            for (const cell of a2.reachable()) acts.push({ type: 'MOVE', to: { x: cell.pos.x, y: cell.pos.y } });
            acts.push(...candidateCasts(v, a2));
            for (const a of acts) {
              const r = applyAction(st, a);
              c.applies++;
              if (!r.ok) continue;
              const k = stateKeyOf(r.state);
              if (seen.has(k)) continue;
              seen.add(k);
              stack.push(r.state);
            }
          }
          perTurn.push({ states: seen.size, capped: c.applies >= cap });
        }
        let action;
        try { action = api.maison() || { type: 'PASS' }; } catch { action = { type: 'PASS' }; }
        const r = applyAction(state, action);
        state = r.ok ? r.state : applyAction(state, { type: 'PASS' }).state;
        if (currentFighter(state) !== actor) turns++;
      }
    }
    console.log(JSON.stringify({ lk, decisions, avgLegalPerDecision: +(legalSum / decisions).toFixed(1),
      maxLegalPerDecision: legalMax, avgDecisionsPerMatch: Math.round(decisions / 4),
      distinctStatesPerFullTurn: perTurn }));
  }
}

// Témoin: maison vs maison, mêmes conditions — isole l'effet matchup.
function baseline(n, lk) {
  const t = { IOP: 0, CRA: 0, D: 0 };
  for (let i = 0; i < n; i++) {
    const [cA, cB] = i % 2 === 0 ? ['IOP', 'CRA'] : ['CRA', 'IOP'];
    let { state } = createGame({ mapId: MAP, seed: hashSeed(`bl:${lk}:${i >> 1}`), fighters: makeFighters(lk, cA, cB) });
    const rngs = {};
    let guard = 0;
    while (!state.over && guard++ < MAX_MATCH_ACTIONS) {
      const actor = currentFighter(state);
      const api = makeBotApi(getView(state, actor.id), rngs[actor.id] ||= createRng(hashSeed(`bl:${i}:${actor.id}`)));
      let action;
      try { action = api.maison() || { type: 'PASS' }; } catch { action = { type: 'PASS' }; }
      const r = applyAction(state, action);
      state = r.ok ? r.state : applyAction(state, { type: 'PASS' }).state;
    }
    if (!state.over || state.winner == null) t.D++;
    else t[state.winner === 'A' ? cA : cB]++;
  }
  console.log(JSON.stringify({ lk, n, ...t, iopWinRate: +(t.IOP / n).toFixed(3) }));
}

// Branche un réseau de valeur (scripts/rl/value_net.cjs) comme éval de
// feuille: V(vue du joueur au trait) ∈ [-1,1] → échelle PV (×1000).
let judgeName = 'heuristic'; // provenance des logs (audit F13)
// Juge-valeur AUTONOME (audit F12): chaque instance a son modèle et son
// buffer — deux bots avec deux juges différents peuvent cohabiter dans un
// même match, sans passer par l'état global setLeafEval.
function makeValueJudge(modelDir) {
  const { loadValue } = require('./value_net.cjs');
  const enc = require('./encoder.cjs');
  const model = loadValue(modelDir);
  const fv = model.shapes.featureVersion || 1;
  const dims = { 1: enc.OBS_DIM, 2: enc.OBS_DIM_V2, 3: enc.OBS_DIM_V3 };
  const encoders = { 1: enc.encodeSample, 2: enc.encodeSampleV2, 3: enc.encodeSampleV3 };
  if (!dims[fv]) throw new Error(`featureVersion inconnue: ${fv}`);
  if (model.shapes.obsDim !== dims[fv]) throw new Error(`obsDim ${model.shapes.obsDim} ≠ encodeur v${fv} (${dims[fv]})`);
  const buf = new Float32Array(dims[fv]);
  const encode = encoders[fv];
  const judge = (s, meId, myTeam, counters) => {
    const view = getView(s, meId);
    encode({ view, board: view.board }, null, buf);
    counters.applies++;
    // V domine, l'heuristique (PV+menace) régularise ses angles morts: le
    // max sur ~17 feuilles exploite sinon les erreurs du réseau (round 1).
    return model.forward(buf) * 1000 + 0.35 * heuristicLeaf(s, meId, myTeam, counters);
  };
  judge.model = model;
  return judge;
}

function useValueModel(modelDir) {
  const judge = makeValueJudge(modelDir);
  judgeName = modelDir;
  setLeafEval(judge);
  return judge.model;
}

// Miroir (même classe des deux côtés): neutralise le matchup, mesure la
// force pure calculateur vs maison.
function mirror(n, cls, lk, outPath) {
  const t = { W: 0, D: 0, L: 0, ms: 0, dec: 0, cov: { cast: 0, two: 0, castMove: 0 } };
  // Provenance (audit F13): sans version/juge/budget/offset dans le log, un
  // résultat historique n'est attribuable à aucun code précis.
  const meta = { version: SEARCH_VERSION, judge: judgeName, budget: PLAN_MAX_APPLIES,
    offset: Number(process.env.SB_SEED_OFFSET || 0), map: MAP,
    opponent: process.env.SB_OPP_MODEL || 'maison' };
  for (let i = 0; i < n; i++) {
    const searchId = i % 2 === 0 ? 'A' : 'B';
    const job = { seed: hashSeed(`mi:${lk}:${cls}:${(i >> 1) + Number(process.env.SB_SEED_OFFSET || 0)}`), loadoutKey: lk, searchId, cA: cls, cB: cls };
    const r = playMatch(job);
    t[r.result]++; t.ms += r.counters.ms; t.dec += r.counters.decisions;
    t.cov.cast += r.counters.covCast || 0; t.cov.two += r.counters.covTwo || 0; t.cov.castMove += r.counters.covCastMove || 0;
    if (outPath) fs.appendFileSync(outPath, JSON.stringify({ mode: 'mirror', cls, lk, i, searchId, result: r.result, turns: r.turns, ...meta }) + '\n');
    console.log(`[mirror ${cls} ${lk}] ${i + 1}/${n} ${r.result} W${t.W} D${t.D} L${t.L}`);
  }
  console.log(JSON.stringify({ mode: 'mirror', cls, lk, n, ...t, winRate: +(t.W / n).toFixed(3),
    msPerDecision: +(t.ms / Math.max(1, t.dec)).toFixed(1), ...meta }));
}

// DUEL juge-contre-juge (audit F12 / porte principale): les DEUX côtés sont
// le même calculateur, chacun avec SON juge de feuille. Sièges alternés par
// seed (jeu i: juge1 = A si i pair). C'est le seul banc qui discrimine les
// juges quand maison est saturée (32-0 des deux côtés).
function duel(n, cls, lk, specA, specB, outPath) {
  const mk = (spec) => (spec === 'hand' ? { fn: heuristicLeaf, name: 'hand' } : { fn: makeValueJudge(spec), name: spec });
  const j1 = mk(specA);
  const j2 = mk(specB);
  const t = { W: 0, D: 0, L: 0 };
  const meta = { version: SEARCH_VERSION, judge1: j1.name, judge2: j2.name, budget: PLAN_MAX_APPLIES,
    offset: Number(process.env.SB_SEED_OFFSET || 0), map: MAP };
  const perSide = { j1ms: 0, j1dec: 0, j2ms: 0, j2dec: 0 };
  for (let i = 0; i < n; i++) {
    const j1Seat = i % 2 === 0 ? 'A' : 'B';
    const seed = hashSeed(`du:${lk}:${cls}:${(i >> 1) + Number(process.env.SB_SEED_OFFSET || 0)}`);
    let { state } = createGame({ mapId: MAP, seed, fighters: makeFighters(lk, cls, cls) });
    const counters = { A: { applies: 0, ms: 0, decisions: 0, endsSum: 0, invalid: 0 },
      B: { applies: 0, ms: 0, decisions: 0, endsSum: 0, invalid: 0 } };
    let guard = 0;
    while (!state.over && guard++ < MAX_MATCH_ACTIONS) {
      const actor = currentFighter(state);
      const judge = actor.id === j1Seat ? j1.fn : j2.fn;
      const action = searchDecide(state, counters[actor.id], judge);
      const r = applyAction(state, action);
      state = r.ok ? r.state : applyAction(state, { type: 'PASS' }).state;
    }
    const result = !state.over || state.winner == null ? 'D' : state.winner === j1Seat ? 'W' : 'L';
    t[result]++;
    const c1 = counters[j1Seat];
    const c2 = counters[j1Seat === 'A' ? 'B' : 'A'];
    perSide.j1ms += c1.ms; perSide.j1dec += c1.decisions;
    perSide.j2ms += c2.ms; perSide.j2dec += c2.decisions;
    if (outPath) fs.appendFileSync(outPath, JSON.stringify({ mode: 'duel', cls, lk, i, j1Seat, result, turns: state.turn, ...meta }) + '\n');
    console.log(`[duel ${j1.name} vs ${j2.name}] ${i + 1}/${n} ${result} W${t.W} D${t.D} L${t.L}`);
  }
  console.log(JSON.stringify({ mode: 'duel', cls, lk, n, ...t, j1WinRate: +(t.W / n).toFixed(3),
    j1MsPerDec: +(perSide.j1ms / Math.max(1, perSide.j1dec)).toFixed(1),
    j2MsPerDec: +(perSide.j2ms / Math.max(1, perSide.j2dec)).toFixed(1), ...meta }));
}

// Une partie miroir commentée: chaque action du calculateur + PV/positions.
function debugGame(cls, lk) {
  let { state } = createGame({ mapId: MAP, seed: hashSeed(`mi:${lk}:${cls}:0`), fighters: makeFighters(lk, cls, cls) });
  const rngs = {};
  const counters = { applies: 0, ms: 0, decisions: 0, endsSum: 0, invalid: 0 };
  let guard = 0;
  while (!state.over && guard++ < 200) {
    const actor = currentFighter(state);
    const view = getView(state, actor.id);
    const api = makeBotApi(view, rngs[actor.id] ||= createRng(hashSeed(`m:${hashSeed(`mi:${lk}:${cls}:0`)}:${actor.id}`)));
    let action;
    if (actor.id === 'A') action = searchDecide(state, counters);
    else { try { action = api.maison() || { type: 'PASS' }; } catch { action = { type: 'PASS' }; } }
    const fs2 = state.fighters;
    console.log(`T${state.turn} ${actor.id === 'A' ? 'CALC' : 'MAISON'} @(${actor.pos.x},${actor.pos.y}) pa${actor.pa} pm${actor.pm} | A:${fs2.A.hp}pv B:${fs2.B.hp}pv -> ${action.type}${action.spell ? ':' + action.spell : ''}${action.to ? `→(${action.to.x},${action.to.y})` : ''}${action.target ? `→(${action.target.x},${action.target.y})` : ''}`);
    const r = applyAction(state, action);
    state = r.ok ? r.state : applyAction(state, { type: 'PASS' }).state;
  }
  console.log(`fin: winner=${state.winner} turn=${state.turn}`);
}

module.exports = {
  searchDecide, setLeafEval, useValueModel, makeValueJudge, candidateCasts, makeFighters,
  LOADOUTS, hpScore, stateKeyOf, playMatch, mirror, duel, MAP, damagePotential,
  SEARCH_VERSION,
};

if (require.main === module) {
  const [, , mode, a1, a2, a3, a4, a5] = process.argv;
  if (mode === 'debug') { if (a3) useValueModel(a3); debugGame(a1 || 'CRA', a2 || 'l200gear'); }
  else if (mode === 'baseline') baseline(Number(a1) || 24, a2 || 'l200gear');
  else if (mode === 'mirror') { if (a5) useValueModel(a5); mirror(Number(a1) || 16, a2 || 'CRA', a3 || 'l200gear', a4 || null); }
  else if (mode === 'duel') duel(Number(a1) || 32, a2 || 'CRA', a3 || 'l100', a4 || 'hand', a5 || 'hand', process.argv[8] || null);
  else if (mode === 'measure') measure();
  else if (mode === 'pilot') runEval(Number(a1) || 12, ['l200gear'], null);
  else if (mode === 'eval') runEval(Number(a1) || 48, ['l100', 'l200', 'l200gear'], a2 || null);
  else console.log('usage: measure | debug cls lk [modelDir] | baseline N lk | mirror N cls lk [out.jsonl] [modelDir] | pilot [N] | eval N [out.jsonl]');
}
