// Stratège — portage navigateur du calculateur (scripts/rl/search_bot.cjs,
// SEARCH_VERSION A1-2026-10-11). Même algorithme, gardé par le test de
// parité src/__tests__/searchBot.test.js (même état ⇒ même action que la
// version banc). Juge = heuristique main (prouvée à parité stricte avec le
// meilleur réseau de valeur sur 256 duels — aucun poids à charger).
//
// LOYAL: planifie uniquement sur l'état RECONSTRUIT depuis la vue (celui que
// l'api fournit), jamais sur l'état réel du moteur. Dés simulés ≠ dés réels:
// chaque plan remplace rngState par des flux dérivés de l'état (le bot ne
// « connaît » jamais ses jets futurs). Déterministe à vue identique.
//
// Dépendances injectées (makeBotApi) pour éviter le cycle api ↔ searchBrain.
import { applyAction, getView, currentFighter } from '../engine/engine';
import { createRng, hashSeed } from '../engine/rng';
import { spellZoneCells } from '../engine/geometry';
import { turnResources } from '../engine/formulas';
import { maisonDecide } from './maison';

export const SEARCH_BRAIN_VERSION = 'A1-2026-10-11';
// decide() tourne en SYNCHRONE sur le thread principal du navigateur: chaque
// milliseconde de recherche est une milliseconde d'interface gelée. Mesure
// sur le VRAI chemin du jeu (LiveMatch, l200 équipé): le coût dominant n'est
// pas l'énumération (bornée par le budget) mais l'étage d'échantillonnage —
// ~24 candidats × rejouage + riposte simulée, et à haut niveau chaque riposte
// coûte plusieurs fois plus (PA/PM doublés). Le profil UI réduit donc le
// NOMBRE de candidats échantillonnés, pas seulement les nœuds. Les valeurs
// par défaut des options = constantes du banc (parité port↔banc testée avec
// elles); le builtin passe UI_PROFILE, re-validé en force avant déploiement.
export const UI_BUDGET = 300;
// Bisection 2026-10-12 (8 parties l100 chacun): fastCasts seul = 8-0,
// coupes de forme seules = 7-1, rollout glouton seul = 3-5 → le modèle
// adverse SIMPLIFIÉ détruit le jugement (les plans ne battant qu'une riposte
// naïve surclassent les vrais) et reste BANNI du profil UI. On garde la
// vraie riposte maison, on paie son coût en réduisant tout le reste.
// 2e leçon de la bisection: les coupes se COMPOSENT mal (fastCasts 8-0 et
// coupes-de-forme 7-1 séparément, mais combinées à budget 150: 7-9!). Le
// profil UI ne garde donc QUE la variante prouvée seule: cibles focalisées
// + budget 300, tout le reste aux valeurs du banc (8-0 mesuré, ~0,5 s/action
// l100). Le vrai fix du gel UI = recherche en Web Worker (pleine force).
export const UI_PROFILE = { budget: 300, fastCasts: true };
const DEPTH2_CANDIDATES = 18;
const OPP_TURN_GUARD = 20;

function hpScore(state, myTeam) {
  let me = 0; let meMax = 0; let opp = 0; let oppMax = 0;
  for (const f of Object.values(state.fighters)) {
    if (f.team === myTeam) { me += Math.max(0, f.hp); meMax += f.maxHp; } else { opp += Math.max(0, f.hp); oppMax += f.maxHp; }
  }
  return (me / Math.max(1, meMax) - opp / Math.max(1, oppMax)) * 1000;
}

