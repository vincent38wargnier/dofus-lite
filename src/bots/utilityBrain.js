// Shared utility policy for players, monsters and custom spellbooks. Every
// actual action is validated by the engine, then re-planned from the new view.
// Scores cover useful damage, owner/dependent threat, friendly fire, support,
// mitigation and reachable enemy bursts. A bounded within-turn search compares
// PA combinations and immediate boosts, including attacks from empty AoE aims.
// Movement first screens all reachable cells, then evaluates six firing cells
// exactly. No wall-clock cutoff, hidden positions, or combat RNG are consulted.
// See docs/ai-2026-10-10.md for measurements and deliberate approximations.

import TUNED from './cortexWeights.json';
import { key, dist, spellZoneCells, hasLineOfSight } from '../engine/geometry';
import { bfs } from '../engine/pathfinding';
import { critDivisor, pointRemovalScores, pointRemovalChance, statBuffTotal, healAmount } from '../engine/formulas';
import { effectAcceptsTarget } from '../engine/engine';
import { DAMAGE_KINDS, expectedHit, spellDamage, castsRemaining, bestBudget, areaAimCells, casterAfterSpell } from './tactics';

export const DEFAULT_WEIGHTS = {
  // valeur des effets
  damage: 1.0,
  lifeSteal: 1.15,
  kill: 2.6,          // bonus quand le coup (ou l'enchaînement) peut achever
  heal: 0.9,
  healThreshold: 0.85,
  removePa: 0.6,
  removePm: 0.4,
  push: 0.4,
  pull: 0.25,
  summon: 1.5,
  buff: 0.4,
  armor: 0.45,
  // ciblage
  focusWeak: 0.6,     // préférer l'ennemi le plus entamé (à la Ancestra)
  leader: 0.3,        // priorité au chef ennemi…
  antiSummon: 0.15,   // legacy profile key; owner/threat valuation takes precedence
  paEfficiency: 0.35, // façonnage valeur-par-PA (Nao divise par le coût)
  // position
  threat: 0.9,        // éviter les cases où l'ennemi peut punir
  rangeBand: 0.6,     // rester à la distance idéale du kit
  aggression: 0.45,   // pression vers l'avant (réduite en repli)
  losHide: 0.3,       // casser la ligne de vue quand on ne peut plus lancer
  retreatHp: 0.4,     // sous ce ratio de PV, la prudence double
  // pilotage
  lookahead: 0.9,     // escompte du sort débloqué par un déplacement
  endTurn: 0.05,
};

const DMG_REF = 100; // un « bon coup » de référence au niveau 100
const avg = (e) => ((e.min || 0) + (e.max || 0)) / 2;

function statOf(f, name) {
  const buff = statBuffTotal(f, name);
  return ((f.stats && f.stats[name]) || 0) + buff;
}

function hasBuffNamed(f, name) {
  return (f.effects || []).some((x) => ['buff', 'armor'].includes(x.kind) && x.name === name && x.turnsLeft > 1);
}

// Dégâts espérés d'une ligne d'effet, fidèle aux formules du moteur:
// jet moyen × (100 + carac + puissance)/100 + dommages fixes, puis
// résistances % et fixes de la victime, puis armure.
function expectedDamage(effect, caster, victim, fighters, spell = {}) {
  const hit = expectedHit(effect, caster, victim, fighters, spell);
  return Math.max(0, hit.damage - hit.healing - hit.recoil);
}

// Profil d'un kit: distance idéale (portée max du meilleur sort de dégâts)
// et portée maximale d'attaque — sert au band de distance ET à la menace.
function kitInfo(f, target = null) {
  let ideal = 1;
  let best = 0;
  let maxReach = 1;
  for (const s of f.spells || []) {
    if (s.pa > f.basePa) continue;
    for (const e of s.effects || []) {
      if (target && !effectAcceptsTarget(e, f, target)) continue;
      if (DAMAGE_KINDS.has(e.kind) || e.kind === 'poison') {
        maxReach = Math.max(maxReach, s.range[1]);
        const d = (target ? expectedDamage(e, f, target, {}, s) : avg(e)) / Math.max(1, s.pa)
          * (e.kind === 'poison' ? 1.5 : 1);
        if (d > best) { best = d; ideal = Math.max(1, s.range[1]); }
      }
    }
  }
  // A support summon with only ranged withdrawals still has a ranged kit.
  if (best === 0) for (const s of f.spells || []) if (s.effects.some(e => ['removePa', 'removePm', 'debuffRange', 'apPoison'].includes(e.kind))) {
    ideal = Math.max(ideal, s.range[1]); maxReach = Math.max(maxReach, s.range[1]);
  }
  return { ideal, maxReach };
}

