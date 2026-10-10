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
//   - Poussée: dégâts bruts (8 + 1d8 × niveau/50) × cases bloquées
//   - Érosion PvP: chaque coup ronge 1/10e des PV max de la cible
//   - Initiative sans jet: (caracs élémentaires + bonus initiative) × ratio de vie

import { createRng, hashSeed } from './rng';
import {
  CLASSES, SUMMONS, getSummon, resolveSpellLoadout, FIGHTER_LEVEL, DEFAULT_BUFF_TURNS,
} from './classes';
import { MAPS } from './maps';
import { getMonster } from './monsters';
import { resolveCustomMonster } from './customMonsters';
import {
  key, dist, samePos, isAligned, adjacentCells,
  hasLineOfSight, spellZoneCells, areaDamagePercent,
} from './geometry';
import { bfs, reconstructPath } from './pathfinding';
import {
  rollCritical, rollFailure, rollEscape, pointRemovalScores, rollPointRemoval,
  initiative, pushbackDamage, damageAmount, applyResistances, healAmount,
  escapeChance, effectiveStat, armorReduction, statBuffTotal, turnResources,
} from './formulas';
import { resolveLoadout, applySpellModifiers } from './equipment';

export const MAX_TURNS = 40;
export const COMBAT_RULES_VERSION = 9;
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
  const opponents = fighterList(state).filter(f => f.team !== me.team && f.leader);
  return opponents.find(f => f.hp > 0) || opponents[0];
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
  if (fighter.isDouble) return {};
  if (fighter.customMonster) return resolveCustomMonster(fighter.customMonster).spells;
  if (fighter.isMonster) return getMonster(fighter.monsterId, fighter.monsterGrade)?.spells || {};
  if (fighter.isSummon) return getSummon(fighter.monsterId, fighter.summonGrade || 5)?.spells || {};
  const spells = fighter.loadout ? resolveSpellLoadout(fighter.classId, fighter.loadout).spells : CLASSES[fighter.classId].spells;
  if (!Object.keys(fighter.spellModifiers || {}).length && !fighter.weaponSpell) return spells;
  const result = Object.fromEntries(Object.entries(spells).map(([key, spell]) => [key, applySpellModifiers(spell, fighter.spellModifiers)]));
  if (fighter.weaponSpell) result.weapon = fighter.weaponSpell;
  const order = fighter.loadout?.spells?.order?.length ? fighter.loadout.spells.order : [0];
  return Object.fromEntries(Object.entries(result).sort(([, a], [, b]) => {
    if (!!a.isWeapon !== !!b.isWeapon) return a.isWeapon ? -1 : 1;
    const ai = order.indexOf(a.id), bi = order.indexOf(b.id);
    return (ai < 0 ? 10000 : ai) - (bi < 0 ? 10000 : bi);
  }));
}

function spellOf(fighter, key) {
  return spellsOf(fighter)[key] || null;
}

export function fighterAt(state, x, y) {
  return fighterList(state).find((f) => f.hp > 0 && !f.carriedBy && !f.hidden && f.pos.x === x && f.pos.y === y) || null;
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
  return statBuffTotal(fighter, stat);
}

function hasState(fighter, id) {
  return fighter.effects.some(e => e.kind === 'state' && e.stateId === id);
}

export function isInvisible(fighter) {
  return (fighter.effects || []).some(e => e.kind === 'invisibility');
}

function revealFighter(events, fighter) {
  if (!isInvisible(fighter)) return;
  fighter.effects = fighter.effects.filter(e => e.kind !== 'invisibility');
  events.push({ t: 'reveal', fighter: fighter.id, pos: { ...fighter.pos } });
}

// Dice expressions retain their distribution (2d2 is not a uniform 2..4).
export function rollEffectValue(rng, effect, caster, target) {
  const min = Math.max(0, effect.min || 0), max = Math.max(min, effect.max || min);
  if (caster?.effects.some(e => e.kind === 'minRolls')) return min;
  if (target?.effects.some(e => e.kind === 'maxRolls')) return max;
  const dice = /^(\d+)d(\d+)\+(\d+)$/.exec(effect.raw?.split(';')[6] || '');
  if (!dice) return min === max ? min : rng.int(min, max);
  let value = Number(dice[3]);
  for (let i = 0; i < Number(dice[1]); i++) value += rng.int(1, Number(dice[2]));
  return value;
}

// Sort.applySpellEffectToFight target flags, preserved per effect at import.
export function effectAcceptsTarget(effect, caster, target) {
  const mask = effect.targetMask || 0;
  if ((mask & 1) && target.team === caster.team) return false;
  if ((mask & 2) && target.id === caster.id) return false;
  if ((mask & 4) && target.team !== caster.team) return false;
  if ((mask & 8) && !target.isSummon) return false;
  if ((mask & 16) && target.isSummon) return false;
  if ((mask & 32) && target.id !== caster.id) return false;
  return true;
}

function effectTargets(state, cells, caster, effect) {
  if ((effect.targetMask || 0) & 32) return caster.hp > 0 ? [caster] : [];
  return fightersInZone(state, cells).filter(target => effectAcceptsTarget(effect, caster, target));
}

