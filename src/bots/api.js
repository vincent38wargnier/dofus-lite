// The API handed to every bot along with its view. Bots never touch the real
// match state: everything here works from the (cloned) view, and validation
// reuses the engine's own rules by rebuilding a minimal state from the view —
// so api.canCast() agrees exactly with what the arena will accept.

import {
  validateAction, blocksMoveAt, blocksLosAt, escapePreview,
} from '../engine/engine';
import { utilityDecide } from './utilityBrain';
import { maisonDecide, maisonWeightsFor } from './maison';
import { neuralDecide } from './neural';
import { makeSearchBrain, UI_PROFILE, stateKeyOf as strategeKeyOf } from './searchBrain';
import { casterAfterSpell } from './tactics';
import { key, dist, cellsInRange, hasLineOfSight } from '../engine/geometry';
import { bfs, reachableCells, reconstructPath } from '../engine/pathfinding';

// A stable RNG belongs to one fighter in one match. Remember only actions that
// left its public view unchanged: an invisible body can reject an otherwise
// legal path/LoS. Never inspect hidden positions or consume the RNG to learn it.
const decisionMemory = new WeakMap();
const actionKey = action => JSON.stringify(action);

// Rebuild a minimal engine state from a bot view (enough for validateAction,
// and complete enough for full forward simulation — the search builtin plans
// on this reconstruction only, never on the real hidden state).
export function stateFromView(view) {
  const toFighter = (v) => ({
    id: v.id,
    team: v.team,
    leader: v.leader,
    isSummon: v.isSummon,
    isMonster: v.isMonster, monsterGrade: v.monsterGrade,
    ...(v.customMonster ? { customMonster: v.customMonster } : {}),
    isDouble: v.isDouble, staticSummon: v.staticSummon, summonGrade: v.summonGrade,
    hidden: v.hidden, carriedBy: v.carriedBy, carrying: v.carrying,
    monsterId: v.monsterId,
    ownerId: v.ownerId,
    classId: v.classId,
    level: v.level,
    pos: { ...v.pos },
    hp: v.hp,
    maxHp: v.maxHp,
    pa: v.pa,
    pm: v.pm,
    basePa: v.basePa,
    basePm: v.basePm,
    stats: { ...v.stats },
    resistances: v.resistances,
    resistancesFixed: v.resistancesFixed,
    effects: v.effects,
    permanent: v.permanent, spellModifiers: v.spellModifiers,
    weaponSpell: v.weaponSpell, maxSummons: v.maxSummons,
    loadout: v.loadout,
    usedOnTarget: v.usedOnTarget || {},
    cooldowns: Object.fromEntries(v.spells.map((s) => [s.key, s.cooldownLeft])),
    usedThisTurn: Object.fromEntries(
      v.spells.map((s) => [s.key, s.usesPerTurn === 0 ? 0 : s.usesPerTurn - s.usesLeft]),
    ),
  });
  const obstacles = {};
  for (const o of view.board.obstacles) obstacles[key(o.x, o.y)] = { ...o };
  const fighters = {};
  for (const v of [view.you, ...(view.allies || []), ...(view.enemies || [])]) {
    fighters[v.id] = toFighter(v);
  }
  if (!fighters[view.enemy.id]) fighters[view.enemy.id] = toFighter(view.enemy);
  return {
    over: false,
    turn: view.turn,
    maxTurns: view.maxTurns,
    board: { width: view.board.width, height: view.board.height, obstacles },
    order: Object.keys(fighters),
    currentIndex: Object.keys(fighters).indexOf(view.you.id),
    fighters,
    hazards: view.hazards || [],
  };
}

// Cerveau du Stratège, construit une fois (makeBotApi lui est injecté —
// pas de cycle: searchBrain n'importe jamais api.js).
const searchBrain = makeSearchBrain({ makeBotApi });

