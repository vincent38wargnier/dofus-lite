// Banc maison2 vs maison — grille de classes, graines appariées, sièges
// alternés. Chaque spec de jeu (clsA, clsB, seed, map) est jouée deux fois:
// maison2 pilote le siège A puis le siège B, pour neutraliser le biais
// d'initiative mesuré (58/42).
//
//   node scripts/rl/maison2_bench.cjs run --pairs 0-77 --games 4 \
//     --lk l100 --out local-observations/rl/maison2/g1-s0.jsonl
//   node scripts/rl/maison2_bench.cjs summary local-observations/rl/maison2/g1
require('../ai_runtime.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { createGame, applyAction, getView, currentFighter } = require('../../src/engine/engine');
const { createRng, hashSeed } = require('../../src/engine/rng');
const { makeBotApi } = require('../../src/bots/api');
const { maison2Decide } = require('../../src/bots/maison2');
const sb = require('./search_bot.cjs');

const MAPS = ['arene', 'muraille', 'canyon', 'amakna_1571', 'territoire_des_dopeuls_5383'];
const CLASSES = ['IOP', 'CRA', 'SACRIEUR', 'SRAM', 'XELOR', 'ENUTROF', 'SADIDA',
  'OSAMODAS', 'PANDAWA', 'ECAFLIP', 'FECA', 'ENIRIPSA'];
const MAX_ACTIONS = 800;

// 78 paires non ordonnées (miroirs inclus), ordre stable.
const PAIRS = [];
for (let i = 0; i < CLASSES.length; i++) for (let j = i; j < CLASSES.length; j++) {
  PAIRS.push([CLASSES[i], CLASSES[j]]);
}

function playGame(clsA, clsB, seed, map, lk, m2Seat) {
  let { state } = createGame({ mapId: map, seed, fighters: sb.makeFighters(lk, clsA, clsB) });
  const rngs = {};
  let guard = 0;
  let invalid = 0;
  while (!state.over && guard++ < MAX_ACTIONS) {
    const actor = currentFighter(state);
    const view = getView(state, actor.id);
    const api = makeBotApi(view, rngs[actor.id] ||= createRng(hashSeed(`m2b:${seed}:${actor.id}`)));
    let action;
    try {
      action = actor.id === m2Seat ? maison2Decide(view, api) : (api.maison() || { type: 'PASS' });
    } catch { action = { type: 'PASS' }; }
    const r = applyAction(state, action || { type: 'PASS' });
    if (!r.ok) { invalid++; state = applyAction(state, { type: 'PASS' }).state; }
    else state = r.state;
  }
  return { winner: state.over ? state.winner : null, turns: state.turn, invalid, aborted: !state.over };
}

async function run() {
  const args = {};
  for (let i = 3; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
  const [p0, p1] = (args.pairs || `0-${PAIRS.length - 1}`).split('-').map(Number);
  const games = Number(args.games || 4);
  const lk = args.lk || 'l100';
  const out = args.out;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const stream = fs.createWriteStream(out);
  const t0 = Date.now();
  let done = 0, w = 0, l = 0, d = 0;
  for (let p = p0; p <= Math.min(p1, PAIRS.length - 1); p++) {
    const [cA, cB] = PAIRS[p];
    for (let g = 0; g < games; g++) {
      const seed = hashSeed(`m2bench:${lk}:${cA}:${cB}:${g}`);
      const map = MAPS[(p + g) % MAPS.length];
      for (const m2Seat of ['A', 'B']) {
        const r = playGame(cA, cB, seed, map, lk, m2Seat);
        const m2Class = m2Seat === 'A' ? cA : cB;
        const oppClass = m2Seat === 'A' ? cB : cA;
        const res = r.winner == null ? 'D' : r.winner === m2Seat ? 'W' : 'L';
        if (res === 'W') w++; else if (res === 'L') l++; else d++;
        done++;
        stream.write(JSON.stringify({ pair: p, cA, cB, m2Seat, m2Class, oppClass,
          seed, map, lk, res, turns: r.turns, invalid: r.invalid, aborted: r.aborted }) + '\n');
      }
    }
    console.log(JSON.stringify({ pair: p, cA, cB, done, w, l, d,
      sPerGame: ((Date.now() - t0) / 1000 / done).toFixed(2) }));
  }
  stream.end();
  console.log(JSON.stringify({ final: true, done, w, l, d }));
}

function summary() {
  const prefix = process.argv[3];
  const dir = path.dirname(prefix);
  const base = path.basename(prefix);
  const rows = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.startsWith(base) || !f.endsWith('.jsonl')) continue;
    for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
      if (line.trim()) rows.push(JSON.parse(line));
    }
  }
  const agg = {}; // par classe pilotée par maison2
  let w = 0, l = 0, d = 0, inv = 0, ab = 0;
  for (const r of rows) {
    const a = agg[r.m2Class] ||= { w: 0, l: 0, d: 0, n: 0 };
    a.n++; a[r.res.toLowerCase()]++;
    if (r.res === 'W') w++; else if (r.res === 'L') l++; else d++;
    inv += r.invalid; ab += r.aborted ? 1 : 0;
  }
  console.log(`maison2 vs maison — ${rows.length} jeux: ${w}W ${l}L ${d}D ` +
    `(${(100 * w / Math.max(1, w + l)).toFixed(1)}% hors nuls), invalides=${inv}, aborts=${ab}`);
  for (const c of CLASSES) {
    const a = agg[c]; if (!a) continue;
    console.log(`  ${c.padEnd(9)} ${String(a.w).padStart(3)}W ${String(a.l).padStart(3)}L ${String(a.d).padStart(2)}D  (${(100 * a.w / Math.max(1, a.w + a.l)).toFixed(0)}%)`);
  }
  // Pires paires (où maison2 perd le plus)
  const byPair = {};
  for (const r of rows) {
    const k = `${r.m2Class}>vs>${r.oppClass}`;
    const a = byPair[k] ||= { w: 0, l: 0 };
    if (r.res === 'W') a.w++; else if (r.res === 'L') a.l++;
  }
  const worst = Object.entries(byPair).filter(([, a]) => a.l > a.w)
    .sort((x, y) => (y[1].l - y[1].w) - (x[1].l - x[1].w)).slice(0, 10);
  if (worst.length) console.log('pires cellules: ' + worst.map(([k, a]) => `${k} ${a.w}W-${a.l}L`).join(' | '));
}

if (process.argv[2] === 'run') run();
else if (process.argv[2] === 'summary') summary();
else console.log('usage: run --pairs a-b --games N --lk l100 --out FILE | summary PREFIX');
