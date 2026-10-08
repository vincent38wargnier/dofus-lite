// Round-robin tournament: every bot meets every other bot twice
// (sides and maps swapped). Win 3 pts, draw 1 pt.

import { runMatch } from './runner';
import { hashSeed } from '../engine/rng';
import { MAP_IDS } from '../engine/maps';

export function runTournament(entries, { seedBase = 42, roundsPerPair = 2 } = {}) {
  // entries: [{ id, name, decide, classId }]
  const matches = [];
  const table = {};
  for (const e of entries) {
    table[e.id] = {
      id: e.id, name: e.name, classId: e.classId,
      played: 0, wins: 0, draws: 0, losses: 0, points: 0, hpDiff: 0,
    };
  }

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      for (let r = 0; r < roundsPerPair; r++) {
        const home = r % 2 === 0 ? entries[i] : entries[j];
        const away = r % 2 === 0 ? entries[j] : entries[i];
        const mapId = MAP_IDS[(i + j + r) % MAP_IDS.length];
        const seed = hashSeed(`${seedBase}:${home.id}:${away.id}:${r}`);

        const result = runMatch({
          bots: { A: { name: home.name, decide: home.decide }, B: { name: away.name, decide: away.decide } },
          classes: { A: home.classId, B: away.classId },
          mapId,
          seed,
          collectFrames: false,
        });

        const fighters = result.finalState.fighters;
        const hpA = fighters.A.hp / fighters.A.maxHp;
        const hpB = fighters.B.hp / fighters.B.maxHp;

        const rowA = table[home.id];
        const rowB = table[away.id];
        rowA.played += 1;
        rowB.played += 1;
        rowA.hpDiff += hpA - hpB;
        rowB.hpDiff += hpB - hpA;
        if (result.winner === 'A') {
          rowA.wins += 1; rowA.points += 3; rowB.losses += 1;
        } else if (result.winner === 'B') {
          rowB.wins += 1; rowB.points += 3; rowA.losses += 1;
        } else {
          rowA.draws += 1; rowB.draws += 1;
          rowA.points += 1; rowB.points += 1;
        }

        matches.push({
          home: home.name, away: away.name,
          homeId: home.id, awayId: away.id,
          homeClass: home.classId, awayClass: away.classId,
          winner: result.winner === 'A' ? home.name : result.winner === 'B' ? away.name : null,
          reason: result.endReason,
          turns: result.turns,
          mapId,
          seed,
        });
      }
    }
  }

  const standings = Object.values(table).sort(
    (a, b) => b.points - a.points || b.hpDiff - a.hpDiff || b.wins - a.wins,
  );
  return { standings, matches };
}