// ---- Stratège hors-thread (Web Worker) --------------------------------
// La recherche pleine force gèle le thread UI (~0,5 s/action l100, ~2 s
// l200 mesurés sur LiveMatch — vécu comme un crash). En navigateur, elle
// tourne donc dans un Worker: pendant le calcul, decide() répond une action
// SAY « réfléchit » (légale, zéro effet moteur, consommée par le référent à
// 620 ms/tick) et joue le coup dès qu'il est prêt. Déterminisme conservé
// (même vue ⇒ même coup — seul le NOMBRE de bulles varie avec la machine).
// Repli synchrone automatique: tests, Node, worker indisponible ou en panne.
const WORKER_PROFILE = { budget: 600, fastCasts: true };
let strategeWorker = null;
let strategeWorkerBroken = false;
let strategeWorkerFactory = null;
const strategeCache = new Map(); // key -> 'pending' | { action, ms, ticks }
const strategePendingMeta = new Map(); // key -> { t0, ticks }
// Chargement DYNAMIQUE de la fabrique (strategeClient contient import.meta,
// intranspilable côté Node — voir ce fichier). En Node/tests, l'import échoue
// ou n'est jamais tenté → repli synchrone permanent, le banc reste intact.
if (typeof Worker !== 'undefined' && process.env.NODE_ENV !== 'test') {
  import('./strategeClient')
    .then((m) => { strategeWorkerFactory = m.createStrategeWorker; })
    .catch(() => { strategeWorkerBroken = true; });
}
function ensureStrategeWorker() {
  if (strategeWorker || strategeWorkerBroken || !strategeWorkerFactory) return strategeWorker;
  try {
    strategeWorker = strategeWorkerFactory();
    strategeWorker.onmessage = (e) => {
      const { key, action, judge, error } = e.data || {};
      if (!key) return;
      const meta = strategePendingMeta.get(key) || { t0: performance.now(), ticks: 0 };
      strategePendingMeta.delete(key);
      strategeCache.set(key, {
        action: action || { type: 'PASS' }, ms: performance.now() - meta.t0,
        ticks: meta.ticks, judge: judge || 'hand', error: error || null,
      });
    };
    strategeWorker.onerror = () => {
      strategeWorkerBroken = true;
      try { strategeWorker.terminate(); } catch { /* rien */ }
      strategeWorker = null;
      strategeCache.clear();
    };
  } catch {
    strategeWorkerBroken = true;
    strategeWorker = null;
  }
  return strategeWorker;
}