function stateKeyOf(state) {
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

const CELL_EFFECT_KINDS = new Set(['trap', 'glyph', 'teleport', 'summon', 'staticSummon', 'double',
  'cell', 'freeCell', 'swap', 'swapAlly', 'carry', 'throw', 'fear', 'revive', 'rollback']);
function effectfulTargets(view, spell, cells) {
  const rows = [...(spell.effects || []), ...(spell.critEffects || [])];
  if (rows.some(e => CELL_EFFECT_KINDS.has(e.kind))) return cells;
  const bodies = new Set();
  for (const f of [view.you, ...(view.allies || []), ...(view.enemies || [])]) {
    if (f && f.hp > 0) bodies.add(`${f.pos.x},${f.pos.y}`);
  }
  const kept = cells.filter(c => rows.some(e =>
    spellZoneCells(e.zone, c, view.you.pos).some(z => bodies.has(`${z.x},${z.y}`))));
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

// Variante UI de candidateCasts: cases candidates = diamants (rayon 2 = plus
// grande zone CRA) autour des combattants vivants ∪ ma case, validées par
// canCast — évite le scan complet du plateau par sort (2,5 ms/sort à l200).
// Approximation assumée UI (zones > rayon 2 d'autres classes: partiellement
// couvertes); le banc garde candidateCasts complet.
function candidateCastsFast(view, api) {
  const you = view.you;
  const castable = (s) => s && (s.pa || 0) <= you.pa && (s.cooldownLeft || 0) <= 0 && (s.usesLeft ?? 99) > 0;
  const cells = [];
  const seen = new Set();
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= view.board.width || y >= view.board.height) return;
    const k = `${x},${y}`;
    if (seen.has(k)) return;
    seen.add(k);
    cells.push({ x, y });
  };
  for (const f of [you, ...(view.allies || []), ...(view.enemies || [])]) {
    if (!f || f.hp <= 0) continue;
    for (let dy = -2; dy <= 2; dy++) {
      const span = 2 - Math.abs(dy);
      for (let dx = -span; dx <= span; dx++) push(f.pos.x + dx, f.pos.y + dy);
    }
  }
  const out = [];
  const trySpell = (s) => {
    if (!castable(s)) return;
    const legal = cells.filter(c => api.canCast(s.key, c).ok);
    for (const c of effectfulTargets(view, s, legal)) out.push({ type: 'CAST', spell: s.key, target: { x: c.x, y: c.y } });
  };
  for (const s of you.spells || []) trySpell(s);
  if (you.weaponSpell) trySpell(you.weaponSpell);
  return out;
}

