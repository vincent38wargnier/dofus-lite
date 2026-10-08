// Pure, headless combat engine — Dofus 1.29 rules.
// No React, no DOM: state in, state out. Every match is reproducible
// from its seed, bots only ever see cloned views.
//
// Mechanics (formulas cross-checked across emulator sources, see formulas.js):
//   - PA/PM, portée min/max (Manhattan), sorts en ligne, ligne de vue
//     (obstacles ET combattants), lancers par tour, intervalle de relance
//   - Coups critiques: 1/x amélioré par l'agilité (2.9901 / ln(agi+12))
//   - Échecs critiques: 1/x, PA consommés, peut terminer le tour
//   - Tacle/fuite: jet basé sur l'agilité des deux camps, échec = move
//     annulé, tous les PM perdus + un pourcentage des PA
//   - Retrait PA/PM esquivable à la sagesse (esquive = sagesse/4)
//   - Dégâts élémentaires: jet × (100 + carac + puissance)/100 + fixes,
//     réduits par résistances % et fixes; soins boostés par l'intelligence
//   - Vol de vie: rend la moitié des dégâts infligés
//   - Poussée: dégâts bruts (1d8+8) × niveau/50 × cases bloquées
//   - Érosion PvP: chaque coup ronge 1/10e des PV max de la cible
//   - Initiative sans jet: (vitalité/4 + caracs) × ratio de vie

import { createRng } from './rng';
import {
  CLASSES, getSpell, getSummonSpell, SUMMONS, FIGHTER_LEVEL, DEFAULT_BUFF_TURNS,
} from './classes';
import { MAPS } from './maps';
import {
  key, dist, samePos, isAligned, adjacentCells,
  hasLineOfSight, spellZoneCells,
} from './geometry';
import { bfs, reconstructPath } from './pathfinding';
import {
  rollCritical, rollFailure, rollEscape, dodgeStat, rollPointRemoval,
  initiative, pushbackDamage, damageAmount, applyResistances, healAmount,
  escapeChance,
} from './formulas';

export const MAX_TURNS = 40;
export { FIGHTER_LEVEL };

const clone = (o) => JSON.parse(JSON.stringify(o));

// ---------------------------------------------------------------- helpers

export function fighterList(state) {
  return Object.values(state.fighters);
}

export function currentFighter(state) {
  return state.fighters[state.order[state.currentIndex]];
}

// The enemy LEADER (bots' main target reference).
export function enemyOf(state, fighterId) {
  const me = state.fighters[fighterId];
  return fighterList(state).find((f) => f.team !== me.team && f.leader);
}

export function enemiesOf(state, fighterId) {
  const me = state.fighters[fighterId];
  return fighterList(state).filter((f) => f.team !== me.team && f.hp > 0);
}

export function alliesOf(state, fighterId) {
  const me = state.fighters[fighterId];
  return fighterList(state).filter((f) => f.team === me.team && f.hp > 0 && f.id !== fighterId);
}

// Spells of a fighter: class kit for leaders, monster kit for summons.
export function spellsOf(fighter) {
  return fighter.isSummon ? SUMMONS[fighter.monsterId].spells : CLASSES[fighter.classId].spells;
}

function spellOf(fighter, key) {
  return fighter.isSummon ? getSummonSpell(fighter.monsterId, key) : getSpell(fighter.classId, key);
}

export function fighterAt(state, x, y) {
  return fighterList(state).find((f) => f.hp > 0 && f.pos.x === x && f.pos.y === y) || null;
}

export function blocksMoveAt(state, x, y) {
  const obs = state.board.obstacles[key(x, y)];
  if (obs && obs.blocksMove) return true;
  return !!fighterAt(state, x, y);
}

export function blocksLosAt(state, x, y) {
  const obs = state.board.obstacles[key(x, y)];
  if (obs && obs.blocksLos) return true;
  return !!fighterAt(state, x, y); // les combattants bloquent la ligne de vue
}

function statBuff(fighter, stat) {
  return fighter.effects
    .filter((e) => e.kind === 'buff' && e.stat === stat)
    .reduce((s, e) => s + e.value, 0);
}

// Certains effets ont des retombées à leur disparition (fin de durée,
// désenvoûtement): la vitalité rend ses PV max.
function onEffectRemoved(f, e) {
  if (e.kind === 'buff' && e.stat === 'vitalite') {
    f.maxHp = Math.max(10, f.maxHp - e.value);
    f.hp = Math.min(f.hp, f.maxHp);
  }
}

function adjacentLivingEnemies(state, fighter) {
  return enemiesOf(state, fighter.id).filter(
    (e) => adjacentCells(fighter.pos).some((c) => samePos(c, e.pos)),
  );
}

function rngOf(state) {
  const rng = createRng(0);
  rng.setState(state.rngState);
  return rng;
}

function saveRng(state, rng) {
  state.rngState = rng.getState();
}

// ---------------------------------------------------------------- creation