export function makeBotApi(view, rng) {
  const state = stateFromView(view);
  const you = view.you;
  const { width, height } = view.board;
  const signature = JSON.stringify(view);
  const previous = decisionMemory.get(rng);
  const rejected = previous?.signature === signature ? new Set(previous.rejected) : new Set();
  if (previous?.signature === signature && previous.action && previous.action.type !== 'PASS') rejected.add(actionKey(previous.action));
  const failedSteps = new Set([...rejected].map(value => JSON.parse(value)).filter(a => a.type === 'MOVE').map(a => key(a.to.x, a.to.y)));
  const forecastStates = new Map();

  const moveBlocked = (x, y) => failedSteps.has(key(x, y)) || blocksMoveAt(state, x, y);
  const losBlocked = (x, y) => blocksLosAt(state, x, y);

  // BFS distances from the enemy (their cell excluded from blocking so the
  // flood fill can start), used by moveToward/moveAway.
  const costsFrom = (origin) => {
    const blocked = (x, y) => !(x === origin.x && y === origin.y) && moveBlocked(x, y);
    return bfs(origin, width * height, width, height, blocked).costs;
  };

  const api = {
    // ---- lecture du terrain -------------------------------------------
    dist: (a, b) => dist(a, b),

    // Deux cases sur la même ligne/colonne ? (sorts « en ligne »)
    aligned: (a, b) => a.x === b.x || a.y === b.y,

    hasLos: (from, to) => hasLineOfSight(from, to, losBlocked),

    // Simule une poussée depuis fromPos sur un combattant en victimPos:
    // { to, moved, blocked } — blocked > 0 signifie collision (dégâts bruts,
    // environ 18-32 par case bloquée à ce niveau).
    simulatePush: (fromPos, victimPos, cells) => {
      const dx = victimPos.x - fromPos.x;
      const dy = victimPos.y - fromPos.y;
      const dir = Math.abs(dx) >= Math.abs(dy)
        ? { x: Math.sign(dx) || 1, y: 0 }
        : { x: 0, y: Math.sign(dy) };
      let cur = { ...victimPos };
      let moved = 0;
      while (moved < cells) {
        const next = { x: cur.x + dir.x, y: cur.y + dir.y };
        const inside = next.x >= 0 && next.y >= 0 && next.x < width && next.y < height;
        if (!inside || moveBlocked(next.x, next.y)) break;
        cur = next;
        moved += 1;
      }
      return { to: cur, moved, blocked: cells - moved };
    },

    isFree: (pos) => pos.x >= 0 && pos.y >= 0 && pos.x < width && pos.y < height
      && !moveBlocked(pos.x, pos.y),

    // Cases atteignables ce tour: [{ pos, cost, path }]
    reachable: () => (you.pm > 0 && !you.carriedBy
      ? reachableCells(you.pos, you.pm, width, height, moveBlocked)
      : []),

    // Chemin complet (sans limite de PM) vers une case, null si inaccessible.
    pathTo: (pos) => {
      const blocked = (x, y) => !(x === pos.x && y === pos.y) && moveBlocked(x, y);
      const { costs, parents } = bfs(you.pos, width * height, width, height, blocked);
      if (!costs.has(key(pos.x, pos.y))) return null;
      return reconstructPath(you.pos, pos, parents);
    },

    // ---- validation (mêmes règles que l'arène) -------------------------
    canMove: (pos) => {
      if (rejected.has(actionKey({ type: 'MOVE', to: pos }))) return { ok: false, reason: 'Déplacement déjà refusé' };
      const r = validateAction(state, { type: 'MOVE', to: pos });
      return { ok: r.ok, reason: r.reason || null };
    },

    canCast: (spellKey, target) => {
      if (rejected.has(actionKey({ type: 'CAST', spell: spellKey, target }))) return { ok: false, reason: 'Cible déjà refusée' };
      const r = validateAction(state, { type: 'CAST', spell: spellKey, target });
      return { ok: r.ok, reason: r.reason || null };
    },

    // Check a prospective firing cell with the same state/target/cooldown rules.
    // The caller obtains reachable cells separately; this never moves the actor.
    canCastFrom: (spellKey, target, from) => {
      if (from.x === you.pos.x && from.y === you.pos.y) return api.canCast(spellKey, target);
      const projected = { ...state, fighters: { ...state.fighters,
        [you.id]: { ...state.fighters[you.id], pos: { ...from } } } };
      const r = validateAction(projected, { type: 'CAST', spell: spellKey, target });
      return { ok: r.ok, reason: r.reason || null };
    },

    // Limited within-turn forecast: consume PA/uses/cooldown and apply the
    // first spell's immediate self boosts, without touching real state or RNG.
    canCastAfter: (firstKey, firstTarget, nextKey, nextTarget, from = you.pos) => {
      const first = you.spells.find(s => s.key === firstKey);
      if (!first) return { ok: false, reason: 'Sort inconnu' };
      const cacheKey = `${firstKey}:${key(firstTarget.x, firstTarget.y)}:${key(from.x, from.y)}`;
      if (!forecastStates.has(cacheKey)) {
        const after = casterAfterSpell(state.fighters[you.id], first, firstTarget, from);
        after.usedThisTurn = { ...after.usedThisTurn, [firstKey]: (after.usedThisTurn[firstKey] || 0) + 1 };
        after.cooldowns = { ...after.cooldowns, [firstKey]: first.cooldown || 0 };
        after.usedOnTarget = { ...after.usedOnTarget };
        const victim = firstTarget.x === from.x && firstTarget.y === from.y ? after
          : Object.values(state.fighters).find(f => f.id !== you.id && f.hp > 0 && f.pos.x === firstTarget.x && f.pos.y === firstTarget.y);
        if (victim) after.usedOnTarget[firstKey] = { ...after.usedOnTarget[firstKey], [victim.id]: (after.usedOnTarget[firstKey]?.[victim.id] || 0) + 1 };
        forecastStates.set(cacheKey, { ...state, fighters: { ...state.fighters, [you.id]: after } });
      }
      const r = validateAction(forecastStates.get(cacheKey), { type: 'CAST', spell: nextKey, target: nextTarget });
      return { ok: r.ok, reason: r.reason || null };
    },

    // Toutes les cases où un sort peut être lancé maintenant.
    castTargets: (spellKey) => {
      const spell = you.spells.find((s) => s.key === spellKey);
      if (!spell) return [];
      return cellsInRange(you.pos, spell.range[0], spell.range[1], width, height, spell.lineOnly)
        .filter((c) => api.canCast(spellKey, c).ok);
    },

    // Fuite: probabilité de s'échapper si vous quittez le contact ce tour.
    // En cas d'échec: tous les PM perdus et floor(PA × chance / 200) PA.
    tackleInfo: () => {
      const { inContact, chance } = escapePreview(state, you.id);
      return {
        inContact,
        escapeChance: chance,
        paIfTackled: inContact ? you.pa - Math.floor((you.pa * chance) / 200) : you.pa,
      };
    },

    // ---- aides au déplacement ------------------------------------------
    // Action MOVE vers la case atteignable qui RAPPROCHE le plus de pos
    // (au sens du chemin, pas à vol d'oiseau). null si aucune n'améliore.
    moveToward: (pos) => {
      const costs = costsFrom(pos);
      const here = costs.get(key(you.pos.x, you.pos.y));
      let best = null;
      let bestCost = here === undefined ? Infinity : here;
      for (const cell of api.reachable()) {
        const c = costs.get(key(cell.pos.x, cell.pos.y));
        if (c !== undefined && (c < bestCost || (best && c === bestCost && cell.cost < best.cost))) {
          best = cell;
          bestCost = c;
        }
      }
      return best ? { type: 'MOVE', to: best.pos } : null;
    },

    // Action MOVE vers la case atteignable qui ÉLOIGNE le plus de pos.
    moveAway: (pos) => {
      const costs = costsFrom(pos);
      const score = (p) => {
        const c = costs.get(key(p.x, p.y));
        return c === undefined ? 10000 + dist(p, pos) : c;
      };
      const here = score(you.pos);
      let best = null;
      let bestScore = here;
      for (const cell of api.reachable()) {
        const s = score(cell.pos);
        if (s > bestScore || (best && s === bestScore && cell.cost < best.cost)) {
          best = cell;
          bestScore = s;
        }
      }
      return best ? { type: 'MOVE', to: best.pos } : null;
    },

    // ---- créateurs d'actions -------------------------------------------
    move: (pos) => ({ type: 'MOVE', to: { x: pos.x, y: pos.y } }),
    cast: (spellKey, target) => ({
      type: 'CAST',
      spell: spellKey,
      target: target ? { x: target.x, y: target.y } : { ...you.pos },
    }),
    endTurn: () => ({ type: 'PASS' }),
    say: (text) => ({ type: 'SAY', text: String(text).slice(0, 80) }),

    // Aléa déterministe (rejouable): même seed, même match.
    random: () => rng.next(),
    pick: (arr) => arr[Math.floor(rng.next() * arr.length)],
    rememberDecision: action => {
      decisionMemory.set(rng, { signature, rejected, action });
      return action;
    },
  };

  // Le cerveau utilitaire intégré: retourne la meilleure action pondérée.
  // Passez vos propres poids pour changer sa personnalité (voir Règles & API).
  api.suggest = (weights) => utilityDecide(view, api, weights);

  // L'IA Maison: le même cerveau avec les poids réglés par auto-jeu pour
  // le matchup (votre classe vs la classe adverse). La référence à battre.
  api.maison = () => maisonDecide(view, api);
  // Les poids que l'IA Maison utiliserait ici — à inspecter ou personnaliser:
  //   return api.suggest({ ...api.maisonWeights(), kill: 5 });
  api.maisonWeights = () => maisonWeightsFor(
    view.you.classId, view.enemy ? view.enemy.classId : null,
  );

  // Synapse: la politique neuronale (self-play PPO). Repli api.maison()
  // tant que les poids (public/models/synapse) ne sont pas chargés.
  api.neural = () => neuralDecide(view, api);

  // Stratège: le calculateur (recherche + simulation moteur). Planifie sur
  // l'état reconstruit depuis la vue — loyal, déterministe, zéro poids.
  // Chemin navigateur: Worker hors-thread + SAY d'attente (voir plus haut).
  // Chemin synchrone (opts explicites, tests, Node, worker en panne): profil
  // UI léger sur le thread courant.
  const strategeViaWorker = (label, profile, sayText) => {
    if (!ensureStrategeWorker()) return null; // fabrique pas (encore) prête
    const key = `${profile.judge || 'hand'}:${strategeKeyOf(state)}`;
    const cached = strategeCache.get(key);
    if (cached && cached !== 'pending' && typeof cached === 'object' && cached.action) {
      strategeCache.delete(key);
      // Diagnostic visible: le VRAI coût de la décision sur CETTE machine
      // (les « lenteurs » doivent se lire dans la console, pas se deviner).
      if (cached.error) {
        // eslint-disable-next-line no-console
        console.error(`[${label}] réseau indisponible (${cached.error}) — juge main utilisé`);
      }
      // eslint-disable-next-line no-console
      console.info(`[${label}] décision en ${Math.round(cached.ms)} ms (${cached.ticks} tick${cached.ticks > 1 ? 's' : ''} d'attente, juge ${cached.judge})`);
      return cached.action;
    }
    if (!cached) {
      if (strategeCache.size > 50) strategeCache.clear(); // états abandonnés
      strategeCache.set(key, 'pending');
      strategePendingMeta.set(key, { t0: performance.now(), ticks: 0 });
      strategeWorker.postMessage({ key, view, profile });
    }
    const meta = strategePendingMeta.get(key);
    if (meta) meta.ticks++;
    return { type: 'SAY', text: sayText };
  };

  api.stratege = (opts) => {
    const workerOk = opts === undefined && typeof Worker !== 'undefined'
      && process.env.NODE_ENV !== 'test' && !strategeWorkerBroken;
    if (!workerOk) return searchBrain.searchDecide(state, opts ?? UI_PROFILE);
    return strategeViaWorker('Stratège', WORKER_PROFILE, '♟️ (calcule…)')
      || searchBrain.searchDecide(state, UI_PROFILE);
  };

  // Stratège V4: MÊME recherche, mais le juge aux feuilles est le RÉSEAU DE
  // VALEUR entraîné (modèle V4, cibles « verdict du prof », mélange du banc).
  // Navigateur seulement: les poids se fetchent dans le Worker. Pas de repli
  // synchrone silencieux — sans Worker, on le dit (bot_error), on ne fait pas
  // semblant que le réseau joue.
  api.strategeNet = () => {
    const workerOk = typeof Worker !== 'undefined'
      && process.env.NODE_ENV !== 'test' && !strategeWorkerBroken;
    if (!workerOk) throw new Error('Stratège V4: nécessite le Worker navigateur (poids du réseau)');
    return strategeViaWorker('Stratège V4', { ...WORKER_PROFILE, judge: 'v4' }, '🧠 (calcule…)')
      || { type: 'SAY', text: '🧠 (calcule…)' };
  };

  return api;
}