function addBuff(events, target, caster, spell, effect, stat, value, extra = {}) {
  const turns = effect.duration > 0 ? effect.duration : DEFAULT_BUFF_TURNS;
  const buff = { kind: 'buff', stat, value, turnsLeft: Math.max(1, turns + (target.id === caster.id ? 1 : 0)), name: spell.name,
    source: caster.id, spellId: spell.id, effectId: effect.id, ...extra };
  target.effects.push(buff);
  if (stat === 'pa' || stat === 'pm') target[stat] = Math.max(0, target[stat] + value);
  if (stat === 'vitalite') { target.maxHp += value; target.hp += value; }
  events.push({ t: 'effect_add', fighter: target.id, source: caster.id,
    kind: buff.kind, stat, value, turns, name: spell.name, effectId: effect.id });
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
  if (hasState(fighter, 6)) return [];
  return enemiesOf(state, fighter.id).filter(
    (e) => !e.carriedBy && !isInvisible(e) && !hasState(e, 6) && adjacentCells(fighter.pos).some((c) => samePos(c, e.pos)),
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

// Keep archived zones intact. Arenas with only one departure gain adjacent,
// reachable cells when a team needs more room, never taking the opposing zone.
function teamStartingCells(map, counts) {
  const zones = clone(map.startingCells);
  const reserved = new Set(zones.flat().map(p => key(p.x, p.y)));
  zones.forEach((cells, i) => {
    if (cells.length >= counts[i]) return;
    if (map.placement.status === 'client') throw new Error('Ce groupe dépasse les cases de placement de la salle.');
    if (!cells.length) throw new Error(`Missing starting cells: ${map.id}`);
    const { costs } = bfs(cells[0], map.width * map.height, map.width, map.height,
      (x, y) => !!map.obstacles[key(x, y)]?.blocksMove);
    const candidates = [...costs].filter(([k]) => !reserved.has(k))
      .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
    for (const [k] of candidates) {
      if (cells.length >= counts[i]) break;
      const [x, y] = k.split(',').map(Number);
      cells.push({ x, y }); reserved.add(k);
    }
    if (cells.length < counts[i]) throw new Error('Pas assez de cases libres pour ce groupe.');
  });
  return zones;
}

export function createGame({ mapId = 'arene', seed = 1, fighters, placement = false }) {
  const map = MAPS[mapId];
  if (!map) throw new Error(`Unknown map: ${mapId}`);
  if (!fighters || fighters.length < 2) throw new Error('Need at least 2 fighters');
  const configs = fighters.map((cfg, i) => ({ ...cfg, id: cfg.id || `F${i + 1}`, team: cfg.team || cfg.id || `F${i + 1}` }));
  const teams = [...new Set(configs.map(f => f.team))];
  if (teams.length !== 2 || teams.some(team => configs.filter(f => f.team === team).length > 8)) {
    throw new Error('Need two teams of at most 8 fighters');
  }
  if (new Set(configs.map(f => f.id)).size !== configs.length) throw new Error('Duplicate fighter id');

  const rng = createRng(seed);
  // A separate stream keeps placement choices from changing combat dice.
  const placementRng = createRng(hashSeed(`${seed}:placement`));
  const swapZones = map.placement.status === 'historical' && placementRng.next() < 0.5;
  const zoneIndex = team => swapZones ? 1 - teams.indexOf(team) : teams.indexOf(team);
  const counts = [0, 0];
  configs.forEach(f => { counts[zoneIndex(f.team)]++; });
  const zones = teamStartingCells(map, counts);
  const occupiedStarts = new Set();
  const state = {
    rulesVersion: COMBAT_RULES_VERSION,
    seed,
    rngState: 0,
    mapId,
    board: { width: map.width, height: map.height, obstacles: clone(map.obstacles) },
    phase: placement ? 'placement' : 'combat',
    placement: { cells: {}, ready: {}, source: { ...clone(map.placement),
      ...(zones.some((cells, i) => cells.length > map.startingCells[i].length) ? { expanded: true } : {}) } },
    turn: placement ? 0 : 1,
    maxTurns: MAX_TURNS,
    order: [],
    currentIndex: 0,
    over: false,
    winner: null,
    endReason: null,
    fighters: {},
    hazards: [],
    hazardCount: 0,
  };

  configs.forEach(cfg => {
    const monster = cfg.customMonster ? resolveCustomMonster(cfg.customMonster) : cfg.monsterId != null ? getMonster(cfg.monsterId, cfg.monsterGrade) : null;
    if (cfg.monsterId != null && !monster) throw new Error(`Unknown monster/grade: ${cfg.monsterId}/${cfg.monsterGrade}`);
    const cls = monster || CLASSES[cfg.classId];
    if (!cls) throw new Error(`Unknown class: ${cfg.classId}`);
    const id = cfg.id;
    const cells = zones[zoneIndex(cfg.team)];
    if (!cells?.length) throw new Error(`Missing starting cells: ${mapId}`);
    state.placement.cells[id] = clone(cells);
    state.placement.ready[id] = !placement;
    const cell = placementRng.pick(cells.filter(p => !occupiedStarts.has(key(p.x, p.y))));
    occupiedStarts.add(key(cell.x, cell.y));
    const pos = { x: cell.x, y: cell.y };
    const equipment = !monster && cfg.loadout ? resolveLoadout(cfg.classId, cfg.loadout) : null;
    if (equipment && !equipment.valid) throw new Error(`${cfg.name || cls.name} : ${equipment.errors.join(' ')}`);
    state.fighters[id] = {
      id,
      team: cfg.team,
      leader: true,
      isSummon: false,
      isMonster: !!monster,
      name: cfg.name || cls.name,
      botName: cfg.botName || null,
      classId: monster ? null : cls.id,
      level: monster ? monster.level : FIGHTER_LEVEL,
      pos: { ...pos },
      startPos: { ...pos },
      hp: cls.baseHp,
      maxHp: cls.baseHp,
      baseMaxHp: cls.baseHp,
      basePa: cls.basePa,
      basePm: cls.basePm,
      pa: Math.max(0, cls.basePa),
      pm: Math.max(0, cls.basePm),
      stats: { ...cls.stats },
      resistances: { ...cls.resistances },
      resistancesFixed: { ...cls.resistancesFixed },
      effects: [],
      cooldowns: {},
      usedThisTurn: {},
      usedOnTarget: {},
      initiative: 0,
      ...(monster ? {
        monsterId: monster.monsterId, monsterGrade: monster.grade, emoji: monster.emoji,
        ...(cfg.customMonster ? { customMonster: clone(cfg.customMonster), appearanceMonsterId: monster.appearanceMonsterId,
          artworkId: monster.artworkId, customInitiative: monster.initiative } : {}),
        permanent: { dodgePa: monster.dodgePa, dodgePm: monster.dodgePm }, maxSummons: monster.maxSummons,
      } : {}),
      ...(equipment ? {
        level: equipment.level,
        hp: equipment.hp, maxHp: equipment.hp, baseMaxHp: equipment.hp,
        pa: equipment.pa, basePa: equipment.pa, pm: equipment.pm, basePm: equipment.pm,
        stats: equipment.stats, resistances: equipment.resistances, resistancesFixed: equipment.resistancesFixed,
        permanent: equipment.permanent, spellModifiers: equipment.spellModifiers, weaponSpell: equipment.weaponSpell,
        loadout: equipment.snapshot, equipment: { items: equipment.items, sets: equipment.sets, sources: 'client-cache' },
        maxSummons: 1,
      } : {}),
    };
  });

  // Initiative 1.29: pas de jet — égalité départagée par le seed.
  const ids = Object.keys(state.fighters);
  for (const id of ids) {
    const f = state.fighters[id];
    f.initiative = f.isMonster ? f.customInitiative ?? getMonster(f.monsterId, f.monsterGrade).initiative
      : initiative(f.stats, f.hp, f.maxHp, statBuff(f, 'initiative'));
  }
  const [a, b] = ids;
  if (ids.length === 2 && state.fighters[a].initiative === state.fighters[b].initiative) {
    state.order = rng.next() < 0.5 ? [a, b] : [b, a];
  } else {
    const ties = Object.fromEntries(ids.map(id => [id, placementRng.next()]));
    const ranked = [...ids].sort((x, y) => state.fighters[y].initiative - state.fighters[x].initiative || ties[x] - ties[y]);
    const queues = teams.map(team => ranked.filter(id => state.fighters[id].team === team));
    let side = teams.indexOf(state.fighters[ranked[0]].team);
    while (queues.some(queue => queue.length)) {
      if (queues[side].length) state.order.push(queues[side].shift());
      side = 1 - side;
    }
  }
  saveRng(state, rng);

  const events = [];
  if (placement) {
    events.push({ t: 'placement_start', mapId, seed,
      cells: clone(state.placement.cells), source: clone(state.placement.source) });
  } else {
    beginCombat(state, events);
  }
  return { state, events };
}

function beginCombat(state, events) {
  state.phase = 'combat';
  state.turn = 1;
  events.push({
    t: 'match_start',
    mapId: state.mapId,
    seed: state.seed,
    placement: clone(state.placement),
    startingPositions: Object.fromEntries(fighterList(state).map(f => [f.id, { ...f.pos }])),
    loadouts: Object.fromEntries(fighterList(state).map(f => [f.id, clone(f.loadout || null)])),
    order: state.order.map((id) => ({
      id,
      name: state.fighters[id].name,
      initiative: state.fighters[id].initiative,
    })),
  });
  startTurn(state, events);
}

function placementCheck(state, fighterId, to) {
  if (state.phase !== 'placement' || state.over) return 'Le placement est terminé';
  if (!state.fighters[fighterId] || !state.placement.cells[fighterId]) return 'Combattant inconnu';
  if (state.placement.ready[fighterId]) return 'Ce combattant est déjà prêt';
  if (!to || !Number.isInteger(to.x) || !Number.isInteger(to.y)
    || to.x < 0 || to.y < 0 || to.x >= state.board.width || to.y >= state.board.height
    || !state.placement.cells[fighterId].some(cell => samePos(cell, to))
    || state.board.obstacles[key(to.x, to.y)]?.blocksMove) return 'Choisissez une case de départ de votre équipe';
  if (fighterList(state).some(f => f.id !== fighterId && f.hp > 0 && samePos(f.pos, to))) return 'Cette case est occupée';
  return null;
}

// Placement teleports cost no PA/PM, trigger no effects and consume no combat RNG.
export function placeFighter(inputState, fighterId, to) {
  const reason = placementCheck(inputState, fighterId, to);
  if (reason) return { ok: false, reason, state: inputState, events: [] };
  const state = clone(inputState);
  const f = state.fighters[fighterId];
  const from = { ...f.pos };
  f.pos = { x: to.x, y: to.y };
  f.startPos = { ...f.pos };
  return { ok: true, state, events: [{ t: 'placement_move', fighter: fighterId, from, to: { ...f.pos } }] };
}

export function readyFighter(inputState, fighterId) {
  const reason = placementCheck(inputState, fighterId, inputState.fighters[fighterId]?.pos);
  if (reason) return { ok: false, reason, state: inputState, events: [] };
  const state = clone(inputState);
  state.placement.ready[fighterId] = true;
  const events = [{ t: 'placement_ready', fighter: fighterId }];
  if (Object.values(state.placement.ready).every(Boolean)) beginCombat(state, events);
  return { ok: true, state, events };
}

// ---------------------------------------------------------------- turn flow

function startTurn(state, events) {
  const f = currentFighter(state);

  for (const k of Object.keys(f.cooldowns)) {
    if (f.cooldowns[k] > 0) f.cooldowns[k] -= 1;
  }
  f.usedThisTurn = {};
  f.usedOnTarget = {};
  f.apSpent = 0;

  // PA/PM du tour = base + effets actifs (retraits compris)
  Object.assign(f, turnResources(f));

  // The cap is per acting fighter's turn, including summons, not per round.
  for (const fighter of fighterList(state)) for (const effect of fighter.effects) {
    if (effect.kind === 'punishment') effect.gained = 0;
  }

  events.push({ t: 'turn_start', fighter: f.id, turn: state.turn, pa: f.pa, pm: f.pm });

  for (const effect of [...f.effects]) {
    if (effect.kind !== 'delayedSpell') continue;
    effect.delay -= 1;
    if (effect.delay <= 0) {
      f.effects = f.effects.filter(e => e !== effect);
      doCast(state, events, { ...effect.trigger, key: `delayed_${effect.spellId}`, emoji: '✦', critEffects: [] },
        f.pos, { caster: f, origin: f.pos, visualSpellId: effect.spellId });
    }
  }
  // Les dégâts périodiques (poisons) tombent au début du tour de la victime.
  for (const e of f.effects) {
    if (e.kind === 'poison' && f.hp > 0 && !state.over) {
      const dmg = e.element ? applyResistances(e.value, e.element, f, state.fighters[e.source]) : e.value;
      applyDamage(state, events, null, f.id, dmg, `${e.name} (poison)`, { erosion: false, element: e.element || null });
    }
    if (e.kind === 'regeneration' && f.hp > 0 && !state.over) {
      applyHeal(state, events, f.id, e.value, `${e.name} (régénération)`);
    }
  }
  for (const hazard of [...(state.hazards || [])]) {
    if (hazard.kind !== 'glyph' || state.over) continue;
    if (hazard.owner === f.id) hazard.turnsLeft -= 1;
    if (hazard.turnsLeft <= 0 || state.fighters[hazard.owner]?.hp <= 0) {
      state.hazards = state.hazards.filter(h => h.id !== hazard.id);
      events.push({ t: 'hazard_end', id: hazard.id, name: hazard.name });
    } else if (f.hp > 0 && hazard.cells.some(c => samePos(c, f.pos))) {
      triggerHazard(state, events, hazard, f);
    }
  }
  // Losing the ability to act does not cancel start-of-turn effects.
  if (f.effects.some(e => e.kind === 'skipTurn') && !state.over && f.hp > 0) {
    events.push({ t: 'turn_skipped', fighter: f.id });
    endTurn(state, events);
  } else if (f.hp <= 0 && !state.over) endTurn(state, events);
}

function endTurn(state, events) {
  const f = currentFighter(state);

  for (const effect of f.effects.filter(e => e.kind === 'apPoison')) {
    const groups = Math.floor((f.apSpent || 0) / Math.max(1, effect.step));
    if (groups && f.hp > 0) applyDamage(state, events, effect.source, f.id, groups * effect.value,
      `${effect.name} (PA utilisés)`, { erosion: false, element: 'feu' });
  }
  if (state.over) return;

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
      // Compare each team's remaining original HP; a dead boss does not
      // erase the rest of its group, and summons do not inflate the score.
      const teams = [...new Set(fighterList(state).filter(f => f.leader).map(f => f.team))];
      const scores = teams.map(team => {
        const members = fighterList(state).filter(f => f.leader && f.team === team);
        return members.reduce((hp, f) => hp + f.hp, 0) / members.reduce((hp, f) => hp + f.baseMaxHp, 0);
      });
      state.over = true;
      state.endReason = 'turn_limit';
      state.winner = scores[0] === scores[1] ? null
        : fighterList(state).find(f => f.leader && f.team === teams[scores[0] > scores[1] ? 0 : 1] && f.hp > 0).id;
      events.push({ t: 'match_end', winner: state.winner, reason: 'turn_limit' });
      return;
    }
  }
  startTurn(state, events);
}

