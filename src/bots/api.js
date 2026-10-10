// The API handed to every bot along with its view. Bots never touch the real
// match state: everything here works from the (cloned) view, and validation
// reuses the engine's own rules by rebuilding a minimal state from the view —
// so api.canCast() agrees exactly with what the arena will accept.

import {
  validateAction, blocksMoveAt, blocksLosAt, escapePreview,
} from '../engine/engine';
import { utilityDecide } from './utilityBrain';
import { maisonDecide, maisonWeightsFor } from './maison';
import { key, dist, cellsInRange, hasLineOfSight } from '../engine/geometry';
import { bfs, reachableCells, reconstructPath } from '../engine/pathfinding';

// Rebuild a minimal engine state from a bot view (enough for validateAction).
function stateFromView(view) {
  const toFighter = (v) => ({
    id: v.id,
    team: v.team,
    leader: v.leader,
    isSummon: v.isSummon,
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

export function makeBotApi(view, rng) {
  const state = stateFromView(view);
  const you = view.you;
  const { width, height } = view.board;

  const moveBlocked = (x, y) => blocksMoveAt(state, x, y);
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
    reachable: () => (you.pm > 0
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
      const r = validateAction(state, { type: 'MOVE', to: pos });
      return { ok: r.ok, reason: r.reason || null };
    },

    canCast: (spellKey, target) => {
      const r = validateAction(state, { type: 'CAST', spell: spellKey, target });
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

  return api;
}
