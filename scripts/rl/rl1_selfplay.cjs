#!/usr/bin/env node
// RL1 (docs/selfplay-rl1.md) — worker de self-play. Joue N parties CRA miroir où la
// politique APPRENANTE (rl1_policy.cjs, échantillonnée à --temp) affronte un adversaire
// tiré dans --mix:
//   self   = l'apprenant des deux côtés (les deux camps sont enregistrés)
//   pool   = une version passée (--pool, échantillonnée à --temp)
//   clone0 = le clone de départ (--clone0) en argmax: l'ancre fixe
//   maison = l'IA Maison
//   c1     = C1, le champion recherche (fc=1+rv=1+b=1200+h=1, réglé et remis à zéro
//            autour de CHAQUE décision, comme calc_duel.cjs) — évaluation seulement
// Niveau (--lk) et carte (arène 60 %, 4 autres 10 % chacune, comme loop 1) tirés par
// partie. Écrit, par décision de l'apprenant: OUT.obs.f16 (obs v3), OUT.mask.bin
// (actions légales, MASK_BYTES bits), OUT.act.u32 (indice joué); par épisode (un camp
// d'une partie, décisions contiguës): une ligne de OUT.ep.jsonl; à la fin OUT.done.json.
// OUT.phi.f32: potentiel Φ = PV(moi) − PV(lui) en fraction, à chaque décision de l'apprenant
// (façonnage à potentiel, RL3). --pool accepte des poids: DIR@w (défaut 1) → tirage pondéré (PFSP).
// Récompense = issue (±1, nul 0) + --margin × (PV restants moi − lui, en fraction).
//   CLONE_ORT=1 node scripts/rl/rl1_selfplay.cjs --learner DIR --out PREFIX --games N --seed S
//     [--temp 1] [--margin 0] [--mix self:0.5,pool:0.3,clone0:0.1,maison:0.1]
//     [--pool DIR1,DIR2] [--clone0 DIR] [--lk l100,l200gear] [--search K]
// --search K (RL2): l'apprenant joue le choix de l'opérateur de recherche rl2_search.cjs
// sur ses K meilleures actions (l'indice enregistré = ce choix: cible Expert Iteration).
// --label-p P --label-k K (RL2 boucle): à une décision de l'apprenant sur P (au hasard), la
// recherche évalue K candidats tirés en Gumbel-top-k; cible améliorée π' = softmax(logit +
// 50·q̂), q̂ = (Q + 1000)/2000, écrite dans OUT.tgt.jsonl; l'action JOUÉE reste celle du réseau.
require('../ai_runtime.cjs');
const fs = require('node:fs');
const { createGame, applyAction, getView, currentFighter } = require('../../src/engine/engine');
const { createRng, hashSeed } = require('../../src/engine/rng');
const { makeBotApi, stateFromView } = require('../../src/bots/api');
const sb = require('./search_bot.cjs');
const { encodeF16 } = require('./f16.cjs');
const { makeSampler, packMask } = require('./rl1_policy.cjs');
const { makeSearcher } = require('./rl2_search.cjs');

const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : def; };
const LEARNER = arg('learner'); const OUT = arg('out'); const GAMES = Number(arg('games', 16));
const SEED = arg('seed', '0'); const TEMP = Number(arg('temp', 1)); const MARGIN = Number(arg('margin', 0));
const POOL_W = String(arg('pool', '')).split(',').filter(Boolean).map((x) => { const i = x.lastIndexOf('@'); return i > 0 ? [x.slice(0, i), Number(x.slice(i + 1))] : [x, 1]; });
const POOL = POOL_W.map(([d]) => d); const POOL_SUM = POOL_W.reduce((t, [, w]) => t + w, 0); const CLONE0 = arg('clone0', null);
for (const [d, w] of POOL_W) if (!(w > 0)) die(`--pool poids invalide: ${d}@${w}`);
const LKS = String(arg('lk', 'l100,l200gear')).split(',');
const SEARCH = Number(arg('search', 0));
const LABEL_P = Number(arg('label-p', 0)); const LABEL_K = Number(arg('label-k', 8));
const C1_LK = arg('c1-lk', null); // niveau imposé aux parties contre C1 (ex. l100)
const LABEL_LK = arg('label-lk', null); // étiquettes de recherche seulement à ce niveau (coût: l200 ≈ 8× l100)
if (C1_LK && !sb.LOADOUTS[C1_LK]) die(`--c1-lk inconnu: ${C1_LK}`);
const MIX = String(arg('mix', 'self:1')).split(',').map((kv) => { const [k, v] = kv.split(':'); return [k, Number(v)]; });
const die = (m) => { console.error(m); process.exit(1); };
if (!LEARNER || !OUT) die('usage: --learner DIR --out PREFIX [--games N --seed S --temp T --margin C --mix k:p,… --pool D1,D2 --clone0 DIR --lk l100,l200gear]');
for (const [k, p] of MIX) if (!['self', 'pool', 'clone0', 'maison', 'c1'].includes(k) || !(p >= 0)) die(`--mix invalide: ${k}:${p}`);
if (MIX.some(([k, p]) => k === 'pool' && p > 0) && !POOL.length) die('--mix pool sans --pool');
if (MIX.some(([k, p]) => k === 'clone0' && p > 0) && !CLONE0) die('--mix clone0 sans --clone0');
for (const lk of LKS) if (!sb.LOADOUTS[lk]) die(`--lk inconnu: ${lk}`);
const MIX_SUM = MIX.reduce((s, [, p]) => s + p, 0);
const MAPS_OTHER = ['muraille', 'canyon', 'amakna_1571', 'territoire_des_dopeuls_5383'];
const PASS = { type: 'PASS' };