// ---------------------------------------------------------------- combat

// Effet 788 → quelle caractéristique le châtiment fait-il gagner ?
export const PUNISHMENT_STATS = {
  118: 'force', 119: 'agilite', 123: 'chance', 124: 'sagesse', 126: 'intelligence', 138: 'power',
};

function applyDamage(state, events, sourceId, targetId, amount, label, opts = {}) {
  const target = state.fighters[targetId];
  // Effect 776 adds permanent damage (erosion), never incoming damage.
  const erosionRate = Math.min(50, 10 + Math.max(0, statBuff(target, 'erosion')));
  const attempted = Math.max(0, Math.round(amount));
  const total = Math.min(target.hp, attempted);

  // Érosion PvP 1.29: chaque coup ronge 1/10e en PV max.
  let erosion = 0;
  if (opts.erosion !== false && total > 0) {
    erosion = Math.floor(total * erosionRate / 100);
    target.maxHp = Math.max(10, target.maxHp - erosion);
  }
  target.hp = Math.max(0, Math.min(target.hp - total, target.maxHp));

  events.push({
    t: 'damage', source: sourceId, target: targetId, amount: total,
    erosion, hpLeft: target.hp, maxHp: target.maxHp, label,
    element: opts.element || null,
    attempted, calculation: opts.calculation || null,
  });

  // Châtiments du Sacrieur (788): chaque COUP DE SORT reçu (pas les poisons
  // ni les collisions) rend dégâts/2 en caractéristique — ou en PV pour le
  // Vitalesque — plafonné par tour (émulateurs: PunishmentBuff).
  if (total > 0 && target.hp > 0 && opts.erosion !== false) {
    for (const e of target.effects) {
      if (e.kind !== 'punishment') continue;
      const attacker = state.fighters[sourceId];
      const gain = Math.min(Math.floor(total / (attacker?.isSummon || attacker?.isMonster ? 1 : 2)), Math.max(0, e.maxPerTurn - (e.gained || 0)));
      if (gain <= 0) continue;
      e.gained = (e.gained || 0) + gain;
      if (e.statEffectId === 108) {
        applyHeal(state, events, target.id, gain, `${e.name} (châtiment)`);
      } else {
        const stat = PUNISHMENT_STATS[e.statEffectId];
        if (!stat) continue;
        const turns = e.bonusDuration || 5;
        target.effects.push({ kind: 'buff', stat, value: gain, turnsLeft: turns + (target.id === currentFighter(state).id ? 1 : 0), name: e.name,
          source: e.source, spellId: e.spellId, effectId: e.statEffectId });
        events.push({ t: 'effect_add', fighter: target.id, kind: 'buff', stat, value: gain, turns, name: e.name,
          source: e.source, spellId: e.spellId });
      }
    }
  }

  // Furie's one-turn drawback reacts to each direct damage line. It is not
  // a poison tick, does not scale with +damage, and cannot trigger itself.
  if (total > 0 && target.hp > 0 && opts.direct) {
    for (const effect of target.effects.filter(e => e.kind === 'damageOnHit')) {
      const raw = Math.floor(target.maxHp * effect.value / 100);
      const recoil = applyResistances(raw, 'neutre', target, target);
      applyDamage(state, events, target.id, target.id, recoil, `${effect.name} (coup reçu)`,
        { erosion: false, element: 'neutre', reactive: true });
      if (target.hp <= 0) break;
    }
  }

  if (target.hp <= 0 && !target.deathOrder) {
    target.deathOrder = (state.deathCount = (state.deathCount || 0) + 1);
    if (target.carrying) {
      const carried = state.fighters[target.carrying];
      if (carried) { carried.carriedBy = null; carried.effects = carried.effects.filter(e => !(e.kind === 'state' && e.stateId === 8)); }
      target.carrying = null;
    }
    if (target.carriedBy && state.fighters[target.carriedBy]) {
      const carrier = state.fighters[target.carriedBy]; carrier.carrying = null;
      carrier.effects = carrier.effects.filter(e => !(e.kind === 'state' && e.stateId === 3));
      target.carriedBy = null;
    }
    events.push({ t: 'death', fighter: targetId });
    for (const dependent of fighterList(state)) if (dependent.hp > 0
      && (dependent.revivedBy === targetId || dependent.ownerId === targetId)) {
      applyDamage(state, events, targetId, dependent.id, dependent.hp,
        dependent.ownerId === targetId ? 'Mort de l’invocateur' : 'Fin de Laisse Spirituelle', { erosion: false });
    }
    if (!state.over && !fighterList(state).some(f => f.leader && f.team === target.team && f.hp > 0)) {
      state.over = true;
      state.endReason = 'ko';
      state.winner = fighterList(state).find(f => f.leader && f.team !== target.team && f.hp > 0)?.id || null;
      events.push({ t: 'match_end', winner: state.winner, reason: 'ko' });
    }
  }
  return total;
}

function applyHeal(state, events, targetId, amount, label) {
  const target = state.fighters[targetId];
  if (!target || target.hp <= 0) return 0;
  const healed = Math.min(target.maxHp - target.hp, Math.max(0, Math.round(amount)));
  target.hp += healed;
  events.push({ t: 'heal', target: targetId, amount: healed, hpLeft: target.hp, label });
  return healed;
}

function damageRecipient(state, events, rng, caster, victim, spell, trigger, dodged) {
  if (dodged.has(victim.id)) return null;
  const sacrifice = victim.effects.find(e => e.kind === 'sacrifice' && e.source !== victim.id && state.fighters[e.source]?.hp > 0);
  if (sacrifice) {
    const protector = state.fighters[sacrifice.source];
    const pos = { ...victim.pos }; victim.pos = { ...protector.pos }; protector.pos = pos;
    events.push({ t: 'swap', a: victim.id, b: protector.id, aTo: { ...victim.pos }, bTo: { ...protector.pos }, name: 'Sacrifice' });
    victim = protector;
  }
  if (dodged.has(victim.id)) return null;
  const dodge = victim.effects.find(e => e.kind === 'dodgeMelee');
  if (!trigger && dodge && dist(caster.pos, victim.pos) === 1 && !hasState(victim, 6) && !victim.carriedBy) {
    dodged.add(victim.id);
    events.push({ t: 'damage_dodged', fighter: victim.id, source: caster.id, spellId: spell.id, name: dodge.name || 'Dérobade' });
    // Even against a wall the attack is avoided; only the collision remains.
    applyPush(state, events, rng, caster.pos, victim.id, dodge.cells || 1, dodge.name || 'Dérobade');
    return null;
  }
  return victim;
}