export function createGame({ mapId = 'arene', seed = 1, fighters }) {
  const map = MAPS[mapId];
  if (!map) throw new Error(`Unknown map: ${mapId}`);
  if (!fighters || fighters.length !== 2) throw new Error('Need exactly 2 fighters');

  const rng = createRng(seed);
  const state = {
    seed,
    rngState: 0,
    mapId,
    board: { width: map.width, height: map.height, obstacles: clone(map.obstacles) },
    turn: 1,
    maxTurns: MAX_TURNS,
    order: [],
    currentIndex: 0,
    over: false,
    winner: null,
    endReason: null,
    fighters: {},
  };

  fighters.forEach((cfg, i) => {
    const cls = CLASSES[cfg.classId];
    if (!cls) throw new Error(`Unknown class: ${cfg.classId}`);
    const id = cfg.id || `F${i + 1}`;
    state.fighters[id] = {
      id,
      team: id,
      leader: true,
      isSummon: false,
      name: cfg.name || cls.name,
      botName: cfg.botName || null,
      classId: cls.id,
      level: FIGHTER_LEVEL,
      pos: { ...map.spawns[i] },
      hp: cls.baseHp,
      maxHp: cls.baseHp,
      baseMaxHp: cls.baseHp,
      basePa: cls.basePa,
      basePm: cls.basePm,
      pa: cls.basePa,
      pm: cls.basePm,
      stats: { ...cls.stats },
      resistances: { ...cls.resistances },
      resistancesFixed: { ...cls.resistancesFixed },
      effects: [],
      cooldowns: {},
      usedThisTurn: {},
      initiative: 0,
    };
  });

  // Initiative 1.29: pas de jet — égalité départagée par le seed.
  const ids = Object.keys(state.fighters);
  const extraHp = (f) => f.maxHp - (55 + 5 * (FIGHTER_LEVEL - 1));
  for (const id of ids) {
    const f = state.fighters[id];
    f.initiative = initiative(f.stats, extraHp(f), f.hp, f.maxHp);
  }
  const [a, b] = ids;
  if (state.fighters[a].initiative === state.fighters[b].initiative) {
    state.order = rng.next() < 0.5 ? [a, b] : [b, a];
  } else {
    state.order = [...ids].sort(
      (x, y) => state.fighters[y].initiative - state.fighters[x].initiative,
    );
  }
  saveRng(state, rng);

  const events = [{
    t: 'match_start',
    mapId,
    seed,
    order: state.order.map((id) => ({
      id,
      name: state.fighters[id].name,
      initiative: state.fighters[id].initiative,
    })),
  }];
  startTurn(state, events);
  return { state, events };
}

// ---------------------------------------------------------------- turn flow

function startTurn(state, events) {
  const f = currentFighter(state);

  for (const k of Object.keys(f.cooldowns)) {
    if (f.cooldowns[k] > 0) f.cooldowns[k] -= 1;
  }
  f.usedThisTurn = {};

  // PA/PM du tour = base + effets actifs (retraits compris)
  f.pa = Math.max(0, f.basePa + statBuff(f, 'pa'));
  f.pm = Math.max(0, f.basePm + statBuff(f, 'pm'));

  // Les châtiments repartent de zéro (leur plafond est PAR TOUR).
  for (const e of f.effects) {
    if (e.kind === 'punishment') e.gained = 0;
  }

  events.push({ t: 'turn_start', fighter: f.id, turn: state.turn, pa: f.pa, pm: f.pm });

  // Les dégâts périodiques (poisons) tombent au début du tour de la victime.
  for (const e of f.effects) {
    if (e.kind === 'poison' && f.hp > 0 && !state.over) {
      const dmg = e.element ? applyResistances(e.value, e.element, f) : e.value;
      applyDamage(state, events, null, f.id, dmg, `${e.name} (poison)`, { erosion: false, element: e.element || null });
    }
  }
}

function endTurn(state, events) {
  const f = currentFighter(state);

  // Les durées d'effets se consument à la fin du tour de leur porteur.
  f.effects = f.effects
    .map((e) => ({ ...e, turnsLeft: e.turnsLeft - 1 }))
    .filter((e) => {
      if (e.turnsLeft <= 0) {
        onEffectRemoved(f, e);
        events.push({ t: 'effect_end', fighter: f.id, name: e.name, kind: e.kind });
        return false;
      }
      return true;
    });

  events.push({ t: 'turn_end', fighter: f.id, turn: state.turn });

  // Avance au prochain combattant VIVANT (les invocations mortes sont sautées).
  let wrapped = false;
  let guard = 0;
  do {
    state.currentIndex = (state.currentIndex + 1) % state.order.length;
    if (state.currentIndex === 0) wrapped = true;
    guard += 1;
  } while (state.fighters[state.order[state.currentIndex]].hp <= 0 && guard <= state.order.length);

  if (wrapped) {
    state.turn += 1;
    if (state.turn > state.maxTurns) {
      // Limite de tours: le % de vie des LEADERS sur les PV max d'ORIGINE,
      // l'érosion punit donc la tortue qui soigne sans conclure.
      const [a, b] = fighterList(state).filter((x) => x.leader);
      const ra = a.hp / a.baseMaxHp;
      const rb = b.hp / b.baseMaxHp;
      state.over = true;
      state.endReason = 'turn_limit';
      state.winner = ra === rb ? null : (ra > rb ? a.id : b.id);
      events.push({ t: 'match_end', winner: state.winner, reason: 'turn_limit' });
      return;
    }
  }
  startTurn(state, events);
}

// ---------------------------------------------------------------- combat

// Effet 788 → quelle caractéristique le châtiment fait-il gagner ?
const PUNISHMENT_STATS = {
  118: 'force', 119: 'agilite', 123: 'chance', 124: 'sagesse', 126: 'intelligence',
};

