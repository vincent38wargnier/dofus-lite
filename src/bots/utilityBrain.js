// Cerveau utilitaire v2 — l'IA « maison » du Koliséum.
//
// Modèle: utility AI (considérations pondérées, argmax, re-score après chaque
// action — l'arbitre rappelle decide() en boucle), croisé avec l'IA des
// serveurs 1.29 (influence signée par effet, valeur-par-PA, focus du plus
// faible). Nouveautés v2:
//   - lookahead déplacement→sort: une case vaut aussi le meilleur sort
//     qu'elle débloque (les kits à distance se replacent AVANT de tirer)
//   - zones réelles: un sort de zone compte toutes ses victimes, alliés
//     et lanceur en NÉGATIF (plus d'auto-bombardement)
//   - dégâts espérés fidèles: résistances % et fixes, armure, critiques
//     espérés (1/x agilité), échec critique escompté
//   - détection de létalité: si un enchaînement de sorts peut tuer ce tour,
//     l'alpha strike passe avant toute prudence
//   - menace par CHEMIN (BFS) et par kit ennemi réel (PM + portée max),
//     repli quand les PV sont bas, esquive du tacle
//   - anti-gaspillage: pas de re-buff quand l'effet est déjà actif
//
// Les poids sont modulables: api.suggest(weights) pour les bots des joueurs,
// et l'IA Maison charge un jeu de poids par (classe, classe adverse) réglé
// par des milliers de matchs en auto-jeu (voir src/tuning/).

import TUNED from './cortexWeights.json';
import { key, dist, spellZoneCells, hasLineOfSight } from '../engine/geometry';
import { bfs } from '../engine/pathfinding';
import { critDivisor, pointRemovalScores, pointRemovalChance, damageAmount, applyResistances, armorReduction, statBuffTotal, healAmount } from '../engine/formulas';
import { effectAcceptsTarget } from '../engine/engine';

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
  antiSummon: 0.15,   // …ou aux invocations (réglé par matchup)
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
  return Math.max(0, applyResistances(damageAmount(avg(effect), effect.element, caster,
    { trap: spell.trap, flatDamage: spell.flatDamage, weaponType: spell.weaponType }), effect.element, victim, caster)
    - armorReduction(victim, effect.element, fighters));
}