// Une décision: le meilleur (sort | déplacement | fin de tour) pour l'état vu.
export function utilityDecide(view, api, weights) {
  const W = { ...DEFAULT_WEIGHTS, ...(TUNED || {}), ...(weights || {}) };
  const you = view.you;
  const board = view.board;
  const enemies = (view.enemies || []).filter((e) => e.hp > 0);
  const allies = (view.allies || []).filter((a) => a.hp > 0);
  if (enemies.length === 0) return api.endTurn();
  let leader = enemies.find((e) => !e.isSummon) || enemies[0];

  // ---- terrain -------------------------------------------------------
  const obstacles = new Map();
  for (const o of board.obstacles) obstacles.set(key(o.x, o.y), o);
  const occupied = new Map();
  const fighters = Object.fromEntries([you, ...allies, ...enemies].map(f => [f.id, f]));
  for (const f of [you, ...allies, ...enemies]) if (!f.hidden && !f.carriedBy) occupied.set(key(f.pos.x, f.pos.y), f);

  const losBlocked = (x, y) => {
    const o = obstacles.get(key(x, y));
    if (o && o.blocksLos) return true;
    const f = occupied.get(key(x, y));
    return !!(f && f.id !== you.id); // mon futur corps est à `from`, jamais entre
  };
  const losFrom = (from, to) => hasLineOfSight(from, to, losBlocked);
  const moveBlocked = (x, y) => {
    const o = obstacles.get(key(x, y));
    if (o && o.blocksMove) return true;
    return occupied.has(key(x, y));
  };

  // Movement uses pathfinding; an attack uses range, alignment and LoS.
  // Flood-filling PM+range wrongly treats projectiles as walking actors and
  // excludes our occupied cell, making the CURRENT position look risk-free.
  const threats = enemies.map((e) => {
    const k = kitInfo(e, you);
    const pm = Math.min(15, Math.max(0, e.basePm + statBuffTotal(e, 'pm')));
    const pa = Math.max(0, e.basePa + statBuffTotal(e, 'pa'));
    const blocked = (x, y) => !(x === you.pos.x && y === you.pos.y) && moveBlocked(x, y);
    const { costs } = bfs(e.pos, pm, board.width, board.height, blocked);
    const origins = [...costs].sort((a, b) => a[1] - b[1]).map(([p]) => {
      const [x, y] = p.split(',').map(Number); return { x, y };
    });
    const attacks = e.spells.filter(s => s.pa <= pa && (s.cooldownLeft || 0) <= 1)
      .map(s => ({ spell: s, pa: s.pa, uses: Math.min(s.usesPerTurn || 99, s.usesPerTarget || 99, s.cooldown > 0 ? 1 : 99),
        value: spellDamage(s, e, you, fighters) })).filter(a => a.value > 0);
    const power = bestBudget(attacks, pa);
    const support = e.spells.reduce((n, s) => n + (s.effects.some(row => ['summon', 'heal', 'buffPa', 'buffDamage', 'removePa', 'removePm'].includes(row.kind)) ? 12 : 0), 0);
    return { e, kit: k, reach: pm + k.maxReach, origins, attacks, pa, power: power + support };
  });
  const powerOf = v => threats.find(t => t.e.id === v.id)?.power || 0;
  const dependents = v => {
    const ids = new Set([v.id]); let changed;
    do { changed = false; for (const enemy of enemies) if (!ids.has(enemy.id) && ids.has(enemy.ownerId)) { ids.add(enemy.id); changed = true; } } while (changed);
    return enemies.filter(e => e.id !== v.id && ids.has(e.id));
  };
  const groupPower = v => powerOf(v) + dependents(v).reduce((n, e) => n + powerOf(e), 0);
  const roots = enemies.filter(e => !e.isSummon || !fighters[e.ownerId] || fighters[e.ownerId].hp <= 0);
  leader = [...(roots.length ? roots : enemies)].sort((a, b) =>
    (groupPower(b) + 30) / Math.sqrt(Math.max(30, b.hp)) / (1 + dist(you.pos, b.pos) * .05)
    - (groupPower(a) + 30) / Math.sqrt(Math.max(30, a.hp)) / (1 + dist(you.pos, a.pos) * .05))[0];
  const myKit = kitInfo(you, leader);
  const maxPower = Math.max(40, ...roots.map(groupPower));
  const goalCosts = bfs(leader.pos, board.width * board.height, board.width, board.height,
    (x, y) => !(x === you.pos.x && y === you.pos.y) && moveBlocked(x, y)).costs;
  const dangerCache = new Map();
  const incomingAt = c => {
    const cacheKey = key(c.x, c.y);
    if (dangerCache.has(cacheKey)) return dangerCache.get(cacheKey);
    let danger = 0;
    for (const t of threats) {
      if (t.e.hidden || t.e.effects?.some(e => e.kind === 'skipTurn')) continue;
      const options = t.attacks.filter(({ spell: s }) => t.origins.some(from => {
        if (from.x === c.x && from.y === c.y) return false;
        const d = dist(from, c);
        if (d < s.range[0] || d > s.range[1]) return false;
        if (s.lineOnly && from.x !== c.x && from.y !== c.y) return false;
        return !s.needsLos || hasLineOfSight(from, c, (x, y) => {
          const f = occupied.get(key(x, y));
          return !!obstacles.get(key(x, y))?.blocksLos || !!(f && f.id !== you.id && f.id !== t.e.id);
        });
      }));
      danger += bestBudget(options, t.pa);
    }
    dangerCache.set(cacheKey, danger); return danger;
  };

  const hpRatio = you.hp / Math.max(1, you.maxHp);
  const blocker = you.isSummon && you.spells.length === 0;
  // A disposable blocker or sacrificial attacker must be willing to do its
  // job. Its life is not worth the same as its summoner's entire army.
  const riskValue = blocker ? .08 : you.isSummon ? .25 : 1;
  const retreating = hpRatio < W.retreatHp;
  // Plus un seul sort payable: les PM qui restent servent à se replacer.
  const cheapestPa = Math.min(...you.spells.map((s) => s.pa), 99);
  const outOfPa = you.pa < cheapestPa;

  const positionScore = (c) => {
    const danger = incomingAt(c) / Math.max(80, you.maxHp * .25);
    const d = dist(c, leader.pos);
    const approach = losFrom(c, leader.pos) && d <= myKit.ideal ? d : goalCosts.get(key(c.x, c.y)) ?? d + 6;
    const spread = Math.max(2, myKit.ideal * 0.75);
    let s = W.rangeBand * Math.exp(-((approach - myKit.ideal) ** 2) / (2 * spread * spread));
    // Gradient de rapprochement LINÉAIRE (la gaussienne est plate de loin:
    // sans lui, un kit de mêlée à 8 cases ne voit aucune raison d'avancer).
    s -= W.aggression * 0.16 * Math.abs(approach - myKit.ideal) * (retreating ? -0.6 : 1);
    s -= riskValue * 0.5 * W.threat * Math.min(2.2, danger) * (retreating ? 1.8 : 1) * (outOfPa ? 1.5 : 1);
    if (incomingAt(c) >= you.hp) s -= riskValue * W.threat * 2 * (1 - you.hp / Math.max(1, incomingAt(c)));
    if (blocker && d === 1) s += 1.5;
    if (you.pa < 2 && !enemies.some((e) => losFrom(c, e.pos))) s += W.losHide;
    for (const h of view.hazards || []) if ((h.cells || spellZoneCells(h.zone, h.center, h.center)).some(p => p.x === c.x && p.y === c.y)) {
      const owner = fighters[h.owner];
      if (!owner || !h.trigger) continue;
      for (const e of h.trigger.effects || []) if (DAMAGE_KINDS.has(e.kind) && effectAcceptsTarget(e, owner, you)) {
        s -= expectedHit(e, owner, { ...you, pos: c }, fighters, { trap: true }, h.center).damage / DMG_REF;
      }
    }
    return s;
  };

  // ---- valeur d'une victime ------------------------------------------
  const victimValues = new Map();
  const victimValue = (v) => {
    if (victimValues.has(v.id)) return victimValues.get(v.id);
    let m = 1 + W.focusWeak * (1 - v.hp / Math.max(1, v.maxHp));
    m *= 1 + .35 * Math.min(2, groupPower(v) / maxPower);
    if (!v.isSummon) m *= 1 + W.leader + .12 * Math.min(4, dependents(v).length);
    else if (fighters[v.ownerId]?.hp > 0) {
      // Killing a healthy owner's disposable summon must not beat hurting the
      // owner just because its tiny HP bar makes it easy to finish.
      const dangerous = Math.min(1, powerOf(v) / Math.max(35, you.hp * .45));
      const blocking = dist(v.pos, you.pos) === 1 && !you.spells.some(s => s.pa <= you.pa && api.canCast(s.key, leader.pos).ok);
      m *= Math.min(1.1, .22 + dangerous * .65 + (blocking ? .3 : 0));
    }
    if (v.hidden) m *= .15;
    victimValues.set(v.id, m); return m;
  };
  const killValue = v => W.kill * (v.isSummon ? .12 * victimValue(v)
    : 1 + dependents(v).reduce((n, e) => n + .15 + Math.min(1, powerOf(e) / maxPower), 0));

  // Heuristic estimate from the first point's odds; later successes are harder.
  const expectedRemoval = (victim, points, kind) => {
    const { attack, defense } = pointRemovalScores(you, victim, kind);
    const max = Math.max(1, kind === 'pa' ? victim.basePa : victim.basePm);
    const cur = victim.id === you.id ? victim[kind] : Math.max(0, max + statBuffTotal(victim, kind));
    const p = pointRemovalChance(attack, defense, cur, max) / 100;
    return Math.min(cur, points * p);
  };

  // ---- score d'un jeu de lignes d'effets sur une cible ----------------
  const scoreRows = (rows, spell, targetPos, fromPos) => {
    let score = 0;
    const projectedCaster = { ...you, pos: fromPos };
    const damaged = new Map();
    let stolen = 0;
    for (const e of rows) {
      const proba = e.chance > 0 ? e.chance / 100 : 1;
      const cells = spellZoneCells(e.zone, targetPos, fromPos);
      const victims = [];
      const seen = new Set();
      if ((e.targetMask || 0) & 32) victims.push(projectedCaster);
      else for (const c of cells) {
        let f = occupied.get(key(c.x, c.y));
        if (f?.id === you.id) f = null;
        if (c.x === fromPos.x && c.y === fromPos.y) f = projectedCaster;
        if (f && f.hp > 0 && !seen.has(f.id) && effectAcceptsTarget(e, you, f)) { seen.add(f.id); victims.push(f); }
      }
      switch (e.kind) {
        case 'glyph':
        case 'trap': {
          if (!e.trigger || (view.hazards || []).some(h => h.owner === you.id && h.spellId === spell.id)) break;
          const payload = e.trigger.effects.map(row => ({ ...row, zone: e.zone }));
          score += scoreRows(payload, { ...spell, trap: e.kind === 'trap' }, targetPos, fromPos) * (e.kind === 'glyph' ? 1.1 : .7);
          break;
        }
        case 'damage':
        case 'lifeSteal':
        case 'fixedLifeSteal':
        case 'punitionDamage': {
          for (const target of victims) {
            const hit = expectedHit(e, projectedCaster, target, fighters, spell, targetPos, fromPos);
            const v = hit.victim;
            const dmg = Math.min(Math.max(0, v.hp - (damaged.get(v.id) || 0)), hit.damage);
            damaged.set(v.id, (damaged.get(v.id) || 0) + dmg * proba);
            if (v.team !== you.team) {
              let val = W.damage * ((dmg - hit.healing) / DMG_REF) * victimValue(v);
              if (['lifeSteal', 'fixedLifeSteal'].includes(e.kind)) {
                const healing = Math.min(Math.max(0, you.maxHp - you.hp - stolen), dmg / 2);
                stolen += healing;
                val += W.heal * W.lifeSteal * healing / DMG_REF * (1 + (1 - hpRatio));
              }
              score += val * proba;
            } else {
              // tir allié (ou sur soi): fortement pénalisé
              const self = v.id === you.id ? 1.2 : 1;
              score -= 1.1 * self * W.damage * (Math.min(dmg, v.hp) / DMG_REF) * proba;
            }
            score -= hit.recoil / DMG_REF * (1 + 2 * (1 - hpRatio)) * proba;
            if (hit.recoil >= you.hp) score -= W.kill * 3;
          }
          break;
        }
        case 'fixedHeal':
        case 'heal': {
          for (const v of victims) {
            const jet = e.kind === 'fixedHeal' ? avg(e) : healAmount(avg(e), you) + (spell.flatHeal || 0);
            const healed = Math.min(v.maxHp - v.hp, jet);
            if (v.team !== you.team) { score -= W.heal * healed / DMG_REF * victimValue(v) * proba; continue; }
            const ratio = v.hp / Math.max(1, v.maxHp);
            if (ratio < W.healThreshold && healed > 0) {
              score += W.heal * (healed / DMG_REF) * (1 + 2 * (1 - ratio)) * (v.leader || v.id === you.id ? 1 : 0.5) * proba;
            }
          }
          break;
        }
        case 'push': {
          for (const v of victims) {
            if (v.team === you.team) continue;
            const sim = api.simulatePush(fromPos, v.pos, e.p1 || 1);
            // collision ≈ 25 dégâts bruts par case bloquée au niveau 100
            let val = W.push * ((sim.blocked * 25) / DMG_REF) * victimValue(v) * 2;
            // désengagement: repousser un kit de mêlée collé à nous
            if (myKit.ideal > 2 && dist(you.pos, v.pos) <= 1 && sim.moved > 0) {
              val += W.push * 0.5 * sim.moved;
            }
            score += val * proba;
          }
          break;
        }
        case 'pull': {
          for (const v of victims) {
            if (v.team === you.team) continue;
            const gain = Math.min(e.p1 || 1, Math.max(0, dist(fromPos, v.pos) - 1));
            if (myKit.ideal <= 2) score += W.pull * gain * proba;
          }
          break;
        }
        case 'teleport': {
          score += 0.9 * (positionScore(targetPos) - positionScore(you.pos));
          break;
        }
        case 'summon': {
          const existing = allies.filter(a => a.ownerId === you.id).length;
          score += W.summon * (view.turn <= 2 ? 1.3 : 1) / (1 + existing * .3) * proba;
          break;
        }
        case 'double':
        case 'staticSummon': {
          if (dist(targetPos, leader.pos) <= 2 && dist(targetPos, fromPos) > 0) score += W.summon * (e.kind === 'double' ? .45 : .12) * proba;
          break;
        }
        case 'armor': {
          for (const v of victims) if (!hasBuffNamed(v, spell.name)) {
            const pressure = incomingAt(v.pos) > 0;
            score += (v.team === you.team ? 1 : -1) * W.armor * (avg(e) / 20) * (pressure ? 1.2 : 0.2) * proba;
          }
          break;
        }
        case 'buffPa':
        case 'buffPm':
        case 'buffPower':
        case 'buffDamage':
        case 'buffCrit':
        case 'buffStat': {
          const factor = e.kind === 'buffPa' ? 1.5
            : e.kind === 'buffPm' ? 1.0
            : e.kind === 'buffPower' ? 0.9
            : e.kind === 'buffDamage' ? 0.8
            : e.kind === 'buffCrit' ? 0.6
            : 0.7;
          // un buff paie quand le combat est engagé
          const engaged = dist(you.pos, leader.pos) <= you.basePm + myKit.maxReach + 2;
          for (const v of victims) {
            if (e.kind === 'buffStat' && ['armorPhysical', 'armorMagic'].includes(e.stat)) {
              if (hasBuffNamed(v, spell.name)) continue;
              const preventable = v.team === you.team ? incomingAt(v.pos)
                : bestBudget(you.spells.map(s => ({ pa: s.pa, uses: castsRemaining(s, you, v.id), value: spellDamage(s, you, v, fighters) })), you.basePa);
              const protection = Math.min(1, avg(e) / 100) * Math.max(.2, preventable / DMG_REF) * Math.min(2, e.duration || 1);
              score += (v.team === you.team ? 1 : -1) * W.armor * protection * proba;
              continue;
            }
            if (v.team !== you.team) { score -= W.buff * factor; continue; }
            if (!hasBuffNamed(v, spell.name)) score += W.buff * factor * (engaged ? 1 : .35) * proba * (v.id === you.id ? 1 : .8);
          }
          break;
        }
        case 'stealPa':
        case 'removePa': {
          for (const v of victims) {
            if (v.team === you.team) continue;
            const exp = expectedRemoval(v, e.p1 || 1, 'pa');
            score += W.removePa * exp * (v.leader ? 1 : 0.3)
              * (e.kind === 'stealPa' ? 1.3 : 1) * proba;
          }
          break;
        }
        case 'stealPm':
        case 'removePm': {
          for (const v of victims) {
            if (v.team === you.team) continue;
            const exp = expectedRemoval(v, e.p1 || 1, 'pm');
            // priver de PM un kit de mêlée qui doit nous atteindre, c'est de l'or
            const vsKit = kitInfo(v).ideal <= 2 ? 1.4 : 0.8;
            score += W.removePm * exp * vsKit * (v.leader ? 1 : 0.3)
              * (e.kind === 'stealPm' ? 1.3 : 1) * proba;
          }
          break;
        }
        case 'poison': {
          for (const v of victims) {
            const perTick = expectedDamage(e, you, v, fighters, { trap: true });
            score += W.damage * 0.8 * ((perTick * Math.min(e.duration || 3, 3)) / DMG_REF)
              * (v.team === you.team ? v.isSummon ? -.5 : -1.25 : victimValue(v)) * proba;
          }
          break;
        }
        case 'swap': {
          // se téléporter à la place de la cible: valeur = échange de positions
          const v = victims.find((x) => x.id !== you.id);
          if (v) score += 0.9 * (positionScore(v.pos) - positionScore(you.pos));
          break;
        }
        case 'dispel': {
          for (const v of victims) {
            const fx = v.effects || [];
            if (v.team !== you.team) {
              // dissiper les buffs adverses (armures, puissances, vitalité…)
              const buffs = fx.filter((x) => x.kind === 'buff' && x.value > 0).length;
              score += 0.3 * W.buff * buffs * proba;
            } else {
              // se purger de ses malus (PA/PM/PO rongés, poisons)
              const maluses = fx.filter((x) => x.kind === 'poison' || (x.kind === 'buff' && x.value < 0)).length;
              score += 0.35 * W.buff * maluses * proba;
            }
          }
          break;
        }
        case 'buffVitality': {
          for (const v of victims) if (!hasBuffNamed(v, spell.name)) {
            score += (v.team === you.team ? 1 : -1) * W.buff * 1.1 * (avg(e) / DMG_REF) * proba;
          }
          break;
        }
        case 'buffRange': {
          for (const v of victims) if (!hasBuffNamed(v, spell.name) && v.spells.some(s => s.adjustableRange)) {
            score += (v.team === you.team ? 1 : -1) * W.buff * 0.8 * (e.min || 1) * 0.35 * proba;
          }
          break;
        }
        case 'debuffRange': {
          for (const v of victims) {
            if (v.team === you.team) continue;
            const vsRanged = kitInfo(v).ideal > 2 ? 1.4 : 0.3;
            score += W.removePm * 0.6 * (e.min || 1) * vsRanged * (v.leader ? 1 : 0.3) * proba;
          }
          break;
        }
        case 'resistBuff':
        case 'resistAllBuff': {
          for (const v of victims) if (!hasBuffNamed(v, spell.name)) {
            const pressure = incomingAt(v.pos) > 0;
            score += (v.team === you.team ? 1 : -1) * W.armor * (avg(e) / 25) * (pressure ? 1.1 : 0.15) * proba;
          }
          break;
        }
        case 'resistDebuff': {
          // -% résistance: démultiplie NOS dégâts futurs de cet élément
          for (const v of victims) {
            if (v.team === you.team) continue;
            score += W.damage * 0.3 * (avg(e) / 25) * victimValue(v) * proba;
          }
          break;
        }
        case 'punishment': {
          // Châtiment: rentable quand on VA se faire taper (Sacrieur au front)
          const active = (you.effects || []).some(
            (x) => x.kind === 'punishment' && x.name === spell.name && x.turnsLeft > 1,
          );
          if (!active) {
            const pressure = incomingAt(fromPos) > 0;
            score += W.armor * (pressure ? 1.2 : 0.4) * (e.p1 === 108 ? 1.3 : 0.9) * proba;
          }
          break;
        }
        case 'swapAlly': {
          const v = victims.find((x) => x.id !== you.id && x.team === you.team);
          if (v) score += 0.9 * (positionScore(v.pos) - positionScore(you.pos));
          break;
        }
        case 'kill': {
          for (const v of victims) score += (v.team !== you.team
            ? W.damage * v.hp / DMG_REF * victimValue(v) + killValue(v)
            : -W.damage * v.hp / DMG_REF - W.kill * (v.id === you.id ? 4 : 2)) * proba;
          break;
        }
        case 'selfDamage':
        case 'selfPercentDamage':
        case 'percentLifeDamage': {
          const amount = e.kind === 'selfDamage' ? avg(e) : you.hp * avg(e) / 100;
          for (const v of e.kind === 'percentLifeDamage' ? victims : [you]) {
            const lost = Math.min(v.hp, amount);
            score += (v.team !== you.team ? W.damage * victimValue(v) : v.isSummon ? -.15 : -(1 + 2 * (1 - v.hp / v.maxHp))) * lost / DMG_REF * proba;
            if (lost >= v.hp) score += v.team !== you.team ? killValue(v) : -W.kill * (v.isSummon ? .1 : 4);
          }
          break;
        }
        case 'weaponMastery': {
          const weapon = you.spells.find(s => s.isWeapon && s.weaponType === e.p1);
          if (weapon && !(you.effects || []).some(fx => fx.kind === e.kind && fx.weaponType === e.p1 && fx.turnsLeft > 1)) score += W.buff * .8 * proba;
          break;
        }
        case 'dodgeMelee':
        case 'damageReflection':
        case 'spellReflection':
        case 'invisibility': {
          for (const v of victims) {
            if (v.effects?.some(fx => fx.kind === e.kind && fx.turnsLeft > 1)) continue;
            const pressure = incomingAt(v.pos) / DMG_REF;
            const contact = threats.some(t => t.kit.ideal <= 2 && dist(t.e.pos, v.pos) <= t.reach);
            const benefit = e.kind === 'dodgeMelee' ? contact ? pressure : 0 : pressure * .5;
            score += (v.team === you.team ? 1 : -1) * W.armor * Math.min(2.5, benefit) * proba;
          }
          break;
        }
        case 'skipTurn': {
          for (const v of victims) if (!v.effects?.some(fx => fx.kind === 'skipTurn')) {
            score += (v.team !== you.team ? (groupPower(v) / DMG_REF + .5) * victimValue(v) : -(v.basePa / 3 + v.basePm / 4)) * proba;
          }
          break;
        }
        case 'debuffPa':
        case 'debuffPm': {
          const stat = e.kind === 'debuffPa' ? 'pa' : 'pm';
          for (const v of victims) {
            const max = Math.max(1, (stat === 'pa' ? v.basePa : v.basePm) + statBuffTotal(v, stat));
            const removed = Math.min(avg(e), max);
            const power = v.team === you.team ? bestBudget(v.spells.map(s => ({ pa: s.pa, uses: s.usesPerTurn || 99,
              value: spellDamage(s, v, leader, fighters) })), v.basePa) : powerOf(v);
            score += (v.team === you.team ? -1 : victimValue(v)) * removed / max
              * Math.max(.3, power / DMG_REF) * (stat === 'pa' ? W.removePa : W.removePm * .5) * proba;
          }
          break;
        }
        case 'debuffStat':
        case 'stealStat': {
          for (const v of victims) score += (v.team === you.team ? -1 : victimValue(v)) * W.buff
            * Math.min(avg(e), Math.max(0, statOf(v, e.stat))) / 100 * (e.kind === 'stealStat' ? 1.6 : 1) * proba;
          break;
        }
        case 'apPoison': {
          for (const v of victims) if (!v.effects?.some(fx => fx.kind === e.kind && fx.spellId === spell.id && fx.turnsLeft > 1)) {
            const damage = Math.floor(v.basePa / Math.max(1, e.p1)) * (e.p2 || 0) * (100 + statOf(you, 'intelligence')) / 100;
            score += (v.team === you.team ? -1 : victimValue(v)) * W.damage * damage / DMG_REF * Math.min(2, e.duration || 1) * proba;
          }
          break;
        }
        case 'state':
        case 'removeState': {
          for (const v of victims) {
            const active = v.effects?.some(fx => fx.kind === 'state' && fx.stateId === e.p3);
            if (active === (e.kind === 'state')) continue;
            const enables = v.spells.some(s => (e.kind === 'state' ? s.requiredStates : s.forbiddenStates)?.includes(e.p3));
            const disables = v.spells.some(s => (e.kind === 'state' ? s.forbiddenStates : s.requiredStates)?.includes(e.p3));
            score += (v.team === you.team ? 1 : -1) * W.buff * ((enables ? 1 : 0) - (disables ? .5 : 0)) * proba;
          }
          break;
        }
        case 'reveal': {
          for (const v of victims) if (v.hidden && v.team !== you.team) score += W.buff * victimValue(v) * proba;
          break;
        }
        default:
          break;
      }
    }
    for (const [id, dmg] of damaged) {
      const victim = fighters[id];
      if (victim && dmg > 0 && dmg >= victim.hp) score += victim.team === you.team ? -W.kill * 2 : killValue(victim);
    }
    return score;
  };

  // Score complet d'un lancer: critiques espérés + échec critique escompté.
  const scoreCast = (s, targetPos, fromPos = you.pos) => {
    let score = scoreRows(s.effects, s, targetPos, fromPos);
    if (s.critRate > 0 && s.critEffects && s.critEffects.length > 0) {
      const p = 1 / critDivisor(s.critRate, statOf(you, 'agilite'), statOf(you, 'crit') + (s.critBonus || 0));
      score = score * (1 - p) + scoreRows(s.critEffects, s, targetPos, fromPos) * p;
    }
    if (s.failRate > 0) score *= 1 - 1 / s.failRate;
    // valeur-par-PA (Nao divise l'influence par le coût en PA)
    score *= 1 + W.paEfficiency * (1 / Math.max(1, s.pa) - 0.15);
    // Multiplicateur par sort (appris par matchup: « ce sort-là compte »)
    const mult = W[`spell_${s.key}`];
    if (mult !== undefined) score *= mult;
    return score;
  };

  // ---- candidats de lancer --------------------------------------------
  // Table (sort, cible) → score, calculée une fois; la légalité est vérifiée
  // par le moteur depuis la case actuelle et les cases retenues pour la suite.
  const candidates = [];
  for (const s of you.spells) {
    if (s.pa > you.pa) continue;
    if ((s.cooldownLeft || 0) > 0) continue;
    if (s.usesLeft <= 0) continue;

    const targets = [];
    if (s.targetMode === 'self') {
      targets.push(you.pos);
    } else if (s.targetMode === 'freeCell') {
      const cells = api.castTargets(s.key);
      const isTeleport = s.effects.some((e) => e.kind === 'teleport');
      if (isTeleport) {
        // téléportation = déplacement: viser les meilleures cases
        cells.sort((a, b) => positionScore(b) - positionScore(a));
        targets.push(...cells.slice(0, 3));
      } else {
        // invocation/piège: près de l'ennemi, plus une case défensive
        cells.sort((a, b) => dist(a, leader.pos) - dist(b, leader.pos));
        targets.push(...cells.slice(0, 3));
        const defensive = [...cells].sort((a, b) => dist(a, you.pos) - dist(b, you.pos))[0];
        if (defensive) targets.push(defensive);
      }
    } else {
      for (const f of [...enemies, ...allies, you]) targets.push(...areaAimCells(s, f.pos, you.pos, board));
    }

    const uniqueTargets = new Map(targets.map(t => [key(t.x, t.y), t]));
    for (const t of uniqueTargets.values()) {
      if (s.targetMode !== 'self' && dist(you.pos, t) > s.range[1] + you.pm) continue;
      const sc = scoreCast(s, t);
      if (sc <= 0 && (you.pm <= 0 || !s.effects.some(e => DAMAGE_KINDS.has(e.kind) && e.zone?.[0] !== 'P'))) continue;
      candidates.push({ spell: s, target: t, score: sc });
    }
  }

  const continuationCache = new Map();
  const continuation = (candidate, from = you.pos) => {
    const first = candidate.spell;
    const target = first.targetMode === 'self' ? from : candidate.target;
    const cacheKey = `${first.key}:${key(target.x, target.y)}:${key(from.x, from.y)}`;
    if (continuationCache.has(cacheKey)) return continuationCache.get(cacheKey);
    const boosted = casterAfterSpell(you, first, target, from);
    let value = 0;
    // The immediate score already counts EVERY area victim. Limit the more
    // expensive sequence search to the aimed enemy and two other priorities.
    const forecastTargets = [...enemies].sort((a, b) => {
      const rank = v => (v.pos.x === target.x && v.pos.y === target.y ? 4 : 0)
        + victimValue(v) / (1 + dist(from, v.pos) * .1);
      return rank(b) - rank(a);
    }).slice(0, 3);
    if (boosted.pa > 0) for (const victim of forecastTargets) {
      const dealt = spellDamage(first, you, victim, fighters, target, from);
      const remaining = Math.max(0, victim.hp - dealt);
      if (!remaining) continue;
      const options = [];
      for (const spell of you.spells) {
        if (spell.pa > boosted.pa || (spell.cooldownLeft || 0) > 0) continue;
        const spent = spell.key === first.key ? 1 : 0;
        const sameTarget = target.x === victim.pos.x && target.y === victim.pos.y;
        const uses = Math.min((spell.usesLeft ?? 99) - spent,
          spell.cooldown > 0 ? 1 - spent : 99,
          spell.usesPerTarget > 0 ? spell.usesPerTarget - (you.usedOnTarget?.[spell.key]?.[victim.id] || 0) - (sameTarget ? spent : 0) : 99);
        if (uses <= 0) continue;
        const damage = spellDamage(spell, boosted, victim, fighters, victim.pos, from);
        if (damage <= 0) continue;
        // A newly gained PA/range bonus can
        // unlock a previously unaffordable spell; validate that in the API.
        const valid = api.canCastAfter(first.key, target, spell.key, victim.pos, from);
        if (!valid.ok) continue;
        options.push({ pa: spell.pa, value: damage, uses });
      }
      const damage = bestBudget(options, boosted.pa);
      let forecast = W.damage * Math.min(remaining, damage) / DMG_REF * victimValue(victim);
      if (dealt > 0 && damage >= remaining) forecast += killValue(victim) * .7;
      value = Math.max(value, forecast);
    }
    continuationCache.set(cacheKey, value); return value;
  };

  // ---- argmax ----------------------------------------------------------
  // Deux seuils distincts: les PA sont PERDUS en fin de tour, donc tout
  // lancer à valeur positive mérite d'être joué (seuil quasi nul); un
  // déplacement, lui, doit VALOIR le coup (anti-va-et-vient).
  const CAST_FLOOR = 0.012;
  let bestCast = { score: CAST_FLOOR, action: null };
  let bestMove = { score: outOfPa ? W.endTurn * 0.5 : W.endTurn, action: null };

  // Keep the best legal aim for each spell before evaluating continuations.
  // Otherwise a large zone repeats the same budget search on dozens of cells.
  const legalBySpell = new Map();
  for (const c of [...candidates].sort((a, b) => b.score - a.score)) {
    if (legalBySpell.has(c.spell.key)) continue;
    if (!api.canCast(c.spell.key, c.target).ok) continue;
    legalBySpell.set(c.spell.key, c);
  }
  for (const c of legalBySpell.values()) {
    // A useless spell must never be selected just to inherit the value of an
    // attack that was already available (e.g. empty heals before a killing hit).
    if (c.score <= CAST_FLOOR) continue;
    const sc = c.score + .85 * continuation(c);
    if (sc > bestCast.score) bestCast = { score: sc, action: api.cast(c.spell.key, c.target) };
  }

  // ---- déplacements: Δposition + meilleur sort débloqué ----------------
  if (you.pm > 0) {
    const here = positionScore(you.pos);
    const escape = api.tackleInfo();
    // candidats triés par score décroissant → premier légal = max
    const perSpell = new Map();
    const sorted = [...candidates].sort((a, b) => b.score - a.score).filter(candidate => {
      const count = perSpell.get(candidate.spell.key) || 0;
      perSpell.set(candidate.spell.key, count + 1); return count < 4;
    });
    const bestFrom = (c, exact = false) => {
      const options = [];
      for (const cand of sorted) {
        const s = cand.spell;
        const target = s.targetMode === 'self' ? c : cand.target;
        const d = dist(c, target);
        if (d < s.range[0] || d > s.range[1]) continue;
        if (s.lineOnly && !(c.x === target.x || c.y === target.y)) continue;
        if (s.needsLos && d > 0 && !losFrom(c, target)) continue;
        if (exact && !api.canCastFrom(s.key, target, c).ok) continue;
        const immediate = exact ? scoreCast(s, target, c) : cand.score;
        if (immediate > CAST_FLOOR) options.push({ cand, immediate });
      }
      if (!exact) return Math.max(0, ...options.map(o => o.immediate));
      return Math.max(0, ...options.sort((a, b) => b.immediate - a.immediate).slice(0, 3)
        .map(o => o.immediate + .85 * continuation(o.cand, c)));
    };

    const moves = api.reachable().map(cell => {
      let position = positionScore(cell.pos) - here - 0.004 * cell.cost;
      for (const h of view.hazards || []) if (h.kind === 'trap' && h.cells?.some(p => cell.path.slice(1).some(step => step.x === p.x && step.y === p.y))) {
        const owner = fighters[h.owner];
        if (owner) for (const e of h.trigger?.effects || []) if (DAMAGE_KINDS.has(e.kind) && effectAcceptsTarget(e, owner, you)) {
          position -= expectedHit(e, owner, you, fighters, { trap: true }, h.center).damage / DMG_REF;
        }
      }
      return { ...cell, position, estimate: position + W.lookahead * bestFrom(cell.pos) };
    }).sort((a, b) => b.estimate - a.estimate).slice(0, 6);
    for (const cell of moves) {
      // Weight the GAIN from moving, not the whole spell again. In particular,
      // a monster's lookahead > 1 must not make a pointless move beat casting
      // the exact same attack immediately.
      const future = bestFrom(cell.pos, true);
      let sc = cell.position + bestCast.score + W.lookahead * (future - bestCast.score);
      if (escape.inContact) sc *= escape.escapeChance / 100; // fuite risquée
      // With an invisible opponent, probe one step and re-plan. A failed move
      // then identifies only the attempted cell, not an entire unknown path.
      const destination = enemies.some(e => e.hidden) ? cell.path[1] || cell.pos : cell.pos;
      if (sc > bestMove.score && api.canMove(destination).ok) bestMove = { score: sc, action: api.move(destination) };
    }
  }

  // Un sort qui vaut au moins autant que le déplacement passe d'abord
  // (après le sort, on re-décide: le déplacement reste possible).
  const action = bestCast.action && bestCast.score >= bestMove.score ? bestCast.action
    : bestMove.action || bestCast.action || api.endTurn();
  return api.rememberDecision ? api.rememberDecision(action) : action;
}

export default utilityDecide;