function applyDamage(state, events, sourceId, targetId, amount, label, opts = {}) {
  const target = state.fighters[targetId];
  // Revers des châtiments (776): +% de dégâts subis.
  const suffer = statBuff(target, 'damageSuffer');
  const total = Math.max(0, Math.round(amount * (100 + Math.max(0, suffer)) / 100));

  // Érosion PvP 1.29: chaque coup ronge 1/10e en PV max.
  let erosion = 0;
  if (opts.erosion !== false && total > 0) {
    erosion = Math.floor(total / 10);
    target.maxHp = Math.max(10, target.maxHp - erosion);
  }
  target.hp = Math.max(0, Math.min(target.hp - total, target.maxHp));

  events.push({
    t: 'damage', source: sourceId, target: targetId, amount: total,
    erosion, hpLeft: target.hp, maxHp: target.maxHp, label,
    element: opts.element || null,
  });

  // Châtiments du Sacrieur (788): chaque COUP DE SORT reçu (pas les poisons
  // ni les collisions) rend dégâts/2 en caractéristique — ou en PV pour le
  // Vitalesque — plafonné par tour (émulateurs: PunishmentBuff).
  if (total > 0 && target.hp > 0 && opts.erosion !== false) {
    for (const e of target.effects) {
      if (e.kind !== 'punishment') continue;
      const gain = Math.min(Math.floor(total / 2), Math.max(0, e.maxPerTurn - (e.gained || 0)));
      if (gain <= 0) continue;
      e.gained = (e.gained || 0) + gain;
      if (e.statEffectId === 108) {
        applyHeal(state, events, target.id, gain, `${e.name} (châtiment)`);
      } else {
        const stat = PUNISHMENT_STATS[e.statEffectId];
        if (!stat) continue;
        target.effects.push({ kind: 'buff', stat, value: gain, turnsLeft: Math.max(1, e.turnsLeft), name: e.name });
        events.push({ t: 'effect_add', fighter: target.id, kind: 'buff', stat, value: gain, turns: e.turnsLeft, name: e.name });
      }
    }
  }

  if (target.hp <= 0) {
    events.push({ t: 'death', fighter: targetId });
    if (target.leader) {
      state.over = true;
      state.endReason = 'ko';
      state.winner = enemyOf(state, targetId).id;
      events.push({ t: 'match_end', winner: state.winner, reason: 'ko' });
    }
  }
  return total;
}

function applyHeal(state, events, targetId, amount, label) {
  const target = state.fighters[targetId];
  const healed = Math.min(target.maxHp - target.hp, Math.max(0, Math.round(amount)));
  target.hp += healed;
  events.push({ t: 'heal', target: targetId, amount: healed, hpLeft: target.hp, label });
  return healed;
}

function applyPush(state, events, rng, casterPos, targetId, cells, label) {
  const target = state.fighters[targetId];
  const dx = target.pos.x - casterPos.x;
  const dy = target.pos.y - casterPos.y;
  const dir = Math.abs(dx) >= Math.abs(dy)
    ? { x: Math.sign(dx) || 1, y: 0 }
    : { x: 0, y: Math.sign(dy) };

  const from = { ...target.pos };
  let moved = 0;
  let cur = { ...target.pos };
  while (moved < cells) {
    const next = { x: cur.x + dir.x, y: cur.y + dir.y };
    const inside = next.x >= 0 && next.y >= 0
      && next.x < state.board.width && next.y < state.board.height;
    if (!inside || blocksMoveAt(state, next.x, next.y)) break;
    cur = next;
    moved += 1;
  }
  const remaining = cells - moved;
  target.pos = cur;

  const collision = pushbackDamage(rng, FIGHTER_LEVEL, remaining);
  events.push({
    t: 'push', target: targetId, from, to: { ...cur }, cells, moved,
    collisionDamage: remaining > 0 ? collision : 0,
  });
  if (remaining > 0 && collision > 0) {
    // Dégâts bruts: pas de caractéristique, pas de résistance, pas d'érosion.
    applyDamage(state, events, null, targetId, collision, `${label} (poussée)`, { erosion: false });
  }
}

// ---------------------------------------------------------------- validation

export function validateAction(state, action) {
  if (state.over) return { ok: false, reason: 'Le combat est terminé' };
  if (!action || !action.type) return { ok: false, reason: 'Action invalide' };
  if (action.type === 'PASS') return { ok: true };
  if (action.type === 'MOVE') return validateMove(state, action);
  if (action.type === 'CAST') return validateCast(state, action);
  return { ok: false, reason: `Type d'action inconnu: ${action.type}` };
}

function validateMove(state, action) {
  const f = currentFighter(state);
  const to = action.to;
  if (!to || typeof to.x !== 'number' || typeof to.y !== 'number') {
    return { ok: false, reason: 'Destination manquante' };
  }
  if (samePos(f.pos, to)) return { ok: false, reason: 'Déjà sur cette case' };
  if (f.pm <= 0) return { ok: false, reason: 'Plus de PM' };
  const { costs, parents } = bfs(
    f.pos, f.pm, state.board.width, state.board.height,
    (x, y) => blocksMoveAt(state, x, y),
  );
  const cost = costs.get(key(to.x, to.y));
  if (cost === undefined || cost > f.pm) {
    return { ok: false, reason: 'Case hors de portée de déplacement' };
  }
  return { ok: true, cost, parents };
}