function applyPush(state, events, rng, casterPos, targetId, cells, label, options = {}) {
  const target = state.fighters[targetId];
  if (hasState(target, 6) || target.carriedBy || samePos(casterPos, target.pos)) return;
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
    if (!inside || state.board.obstacles[key(next.x, next.y)]?.blocksMove || (!options.throughFighters && fighterAt(state, next.x, next.y))) break;
    if (options.throughFighters && fighterAt(state, next.x, next.y)) {
      // Cross occupied cells only when a free landing exists within the push.
      const distance = moved + 1;
      let landing = null;
      for (let step = distance + 1; step <= cells; step++) {
        const candidate = { x: from.x + dir.x * step, y: from.y + dir.y * step };
        if (candidate.x < 0 || candidate.y < 0 || candidate.x >= state.board.width || candidate.y >= state.board.height || state.board.obstacles[key(candidate.x, candidate.y)]?.blocksMove) break;
        if (!fighterAt(state, candidate.x, candidate.y)) { landing = { ...candidate, step }; break; }
      }
      if (!landing) break;
      cur = { x: landing.x, y: landing.y }; moved = landing.step;
    } else { cur = next; moved += 1; }
  }
  const remaining = cells - moved;
  target.pos = cur;
  if (target.carrying) state.fighters[target.carrying].pos = { ...cur };

  const collision = options.collision === false ? 0 : pushbackDamage(rng, currentFighter(state).level || FIGHTER_LEVEL, remaining);
  events.push({
    t: 'push', target: targetId, from, to: { ...cur }, cells, moved,
    collisionDamage: remaining > 0 ? collision : 0,
  });
  if (remaining > 0 && collision > 0) {
    // Dégâts bruts: pas de caractéristique, pas de résistance, pas d'érosion.
    applyDamage(state, events, null, targetId, collision, `${label} (poussée)`, { erosion: false });
  }
  triggerTraps(state, events, target, rng);
}

// ---------------------------------------------------------------- validation

export function validateAction(state, action) {
  if (state.phase === 'placement') return { ok: false, reason: 'Validez votre placement avant de jouer' };
  if (state.over) return { ok: false, reason: 'Le combat est terminé' };
  if (!action || !action.type) return { ok: false, reason: 'Action invalide' };
  if (action.type === 'PASS') return { ok: true };
  if (action.type === 'MOVE') return validateMove(state, action);
  if (action.type === 'CAST') return validateCast(state, action);
  return { ok: false, reason: `Type d'action inconnu: ${action.type}` };
}

