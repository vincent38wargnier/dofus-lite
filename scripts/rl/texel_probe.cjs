#!/usr/bin/env node
// Audit du juge main (base audit B2, docs/selfplay-loop1.md): pour chaque RACINE de
// décision des shards loop 1 (début du tour du chercheur = même type d'état que la
// feuille de C1 après la riposte simulée), écrit les termes du juge main
// (heuristicLeaf de search_bot.cjs) + quelques features candidates, et l'issue réelle
// du match pour le chercheur. Lecture seule: aucun état n'est modifié.
//   node scripts/rl/texel_probe.cjs 'local-observations/rl/loop1/shards/*.meta.json' out.jsonl
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');
const sb = require('./search_bot.cjs');

const [pattern, outPath] = process.argv.slice(2);
if (!pattern || !outPath) { console.error('usage: texel_probe.cjs META_GLOB OUT.jsonl'); process.exit(1); }
const dir = path.dirname(pattern);
const re = new RegExp('^' + path.basename(pattern).replace(/[.]/g, '\\.').replace(/\*/g, '.*') + '$');
const metas = fs.readdirSync(dir).filter((f) => re.test(f)).sort();
fs.writeFileSync(outPath, '');
let nOut = 0; let nNoZ = 0;
for (const mf of metas) {
  const base = path.join(dir, mf.replace(/\.meta\.json$/, ''));
  const meta = JSON.parse(fs.readFileSync(`${base}.meta.json`, 'utf8'));
  const decs = fs.readFileSync(`${base}.dec.jsonl`, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const roots = zlib.gunzipSync(fs.readFileSync(`${base}.root.jsonl.gz`)).toString('utf8').split('\n').filter(Boolean);
  if (roots.length !== decs.length) throw new Error(`${base}: ${roots.length} racines pour ${decs.length} décisions`);
  // z (i8, par record) = issue pour le joueur AU TRAIT de l'après-état = l'adversaire du
  // chercheur; d (u32, par record) = indice de décision → issue du chercheur = −z.
  const z = new Int8Array(fs.readFileSync(`${base}.z.i8`).buffer.slice(0));
  const dRaw = fs.readFileSync(`${base}.d.u32`);
  const d = new Uint32Array(dRaw.buffer, dRaw.byteOffset, dRaw.length / 4);
  const zOf = new Map();
  for (let i = 0; i < d.length; i++) {
    const prev = zOf.get(d[i]);
    if (prev === undefined) zOf.set(d[i], z[i]);
    else if (prev !== z[i]) throw new Error(`${base}: z incohérent dans la décision ${d[i]}`);
  }
  const lines = [];
  for (let k = 0; k < decs.length; k++) {
    const dec = decs[k];
    const zz = zOf.get(dec.d);
    if (zz === undefined) { nNoZ++; continue; } // décision sans record (après-états tous terminaux)
    const s = JSON.parse(roots[k]);
    const me = s.fighters[dec.side];
    const opp = Object.values(s.fighters).find((f) => f.team !== me.team && f.leader);
    if (!me || !opp) continue;
    const counters = { applies: 0 };
    const mine = sb.damagePotential(s, me.id, counters);
    const theirs = sb.damagePotential(s, opp.id, counters);
    lines.push(JSON.stringify({
      shard: path.basename(base), g: dec.g, d: dec.d, side: dec.side, lk: meta.lk, map: dec.map, opp: dec.opp,
      expl: dec.expl || 0, turn: s.turn, outcome: -zz,
      hp: sb.hpScore(s, me.team) / 1000, mine, theirs, myHp: me.hp, oppHp: opp.hp, myMax: me.maxHp, oppMax: opp.maxHp,
      hand: sb.heuristicLeaf(s, me.id, me.team, { applies: 0 }),
      dist: Math.abs(me.pos.x - opp.pos.x) + Math.abs(me.pos.y - opp.pos.y),
    }));
  }
  fs.appendFileSync(outPath, lines.join('\n') + (lines.length ? '\n' : ''));
  nOut += lines.length;
}
console.log(JSON.stringify({ shards: metas.length, roots: nOut, skippedNoRecord: nNoZ }));