function validateCast(state, action) {
  const f = currentFighter(state);
  const spell = spellOf(f, action.spell);
  if (!spell) return { ok: false, reason: `Sort inconnu: ${action.spell}` };

  // Limite d'invocations vivantes du lanceur.
  if (spell.effects.some((e) => e.kind === 'summon')) {
    const living = fighterList(state).filter(
      (x) => x.isSummon && x.ownerId === f.id && x.hp > 0,
    ).length;
    const max = CLASSES[f.classId]?.maxSummons || 1;
    if (living >= max) return { ok: false, reason: `Déjà ${living} invocation(s) en jeu` };
  }

  const target = spell.targetMode === 'self' ? { ...f.pos } : action.target;
  if (!target || typeof target.x !== 'number' || typeof target.y !== 'number') {
    return { ok: false, reason: 'Cible manquante' };
  }
  if (target.x < 0 || target.y < 0
    || target.x >= state.board.width || target.y >= state.board.height) {
    return { ok: false, reason: 'Cible hors du plateau' };
  }
  if (f.pa < spell.pa) return { ok: false, reason: `PA insuffisants (${f.pa}/${spell.pa})` };
  if ((f.cooldowns[spell.key] || 0) > 0) {
    return { ok: false, reason: `${spell.name} en relance (${f.cooldowns[spell.key]} tours)` };
  }
  if (spell.usesPerTurn > 0 && (f.usedThisTurn[spell.key] || 0) >= spell.usesPerTurn) {
    return { ok: false, reason: `${spell.name} déjà lancé ${spell.usesPerTurn}x ce tour` };
  }

  // Portée modifiable (1.29): les bonus/malus de PO ne touchent que les
  // sorts à portée « ajustable ».
  const rangeMax = Math.max(
    spell.range[0],
    spell.range[1] + (spell.adjustableRange ? statBuff(f, 'range') : 0),
  );
  const d = dist(f.pos, target);
  if (d < spell.range[0] || d > rangeMax) {
    return { ok: false, reason: `Hors de portée (${d}, portée ${spell.range[0]}-${rangeMax})` };
  }
  if (spell.lineOnly && !isAligned(f.pos, target)) {
    return { ok: false, reason: 'Ce sort se lance en ligne' };
  }
  if (spell.needsLos && d > 0) {
    const losOk = hasLineOfSight(f.pos, target, (x, y) => blocksLosAt(state, x, y));
    if (!losOk) return { ok: false, reason: 'Pas de ligne de vue' };
  }

  const occupant = fighterAt(state, target.x, target.y);
  const obs = state.board.obstacles[key(target.x, target.y)];
  switch (spell.targetMode) {
    case 'enemy':
      if (!occupant || occupant.team === f.team) return { ok: false, reason: 'Il faut cibler un ennemi' };
      break;
    case 'fighter':
      if (!occupant) return { ok: false, reason: 'Il faut cibler un combattant' };
      break;
    case 'freeCell':
      if (occupant || (obs && obs.blocksMove)) return { ok: false, reason: 'La case doit être libre' };
      break;
    case 'cell':
      if (!occupant && obs && obs.blocksMove) return { ok: false, reason: 'Case invalide' };
      break;
    default: // self
      break;
  }
  return { ok: true, spell, target };
}

// ---------------------------------------------------------------- actions

export function applyAction(inputState, action) {
  const state = clone(inputState);
  const events = [];
  const check = validateAction(state, action);
  if (!check.ok) {
    events.push({ t: 'invalid', fighter: currentFighter(state).id, reason: check.reason, action });
    return { state: inputState, events, ok: false };
  }

  if (action.type === 'PASS') {
    endTurn(state, events);
    return { state, events, ok: true };
  }
  if (action.type === 'MOVE') {
    doMove(state, events, action, check);
    return { state, events, ok: true };
  }
  if (action.type === 'CAST') {
    doCast(state, events, check.spell, check.target);
    return { state, events, ok: true };
  }
  return { state: inputState, events, ok: false };
}

function doMove(state, events, action, check) {
  const f = currentFighter(state);
  const rng = rngOf(state);

  // Tacle 1.29: quitter le contact demande un jet de fuite.
  const tacklers = adjacentLivingEnemies(state, f);
  if (tacklers.length > 0) {
    const agiEnemies = tacklers.reduce((s, e) => s + e.stats.agilite, 0);
    const result = rollEscape(rng, f.stats.agilite, agiEnemies, f.pa);
    saveRng(state, rng);
    if (!result.escaped) {
      f.pa = Math.max(0, f.pa - result.lostPa);
      f.pm = 0;
      events.push({
        t: 'tackle', fighter: f.id, by: tacklers[0].id,
        chance: result.chance, lostPa: result.lostPa,
      });
      return; // le déplacement est annulé
    }
    events.push({ t: 'escape', fighter: f.id, chance: result.chance });
  }

  const path = reconstructPath(f.pos, action.to, check.parents);
  const steps = path.slice(1);
  const from = { ...f.pos };
  const dest = steps[steps.length - 1];
  f.pos = { ...dest };
  f.pm -= steps.length;
  events.push({
    t: 'move', fighter: f.id, from, to: { ...dest },
    path: [from, ...steps], cost: steps.length, pmLeft: f.pm,
  });
}

function fightersInZone(state, cells) {
  const seen = new Set();
  const out = [];
  for (const c of cells) {
    const victim = fighterAt(state, c.x, c.y);
    if (victim && victim.hp > 0 && !seen.has(victim.id)) {
      seen.add(victim.id);
      out.push(victim);
    }
  }
  return out;
}