const learner = makeSampler(LEARNER);
const searcher = SEARCH > 0 || LABEL_P > 0 ? makeSearcher(learner, { seed: `rl2:${SEED}` }) : null;
const lrng = createRng(hashSeed(`rl2l:${SEED}`));
const opponents = new Map();
const opponent = (dir) => { if (!opponents.has(dir)) opponents.set(dir, makeSampler(dir)); return opponents.get(dir); };
const fd = { obs: fs.openSync(`${OUT}.obs.f16`, 'w'), mask: fs.openSync(`${OUT}.mask.bin`, 'w'),
  act: fs.openSync(`${OUT}.act.u32`, 'w'), ep: fs.openSync(`${OUT}.ep.jsonl`, 'w'), phi: fs.openSync(`${OUT}.phi.f32`, 'w'),
  tgt: fs.openSync(`${OUT}.tgt.jsonl`, 'w') };
const rng = createRng(hashSeed(`rl1:${SEED}`));
const o16 = new Uint16Array(learner.buf.length);
const tally = { games: 0, steps: 0, invalid: 0, learnerMs: 0, learnerDec: 0, c1Ms: 0, c1Dec: 0, byKind: {} };
const c1Counters = { applies: 0, ms: 0, decisions: 0, endsSum: 0, invalid: 0 };
let step = 0;
const t0 = Date.now();

