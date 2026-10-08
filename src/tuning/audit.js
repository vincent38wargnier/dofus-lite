// Audit « exploitation du kit »: est-ce que les bots utilisent vraiment
// leurs PA, leurs PM et TOUS leurs sorts ? Mesuré depuis les événements
// de vrais matchs (aucune instrumentation du moteur).
//
// Métriques par classe (côté leader uniquement):
//   paUtil     PA dépensés en sorts / PA disponibles aux débuts de tours
//   pmUtil     cases parcourues / PM disponibles
//   spellMix   part de chaque sort dans les lancers (l'idéal: tout le kit sert)
//   idleTurns  part des tours finis avec ≥ 4 PA non dépensés
//   castsPerTurn

/* eslint-disable no-console */
import { runMatch } from '../arena/runner';
import { maisonDecide } from '../bots/maison';
import { CLASSES, CLASS_IDS } from '../engine/classes';
import { hashSeed } from '../engine/rng';
import { TUNE_MAPS } from './harness';

export function auditMatch({ myClass, oppClass, seed, mapId, mySide, myDecide, oppDecide }) {
  const me = { name: 'me', decide: myDecide || ((v, a) => maisonDecide(v, a)) };
  const opp = { name: 'opp', decide: oppDecide || ((v, a) => maisonDecide(v, a)) };
  const bots = mySide === 'A' ? { A: me, B: opp } : { A: opp, B: me };
  const classes = mySide === 'A' ? { A: myClass, B: oppClass } : { A: oppClass, B: myClass };
  const r = runMatch({ bots, classes, mapId, seed, collectFrames: false });

  const stats = {
    paAvail: 0, paSpent: 0, pmAvail: 0, pmMoved: 0,
    turns: 0, idleTurns: 0, casts: 0, bySpell: {},
    win: r.winner === mySide ? 1 : r.winner === null ? 0.5 : 0,
  };
  let curPa = 0;
  let curSpent = 0;
  let inTurn = false;

  const closeTurn = () => {
    if (!inTurn) return;
    if (curPa - curSpent >= 4) stats.idleTurns += 1;
    inTurn = false;
  };

  for (const e of r.events) {
    if (e.t === 'turn_start' && e.fighter === mySide) {
      closeTurn();
      inTurn = true;
      curPa = e.pa;
      curSpent = 0;
      stats.turns += 1;
      stats.paAvail += e.pa;
      stats.pmAvail += e.pm;
    }
    if (e.t === 'turn_end' && e.fighter === mySide) closeTurn();
    if (e.t === 'cast' && e.fighter === mySide) {
      stats.casts += 1;
      stats.paSpent += e.paCost;
      curSpent += e.paCost;
      stats.bySpell[e.spell] = (stats.bySpell[e.spell] || 0) + 1;
    }
    if (e.t === 'move' && e.fighter === mySide) stats.pmMoved += e.cost;
  }
  closeTurn();
  return stats;
}

// Agrège sur un échantillon d'adversaires × seeds × côtés.
export function auditClass(myClass, {
  opponents = ['IOP', 'CRA', 'ENIRIPSA', 'OSAMODAS'],
  seedsPerOpp = 4,
  myDecide = null,
} = {}) {
  const agg = {
    paAvail: 0, paSpent: 0, pmAvail: 0, pmMoved: 0,
    turns: 0, idleTurns: 0, casts: 0, bySpell: {}, wins: 0, games: 0,
  };
  for (const opp of opponents) {
    for (let i = 0; i < seedsPerOpp; i++) {
      const seed = hashSeed(`audit:${myClass}:${opp}:${i}`) % 1e9;
      for (const mySide of ['A', 'B']) {
        const s = auditMatch({
          myClass, oppClass: opp, seed, mapId: TUNE_MAPS[i % TUNE_MAPS.length], mySide, myDecide,
        });
        for (const k of ['paAvail', 'paSpent', 'pmAvail', 'pmMoved', 'turns', 'idleTurns', 'casts']) agg[k] += s[k];
        for (const [sp, n] of Object.entries(s.bySpell)) agg.bySpell[sp] = (agg.bySpell[sp] || 0) + n;
        agg.wins += s.win;
        agg.games += 1;
      }
    }
  }
  const kit = Object.values(CLASSES[myClass].spells).map((s) => s.key);
  const total = Math.max(1, agg.casts);
  return {
    classId: myClass,
    paUtil: agg.paSpent / Math.max(1, agg.paAvail),
    pmUtil: agg.pmMoved / Math.max(1, agg.pmAvail),
    castsPerTurn: agg.casts / Math.max(1, agg.turns),
    idleTurns: agg.idleTurns / Math.max(1, agg.turns),
    spellMix: Object.fromEntries(kit.map((k) => [k, (agg.bySpell[k] || 0) / total])),
    unusedSpells: kit.filter((k) => !agg.bySpell[k]),
    winRate: agg.wins / agg.games,
    games: agg.games,
  };
}

export function auditAll(opts = {}) {
  const out = {};
  for (const cls of CLASS_IDS) {
    const a = auditClass(cls, opts);
    out[cls] = a;
    console.log(
      `${cls.padEnd(10)} PA ${(100 * a.paUtil).toFixed(0)}% · PM ${(100 * a.pmUtil).toFixed(0)}% `
      + `· ${a.castsPerTurn.toFixed(2)} sorts/tour · tours passifs ${(100 * a.idleTurns).toFixed(0)}% `
      + `· sorts inutilisés: ${a.unusedSpells.join(',') || 'aucun'}`,
    );
  }
  return out;
}
