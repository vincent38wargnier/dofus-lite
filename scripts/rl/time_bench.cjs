// Banc de TEMPS figé (équivalent du `bench` de Stockfish) pour la parité de
// temps des duels loop 1: mêmes positions, chaque config chronométrée en
// ALTERNANCE avec la référence C1 (ordre inversé une position sur deux: la
// dérive de charge du Mac s'annule), dans le même process.
//   node scripts/rl/time_bench.cjs build LK [P=60]          # fige P positions (parties C1 vs C1)
//   node scripts/rl/time_bench.cjs time LK SPEC [REF_SPEC]  # rapport ms/décision SPEC ÷ REF
// SPEC = clés calc_duel: b=N, fc=1, h=N, k=N, f=N, net=DIR, nm=prelim|full (REF défaut: C1)
require('../ai_runtime.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { createGame, applyAction, getView, currentFighter } = require('../../src/engine/engine');
const { hashSeed } = require('../../src/engine/rng');
const { stateFromView } = require('../../src/bots/api');
const sb = require('./search_bot.cjs');

const DIR = path.join(__dirname, '../../local-observations/rl/loop1');
const C1 = 'fc=1+b=1200+h=1';
const [, , mode, LK, a3, a4] = process.argv;
const posFile = (lk) => path.join(DIR, `bench-positions-${lk}.jsonl`);

function parse(spec) {
  const o = { b: null, fc: false, h: null, k: null, f: null, net: null, nm: 'prelim' };
  for (const kv of spec.split('+')) {
    const [k, v] = kv.split('=');
    if (!(k in o)) { console.error(`clé inconnue ${k}`); process.exit(1); }
    o[k] = k === 'fc' ? v === '1' : ['net', 'nm'].includes(k) ? v : Number(v);
  }
  if (o.net) o.netJudge = { model: require('./value_net.cjs').loadValueOrt(o.net), mode: o.nm };
  return o;
}
function run(o, state, counters) {
  sb.setBudget(o.b); sb.setFastCasts(o.fc); sb.setHorizon(o.h); sb.setSampling({ samples: o.k, finalists: o.f });
  sb.setNetJudge(o.netJudge || null);
  try { return sb.searchDecide(state, counters); } finally {
    sb.setBudget(null); sb.setFastCasts(false); sb.setHorizon(null); sb.setSampling(); sb.setNetJudge(null);
  }
}

if (mode === 'build') {
  const P = Number(a3 || 60);
  fs.mkdirSync(DIR, { recursive: true });
  const c1 = parse(C1);
  const out = [];
  for (let g = 0; out.length < P && g < 200; g++) {
    let { state } = createGame({ mapId: 'arene', seed: hashSeed(`tb:${LK}:${g}`), fighters: sb.makeFighters(LK, 'CRA', 'CRA') });
    let k = 0; let guard = 0;
    while (!state.over && guard++ < 800 && out.length < P) {
      const st = stateFromView(getView(state, currentFighter(state).id));
      if (k++ % 3 === 0) out.push(JSON.stringify(st)); // 1 décision sur 3: positions variées
      const a = run(c1, st, { applies: 0, ms: 0, decisions: 0, endsSum: 0, invalid: 0 }) || { type: 'PASS' };
      const r = applyAction(state, a);
      state = r.ok ? r.state : applyAction(state, { type: 'PASS' }).state;
    }
  }
  fs.writeFileSync(posFile(LK), out.join('\n') + '\n');
  console.log(JSON.stringify({ built: posFile(LK), positions: out.length }));
} else if (mode === 'time') {
  const X = parse(a3); const R = parse(a4 || C1);
  const pos = fs.readFileSync(posFile(LK), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  run(X, pos[0], { applies: 0, ms: 0, decisions: 0, endsSum: 0, invalid: 0 }); // chauffe (session ONNX, JIT)
  run(R, pos[0], { applies: 0, ms: 0, decisions: 0, endsSum: 0, invalid: 0 });
  const cx = { applies: 0, ms: 0, decisions: 0, endsSum: 0, invalid: 0 };
  const cr = { applies: 0, ms: 0, decisions: 0, endsSum: 0, invalid: 0 };
  const ratios = [];
  pos.forEach((st, i) => {
    const mx0 = cx.ms; const mr0 = cr.ms;
    if (i % 2 === 0) { run(X, st, cx); run(R, st, cr); } else { run(R, st, cr); run(X, st, cx); }
    ratios.push((cx.ms - mx0) / Math.max(1e-6, cr.ms - mr0));
  });
  ratios.sort((p, q) => p - q);
  console.log(JSON.stringify({ lk: LK, spec: a3, ref: a4 || C1, positions: pos.length,
    msX: +(cx.ms / cx.decisions).toFixed(1), msRef: +(cr.ms / cr.decisions).toFixed(1),
    ratioOfMeans: +(cx.ms / cr.ms).toFixed(3), medianRatio: +ratios[Math.floor(ratios.length / 2)].toFixed(3),
    netEvalsPerDec: cx.netEvals ? +(cx.netEvals / cx.decisions).toFixed(1) : 0 }));
} else {
  console.log('usage: build LK [P] | time LK SPEC [REF_SPEC]');
}