// Parties APPARIÉES: g pair et g+1 partagent graine, niveau, carte et adversaire, sièges
// inversés (comme calc_duel) — les portes en argmax se lisent alors par paires.
let pair = null;
for (let g = 0; g < GAMES; g++) {
  if (g % 2 === 0) {
    const lk = LKS[Math.floor(rng.next() * LKS.length)];
    const map = rng.next() < 0.6 ? 'arene' : MAPS_OTHER[Math.floor(rng.next() * MAPS_OTHER.length)];
    let u = rng.next() * MIX_SUM; let kind = MIX[MIX.length - 1][0];
    for (const [k, p] of MIX) { if (u < p) { kind = k; break; } u -= p; }
    let oppDir = kind === 'clone0' ? CLONE0 : null;
    if (kind === 'pool') { let w = rng.next() * POOL_SUM; oppDir = POOL_W[POOL_W.length - 1][0]; for (const [d, x] of POOL_W) { if (w < x) { oppDir = d; break; } w -= x; } }
    pair = { lk: kind === 'c1' && C1_LK ? C1_LK : lk, map, kind, oppDir, seed: hashSeed(`rl1g:${SEED}:${g >> 1}`) };
  }
  const { lk, map, kind, oppDir, seed } = pair;
  const learnerSide = g % 2 === 0 ? 'A' : 'B';
  const recorded = kind === 'self' ? ['A', 'B'] : [learnerSide];
  const srng = createRng(hashSeed(`rl1s:${SEED}:${g}`));
  const rand = () => srng.next();
  let { state } = createGame({ mapId: map, seed, fighters: sb.makeFighters(lk, 'CRA', 'CRA') });
  const rngs = {}; const steps = { A: [], B: [] };
  let guard = 0; let inv = 0;
  while (!state.over && guard++ < 800) {
    const actor = currentFighter(state);
    const view = getView(state, actor.id);
    const api = makeBotApi(view, rngs[actor.id] ||= createRng(hashSeed(`m:${seed}:${actor.id}`)));
    let action;
    if (recorded.includes(actor.id)) {
      const ta = Date.now();
      const lab = LABEL_P > 0 && (!LABEL_LK || lk === LABEL_LK) && lrng.next() < LABEL_P;
      const d = learner(view, api, rand, TEMP, lab ? LABEL_K : SEARCH, lab ? () => lrng.next() : null);
      encodeF16(learner.buf, o16); // obs de la RACINE, avant les simulations de la recherche
      const obs = Buffer.from(new Uint16Array(o16).buffer);
      let tgt = null;
      if (lab && d.top.length > 1) {
        const r = searcher(view, d.top);
        const z = d.top.map((c, i) => (Number.isFinite(r.q[i]) ? c.logit + 50 * (r.q[i] + 1000) / 2000 : -Infinity));
        const mx = Math.max(...z); const w = z.map((x) => Math.exp(x - mx)); const sw = w.reduce((t, x) => t + x, 0);
        tgt = { labels: d.top.map((c) => c.label), probs: w.map((x) => +(x / sw).toFixed(6)) };
        tally.labels = (tally.labels || 0) + 1;
      }
      const pick = searcher && !lab && SEARCH > 0 && d.top.length > 1 ? searcher(view, d.top) : d;
      tally.learnerMs += Date.now() - ta; tally.learnerDec++;
      const opp = Object.values(state.fighters).find((f) => f.team !== actor.team && f.leader);
      const phi = Math.max(0, actor.hp) / actor.maxHp - (opp ? Math.max(0, opp.hp) / opp.maxHp : 0);
      steps[actor.id].push({ obs, mask: packMask(d.legal), label: pick.label, phi, tgt });
      action = pick.action;
    } else if (kind === 'c1' && (actor.id === 'A' || actor.id === 'B')) {
      const tc = Date.now();
      sb.setBudget(1200); sb.setFastCasts(true); sb.setHorizon(1);
      try { action = sb.searchDecide(stateFromView(getView(state, actor.id)), c1Counters) || PASS; } catch { action = PASS; }
      sb.setBudget(null); sb.setFastCasts(false); sb.setHorizon(null);
      tally.c1Ms += Date.now() - tc; tally.c1Dec++;
    } else if (kind === 'maison' || (actor.id !== 'A' && actor.id !== 'B')) {
      try { action = api.maison() || PASS; } catch { action = PASS; }
    } else {
      action = opponent(oppDir)(view, api, rand, kind === 'clone0' ? 0 : TEMP).action;
    }
    const r = applyAction(state, action);
    if (!r.ok) { inv++; state = applyAction(state, PASS).state; continue; }
    state = r.state;
  }
  for (const side of recorded) {
    const me = state.fighters[side]; const op = state.fighters[side === 'A' ? 'B' : 'A'];
    const outcome = !state.over || state.winner == null ? 0 : state.winner === me.team ? 1 : -1;
    const margin = Math.max(0, me.hp) / me.maxHp - Math.max(0, op.hp) / op.maxHp;
    const list = steps[side];
    for (const s of list) {
      fs.writeSync(fd.obs, s.obs); fs.writeSync(fd.mask, s.mask);
      fs.writeSync(fd.act, Buffer.from(new Uint32Array([s.label]).buffer));
      fs.writeSync(fd.phi, Buffer.from(new Float32Array([s.phi]).buffer));
      if (s.tgt) fs.writeSync(fd.tgt, JSON.stringify({ step: step + list.indexOf(s), ...s.tgt }) + '\n');
    }
    fs.writeSync(fd.ep, JSON.stringify({ start: step, steps: list.length, reward: outcome + MARGIN * margin, outcome,
      margin: +margin.toFixed(4), kind, opp: oppDir, lk, map, side, game: g, turns: state.turn, over: state.over, inv }) + '\n');
    step += list.length;
    const t = (tally.byKind[kind] ||= { n: 0, win: 0, draw: 0 });
    t.n++; if (outcome > 0) t.win++; else if (outcome === 0) t.draw++;
  }
  tally.games++; tally.invalid += inv;
}
tally.steps = step;
fs.writeFileSync(`${OUT}.done.json`, JSON.stringify({ ...tally, learner: LEARNER, seed: SEED, temp: TEMP, margin: MARGIN,
  mix: Object.fromEntries(MIX), lk: LKS, search: SEARCH, wallSec: (Date.now() - t0) / 1000,
  msPerLearnerDecision: +(tally.learnerMs / Math.max(1, tally.learnerDec)).toFixed(2) }));
for (const f of Object.values(fd)) fs.closeSync(f);