function doCast(state, events, spell, target) {
  const f = currentFighter(state);
  const rng = rngOf(state);

  f.pa -= spell.pa;
  f.usedThisTurn[spell.key] = (f.usedThisTurn[spell.key] || 0) + 1;
  if (spell.cooldown > 0) f.cooldowns[spell.key] = spell.cooldown;

  // Échec critique: PA dépensés, aucun effet, peut terminer le tour.
  if (rollFailure(rng, spell.failRate)) {
    saveRng(state, rng);
    events.push({
      t: 'spell_fail', fighter: f.id, spell: spell.key, spellName: spell.name,
      endsTurn: spell.endsTurnOnFailure, paLeft: f.pa,
    });
    if (spell.endsTurnOnFailure && !state.over) endTurn(state, events);
    return;
  }

  // Coup critique: 1/x amélioré par l'agilité et les bonus critiques.
  const crit = rollCritical(
    rng, spell.critRate, f.stats.agilite + statBuff(f, 'agilite'), statBuff(f, 'crit'),
  );

  const rows = crit && spell.critEffects.length > 0 ? spell.critEffects : spell.effects;
  const casterPos = { ...f.pos };

  // Cellules de zone (pour l'affichage) : union des zones non ponctuelles.
  const aoe = [];
  const aoeSeen = new Set();
  for (const effect of rows) {
    const cells = spellZoneCells(effect.zone, target, casterPos);
    if (cells.length > 1) {
      for (const c of cells) {
        const k = `${c.x},${c.y}`;
        if (!aoeSeen.has(k)) { aoeSeen.add(k); aoe.push(c); }
      }
    }
  }

  events.push({
    t: 'cast', fighter: f.id, spell: spell.key, spellName: spell.name,
    emoji: spell.emoji, element: spell.element, from: casterPos,
    target: { ...target }, crit, paCost: spell.pa, paLeft: f.pa,
    aoe: aoe.length > 0 ? aoe : null,
  });

  for (const effect of rows) {
    if (state.over) break;
    // Effets à probabilité (Pile ou Face, Bluff…)
    if (effect.chance > 0 && rng.int(1, 100) > effect.chance) continue;
    const cells = spellZoneCells(effect.zone, target, casterPos);

    switch (effect.kind) {
      case 'damage':
      case 'lifeSteal': {
        for (const victim of fightersInZone(state, cells)) {
          const jet = rng.int(effect.min, effect.max);
          const raw = damageAmount(jet, effect.element, f);
          const afterRes = applyResistances(raw, effect.element, victim);
          // Armure (Féca…): réduction plate des dégâts subis.
          const finalDmg = Math.max(0, afterRes - statBuff(victim, 'armor'));
          const dealt = applyDamage(
            state, events, f.id, victim.id, finalDmg,
            spell.name + (crit ? ' (critique !)' : ''),
            { element: effect.element },
          );
          if (effect.kind === 'lifeSteal' && dealt > 0 && f.hp > 0) {
            // Vol de vie: rend la moitié des dégâts, sans boost d'intelligence.
            applyHeal(state, events, f.id, Math.floor(dealt / 2), `${spell.name} (vol de vie)`);
          }
          if (state.over) break;
        }
        break;
      }
      case 'heal': {
        for (const patient of fightersInZone(state, cells)) {
          const jet = rng.int(effect.min, effect.max);
          applyHeal(state, events, patient.id, healAmount(jet, f), spell.name);
        }
        break;
      }
      case 'push': {
        for (const victim of fightersInZone(state, cells)) {
          if (victim.id === f.id) continue;
          applyPush(state, events, rng, casterPos, victim.id, effect.p1 || 1, spell.name);
          if (state.over) break;
        }
        break;
      }
      case 'pull': {
        for (const victim of fightersInZone(state, cells)) {
          if (victim.id === f.id) continue;
          // Attirance: pas de dégâts de collision en 1.29.
          const ddx = Math.sign(casterPos.x - victim.pos.x);
          const ddy = Math.sign(casterPos.y - victim.pos.y);
          const dir = Math.abs(casterPos.x - victim.pos.x) >= Math.abs(casterPos.y - victim.pos.y)
            ? { x: ddx, y: 0 } : { x: 0, y: ddy };
          let cur = { ...victim.pos };
          for (let i = 0; i < (effect.p1 || 1); i++) {
            const next = { x: cur.x + dir.x, y: cur.y + dir.y };
            if (dist(next, casterPos) === 0 || blocksMoveAt(state, next.x, next.y)) break;
            cur = next;
          }
          const from = { ...victim.pos };
          victim.pos = cur;
          events.push({ t: 'pull', target: victim.id, from, to: { ...cur } });
        }
        break;
      }
      case 'teleport': {
        const from = { ...f.pos };
        f.pos = { ...target };
        events.push({ t: 'teleport', fighter: f.id, from, to: { ...target }, spell: spell.key });
        break;
      }
      case 'buffPa':
      case 'buffPm':
      case 'buffPower':
      case 'buffDamage':
      case 'buffCrit':
      case 'buffStat': {
        // Les buffs du roster sont des sorts sur soi.
        const value = effect.min === effect.max ? effect.min : rng.int(effect.min, effect.max);
        const stat = effect.kind === 'buffPa' ? 'pa'
          : effect.kind === 'buffPm' ? 'pm'
          : effect.kind === 'buffPower' ? 'power'
          : effect.kind === 'buffDamage' ? 'damage'
          : effect.kind === 'buffCrit' ? 'crit'
          : effect.stat;
        const turns = effect.duration > 0 ? effect.duration : DEFAULT_BUFF_TURNS;
        // 1.29: relancer un sort REMPLACE son effet, il ne s'empile pas.
        const prev = f.effects.find((x) => x.kind === 'buff' && x.name === spell.name && x.stat === stat);
        if (prev) f.effects = f.effects.filter((x) => x !== prev);
        f.effects.push({ kind: 'buff', stat, value, turnsLeft: turns, name: spell.name });
        if (stat === 'pa') f.pa = Math.max(0, f.pa + value - (prev ? prev.value : 0));
        if (stat === 'pm') f.pm = Math.max(0, f.pm + value - (prev ? prev.value : 0));
        events.push({
          t: 'effect_add', fighter: f.id, kind: 'buff', stat, value, turns, name: spell.name,
        });
        break;
      }
      case 'armor': {
        const value = effect.min === effect.max ? effect.min : rng.int(effect.min, effect.max);
        const turns = effect.duration > 0 ? effect.duration : DEFAULT_BUFF_TURNS;
        // Remplace l'armure du même sort au lieu de l'empiler.
        f.effects = f.effects.filter((x) => !(x.kind === 'buff' && x.name === spell.name && x.stat === 'armor'));
        f.effects.push({ kind: 'buff', stat: 'armor', value, turnsLeft: turns, name: spell.name });
        events.push({ t: 'effect_add', fighter: f.id, kind: 'buff', stat: 'armor', value, turns, name: spell.name });
        break;
      }
      case 'summon': {
        const tpl = SUMMONS[effect.p1];
        if (!tpl) break;
        // Invocation 1.29: stats et PV multipliés par (1 + niveau de l'invocateur / 100).
        const coef = 1 + FIGHTER_LEVEL / 100;
        const id = `${f.id}s${(f.summonCount = (f.summonCount || 0) + 1)}`;
        const summon = {
          id,
          team: f.team,
          leader: false,
          isSummon: true,
          ownerId: f.id,
          monsterId: tpl.monsterId,
          name: tpl.name,
          emoji: tpl.emoji,
          classId: f.classId,
          level: FIGHTER_LEVEL,
          pos: { ...target },
          hp: Math.floor(tpl.hp * coef),
          maxHp: Math.floor(tpl.hp * coef),
          baseMaxHp: Math.floor(tpl.hp * coef),
          basePa: tpl.pa,
          basePm: tpl.pm,
          pa: tpl.pa,
          pm: tpl.pm,
          stats: Object.fromEntries(
            Object.entries(tpl.stats).map(([k, v]) => [k, Math.floor(v * coef)]),
          ),
          resistances: { neutre: 0, terre: 0, feu: 0, eau: 0, air: 0 },
          resistancesFixed: { neutre: 0, terre: 0, feu: 0, eau: 0, air: 0 },
          effects: [],
          cooldowns: {},
          usedThisTurn: {},
          initiative: 0,
        };
        state.fighters[id] = summon;
        // L'invocation joue juste APRÈS son invocateur.
        const idx = state.order.indexOf(f.id);
        state.order.splice(idx + 1, 0, id);
        events.push({
          t: 'summon_add', fighter: f.id, id, name: tpl.name, emoji: tpl.emoji,
          pos: { ...target }, hp: summon.hp,
        });
        break;
      }
      case 'punishment': {
        // Châtiment: pendant `duration` tours, chaque coup reçu rend
        // dégâts/2 en carac (ou en PV pour le Vitalesque), cap p2 par tour.
        const turns = effect.duration > 0 ? effect.duration : 5;
        f.effects = f.effects.filter((x) => !(x.kind === 'punishment' && x.name === spell.name));
        f.effects.push({
          kind: 'punishment', statEffectId: effect.p1, maxPerTurn: effect.p2 || 999,
          gained: 0, turnsLeft: turns, name: spell.name,
        });
        events.push({
          t: 'effect_add', fighter: f.id, kind: 'punishment',
          stat: PUNISHMENT_STATS[effect.p1] || 'PV', value: effect.p2 || 0, turns, name: spell.name,
        });
        break;
      }
      case 'damageSuffer': {
        // Revers du châtiment: +p1% de dégâts subis pendant la durée.
        const turns = effect.duration > 0 ? effect.duration : DEFAULT_BUFF_TURNS;
        const value = effect.p1 || effect.min || 0;
        f.effects = f.effects.filter((x) => !(x.kind === 'buff' && x.stat === 'damageSuffer' && x.name === spell.name));
        f.effects.push({ kind: 'buff', stat: 'damageSuffer', value, turnsLeft: turns, name: spell.name });
        events.push({ t: 'effect_add', fighter: f.id, kind: 'buff', stat: 'damageSuffer', value, turns, name: spell.name });
        break;
      }
      case 'punitionDamage': {
        // Punition (672), formule GDCore: cloche sur le ratio de PV du
        // LANCEUR — nulle à pleine vie, maximale (p1% des PV max) à mi-vie.
        for (const victim of fightersInZone(state, cells)) {
          if (victim.id === f.id) continue;
          const ratio = f.hp / Math.max(1, f.maxHp);
          const radian = 2 * Math.PI * (ratio - 0.5);
          const raw = Math.floor((((Math.cos(radian) + 1) ** 2) / 4)
            * ((effect.p1 || 0) / 100) * f.maxHp);
          const afterRes = applyResistances(raw, 'neutre', victim);
          const finalDmg = Math.max(0, afterRes - statBuff(victim, 'armor'));
          applyDamage(state, events, f.id, victim.id, finalDmg,
            spell.name + (crit ? ' (critique !)' : ''), { element: 'neutre' });
          if (state.over) break;
        }
        break;
      }
      case 'swapAlly': {
        // Dérobade: échange de positions avec un ALLIÉ (invocation comprise).
        const ally = fightersInZone(state, cells).find((v) => v.id !== f.id && v.team === f.team);
        if (!ally) break;
        const posA = { ...f.pos };
        f.pos = { ...ally.pos };
        ally.pos = posA;
        events.push({
          t: 'swap', a: f.id, b: ally.id,
          aTo: { ...f.pos }, bTo: { ...ally.pos }, name: spell.name,
        });
        break;
      }
      case 'swap': {
        // Transposition, Coopération, Détour: échange de positions.
        const victim = fightersInZone(state, cells).find((v) => v.id !== f.id);
        if (!victim) break;
        const was = { ...f.pos };
        f.pos = { ...victim.pos };
        victim.pos = was;
        events.push({
          t: 'swap', a: f.id, b: victim.id,
          aTo: { ...f.pos }, bTo: { ...victim.pos }, name: spell.name,
        });
        break;
      }
      case 'dispel': {
        // Désenvoûtement: retire TOUS les effets (buffs comme malus).
        for (const victim of fightersInZone(state, cells)) {
          if (victim.effects.length === 0) continue;
          for (const ef of victim.effects) onEffectRemoved(victim, ef);
          const removed = victim.effects.length;
          victim.effects = [];
          events.push({ t: 'dispel', fighter: f.id, target: victim.id, removed, name: spell.name });
        }
        break;
      }
      case 'buffVitality': {
        // +vitalité: PV max ET PV courants, rendus à l'expiration.
        const value = effect.min === effect.max ? effect.min : rng.int(effect.min, effect.max);
        const turns = effect.duration > 0 ? effect.duration : DEFAULT_BUFF_TURNS;
        const prev = f.effects.find((x) => x.kind === 'buff' && x.name === spell.name && x.stat === 'vitalite');
        if (prev) { onEffectRemoved(f, prev); f.effects = f.effects.filter((x) => x !== prev); }
        f.effects.push({ kind: 'buff', stat: 'vitalite', value, turnsLeft: turns, name: spell.name });
        f.maxHp += value;
        f.hp += value;
        events.push({ t: 'effect_add', fighter: f.id, kind: 'buff', stat: 'vitalite', value, turns, name: spell.name });
        break;
      }
      case 'buffRange': {
        const value = effect.min === effect.max ? effect.min : rng.int(effect.min, effect.max);
        const turns = effect.duration > 0 ? effect.duration : DEFAULT_BUFF_TURNS;
        f.effects = f.effects.filter((x) => !(x.kind === 'buff' && x.name === spell.name && x.stat === 'range'));
        f.effects.push({ kind: 'buff', stat: 'range', value, turnsLeft: turns, name: spell.name });
        events.push({ t: 'effect_add', fighter: f.id, kind: 'buff', stat: 'range', value, turns, name: spell.name });
        break;
      }
      case 'debuffRange': {
        const turns = effect.duration > 0 ? effect.duration : DEFAULT_BUFF_TURNS;
        for (const victim of fightersInZone(state, cells)) {
          if (victim.id === f.id) continue;
          const value = effect.min === effect.max ? effect.min : rng.int(effect.min, effect.max);
          victim.effects.push({ kind: 'buff', stat: 'range', value: -value, turnsLeft: turns, name: spell.name });
          events.push({ t: 'effect_add', fighter: victim.id, kind: 'buff', stat: 'range', value: -value, turns, name: spell.name });
        }
        break;
      }
      case 'resistBuff': {
        // Bouclier Féca et armures élémentaires: +% résistance sur soi.
        const value = effect.min === effect.max ? effect.min : rng.int(effect.min, effect.max);
        const turns = effect.duration > 0 ? effect.duration : DEFAULT_BUFF_TURNS;
        const stat = `res_${effect.element}`;
        f.effects = f.effects.filter((x) => !(x.kind === 'buff' && x.name === spell.name && x.stat === stat));
        f.effects.push({ kind: 'buff', stat, value, turnsLeft: turns, name: spell.name });
        events.push({ t: 'effect_add', fighter: f.id, kind: 'buff', stat, value, turns, name: spell.name });
        break;
      }
      case 'resistDebuff': {
        // Vulnérabilités Pandawa: -% résistance sur la cible.
        const turns = effect.duration > 0 ? effect.duration : DEFAULT_BUFF_TURNS;
        const stat = `res_${effect.element}`;
        for (const victim of fightersInZone(state, cells)) {
          if (victim.id === f.id) continue;
          const value = effect.min === effect.max ? effect.min : rng.int(effect.min, effect.max);
          victim.effects = victim.effects.filter((x) => !(x.kind === 'buff' && x.name === spell.name && x.stat === stat));
          victim.effects.push({ kind: 'buff', stat, value: -value, turnsLeft: turns, name: spell.name });
          events.push({ t: 'effect_add', fighter: victim.id, kind: 'buff', stat, value: -value, turns, name: spell.name });
        }
        break;
      }
      case 'stealPa':
      case 'stealPm': {
        const isPa = effect.kind === 'stealPa';
        for (const victim of fightersInZone(state, cells)) {
          if (victim.id === f.id) continue;
          const { removed, dodged } = rollPointRemoval(
            rng, dodgeStat(f.stats.sagesse), dodgeStat(victim.stats.sagesse),
            isPa ? victim.pa : victim.pm, isPa ? victim.basePa : victim.basePm, effect.p1 || 1,
          );
          if (removed > 0) {
            if (isPa) { victim.pa = Math.max(0, victim.pa - removed); f.pa += removed; }
            else { victim.pm = Math.max(0, victim.pm - removed); f.pm += removed; }
            victim.effects.push({
              kind: 'buff', stat: isPa ? 'pa' : 'pm', value: -removed, turnsLeft: 1, name: spell.name,
            });
          }
          events.push({
            t: 'point_removal', fighter: f.id, target: victim.id,
            stat: isPa ? 'PA' : 'PM', removed, dodged, name: spell.name, stolen: true,
          });
        }
        break;
      }
      case 'removePa':
      case 'removePm': {
        const isPa = effect.kind === 'removePa';
        for (const victim of fightersInZone(state, cells)) {
          const removerDodge = dodgeStat(f.stats.sagesse);
          const victimDodge = dodgeStat(victim.stats.sagesse);
          const current = isPa ? victim.pa : victim.pm;
          const max = isPa ? victim.basePa : victim.basePm;
          const { removed, dodged } = rollPointRemoval(
            rng, removerDodge, victimDodge, current, max, effect.p1 || 1,
          );
          if (removed > 0) {
            if (isPa) victim.pa = Math.max(0, victim.pa - removed);
            else victim.pm = Math.max(0, victim.pm - removed);
            // Le retrait pèse aussi sur le prochain tour de la victime.
            if (victim.id !== f.id) {
              victim.effects.push({
                kind: 'buff', stat: isPa ? 'pa' : 'pm', value: -removed,
                turnsLeft: 1, name: spell.name,
              });
            }
          }
          events.push({
            t: 'point_removal', fighter: f.id, target: victim.id,
            stat: isPa ? 'PA' : 'PM', removed, dodged, name: spell.name,
          });
        }
        break;
      }
      case 'poison': {
        // Poison 1.29: jet × caracs du LANCEUR au lancer, résistances de la
        // victime à chaque tic (début de son tour). Relancer remplace.
        for (const victim of fightersInZone(state, cells)) {
          const jet = rng.int(effect.min ?? 0, effect.max ?? effect.min ?? 0);
          const value = Math.max(1, damageAmount(jet, effect.element, f));
          const turns = effect.duration || 3;
          victim.effects = victim.effects.filter((x) => !(x.kind === 'poison' && x.name === spell.name));
          victim.effects.push({
            kind: 'poison', value, element: effect.element || null, turnsLeft: turns, name: spell.name,
          });
          events.push({
            t: 'effect_add', fighter: victim.id, kind: 'poison',
            value, turns, name: spell.name,
          });
        }
        break;
      }
      default:
        break;
    }
  }

  saveRng(state, rng);
}