// netV (optionnel): évaluateur appris (state, meId, counters) → V ∈ [−1,1].
// Branché, la feuille devient le MÉLANGE du banc (makeValueJudge): le réseau
// domine (×1000), l'heuristique régularise ses angles morts (×0.35) — sinon
// le max sur ~17 feuilles exploite les erreurs du réseau (leçon du round 1).
export function makeSearchBrain({ makeBotApi, netV = null }) {
  const freshApi = (state, meId) =>
    makeBotApi(getView(state, meId), createRng(hashSeed(`api:${meId}:${stateKeyOf(state)}`)));

  function damagePotential(state, fid, counters) {
    const f = state.fighters[fid];
    if (!f || f.hp <= 0) return 0;
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
      counters.applies++;
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

  // Rollout UI: politique gloutonne (meilleur sort de dégâts castable sur un
  // ennemi, sinon approche, sinon PASS) — ~150× moins cher que le scan
  // utilitaire complet de maison (mesuré 15 ms/action à l200). Modèle adverse
  // plus faible: re-validé en force avant tout déploiement.
  function simTurnFast(s, counters) {
    const team = currentFighter(s).team;
    let guard = OPP_TURN_GUARD;
    while (!s.over && currentFighter(s).team === team && guard-- > 0) {
      const f = currentFighter(s);
      const view = getView(s, f.id);
      const api = freshApi(s, f.id);
      let action = null;
      const enemies = (view.enemies || []).filter(e => e.hp > 0);
      const spells = [...(view.you.spells || [])]
        .filter(sp => (sp.cooldownLeft || 0) <= 0 && (sp.pa || 0) <= view.you.pa && (sp.usesLeft ?? 99) > 0)
        .map(sp => ({ sp, dmg: (sp.effects || []).filter(e => e.kind === 'damage' || e.kind === 'lifeSteal')
          .reduce((t, e) => t + (e.min + e.max) / 2, 0) }))
        .filter(x => x.dmg > 0)
        .sort((a, b) => b.dmg / (b.sp.pa || 1) - a.dmg / (a.sp.pa || 1));
      for (const { sp } of spells) {
        const target = enemies.find(e => api.canCast(sp.key, e.pos).ok);
        if (target) { action = { type: 'CAST', spell: sp.key, target: { ...target.pos } }; break; }
      }
      if (!action && view.you.pm > 0 && enemies.length) {
        const to = api.moveToward ? api.moveToward(enemies[0].pos) : null;
        if (to && to.to && (to.to.x !== f.pos.x || to.to.y !== f.pos.y)) action = to;
      }
      if (!action) action = { type: 'PASS' };
      const r = applyAction(s, action);
      counters.applies++;
      if (!r.ok) { s = applyAction(s, { type: 'PASS' }).state; counters.applies++; continue; }
      s = r.state;
      if (action.type === 'PASS') break;
    }
    if (!s.over && currentFighter(s).team === team) { s = applyAction(s, { type: 'PASS' }).state; counters.applies++; }
    return s;
  }

  function heuristicLeaf(s, meId, myTeam, counters) {
    let mine = null; let theirs = null; let myHp = 0; let myMax = 1; let oppHp = 0; let oppMax = 1;
    for (const f of Object.values(s.fighters)) {
      if (f.hp <= 0) continue;
      if (f.team === myTeam) { myHp = f.hp; myMax = f.maxHp; mine = mine ?? damagePotential(s, f.id, counters); }
      else { oppHp = f.hp; oppMax = f.maxHp; theirs = theirs ?? damagePotential(s, f.id, counters); }
    }
    mine = mine || 0; theirs = theirs || 0;
    let score = hpScore(s, myTeam) + (mine / oppMax - theirs / myMax) * 1000 * 0.35;
    if (mine >= oppHp) score += 300;
    if (theirs >= myHp) score -= 300;
    return score;
  }

  function depth2Score(endState, meId, myTeam, counters, horizon = 3, rollout = simTurn) {
    let s = endState;
    if (!s.over && currentFighter(s).id === meId) {
      const r = applyAction(s, { type: 'PASS' });
      counters.applies++;
      s = r.state;
    }
    for (let h = 0; h < horizon && !s.over; h++) s = rollout(s, counters);
    if (s.over) return s.winner === myTeam ? 1000 : s.winner ? -1000 : 0;
    const v = netV
      ? netV(s, meId, counters) * 1000 + 0.35 * heuristicLeaf(s, meId, myTeam, counters)
      : heuristicLeaf(s, meId, myTeam, counters);
    return Math.max(-999, Math.min(999, v));
  }

  // Même algorithme que le banc: BFS préfiltrée, nominations par (combo,
  // case finale) + variante repliée + setups + témoin maison, 3 rejouages
  // frais par finaliste (CRN), issue terminale > toute feuille, départage
  // plan court. Voir scripts/rl/search_bot.cjs pour la version annotée.
  function searchDecide(realState, opts = UI_BUDGET) {
    // opts: nombre (budget seul, compat) ou profil complet. Défauts = banc.
    const o = typeof opts === 'number' ? { budget: opts } : (opts || {});
    const budget0 = o.budget ?? UI_BUDGET;
    const comboSlice = o.comboSlice ?? 8;
    const retreatSlice = o.retreatSlice ?? 8;
    const setupSlice = o.setupSlice ?? 5;
    const fillMax = o.fillMax ?? DEPTH2_CANDIDATES;
    const randomPicks = o.randomPicks ?? 3;
    const nFinalists = o.finalists ?? 6;
    const nSamples = o.samples ?? 3;
    const horizon = o.horizon ?? 3;
    const rollout = o.fastRollout ? simTurnFast : simTurn;
    const fastCasts = o.fastCasts ?? false;
    const withWitness = o.witness ?? true;
    const counters = { applies: 0 };
    const meId = currentFighter(realState).id;
    const myTeam = currentFighter(realState).team;
    const rootKey = stateKeyOf(realState);
    const simRng = createRng(hashSeed(`sim:${rootKey}`));
    const root = { ...realState, rngState: simRng.getState() };

    const baseHp = hpScore(root, myTeam);
    const ends = [];
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
    const effectKeyOf = (s) => {
      const parts = [];
      for (const id of Object.keys(s.fighters)) {
        const f = s.fighters[id];
        parts.push(id, f.pos.x, f.pos.y, f.hp, JSON.stringify(f.effects || []), f.carriedBy || '');
      }
      if ((s.hazards || []).length) parts.push(JSON.stringify(s.hazards));
      return parts.join('|');
    };
    let budget = budget0;
    const applies0 = counters.applies;
    const queue = [...startNodes];
    let qi = 0;
    while (qi < queue.length) {
      const node = queue[qi++];
      ends.push(node);
      if (node.state.over || currentFighter(node.state).id !== meId) continue;
      if (budget <= 0) continue;
      const view = getView(node.state, meId);
      const api = freshApi(node.state, meId);
      const parentEffectKey = effectKeyOf(node.state);
      const acts = fastCasts ? candidateCastsFast(view, api) : candidateCasts(view, api);
      const occ = new Set(Object.values(node.state.fighters).filter(f => f.hp > 0).map(f => `${f.pos.x},${f.pos.y}`));
      acts.sort((a, b) => (occ.has(`${b.target?.x},${b.target?.y}`) ? 1 : 0) - (occ.has(`${a.target?.x},${a.target?.y}`) ? 1 : 0));
      if (node.last === 'CAST' && node.state.fighters[meId].pm > 0) {
        for (const cell of api.reachable()) acts.push({ type: 'MOVE', to: { x: cell.pos.x, y: cell.pos.y } });
      }
      for (const a of acts) {
        if (budget <= 0 || counters.applies - applies0 > budget0 * 3) break;
        const r = applyAction(node.state, a);
        counters.applies++;
        if (!r.ok) continue;
        const k = stateKeyOf(r.state);
        if (seen.has(k)) continue;
        if (a.type === 'CAST' && effectKeyOf(r.state) === parentEffectKey) continue;
        seen.add(k);
        budget--;
        const spells = a.type === 'CAST' ? [...node.spells.split(','), a.spell].filter(Boolean).sort().join(',') : node.spells;
        queue.push({ state: r.state, first: node.first ?? a, moved: node.moved, depth: node.depth + 1, last: a.type, spells, acts: [...node.acts, a] });
      }
    }

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
    const byCell = new Map();
    for (const x of scored) {
      if (x.cheap > baseHp + 0.5) continue;
      const me = x.e.state.fighters[meId];
      const key = `${me.pos.x},${me.pos.y}|${x.e.spells}`;
      const prev = byCell.get(key);
      if (!prev || me.pa > prev.e.state.fighters[meId].pa) byCell.set(key, x);
    }
    const all = [...byCell.values()];
    const moves = all.filter(x => !x.e.spells);
    const setups = all.filter(x => x.e.spells && x.cheap >= baseHp - 0.5);
    const view0 = getView(root, meId);
    const pref = preferredRange(view0);
    for (const x of moves) x.posGap = Math.abs(nearestEnemyDist(x.e.state, meId) - pref);
    moves.sort((a, b) => a.posGap - b.posGap);
    const far = [...moves].sort((a, b) => nearestEnemyDist(b.e.state, meId) - nearestEnemyDist(a.e.state, meId))[0];
    const near = [...moves].sort((a, b) => nearestEnemyDist(a.e.state, meId) - nearestEnemyDist(b.e.state, meId))[0];
    const nominees = [];
    const pick = (x) => { if (x && !nominees.includes(x)) nominees.push(x); };
    const byCombo = new Map();
    const retreatByCombo = new Map();
    for (const x of damage) {
      if (!byCombo.has(x.e.spells)) byCombo.set(x.e.spells, x);
      x.dist = nearestEnemyDist(x.e.state, meId);
      const prev = retreatByCombo.get(x.e.spells);
      if (!prev || x.dist > prev.dist || (x.dist === prev.dist && x.cheap > prev.cheap)) retreatByCombo.set(x.e.spells, x);
    }
    for (const x of [...byCombo.values()].slice(0, comboSlice)) pick(x);
    for (const x of [...retreatByCombo.values()].slice(0, retreatSlice)) pick(x);
    const bySetupCombo = new Map();
    for (const x of setups) {
      x.posGap = Math.abs(nearestEnemyDist(x.e.state, meId) - pref);
      const prev = bySetupCombo.get(x.e.spells);
      if (!prev || x.posGap < prev.posGap) bySetupCombo.set(x.e.spells, x);
    }
    for (const x of [...bySetupCombo.values()].slice(0, setupSlice)) pick(x);
    for (const x of moves.slice(0, Math.max(0, fillMax - nominees.length - 2))) pick(x);
    pick(far); pick(near);
    let maisonNom = null;
    try {
      if (!withWitness) throw new Error('witness off');
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
    const nomRng = createRng(hashSeed(`nom:${rootKey}`));
    for (let r = 0; r < randomPicks && moves.length; r++) pick(moves[Math.floor(nomRng.next() * moves.length)]);

    const leafSeeds = [0, 1, 2].map((k) => createRng(hashSeed(`leaf:${rootKey}:${k}`)).getState());
    const score = (st) => depth2Score(st, meId, myTeam, counters, horizon, rollout);
    const replayed = (x, k) => {
      let st = { ...root, rngState: leafSeeds[k] };
      for (const a of x.e.acts) {
        const r = applyAction(st, a);
        counters.applies++;
        if (!r.ok) break;
        st = r.state;
        if (st.over || currentFighter(st).id !== meId) break;
      }
      return score(st);
    };
    const prelim = nominees.map((x) => ({ x, s0: replayed(x, 0) }));
    prelim.sort((a, b) => b.s0 - a.s0);
    const finalists = prelim.slice(0, nFinalists);
    if (maisonNom) {
      const mc = prelim.find((c) => c.x === maisonNom);
      if (mc && !finalists.includes(mc)) finalists.push(mc);
    }
    let best = null;
    for (const c of finalists) {
      let sum = c.s0;
      for (let k = 1; k < nSamples; k++) sum += replayed(c.x, k);
      const score = sum / nSamples;
      if (!best || score > best.score + 1e-9
        || (Math.abs(score - best.score) <= 1e-9 && c.x.e.acts.length < best.len)) {
        best = { score, len: c.x.e.acts.length, first: c.x.e.first, acts: c.x.e.acts };
      }
    }
    return best?.first || { type: 'PASS' };
  }

  return { searchDecide };
}

export { stateKeyOf };