// Profil d'un kit: distance idéale (portée max du meilleur sort de dégâts)
// et portée maximale d'attaque — sert au band de distance ET à la menace.
function kitInfo(f) {
  let ideal = 1;
  let best = 0;
  let maxReach = 1;
  for (const s of f.spells || []) {
    if (s.pa > f.basePa) continue;
    for (const e of s.effects || []) {
      if (e.kind === 'damage' || e.kind === 'lifeSteal' || e.kind === 'poison') {
        maxReach = Math.max(maxReach, s.range[1]);
        const d = avg(e) * (e.kind === 'poison' ? 1.5 : 1); // poison ≈ plusieurs tics
        if (d > best) { best = d; ideal = Math.max(1, s.range[1]); }
      }
    }
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
  const leader = enemies.find((e) => e.leader) || enemies[0];

  // ---- terrain -------------------------------------------------------
  const obstacles = new Map();
  for (const o of board.obstacles) obstacles.set(key(o.x, o.y), o);
  const occupied = new Map();
  const fighters = Object.fromEntries([you, ...allies, ...enemies].map(f => [f.id, f]));
  for (const f of [you, ...allies, ...enemies]) occupied.set(key(f.pos.x, f.pos.y), f);

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

  // ---- menace: BFS depuis chaque ennemi, portée = PM + portée du kit --
  const myKit = kitInfo(you);
  const threats = enemies.map((e) => {
    const k = kitInfo(e);
    const reach = Math.min(e.basePm + k.maxReach, 15);
    const blocked = (x, y) => !(x === e.pos.x && y === e.pos.y) && moveBlocked(x, y);
    const { costs } = bfs(e.pos, reach, board.width, board.height, blocked);
    return { e, kit: k, reach, costs };
  });

  const hpRatio = you.hp / Math.max(1, you.maxHp);
  const retreating = hpRatio < W.retreatHp;
  // Plus un seul sort payable: les PM qui restent servent à se replacer.
  const cheapestPa = Math.min(...you.spells.map((s) => s.pa), 99);
  const outOfPa = you.pa < cheapestPa;

  const positionScore = (c) => {
    let danger = 0;
    for (const t of threats) {
      const cost = t.costs.get(key(c.x, c.y));
      if (cost !== undefined && cost <= t.reach) {
        danger += (t.reach - cost + 1) / (t.reach + 1);
      }
      // un kit de mêlée adjacent, c'est aussi un tacle en puissance
      if (t.kit.ideal <= 1 && cost !== undefined && cost <= t.e.basePm + 1) danger += 0.35;
    }
    const d = dist(c, leader.pos);
    const spread = Math.max(2, myKit.ideal * 0.75);
    let s = W.rangeBand * Math.exp(-((d - myKit.ideal) ** 2) / (2 * spread * spread));
    // Gradient de rapprochement LINÉAIRE (la gaussienne est plate de loin:
    // sans lui, un kit de mêlée à 8 cases ne voit aucune raison d'avancer).
    s -= W.aggression * 0.08 * Math.abs(d - myKit.ideal) * (retreating ? -0.6 : 1);
    s -= 0.5 * W.threat * Math.min(2.2, danger) * (retreating ? 1.8 : 1) * (outOfPa ? 1.5 : 1);
    if (you.pa < 2 && !enemies.some((e) => losFrom(c, e.pos))) s += W.losHide;
    return s;
  };

  // ---- valeur d'une victime ------------------------------------------
  const victimValue = (v) => {
    let m = 1 + W.focusWeak * (1 - v.hp / Math.max(1, v.maxHp));
    if (v.leader) m *= 1 + W.leader;
    else if (v.isSummon) m *= 1 + W.antiSummon;
    return m;
  };

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
    for (const e of rows) {
      const proba = e.chance > 0 ? e.chance / 100 : 1;
      const cells = spellZoneCells(e.zone, targetPos, fromPos);
      const victims = [];
      const seen = new Set();
      for (const c of cells) {
        const f = occupied.get(key(c.x, c.y));
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
        case 'lifeSteal': {
          for (const v of victims) {
            const dmg = expectedDamage(e, you, v, fighters, spell);
            if (v.team !== you.team) {
              let val = W.damage * (Math.min(dmg, v.hp) / DMG_REF) * victimValue(v);
              if (e.kind === 'lifeSteal') {
                val *= W.lifeSteal;
                // la moitié rendue compte double quand on est entamé
                if (hpRatio < 0.7) val *= 1.25;
              }
              if (dmg >= v.hp) val += W.kill * (v.leader ? 1 : 0.35);
              score += val * proba;
            } else {
              // tir allié (ou sur soi): fortement pénalisé
              const self = v.id === you.id ? 1.2 : 1;
              score -= 1.1 * self * W.damage * (Math.min(dmg, v.hp) / DMG_REF) * proba;
            }
          }
          break;
        }
        case 'heal': {
          for (const v of victims) {
            if (v.team !== you.team) { score -= 0.3 * proba; continue; }
            const jet = healAmount(avg(e), you) + (spell.flatHeal || 0);
            const healed = Math.min(v.maxHp - v.hp, jet);
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
          score += W.summon * (view.turn <= 2 ? 1.3 : 1) * proba;
          break;
        }
        case 'armor': {
          if (!hasBuffNamed(you, spell.name)) {
            const pressure = threats.some((t) => {
              const c = t.costs.get(key(you.pos.x, you.pos.y));
              return c !== undefined && c <= t.reach;
            });
            score += W.armor * (avg(e) / 20) * (pressure ? 1.2 : 0.6) * proba;
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
            if (v.team === you.team) continue;
            const perTick = expectedDamage(e, you, v, fighters);
            score += W.damage * 0.8 * ((perTick * Math.min(e.duration || 3, 3)) / DMG_REF)
              * victimValue(v) * proba;
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
          if (!hasBuffNamed(you, spell.name)) {
            score += W.buff * 1.1 * (avg(e) / DMG_REF) * proba;
          }
          break;
        }
        case 'buffRange': {
          if (!hasBuffNamed(you, spell.name) && myKit.ideal > 2) {
            score += W.buff * 0.8 * (e.min || 1) * 0.35 * proba;
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
        case 'resistBuff': {
          if (!hasBuffNamed(you, spell.name)) {
            const pressure = threats.some((t) => {
              const c = t.costs.get(key(you.pos.x, you.pos.y));
              return c !== undefined && c <= t.reach;
            });
            score += W.armor * (avg(e) / 25) * (pressure ? 1.1 : 0.5) * proba;
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
            const pressure = threats.some((t) => {
              const c = t.costs.get(key(you.pos.x, you.pos.y));
              return c !== undefined && c <= t.reach;
            });
            score += W.armor * (pressure ? 1.2 : 0.4) * (e.p1 === 108 ? 1.3 : 0.9) * proba;
          }
          break;
        }
        case 'punitionDamage': {
          // cloche de Punition: 0 à pleine vie, max à mi-vie (formule moteur)
          for (const v of victims) {
            if (v.team === you.team) continue;
            const ratio = you.hp / Math.max(1, you.maxHp);
            const radian = 2 * Math.PI * (ratio - 0.5);
            let dmg = Math.floor((((Math.cos(radian) + 1) ** 2) / 4) * ((e.p1 || 0) / 100) * you.maxHp);
            dmg = Math.max(0, applyResistances(dmg, 'neutre', v) - armorReduction(v, 'neutre', fighters));
            let val = W.damage * (Math.min(dmg, v.hp) / DMG_REF) * victimValue(v);
            if (dmg >= v.hp && dmg > 0) val += W.kill * (v.leader ? 1 : 0.35);
            score += val * proba;
          }
          break;
        }
        case 'swapAlly': {
          const v = victims.find((x) => x.id !== you.id && x.team === you.team);
          if (v) score += 0.9 * (positionScore(v.pos) - positionScore(you.pos));
          break;
        }
        default:
          break;
      }
    }
    return score;
  };

  // Score complet d'un lancer: critiques espérés + échec critique escompté.
  const scoreCast = (s, targetPos) => {
    let score = scoreRows(s.effects, s, targetPos, you.pos);
    if (s.critRate > 0 && s.critEffects && s.critEffects.length > 0) {
      const p = 1 / critDivisor(s.critRate, statOf(you, 'agilite'), statOf(you, 'crit') + (s.critBonus || 0));
      score = score * (1 - p) + scoreRows(s.critEffects, s, targetPos, you.pos) * p;
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
  // exactement (moteur) depuis la case actuelle, géométriquement pour le
  // lookahead depuis les autres cases.
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
      for (const f of [...enemies, ...allies, you]) targets.push(f.pos);
    }

    for (const t of targets) {
      const sc = scoreCast(s, t);
      if (sc <= 0) continue;
      candidates.push({ spell: s, target: t, score: sc });
    }
  }

  // Létalité: la somme des dégâts espérés lançables CE TOUR sur une victime
  // peut-elle l'achever ? Alors l'alpha strike prime sur tout le reste.
  const dmgPotential = new Map(); // victimId → dégâts cumulés (budget PA glouton)
  for (const v of enemies) {
    const options = [];
    for (const s of you.spells) {
      if (s.pa > you.pa || (s.cooldownLeft || 0) > 0 || s.usesLeft <= 0) continue;
      if (!api.canCast(s.key, v.pos).ok) continue;
      let dmg = 0;
      for (const e of s.effects) {
        if (e.kind === 'damage' || e.kind === 'lifeSteal') {
          dmg += expectedDamage(e, you, v, fighters, s) * (e.chance > 0 ? e.chance / 100 : 1);
        }
        if (e.kind === 'punitionDamage') {
          const ratio = you.hp / Math.max(1, you.maxHp);
          const radian = 2 * Math.PI * (ratio - 0.5);
          const raw = Math.floor((((Math.cos(radian) + 1) ** 2) / 4) * ((e.p1 || 0) / 100) * you.maxHp);
          dmg += Math.max(0, applyResistances(raw, 'neutre', v) - armorReduction(v, 'neutre', fighters));
        }
      }
      if (dmg > 0) options.push({ pa: s.pa, dmg, uses: s.usesLeft });
    }
    options.sort((a, b) => b.dmg / b.pa - a.dmg / a.pa);
    let pa = you.pa;
    let total = 0;
    for (const o of options) {
      const n = Math.min(o.uses, Math.floor(pa / o.pa));
      total += n * o.dmg;
      pa -= n * o.pa;
    }
    dmgPotential.set(v.id, total);
  }
  const lethalIds = new Set(
    enemies.filter((v) => (dmgPotential.get(v.id) || 0) >= v.hp).map((v) => v.id),
  );

  // ---- argmax ----------------------------------------------------------
  // Deux seuils distincts: les PA sont PERDUS en fin de tour, donc tout
  // lancer à valeur positive mérite d'être joué (seuil quasi nul); un
  // déplacement, lui, doit VALOIR le coup (anti-va-et-vient).
  const CAST_FLOOR = 0.012;
  let bestCast = { score: CAST_FLOOR, action: null };
  let bestMove = { score: outOfPa ? W.endTurn * 0.5 : W.endTurn, action: null };

  let bestNow = 0;
  for (const c of candidates) {
    if (!api.canCast(c.spell.key, c.target).ok) continue;
    let sc = c.score;
    const v = occupied.get(key(c.target.x, c.target.y));
    if (v && lethalIds.has(v.id)) sc *= 1 + 0.8 * W.kill;
    if (sc > bestNow) bestNow = sc;
    if (sc > bestCast.score) bestCast = { score: sc, action: api.cast(c.spell.key, c.target) };
  }

  // ---- déplacements: Δposition + meilleur sort débloqué ----------------
  if (you.pm > 0) {
    const here = positionScore(you.pos);
    const escape = api.tackleInfo();
    // candidats triés par score décroissant → premier légal = max
    const sorted = [...candidates].sort((a, b) => b.score - a.score);
    const bestFrom = (c) => {
      for (const cand of sorted) {
        const s = cand.spell;
        if (s.targetMode === 'self') return cand.score; // lançable de partout
        const d = dist(c, cand.target);
        if (d < s.range[0] || d > s.range[1]) continue;
        if (s.lineOnly && !(c.x === cand.target.x || c.y === cand.target.y)) continue;
        if (s.needsLos && d > 0 && !losFrom(c, cand.target)) continue;
        return cand.score;
      }
      return 0;
    };

    for (const cell of api.reachable()) {
      let sc = positionScore(cell.pos) - here
        + W.lookahead * Math.max(0, bestFrom(cell.pos) - bestNow)
        - 0.004 * cell.cost;
      if (escape.inContact) sc *= escape.escapeChance / 100; // fuite risquée
      if (sc > bestMove.score) bestMove = { score: sc, action: api.move(cell.pos) };
    }
  }

  // Un sort qui vaut au moins autant que le déplacement passe d'abord
  // (après le sort, on re-décide: le déplacement reste possible).
  if (bestCast.action && bestCast.score >= bestMove.score) return bestCast.action;
  if (bestMove.action) return bestMove.action;
  if (bestCast.action) return bestCast.action;
  return api.endTurn();
}

export default utilityDecide;