function validateMove(state, action) {
  const f = currentFighter(state);
  // Pesanteur (7) prevents movement spells, not ordinary movement using MP.
  if (f.carriedBy) return { ok: false, reason: 'Déplacement impossible dans cet état' };
  const to = action.to;
  if (!to || !Number.isInteger(to.x) || !Number.isInteger(to.y)) {
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
  if (spell.missingSummons?.length) return { ok: false, reason: 'Invocation indisponible : caractéristiques manquantes.' };
  if (spell.isWeapon && (hasState(f, 42) || f.carriedBy)) return { ok: false, reason: 'Arme inutilisable dans cet état' };
  if ((spell.requiredStates || []).some(id => !hasState(f, id))) return { ok: false, reason: 'État requis absent' };
  if ((spell.forbiddenStates || []).some(id => hasState(f, id))) return { ok: false, reason: 'Impossible dans cet état' };

  // Limite d'invocations vivantes du lanceur.
  if (spell.effects.some((e) => ['summon', 'double'].includes(e.kind))) {
    const living = fighterList(state).filter(
      (x) => x.isSummon && !x.staticSummon && x.ownerId === f.id && x.hp > 0,
    ).length;
    const max = Math.max(0, (f.maxSummons ?? CLASSES[f.classId]?.maxSummons ?? 1) + statBuff(f, 'summons'));
    if (living >= max) return { ok: false, reason: `Déjà ${living} invocation(s) en jeu` };
  }

  const target = spell.targetMode === 'self' ? { ...f.pos } : action.target;
  if (!target || !Number.isInteger(target.x) || !Number.isInteger(target.y)) {
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
  if (spell.effects.some(e => e.kind === 'carry') && (!occupant || occupant.id === f.id || occupant.carriedBy || occupant.carrying || f.carrying || hasState(occupant, 6))) {
    return { ok: false, reason: 'Cette cible ne peut pas être portée' };
  }
  if (spell.effects.some(e => ['swap', 'teleport', 'rollback', 'throw'].includes(e.kind)) && hasState(f, 7)) return { ok: false, reason: 'Déplacement interdit dans cet état' };
  if (spell.effects.some(e => e.kind === 'swap') && (hasState(f, 6) || (occupant && hasState(occupant, 6)))) return { ok: false, reason: 'Cible stabilisée' };
  if (spell.effects.some(e => e.kind === 'throw') && !f.carrying) return { ok: false, reason: 'Aucune cible portée' };
  if (spell.id === 438 && occupant?.team !== f.team) return { ok: false, reason: 'Transposition nécessite un allié' };
  if (spell.id === 445 && occupant?.team === f.team) return { ok: false, reason: 'Coopération nécessite un ennemi' };
  if (spell.id === 450 && (!occupant || occupant.id === f.id || occupant.team !== f.team)) return { ok: false, reason: 'Folie sanguinaire nécessite un autre allié' };
  if (spell.effects.some(e => ['summon', 'staticSummon'].includes(e.kind)
    && !((f.isMonster || spell.monsterSummons) ? getMonster(e.p1, e.p2) : getSummon(e.p1, e.p2)))) {
    return { ok: false, reason: 'Données de cette invocation indisponibles' };
  }
  const obs = state.board.obstacles[key(target.x, target.y)];
  if (obs?.type === 'VOID') return { ok: false, reason: 'Cible hors de la carte' };
  if (spell.emptyCellOnly && (occupant || obs?.blocksMove)) return { ok: false, reason: 'La case doit être libre' };
  if (spell.effects.some(e => e.kind === 'trap') && (state.hazards || []).some(h => h.kind === 'trap' && samePos(h.center, target))) {
    return { ok: false, reason: 'Un piège occupe déjà cette case' };
  }
  if (spell.usesPerTarget > 0 && occupant
    && (f.usedOnTarget?.[spell.key]?.[occupant.id] || 0) >= spell.usesPerTarget) {
    return { ok: false, reason: `${spell.name} déjà lancé ${spell.usesPerTarget}x sur cette cible ce tour` };
  }
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

  // Presentation and exported logs need a stable boundary for a whole action,
  // including its damage rows, life steals and triggered reactions.
  state.actionSequence = (state.actionSequence || 0) + 1;
  if (action.type === 'PASS') {
    endTurn(state, events);
  } else if (action.type === 'MOVE') {
    doMove(state, events, action, check);
    if (!state.over && currentFighter(state).hp <= 0) endTurn(state, events);
  } else if (action.type === 'CAST') {
    doCast(state, events, check.spell, check.target);
    if (!state.over && currentFighter(state).hp <= 0) endTurn(state, events);
  } else {
    return { state: inputState, events, ok: false };
  }
  return { state, events: events.map(e => ({ ...e, actionId: state.actionSequence })), ok: true };
}

function doMove(state, events, action, check) {
  const f = currentFighter(state);
  const rng = rngOf(state);
  const path = reconstructPath(f.pos, action.to, check.parents);
  const from = { ...f.pos };
  const travelled = [from];
  let tackled = false;
  for (const next of path.slice(1)) {
    // Check every cell departure: a long path can encounter tackle midway.
    const tacklers = hasState(f, 6) ? [] : adjacentLivingEnemies(state, f)
      .filter(e => !hasState(e, 6));
    if (tacklers.length) {
      const agility = tacklers.reduce((sum, e) => sum + effectiveStat(e, 'agilite'), 0);
      const result = rollEscape(rng, effectiveStat(f, 'agilite'), agility, f.pa);
      if (!result.escaped) {
        f.pa = Math.max(0, f.pa - result.lostPa);
        f.pm = 0;
        events.push({ t: 'tackle', fighter: f.id, by: tacklers[0].id,
          chance: result.chance, roll: result.roll, lostPa: result.lostPa, at: { ...f.pos } });
        tackled = true;
        break;
      }
      events.push({ t: 'escape', fighter: f.id, chance: result.chance, roll: result.roll });
    }
    f.pos = { ...next };
    if (f.carrying) state.fighters[f.carrying].pos = { ...f.pos };
    f.pm -= 1;
    travelled.push({ ...next });
    if (triggerTraps(state, events, f, rng) || f.hp <= 0 || state.over) break;
  }
  if (travelled.length > 1) events.push({ t: 'move', fighter: f.id, from,
    to: { ...travelled[travelled.length - 1] }, path: travelled, cost: travelled.length - 1, pmLeft: f.pm, interrupted: tackled });
  saveRng(state, rng);
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

function triggerHazard(state, events, hazard, victim, rng) {
  const caster = state.fighters[hazard.owner];
  if (!caster || caster.hp <= 0 || victim.hp <= 0 || state.over) return;
  events.push({ t: 'hazard_trigger', id: hazard.id, kind: hazard.kind, name: hazard.name, target: victim.id, center: hazard.center });
  doCast(state, events, { ...hazard.trigger, key: `hazard_${hazard.id}`, emoji: hazard.kind === 'trap' ? '🪤' : '✦',
    flatDamage: caster.spellModifiers?.[hazard.spellId]?.damage || 0,
    flatHeal: caster.spellModifiers?.[hazard.spellId]?.heal || 0,
    element: hazard.trigger.effects.find(e => e.element)?.element },
  hazard.kind === 'trap' ? hazard.center : victim.pos, {
    caster, rng, origin: hazard.center, visualSpellId: hazard.spellId, trap: hazard.kind === 'trap',
    cells: hazard.kind === 'trap' ? hazard.cells : null, areaZone: hazard.zone,
  });
}

function triggerTraps(state, events, fighter, rng) {
  let triggered = false;
  for (const hazard of [...(state.hazards || [])]) {
    if (state.over || fighter.hp <= 0) break;
    if (hazard.kind !== 'trap' || !state.hazards.some(h => h.id === hazard.id)) continue;
    if (!hazard.cells.some(c => samePos(c, fighter.pos))) continue;
    state.hazards = state.hazards.filter(h => h.id !== hazard.id);
    triggerHazard(state, events, hazard, fighter, rng);
    triggered = true;
  }
  return triggered;
}

function doCast(state, events, spell, target, trigger = null) {
  const f = trigger?.caster || currentFighter(state);
  const rng = trigger?.rng || rngOf(state);

  if (!trigger) {
    f.pa -= spell.pa;
    f.apSpent = (f.apSpent || 0) + spell.pa;
    f.usedThisTurn[spell.key] = (f.usedThisTurn[spell.key] || 0) + 1;
    const targetFighter = fighterAt(state, target.x, target.y);
    if (targetFighter) {
      f.usedOnTarget = f.usedOnTarget || {};
      const uses = f.usedOnTarget[spell.key] || (f.usedOnTarget[spell.key] = {});
      uses[targetFighter.id] = (uses[targetFighter.id] || 0) + 1;
    }
    if (spell.cooldown > 0) f.cooldowns[spell.key] = spell.cooldown;

    // Échec critique: PA dépensés, aucun effet, peut terminer le tour.
    if (rollFailure(rng, spell.failRate ? Math.max(2, spell.failRate - statBuff(f, 'fail')) : 0)) {
      saveRng(state, rng);
      events.push({
        t: 'spell_fail', fighter: f.id, spell: spell.key, spellName: spell.name,
        endsTurn: spell.endsTurnOnFailure, paLeft: f.pa,
      });
      if (spell.endsTurnOnFailure && !state.over) endTurn(state, events);
      return;
    }
  }

  // Coup critique: 1/x amélioré par l'agilité et les bonus critiques.
  const crit = !trigger && !f.effects.some(e => e.kind === 'minRolls') && rollCritical(
    rng, spell.critRate, effectiveStat(f, 'agilite'), statBuff(f, 'crit') + (spell.critBonus || 0),
  );

  const rows = crit && spell.critEffects.length > 0 ? spell.critEffects : spell.effects;
  if (!trigger && (spell.isWeapon || rows.some(e => ['damage', 'lifeSteal', 'fixedLifeSteal', 'punitionDamage'].includes(e.kind)))) revealFighter(events, f);
  const casterPos = { ...(trigger?.origin || f.pos) };

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
    t: trigger ? 'hazard_effect' : 'cast', fighter: f.id, spell: spell.key, spellId: trigger?.visualSpellId || spell.id, grade: spell.grade,
    ...(spell.visualSpellId ? { visualSpellId: spell.visualSpellId } : {}),
    spellName: spell.name,
    itemId: spell.itemId || null, weaponAnimation: spell.isWeapon ? spell.animation : null,
    emoji: spell.emoji, element: spell.element, from: casterPos,
    target: { ...target }, crit, paCost: trigger ? 0 : spell.pa, paLeft: f.pa,
    aoe: aoe.length > 0 ? aoe : null,
  });

  if (spell.unsupportedEffects?.length) events.push({ t: 'unsupported_effects', spellId: spell.id,
    name: spell.name, effects: spell.unsupportedEffects });
  // One shared draw partitions the probability intervals (e.g. Bluff: water OR air).
  const chanceRoll = rows.some(e => e.chance > 0) ? rng.int(0, 99) : null;
  let chanceCursor = 0;
  const dodged = new Set();

  for (const effect of rows) {
    if (state.over) break;
    // Effets à probabilité (Pile ou Face, Bluff…)
    if (effect.chance > 0) {
      const selected = chanceRoll >= chanceCursor && chanceRoll < chanceCursor + effect.chance;
      chanceCursor += effect.chance;
      events.push({ t: 'effect_roll', fighter: f.id, spellId: spell.id, effectId: effect.id,
        roll: chanceRoll, chance: effect.chance, selected });
      if (!selected) continue;
    }
    const cells = trigger?.cells || spellZoneCells(effect.zone, target, casterPos);
    let targets = effectTargets(state, cells, f, effect).sort((a, b) => dist(a.pos, target) - dist(b.pos, target));
    const targetPositions = targets.map(victim => ({ ...victim.pos }));
    if (!trigger && !spell.isWeapon && ['damage', 'lifeSteal', 'fixedLifeSteal', 'punitionDamage', 'removePa', 'stealPa'].includes(effect.kind)) {
      targets = targets.map(victim => {
        if (victim.id !== f.id && victim.effects.some(e => e.kind === 'spellReflection' && e.value >= spell.grade && (e.chance >= 100 || rng.int(0, 99) < e.chance))) {
          events.push({ t: 'spell_reflected', fighter: victim.id, target: f.id, spellId: spell.id });
          return f;
        }
        return victim;
      });
    }

    switch (effect.kind) {
      case 'kill':
        for (const victim of targets) applyDamage(state, events, f.id, victim.id, victim.hp, spell.name, { erosion: false });
        break;
      case 'outOfCombat':
      case 'cosmetic':
        events.push({ t: 'non_combat_effect', fighter: f.id, spellId: spell.id, effectId: effect.id, name: spell.name });
        break;
      case 'weaponMastery':
      case 'damageReflection':
      case 'spellReflection':
      case 'ecaflipLuck':
      case 'dodgeMelee':
      case 'skipTurn':
      case 'invisibility':
      case 'sacrifice':
      case 'minRolls':
      case 'maxRolls':
      case 'apPoison':
      case 'damageOnHit':
      case 'delayedSpell': {
        for (const patient of targets) {
          const turns = Math.max(1, effect.duration || effect.p3 || 1);
          const entry = { kind: effect.kind, spellId: spell.id, source: f.id, name: spell.name,
            turnsLeft: turns + (patient.id === f.id ? 1 : 0),
            value: effect.kind === 'spellReflection' ? effect.p2 : effect.kind === 'weaponMastery' ? effect.p2 : Math.max(0, effect.p1 || 0) };
          if (effect.kind === 'weaponMastery') entry.weaponType = effect.p1;
          if (effect.kind === 'dodgeMelee') entry.cells = Math.max(1, effect.p2 || 1);
          if (effect.kind === 'invisibility') patient.lastVisiblePos = { ...patient.pos };
          if (effect.kind === 'spellReflection') entry.chance = effect.p3 > 0 ? effect.p3 : 100;
          if (effect.kind === 'ecaflipLuck') Object.assign(entry, { chance: 100 - effect.p3, damageFactor: effect.p1, healFactor: effect.p2 });
          if (effect.kind === 'apPoison') Object.assign(entry, { step: effect.p1,
            value: Math.floor(Math.max(0, effect.p2) * (100 + effectiveStat(f, 'intelligence')) / 100) });
          if (effect.kind === 'delayedSpell') Object.assign(entry, { trigger: effect.trigger, delay: Math.max(1, effect.p3) });
          if (effect.kind !== 'damageOnHit') patient.effects = patient.effects.filter(e => !(e.kind === entry.kind && e.spellId === spell.id && e.source === f.id));
          patient.effects.push(entry);
          events.push({ t: 'effect_add', fighter: patient.id, kind: entry.kind, value: entry.value, turns, name: spell.name });
        }
        break;
      }
      case 'resistAllBuff':
        for (const patient of targets) for (const element of ['terre', 'feu', 'eau', 'air', 'neutre']) {
          addBuff(events, patient, f, spell, effect, `res_${element}`, rollEffectValue(rng, effect, f, patient));
        }
        break;
      case 'reveal':
        for (const patient of targets) revealFighter(events, patient);
        for (const hazard of state.hazards || []) if (cells.some(c => samePos(c, hazard.center))) {
          hazard.revealedTo = [...new Set([...(hazard.revealedTo || []), f.team])];
        }
        break;
      case 'carry': {
        const patient = targets.find(v => v.id !== f.id);
        if (!patient) break;
        patient.carriedBy = f.id; f.carrying = patient.id; patient.pos = { ...f.pos };
        f.effects.push({ kind: 'state', stateId: 3, turnsLeft: 9999, name: spell.name });
        patient.effects.push({ kind: 'state', stateId: 8, turnsLeft: 9999, name: spell.name });
        events.push({ t: 'carry', fighter: f.id, target: patient.id });
        break;
      }
      case 'throw': {
        const patient = state.fighters[f.carrying];
        if (!patient) break;
        const from = { ...patient.pos }; patient.pos = { ...target };
        patient.carriedBy = null; f.carrying = null;
        f.effects = f.effects.filter(e => !(e.kind === 'state' && e.stateId === 3));
        patient.effects = patient.effects.filter(e => !(e.kind === 'state' && e.stateId === 8));
        events.push({ t: 'teleport', fighter: patient.id, from, to: { ...target }, spell: spell.key });
        triggerTraps(state, events, patient, rng);
        break;
      }
      case 'fear': {
        const direction = { x: Math.sign(target.x - f.pos.x), y: Math.sign(target.y - f.pos.y) };
        const patient = fighterAt(state, f.pos.x + direction.x, f.pos.y + direction.y);
        if (patient && !hasState(patient, 6)) applyPush(state, events, rng, f.pos, patient.id,
          Math.max(0, dist(f.pos, target) - 1), spell.name, { collision: false });
        break;
      }
      case 'rollback': {
        const movable = fighterList(state).filter(v => v.hp > 0 && v.startPos && !v.carriedBy && !hasState(v, 6));
        const movingIds = new Set(movable.map(v => v.id));
        let changed;
        do {
          changed = false;
          for (const patient of movable) {
            const blocker = fighterAt(state, patient.startPos.x, patient.startPos.y);
            if (movingIds.has(patient.id) && blocker && !movingIds.has(blocker.id)) { movingIds.delete(patient.id); changed = true; }
          }
        } while (changed);
        for (const patient of movable.filter(v => movingIds.has(v.id))) {
          const from = { ...patient.pos }; patient.pos = { ...patient.startPos };
          if (patient.carrying) state.fighters[patient.carrying].pos = { ...patient.pos };
          events.push({ t: 'teleport', fighter: patient.id, from, to: { ...patient.pos }, spell: spell.key });
        }
        for (const patient of movable) triggerTraps(state, events, patient, rng);
        break;
      }
      case 'lifeTransfer': {
        const amount = Math.floor(f.hp * rollEffectValue(rng, effect, f, f) / 100);
        applyDamage(state, events, f.id, f.id, amount, spell.name, { erosion: false });
        for (const patient of targets) if (patient.id !== f.id && patient.team === f.team) applyHeal(state, events, patient.id, amount, spell.name);
        break;
      }
      case 'revive': {
        const patient = fighterList(state).filter(v => v.team === f.team && v.hp <= 0 && v.deathOrder)
          .sort((a, b) => b.deathOrder - a.deathOrder)[0];
        if (!patient) break;
        patient.hp = Math.max(1, Math.floor(patient.maxHp * effect.p1 / 100));
        delete patient.deathOrder;
        patient.pos = { ...target }; patient.effects = []; patient.revivedBy = f.id;
        if (!state.order.includes(patient.id)) state.order.splice(state.currentIndex + 1, 0, patient.id);
        events.push({ t: 'summon_add', fighter: f.id, id: patient.id, name: patient.name, emoji: patient.emoji, pos: patient.pos, hp: patient.hp });
        break;
      }
      case 'trap':
      case 'glyph': {
        if (!effect.trigger) break;
        const hazard = { id: `H${++state.hazardCount}`, kind: effect.kind,
          owner: f.id, team: f.team, spellId: spell.id, name: spell.name,
          center: { ...target }, zone: effect.zone, cells, trigger: effect.trigger, turnsLeft: effect.duration || null };
        state.hazards = [...(state.hazards || []), hazard];
        events.push({ t: 'hazard_add', id: hazard.id, kind: hazard.kind, fighter: f.id,
          name: spell.name, center: hazard.center, turns: hazard.turnsLeft });
        break;
      }
      case 'damage':
      case 'lifeSteal':
      case 'punitionDamage':
      case 'fixedLifeSteal': {
        for (const [index, originalVictim] of targets.entries()) {
          let victim = originalVictim;
          const isPunition = effect.kind === 'punitionDamage';
          const element = isPunition ? 'neutre' : effect.element;
          const areaPercent = effect.kind === 'fixedLifeSteal' ? 100
            : areaDamagePercent(trigger?.areaZone || effect.zone, trigger?.origin || target, targetPositions[index], spell.isWeapon);
          victim = damageRecipient(state, events, rng, f, victim, spell, trigger, dodged);
          if (!victim || victim.hp <= 0 || state.over) continue;
          const jet = rollEffectValue(rng, effect, f, victim);
          const boost = f.effects.filter(e => e.kind === 'spellBoost' && e.boostSpell === spell.id)
            .reduce((sum, e) => sum + e.value, 0);
          // Punition peaks at half life and ignores characteristic/+damage
          // bonuses, but still follows the same defensive reactions as a hit.
          const lifeCurve = ((Math.cos(2 * Math.PI * (f.hp / Math.max(1, f.maxHp) - 0.5)) + 1) ** 2) / 4;
          const raw = isPunition ? Math.floor(lifeCurve * (effect.p1 || 0) / 100 * f.maxHp)
            : effect.kind === 'fixedLifeSteal' ? jet : damageAmount(jet + boost, element, f,
              { trap: trigger?.trap, flatDamage: spell.flatDamage, weaponType: spell.weaponType });
          const afterArea = Math.floor(raw * areaPercent / 100);
          const afterRes = effect.kind === 'fixedLifeSteal' ? raw : applyResistances(afterArea, element, victim, f);
          // Armure (Féca…): réduction plate des dégâts subis.
          const armor = effect.kind === 'fixedLifeSteal' ? 0 : armorReduction(victim, element, state.fighters);
          const afterArmor = Math.max(0, afterRes - armor);
          const reflection = victim.id !== f.id ? Math.min(afterArmor, Math.max(0, statBuff(victim, 'reflect'))) : 0;
          // Equipment reflection does not prevent incoming damage (Ankama 1.17,
          // Prespic). It is fixed, unlike wisdom-scaled reflection SPELLS.
          const spellReflection = victim.id !== f.id && !trigger ? Math.min(afterArmor, victim.effects
            .filter(e => e.kind === 'damageReflection').reduce((sum, e) => sum + Math.floor(e.value * (100 + effectiveStat(victim, 'sagesse')) / 100), 0)) : 0;
          let finalDmg = Math.max(0, afterArmor - spellReflection);
          const luck = victim.effects.find(e => e.kind === 'ecaflipLuck');
          if (luck && rng.int(0, 99) < luck.chance) {
            applyHeal(state, events, victim.id, finalDmg * luck.healFactor, `${spell.name} (Chance d’Ecaflip)`);
            continue;
          }
          if (luck) finalDmg *= luck.damageFactor;
          const dealt = applyDamage(
            state, events, f.id, victim.id, finalDmg,
            spell.name + (crit ? ' (critique !)' : ''),
            { element, direct: !trigger, calculation: { jet, boost, raw, areaPercent, afterArea, afterRes, armor, reflection,
              flatDamage: isPunition || effect.kind === 'fixedLifeSteal' ? 0 : statBuff(f, 'damage') + (spell.flatDamage || 0) } },
          );
          if (spellReflection > 0 && f.hp > 0) applyDamage(state, events, victim.id, f.id,
            Math.max(0, applyResistances(spellReflection, element, f, victim) - armorReduction(f, element, state.fighters)), 'Renvoi de sort de protection');
          if (reflection > 0 && f.hp > 0) applyDamage(state, events, victim.id, f.id, reflection, 'Renvoi de dommages');
          if (victim.monsterId === 2750 && dealt > 0 && f.hp > 0) applyHeal(state, events, f.id, dealt, 'Arbre de vie');
          if (['lifeSteal', 'fixedLifeSteal'].includes(effect.kind) && dealt > 0 && f.hp > 0) {
            // Vol de vie: rend la moitié des dégâts, sans boost d'intelligence.
            applyHeal(state, events, f.id, Math.floor(dealt / 2), `${spell.name} (vol de vie)`);
          }
          if (state.over) break;
        }
        break;
      }
      case 'fixedHeal':
      case 'heal': {
        for (const patient of targets) {
          const jet = rollEffectValue(rng, effect, f, patient);
          const value = effect.kind === 'fixedHeal' ? jet : healAmount(jet, f) + (spell.flatHeal || 0);
          if (effect.duration > 0) {
            patient.effects.push({ kind: 'regeneration', source: f.id, name: spell.name, value,
              turnsLeft: effect.duration + (patient.id === f.id ? 1 : 0) });
            events.push({ t: 'effect_add', fighter: patient.id, kind: 'regeneration', value, turns: effect.duration, name: spell.name });
          } else applyHeal(state, events, patient.id, value, spell.name);
        }
        break;
      }
      case 'push': {
        const center = [151, 418, 1688].includes(spell.id) ? target : casterPos;
        // Furthest first prevents nearer fighters blocking an outward area push.
        for (const victim of [...targets].sort((a, b) => dist(b.pos, center) - dist(a.pos, center))) {
          if (victim.id === f.id && ![151, 418, 1688].includes(spell.id)) continue;
          applyPush(state, events, rng, center, victim.id, effect.p1 || 1, spell.name, { throughFighters: spell.id === 418 });
          if (state.over) break;
        }
        break;
      }
      case 'pull': {
        for (const victim of targets) {
          if (victim.id === f.id || hasState(victim, 6) || victim.carriedBy) continue;
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
          if (victim.carrying) state.fighters[victim.carrying].pos = { ...cur };
          events.push({ t: 'pull', target: victim.id, from, to: { ...cur } });
          triggerTraps(state, events, victim, rng);
        }
        break;
      }
      case 'teleport': {
        const from = { ...f.pos };
        f.pos = { ...target };
        if (f.carrying) state.fighters[f.carrying].pos = { ...f.pos };
        events.push({ t: 'teleport', fighter: f.id, from, to: { ...target }, spell: spell.key });
        triggerTraps(state, events, f, rng);
        break;
      }
      case 'buffPa':
      case 'buffPm':
      case 'buffPower':
      case 'buffDamage':
      case 'buffCrit':
      case 'buffStat': {
        const value = rollEffectValue(rng, effect, f, targets[0]);
        const stat = effect.kind === 'buffPa' ? 'pa'
          : effect.kind === 'buffPm' ? 'pm'
          : effect.kind === 'buffPower' ? 'power'
          : effect.kind === 'buffDamage' ? 'damage'
          : effect.kind === 'buffCrit' ? 'crit'
          : effect.stat;
        for (const patient of targets) addBuff(events, patient, f, spell, effect, stat, value);
        break;
      }
      case 'refundPa': {
        const value = rng.int(effect.min, effect.max);
        if (effect.duration > 0) addBuff(events, f, f, spell, effect, 'pa', value);
        else {
          f.pa += value;
          events.push({ t: 'pa_refund', fighter: f.id, value, name: spell.name });
        }
        break;
      }
      case 'armor': {
        const value = rollEffectValue(rng, effect, f, targets[0]);
        const turns = effect.duration > 0 ? effect.duration : DEFAULT_BUFF_TURNS;
        for (const patient of targets) {
          patient.effects.push({ kind: 'armor', source: f.id, spellId: spell.id, value, turnsLeft: Math.max(1, turns + (patient.id === f.id ? 1 : 0)), name: spell.name });
          events.push({ t: 'effect_add', fighter: patient.id, kind: 'armor', value, turns, name: spell.name });
        }
        break;
      }
      case 'staticSummon':
      case 'double':
      case 'summon': {
        const monster = (f.isMonster || spell.monsterSummons) && effect.kind !== 'double' ? getMonster(effect.p1, effect.p2) : null;
        const tpl = effect.kind === 'double' ? { ...f, monsterId: null, name: 'Double', emoji: '👤', hp: f.maxHp, pa: 0, pm: f.basePm }
          : monster ? { ...monster, hp: monster.baseHp, pa: Math.max(0, monster.basePa), pm: Math.max(0, monster.basePm) }
            : getSummon(effect.p1, effect.p2);
        if (!tpl) break;
        // Invocation 1.29: stats et PV multipliés par (1 + niveau de l'invocateur / 100).
        const coef = effect.kind === 'double' || f.isMonster || spell.monsterSummons ? 1 : 1 + f.level / 100;
        const id = `${f.id}s${(f.summonCount = (f.summonCount || 0) + 1)}`;
        const summon = {
          id,
          team: f.team,
          leader: false,
          isSummon: true,
          ...(monster ? { isMonster: true, monsterGrade: monster.grade, maxSummons: monster.maxSummons,
            permanent: { dodgePa: monster.dodgePa, dodgePm: monster.dodgePm } } : {}),
          isDouble: effect.kind === 'double', staticSummon: effect.kind === 'staticSummon', summonGrade: effect.p2,
          ownerId: f.id,
          monsterId: tpl.monsterId,
          name: tpl.name,
          emoji: tpl.emoji,
          classId: f.classId,
          level: monster ? monster.level : f.level,
          pos: { ...target },
          startPos: { ...target },
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
          resistances: { ...tpl.resistances },
          resistancesFixed: { neutre: 0, terre: 0, feu: 0, eau: 0, air: 0 },
          effects: [],
          cooldowns: {},
          usedThisTurn: {},
          usedOnTarget: {},
          initiative: 0,
        };
        state.fighters[id] = summon;
        // L'invocation joue juste APRÈS son invocateur.
        const idx = state.order.indexOf(f.id);
        if (!summon.staticSummon) state.order.splice(idx + 1, 0, id);
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
        for (const patient of targets) {
        patient.effects = patient.effects.filter((x) => !(x.kind === 'punishment' && x.name === spell.name));
        patient.effects.push({
          kind: 'punishment', statEffectId: effect.p1, maxPerTurn: effect.p2 || 999,
          gained: 0, bonusDuration: effect.p3 > 0 ? effect.p3 : 5, turnsLeft: turns + (patient.id === f.id ? 1 : 0), name: spell.name,
          source: f.id, spellId: spell.id,
        });
        events.push({
          t: 'effect_add', fighter: patient.id, kind: 'punishment',
          stat: PUNISHMENT_STATS[effect.p1] || 'PV', value: effect.p2 || 0, turns, name: spell.name,
        });
        }
        break;
      }
      case 'erosion': {
        // Permanent damage percentage, added to the natural 10%.
        const value = effect.p1 || effect.min || 0;
        for (const patient of targets) addBuff(events, patient, f, spell, effect, 'erosion', value);
        break;
      }
      case 'swapAlly': {
        // Échange de positions avec un allié (invocation comprise).
        const ally = targets.find((v) => v.id !== f.id && v.team === f.team);
        if (!ally) break;
        const posA = { ...f.pos };
        f.pos = { ...ally.pos };
        ally.pos = posA;
        events.push({
          t: 'swap', a: f.id, b: ally.id,
          aTo: { ...f.pos }, bTo: { ...ally.pos }, name: spell.name,
        });
        triggerTraps(state, events, f, rng);
        triggerTraps(state, events, ally, rng);
        break;
      }
      case 'swap': {
        // Transposition, Coopération, Détour: échange de positions.
        const victim = targets.find((v) => v.id !== f.id);
        if (!victim) break;
        const was = { ...f.pos };
        f.pos = { ...victim.pos };
        victim.pos = was;
        events.push({
          t: 'swap', a: f.id, b: victim.id,
          aTo: { ...f.pos }, bTo: { ...victim.pos }, name: spell.name,
        });
        triggerTraps(state, events, f, rng);
        triggerTraps(state, events, victim, rng);
        break;
      }
      case 'dispel': {
        // Désenvoûtement: retire TOUS les effets (buffs comme malus).
        for (const victim of targets) {
          if (victim.effects.length === 0) continue;
          const available = { pa: Math.max(0, victim.basePa + statBuff(victim, 'pa')),
            pm: Math.max(0, victim.basePm + statBuff(victim, 'pm')) };
          const dispellable = victim.effects.filter(e => e.kind !== 'state');
          for (const ef of dispellable) onEffectRemoved(victim, ef);
          const removed = dispellable.length;
          victim.effects = victim.effects.filter(e => e.kind === 'state');
          for (const stat of ['pa', 'pm']) {
            const capacity = Math.max(0, (stat === 'pa' ? victim.basePa : victim.basePm) + statBuff(victim, stat));
            victim[stat] = Math.max(0, victim[stat] + capacity - available[stat]);
          }
          events.push({ t: 'dispel', fighter: f.id, target: victim.id, removed, name: spell.name });
        }
        break;
      }
      case 'buffVitality':
      case 'buffRange':
      case 'debuffRange':
      case 'resistBuff':
      case 'resistDebuff':
      case 'debuffStat':
      case 'stealStat': {
        const value = rollEffectValue(rng, effect, f, targets[0]);
        const stat = effect.kind === 'buffVitality' ? 'vitalite'
          : ['buffRange', 'debuffRange'].includes(effect.kind) ? 'range'
          : ['resistBuff', 'resistDebuff'].includes(effect.kind) ? `res_${effect.element}` : effect.stat;
        const negative = ['debuffRange', 'resistDebuff', 'debuffStat', 'stealStat'].includes(effect.kind);
        for (const patient of targets) {
          addBuff(events, patient, f, spell, effect, stat, negative ? -value : value);
          if (effect.kind === 'stealStat') addBuff(events, f, f, spell, effect, stat, value);
        }
        break;
      }
      case 'state':
      case 'removeState': {
        for (const patient of targets) {
          patient.effects = patient.effects.filter(e => !(e.kind === 'state' && e.stateId === effect.p3));
          if (effect.kind === 'state') patient.effects.push({ kind: 'state', stateId: effect.p3,
            turnsLeft: effect.duration > 0 ? effect.duration + (patient.id === f.id ? 1 : 0) : 9999, name: spell.name, source: f.id });
          events.push({ t: 'state_change', fighter: patient.id, stateId: effect.p3,
            active: effect.kind === 'state', name: spell.name });
        }
        break;
      }
      case 'spellBoost': {
        f.effects = f.effects.filter(e => !(e.kind === 'spellBoost' && e.boostSpell === effect.p1));
        f.effects.push({ kind: 'spellBoost', boostSpell: effect.p1, value: effect.p3 || 0,
          turnsLeft: (effect.duration || 1) + 1, name: spell.name });
        break;
      }
      case 'selfDamage':
      case 'selfPercentDamage':
      case 'percentLifeDamage': {
        const victims = ['selfDamage', 'selfPercentDamage'].includes(effect.kind) ? [f] : targets;
        for (const victim of victims) {
          const jet = rollEffectValue(rng, effect, f, victim);
          const raw = effect.kind === 'selfDamage' ? jet : Math.floor(f.hp * jet / 100);
          if (effect.duration > 0) {
            victim.effects.push({ kind: 'poison', value: raw, turnsLeft: effect.duration,
              name: spell.name, source: f.id, element: null });
          } else applyDamage(state, events, f.id, victim.id, raw, spell.name, { erosion: false });
        }
        break;
      }
      case 'stealPa':
      case 'stealPm': {
        const isPa = effect.kind === 'stealPa';
        for (const victim of targets) {
          if (victim.id === f.id) continue;
          const stat = isPa ? 'pa' : 'pm';
          const max = isPa ? victim.basePa : victim.basePm;
          const current = victim.id === currentFighter(state).id ? victim[stat] : Math.max(0, max + statBuff(victim, stat));
          const { attack, defense } = pointRemovalScores(f, victim, stat);
          const { removed, dodged } = rollPointRemoval(
            rng, attack, defense,
            current, max, rollEffectValue(rng, effect, f, victim),
          );
          if (removed > 0) {
            if (isPa) { victim.pa = Math.max(0, victim.pa - removed); f.pa += removed; }
            else { victim.pm = Math.max(0, victim.pm - removed); f.pm += removed; }
            victim.effects.push({
              kind: 'buff', stat, value: -removed, turnsLeft: effect.duration || 1, name: spell.name,
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
      case 'removePm':
      case 'debuffPa':
      case 'debuffPm': {
        const isPa = effect.kind.endsWith('Pa');
        for (const victim of targets) {
          const stat = isPa ? 'pa' : 'pm';
          const { attack, defense } = pointRemovalScores(f, victim, stat);
          const max = isPa ? victim.basePa : victim.basePm;
          const current = victim.id === currentFighter(state).id ? victim[stat] : Math.max(0, max + statBuff(victim, stat));
          const points = rollEffectValue(rng, effect, f, victim);
          const nonDodgeable = effect.kind.startsWith('debuff');
          const { removed, dodged } = nonDodgeable
            ? { removed: Math.min(points, current), dodged: 0 } : rollPointRemoval(
            rng, attack, defense, current, max, points,
          );
          const penalty = nonDodgeable ? points : removed;
          if (penalty > 0) {
            if (isPa) victim.pa = Math.max(0, victim.pa - removed);
            else victim.pm = Math.max(0, victim.pm - removed);
            // Le retrait pèse aussi sur le prochain tour de la victime.
            if (effect.duration > 0 || victim.id !== currentFighter(state).id) {
              victim.effects.push({
                kind: 'buff', stat: isPa ? 'pa' : 'pm', value: -penalty,
                turnsLeft: Math.max(1, (effect.duration || 0) + (victim.id === currentFighter(state).id ? 1 : 0)), name: spell.name,
                source: f.id, spellId: spell.id, effectId: effect.id,
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
        // victime à chaque tic (début de son tour). Chaque lancer garde sa durée.
        for (const victim of targets) {
          const jet = rollEffectValue(rng, effect, f, victim);
          const value = Math.max(1, damageAmount(jet, effect.element, f, { trap: trigger?.trap, flatDamage: spell.flatDamage }));
          const turns = effect.duration || 3;
          victim.effects.push({
            kind: 'poison', source: f.id, value, element: effect.element || null, turnsLeft: turns + (victim.id === f.id ? 1 : 0), name: spell.name,
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
  const isMyTurn = state.phase !== 'placement' && currentFighter(state).id === fighterId;

  const viewFighter = (f) => ({
    id: f.id,
    team: f.team,
    leader: f.leader,
    isSummon: !!f.isSummon,
    isMonster: !!f.isMonster, monsterGrade: f.monsterGrade,
    ...(f.customMonster ? { customMonster: clone(f.customMonster) } : {}),
    isDouble: !!f.isDouble, staticSummon: !!f.staticSummon, summonGrade: f.summonGrade,
    carriedBy: f.carriedBy || null, carrying: f.carrying || null,
    hidden: f.team !== me.team && isInvisible(f),
    monsterId: f.monsterId || null,
    ownerId: f.ownerId || null,
    name: f.name,
    classId: f.classId,
    className: f.isMonster ? f.customMonster?.name || getMonster(f.monsterId, f.monsterGrade)?.name : CLASSES[f.classId]?.name || f.name,
    level: f.level,
    pos: { ...(isInvisible(f) && f.team !== me.team ? f.lastVisiblePos || f.startPos || f.pos : f.pos) },
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
    permanent: clone(f.permanent || {}), spellModifiers: clone(f.spellModifiers || {}),
    weaponSpell: clone(f.weaponSpell || null), maxSummons: f.maxSummons,
    loadout: clone(f.loadout || null),
    initiative: f.initiative,
    effects: clone(f.effects),
    usedOnTarget: clone(f.usedOnTarget || {}),
    spells: Object.values(spellsOf(f)).map((s) => ({
      key: s.key,
      id: s.id,
      grade: s.grade,
      ...(s.visualSpellId ? { visualSpellId: s.visualSpellId, description: s.description } : {}),
      ...(s.iconArtworkId ? { iconArtworkId: s.iconArtworkId, iconFile: s.iconFile } : {}),
      unsupportedEffects: s.unsupportedEffects || [],
      usesPerTarget: s.usesPerTarget || 0,
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
      requiredStates: [...(s.requiredStates || [])], forbiddenStates: [...(s.forbiddenStates || [])],
      lineOnly: s.lineOnly,
      needsLos: s.needsLos,
      critRate: s.critRate,
      critBonus: s.critBonus || 0, flatDamage: s.flatDamage || 0, flatHeal: s.flatHeal || 0,
      itemId: s.itemId || null, isWeapon: !!s.isWeapon, weaponType: s.weaponType || null,
      failRate: s.failRate ? Math.max(2, s.failRate - statBuff(f, 'fail')) : 0,
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
    phase: state.phase,
    turn: state.turn,
    maxTurns: state.maxTurns,
    isMyTurn,
    you: viewFighter(me),
    enemy: viewFighter(enemy),
    enemies: (me.monsterId === 262 ? fighterList(state).filter(f => f.id !== me.id && f.hp > 0) : enemiesOf(state, fighterId)).map(viewFighter),
    allies: me.monsterId === 262 ? [] : alliesOf(state, fighterId).map(viewFighter),
    hazards: clone((state.hazards || []).filter(h => h.kind === 'glyph' || h.team === me.team || h.revealedTo?.includes(me.team))),
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
  const agiEnemies = tacklers.reduce((s, e) => s + effectiveStat(e, 'agilite'), 0);
  return {
    inContact: true,
    chance: escapeChance(effectiveStat(f, 'agilite'), agiEnemies),
  };
}

export { SUMMONS };