// ---------------------------------------------------------------- bot view

export function getView(state, fighterId) {
  const me = state.fighters[fighterId];
  const enemy = enemyOf(state, fighterId);
  const isMyTurn = currentFighter(state).id === fighterId;

  const viewFighter = (f) => ({
    id: f.id,
    team: f.team,
    leader: f.leader,
    isSummon: !!f.isSummon,
    monsterId: f.monsterId || null,
    ownerId: f.ownerId || null,
    name: f.name,
    classId: f.classId,
    className: CLASSES[f.classId].name,
    level: f.level,
    pos: { ...f.pos },
    hp: f.hp,
    maxHp: f.maxHp,
    baseMaxHp: f.baseMaxHp,
    pa: f.pa,
    pm: f.pm,
    basePa: f.basePa,
    basePm: f.basePm,
    stats: { ...f.stats },
    resistances: { ...f.resistances },
    resistancesFixed: { ...f.resistancesFixed },
    initiative: f.initiative,
    effects: clone(f.effects),
    spells: Object.values(spellsOf(f)).map((s) => ({
      key: s.key,
      name: s.name,
      emoji: s.emoji,
      element: s.element,
      targetMode: s.targetMode,
      pa: s.pa,
      // portée effective: les bonus/malus de PO s'appliquent aux sorts ajustables
      range: [
        s.range[0],
        Math.max(s.range[0], s.range[1] + (s.adjustableRange ? statBuff(f, 'range') : 0)),
      ],
      adjustableRange: !!s.adjustableRange,
      lineOnly: s.lineOnly,
      needsLos: s.needsLos,
      critRate: s.critRate,
      failRate: s.failRate,
      endsTurnOnFailure: s.endsTurnOnFailure,
      usesPerTurn: s.usesPerTurn,
      cooldown: s.cooldown,
      effects: clone(s.effects),
      critEffects: clone(s.critEffects),
      cooldownLeft: f.cooldowns[s.key] || 0,
      usesLeft: s.usesPerTurn === 0 ? 99 : s.usesPerTurn - (f.usedThisTurn[s.key] || 0),
    })),
  });

  return {
    turn: state.turn,
    maxTurns: state.maxTurns,
    isMyTurn,
    you: viewFighter(me),
    enemy: viewFighter(enemy),
    enemies: enemiesOf(state, fighterId).map(viewFighter),
    allies: alliesOf(state, fighterId).map(viewFighter),
    board: {
      width: state.board.width,
      height: state.board.height,
      obstacles: Object.values(state.board.obstacles).map((o) => ({
        x: o.x, y: o.y, type: o.type, blocksMove: o.blocksMove, blocksLos: o.blocksLos,
      })),
    },
  };
}

// Escape odds preview, exposed to bots through the api.
export function escapePreview(state, fighterId) {
  const f = state.fighters[fighterId];
  const tacklers = adjacentLivingEnemies(state, f);
  if (tacklers.length === 0) return { inContact: false, chance: 100 };
  const agiEnemies = tacklers.reduce((s, e) => s + e.stats.agilite, 0);
  return {
    inContact: true,
    chance: escapeChance(f.stats.agilite, agiEnemies),
  };
}

export { SUMMONS };
