// Loop 1 — générateur d'APRÈS-ÉTATS étiquetés par le champion C1 (auto-jeu).
//
// Après-état = position juste après MON tour (leur tour commencé, avant leur
// riposte) — le nœud « afterstate » des jeux stochastiques (Stochastic MuZero).
// Étiquette = le score que C1 calcule DÉJÀ pour cette position: une riposte
// maison simulée (h=1) puis le juge main, échelle ±1000 → y ∈ [−1, 1], exprimée
// pour le joueur AU TRAIT de l'après-état (l'adversaire du chercheur) — même
// convention que tous les réseaux de valeur précédents (encodeur V3, « you » =
// joueur au trait). Distillation façon NNUE: on apprend le verdict de la
// recherche, pas l'issue lointaine (z est gardé pour un mélange λ ultérieur).
//
// Enregistré à chaque décision de C1 (profil {budget 1200, fastCasts, h=1},
// planifie sur l'état reconstruit de la vue comme le jeu):
//  r=1 P  étape 1: chaque nominé, échantillon k=0 (gratuit)
//  r=2 F  finale: échantillons k≥1 des finalistes (gratuit)
//  r=3 R  fins énumérées tirées au hasard hors nominés (+1 riposte chacune) —
//         couvre la distribution qu'un crible verrait (tout l'énumération)
//  r=4 Q  (décisions GT seulement) rejeux k=1,2 des non-finalistes, SANS étiquette
// Décisions GT (shards de validation): chaque nominé reçoit --gt-k riposte(s)
// indépendantes → vérité terrain à faible bruit (cf. KataGo: recherches
// complètes seulement pour les positions mesurées), dans .dec.jsonl.
//
//   node scripts/rl/afterstate_gen.cjs --out DIR/shard --matches 40 --lk l100 \
//     --seed0 0 [--split auto|train|val] [--mix self:0.6,ingame:0.2,maison:0.2]
//     [--explore-p 0.15 --explore-turns 3] [--extra 6] [--gt-prob 0 --gt-k 16]
//     [--arena 0.6]
// Arrêt propre: touch DIR/STOP-loop1 → le shard se ferme après le match en cours.
require('../ai_runtime.cjs');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { execSync } = require('node:child_process');
const { createGame, applyAction, getView, currentFighter } = require('../../src/engine/engine');
const { createRng, hashSeed } = require('../../src/engine/rng');
const { makeBotApi, stateFromView } = require('../../src/bots/api');
const { makeSearchBrain } = require('../../src/bots/searchBrain');
const enc = require('./encoder.cjs');
const sb = require('./search_bot.cjs');
const { encodeF16 } = require('./f16.cjs');

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
const OUT = args.out;
const MATCHES = Number(args.matches || 40);
const LK = args.lk || 'l100';
const SEED0 = Number(args.seed0 || 0);
const SPLIT = args.split || 'auto';
const CLS = 'CRA';
const EXPLORE_P = Number(args['explore-p'] ?? 0.15);
const EXPLORE_TURNS = Number(args['explore-turns'] ?? 3);
const EXTRA = Number(args.extra ?? 6);
const GT_PROB = Number(args['gt-prob'] ?? 0);
const GT_K = Number(args['gt-k'] ?? 16);
const ARENA = Number(args.arena ?? 0.6);
const MIX = Object.fromEntries((args.mix || 'self:0.6,ingame:0.2,maison:0.2').split(',').map((kv) => {
  const [k, v] = kv.split(':'); return [k, Number(v)];
}));
if (!OUT) { console.error('--out requis'); process.exit(1); }
if (!sb.LOADOUTS[LK]) { console.error(`--lk inconnu: ${LK}`); process.exit(1); }
if (!['auto', 'train', 'val'].includes(SPLIT)) { console.error(`--split: auto|train|val`); process.exit(1); }
for (const k of Object.keys(MIX)) if (!['self', 'ingame', 'maison'].includes(k)) { console.error(`--mix: clé ${k}`); process.exit(1); }
const mixTotal = Object.values(MIX).reduce((a, b) => a + b, 0);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const STOP = path.join(path.dirname(OUT), 'STOP-loop1');

// Champion C1 (record du 2026-10-14) = spec calc_duel `fc=1+rv=1+b=1200+h=1`.
const C1 = { budget: 1200, fastCasts: true, horizon: 1, rebuiltState: true };
const applyC1 = () => { sb.setBudget(C1.budget); sb.setFastCasts(true); sb.setSampling({}); sb.setHorizon(C1.horizon);
  sb.setRolloutPolicy(null); sb.setNominatorPolicy(null); sb.setReplySet(null); };
const resetC1 = () => { sb.setBudget(null); sb.setFastCasts(false); sb.setSampling(); sb.setHorizon(null); };
// Adversaire « ingame » = le VRAI Stratège du jeu (garde-fou: profil inchangé).
const INGAME_PROFILE = { budget: 600, fastCasts: true };
if (!fs.readFileSync(require.resolve('../../src/bots/api.js'), 'utf8').includes('const WORKER_PROFILE = { budget: 600, fastCasts: true };')) {
  console.error('WORKER_PROFILE a changé dans src/bots/api.js — mettre INGAME_PROFILE à jour'); process.exit(1);
}
const ingameBrain = makeSearchBrain({ makeBotApi });
const MAPS_OTHER = ['muraille', 'canyon', 'amakna_1571', 'territoire_des_dopeuls_5383'];
const MAX_ACTIONS = 800;
const PASS = { type: 'PASS' };
const D = enc.OBS_DIM_V3;

const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, f))).digest('hex').slice(0, 16);
const provenance = {
  gitHead: (() => { try { return execSync('git rev-parse HEAD', { cwd: __dirname }).toString().trim(); } catch { return null; } })(),
  sha256: { 'search_bot.cjs': sha('search_bot.cjs'), 'encoder.cjs': sha('encoder.cjs'), 'afterstate_gen.cjs': sha('afterstate_gen.cjs'), 'f16.cjs': sha('f16.cjs') },
  node: process.version,
};

const streams = {};
for (const [k, ext] of [['x', 'x.f16'], ['y', 'y.f32'], ['z', 'z.i8'], ['g', 'g.u32'], ['d', 'd.u32'], ['r', 'r.u8'],
  ['k', 'k.u8'], ['n', 'n.u16'], ['v', 'v.u8'], ['dec', 'dec.jsonl']]) streams[k] = fs.createWriteStream(`${OUT}.${ext}`);
// États COMPLETS (JSON, gzip): ligne N ↔ record N (après-état), et racine de
// chaque décision ↔ ligne N de dec.jsonl — pour RÉ-ÉTIQUETER plus tard avec une
// recherche améliorée (NNUE « rescore », MuZero Reanalyse) sans rejouer.
const gz = {};
for (const [k, ext] of [['s', 's.jsonl.gz'], ['root', 'root.jsonl.gz']]) {
  const file = fs.createWriteStream(`${OUT}.${ext}`);
  const z = zlib.createGzip({ level: 6 });
  z.pipe(file);
  gz[k] = { z, file };
}
const writeChunk = (s, buf) => (s.write(buf) ? Promise.resolve() : new Promise((res) => s.once('drain', res)));

const stats = { records: 0, byRole: { 1: 0, 2: 0, 3: 0, 4: 0 }, terminalSkipped: 0, decisions: 0, gtDecisions: 0,
  explored: 0, invalid: 0 };
const f32 = new Float32Array(D);
function encodeAfter(after) {
  const toMove = currentFighter(after);
  const view = getView(after, toMove.id);
  enc.encodeSampleV3({ view, board: view.board }, null, f32);
  return { h16: encodeF16(f32, new Uint16Array(D)), toMove: toMove.team, js: JSON.stringify(after) };
}

// ---------------------------------------------------------------- enregistreur
const rec = {
  ctx: null, // { g, d, side, turn, matchRecs, isVal, gt }
  pending: [],
  onSample({ x, k, after, v }) {
    if (after.over) { stats.terminalSkipped++; return; }
    const { h16, toMove, js } = encodeAfter(after);
    this.pending.push({ x, k, h16, y: -v / 1000, toMove, js });
  },
  onDecision({ root, rootKey, meId, myTeam, ends, nominees, prelim, finalists, best, judge }) {
    const c = this.ctx;
    const idxOf = new Map(nominees.map((x, i) => [x, i]));
    const push = (role, k, n, h16, y, toMove, js) => {
      c.matchRecs.push({ role, k, n, h16, y, toMove, d: c.d, js });
      stats.byRole[role]++;
    };
    for (const p of this.pending) push(p.k === 0 ? 1 : 2, p.k, idxOf.has(p.x) ? idxOf.get(p.x) : 65535, p.h16, p.y, p.toMove, p.js);
    this.pending = [];
    const scratch = { applies: 0 };
    // R: fins énumérées tirées au hasard HORS nominés, étiquetées par la MÊME
    // évaluation (1 riposte) — flux dédié, après le choix: n'influe sur rien.
    if (EXTRA > 0) {
      const nomEnds = new Set(nominees.map((x) => x.e));
      const pool = ends.filter((e) => !nomEnds.has(e) && !e.state.over);
      const xr = createRng(hashSeed(`xr:${rootKey}`));
      for (let j = 0; j < Math.min(EXTRA, pool.length); j++) {
        const pick = j + Math.floor(xr.next() * (pool.length - j));
        [pool[j], pool[pick]] = [pool[pick], pool[j]];
        const cap = {};
        const v = sb.depth2Score(pool[j].state, meId, myTeam, scratch, judge, cap);
        if (cap.after.over) { stats.terminalSkipped++; continue; }
        const { h16, toMove, js } = encodeAfter(cap.after);
        push(3, 0, 65535, h16, -v / 1000, toMove, js);
      }
    }
    // Résumé de la décision (classement du prof: s0 = 1 échantillon, s3 = finale).
    const bestKey = best ? JSON.stringify(best.acts) : null;
    const chosen = nominees.findIndex((x) => JSON.stringify(x.e.acts) === bestKey);
    const line = { d: c.d, g: c.g, side: meId, turn: c.turn, nNom: nominees.length, nEnds: ends.length, chosen,
      s0: prelim.map((p) => [idxOf.get(p.x), Math.round(p.s0)]),
      s3: finalists.map((f) => [idxOf.get(f.x), f.s3 == null ? null : Math.round(f.s3)]) };
    // GT: vérité terrain à K élevé pour CHAQUE nominé (flux indépendants), et
    // après-états k=1,2 des non-finalistes (r=4, sans étiquette) pour évaluer
    // hors-ligne un juge appris sur EXACTEMENT les états que la recherche verrait.
    if (c.gt) {
      stats.gtDecisions++;
      const finSet = new Set(finalists.map((f) => f.x));
      const leaf = (k) => createRng(hashSeed(`leaf:${rootKey}:${k}`)).getState();
      line.gt = [];
      for (const x of nominees) {
        const n = idxOf.get(x);
        if (!finSet.has(x)) {
          for (let k = 1; k < 3; k++) {
            let st = sb.replayPlan(root, x.e.acts, leaf(k), meId, scratch);
            if (!st.over && currentFighter(st).id === meId) st = applyAction(st, PASS).state;
            if (st.over) continue;
            const { h16, toMove, js } = encodeAfter(st);
            push(4, k, n, h16, NaN, toMove, js);
          }
        }
        const vals = [];
        for (let j = 0; j < GT_K; j++) {
          const st = sb.replayPlan(root, x.e.acts, createRng(hashSeed(`gt:${rootKey}:${j}`)).getState(), meId, scratch);
          vals.push(sb.depth2Score(st, meId, myTeam, scratch, judge));
        }
        // Échantillons BRUTS (pas seulement la moyenne): l'évaluation hors-ligne
        // simule une finale à 3 échantillons sur les 3 premiers et mesure le
        // regret sur les AUTRES — jamais sur ceux qui ont servi à choisir.
        line.gt.push([n, vals.map((v) => Math.round(v))]);
      }
    }
    c.decLines.push(line);
    c.rootLines.push(JSON.stringify(root));
    stats.decisions++;
  },
};

// ---------------------------------------------------------------- matchs
async function main() {
  const t0 = Date.now();
  const res = { self: { games: 0 }, ingame: { games: 0, c1Wins: 0 }, maison: { games: 0, c1Wins: 0 } };
  let aborts = 0;
  let matchesDone = 0;
  let stoppedEarly = false;
  for (let i = 0; i < MATCHES; i++) {
    if (fs.existsSync(STOP)) { stoppedEarly = true; break; }
    const gid = SEED0 + i;
    const uid = hashSeed(`ag:${LK}:${gid}`);
    const mrng = createRng(hashSeed(`agm:${uid}`));
    const isVal = SPLIT === 'val' ? true : SPLIT === 'train' ? false : uid % 17 === 0;
    const map = mrng.next() < ARENA ? 'arene' : MAPS_OTHER[Math.floor(mrng.next() * MAPS_OTHER.length)];
    let u = mrng.next() * mixTotal;
    let opp = 'self';
    for (const [k, w] of Object.entries(MIX)) { if (u < w) { opp = k; break; } u -= w; }
    const c1Seat = i % 2 === 0 ? 'A' : 'B';
    const isC1 = (id) => opp === 'self' || id === c1Seat;
    let { state } = createGame({ mapId: map, seed: uid, fighters: sb.makeFighters(LK, CLS, CLS) });
    const counters = { A: { applies: 0, ms: 0, decisions: 0, endsSum: 0, invalid: 0 },
      B: { applies: 0, ms: 0, decisions: 0, endsSum: 0, invalid: 0 } };
    const rngs = {};
    const exRng = createRng(hashSeed(`ex:${uid}`));
    const gtRng = createRng(hashSeed(`gtp:${uid}`));
    const matchRecs = [];
    const decLines = [];
    const rootLines = [];
    let explored = 0;
    let guard = 0;
    while (!state.over && guard++ < MAX_ACTIONS) {
      const actor = currentFighter(state);
      const view = getView(state, actor.id);
      let action;
      if (isC1(actor.id)) {
        rec.ctx = { g: gid, d: stats.decisions, side: actor.id, turn: state.turn, matchRecs, decLines, rootLines,
          isVal, gt: isVal && GT_PROB > 0 && gtRng.next() < GT_PROB }; // GT = parties de VALIDATION seulement
        rec.pending = [];
        const msBefore = counters[actor.id].ms;
        counters[actor.id].candidates = null;
        sb.setAfterstateHook(rec); applyC1();
        try {
          action = sb.searchDecide(stateFromView(view), counters[actor.id]) || PASS;
        } finally { resetC1(); sb.setAfterstateHook(null); }
        const last = decLines[decLines.length - 1];
        if (last) last.ms = Math.round(counters[actor.id].ms - msBefore);
        // Ouvertures variées (pratique « coups aléatoires en début de partie »):
        // aux EXPLORE_TURNS premiers tours, avec proba EXPLORE_P on joue un des
        // 3 meilleurs finalistes au hasard. Les étiquettes (verdicts de recherche)
        // restent valides; seule l'issue z en est marquée (flag expl).
        if (EXPLORE_P > 0 && state.turn <= EXPLORE_TURNS && exRng.next() < EXPLORE_P) {
          const fin = (counters[actor.id].candidates || []).filter((x) => x.s3 != null).sort((a, b) => b.s3 - a.s3).slice(0, 3);
          if (fin.length > 1) {
            action = fin[Math.floor(exRng.next() * fin.length)].a;
            explored++; stats.explored++;
            if (last) last.expl = 1;
          }
        }
      } else if (opp === 'ingame') {
        action = ingameBrain.searchDecide(stateFromView(view), INGAME_PROFILE) || PASS;
      } else {
        const api = makeBotApi(view, rngs[actor.id] ||= createRng(hashSeed(`ag:${uid}:${actor.id}`)));
        try { action = api.maison() || PASS; } catch { action = PASS; }
      }
      const r = applyAction(state, action);
      if (!r.ok) stats.invalid++;
      state = r.ok ? r.state : applyAction(state, PASS).state;
    }
    if (!state.over) aborts++;
    const winner = state.over ? state.winner : null;
    res[opp].games++;
    if (opp !== 'self' && winner === c1Seat) res[opp].c1Wins++;
    // Écriture du match (backpressure réelle; manifest atomique en fin de shard).
    const n = matchRecs.length;
    const x = Buffer.alloc(n * D * 2); const y = Buffer.alloc(4 * n); const z = Buffer.alloc(n);
    const g = Buffer.alloc(4 * n); const dd = Buffer.alloc(4 * n); const rr = Buffer.alloc(n);
    const kk = Buffer.alloc(n); const nn = Buffer.alloc(2 * n); const vv = Buffer.alloc(n, isVal ? 1 : 0);
    matchRecs.forEach((m, j) => {
      Buffer.from(m.h16.buffer, m.h16.byteOffset, m.h16.byteLength).copy(x, j * D * 2);
      y.writeFloatLE(m.y, 4 * j);
      z.writeInt8(winner == null ? 0 : winner === m.toMove ? 1 : -1, j);
      g.writeUInt32LE(gid, 4 * j); dd.writeUInt32LE(m.d, 4 * j);
      rr.writeUInt8(m.role, j); kk.writeUInt8(m.k, j); nn.writeUInt16LE(m.n, 2 * j);
    });
    for (const L of decLines) { L.lk = LK; L.map = map; L.opp = opp; L.val = isVal ? 1 : 0; L.winner = winner; }
    await writeChunk(streams.x, x); await writeChunk(streams.y, y); await writeChunk(streams.z, z);
    await writeChunk(streams.g, g); await writeChunk(streams.d, dd); await writeChunk(streams.r, rr);
    await writeChunk(streams.k, kk); await writeChunk(streams.n, nn); await writeChunk(streams.v, vv);
    if (decLines.length) await writeChunk(streams.dec, Buffer.from(decLines.map((L) => JSON.stringify(L)).join('\n') + '\n'));
    if (n) await writeChunk(gz.s.z, Buffer.from(matchRecs.map((m) => m.js).join('\n') + '\n'));
    if (rootLines.length) await writeChunk(gz.root.z, Buffer.from(rootLines.join('\n') + '\n'));
    stats.records += n;
    matchesDone++;
    console.log(JSON.stringify({ done: matchesDone, opp, map, winner, turns: state.turn, recs: n, explored,
      records: stats.records, decisions: stats.decisions, gt: stats.gtDecisions,
      c1VsMaison: res.maison.games ? `${res.maison.c1Wins}/${res.maison.games}` : null,
      c1VsIngame: res.ingame.games ? `${res.ingame.c1Wins}/${res.ingame.games}` : null,
      sec: Math.round((Date.now() - t0) / 1000) }));
  }
  await Promise.all(Object.values(streams).map((s) => new Promise((r) => s.end(r))));
  await Promise.all(Object.values(gz).map(({ z, file }) => new Promise((r) => { file.on('finish', r); z.end(); })));
  const meta = {
    kind: 'afterstates-v1', featureVersion: enc.FEATURE_VERSION_V3, obsDim: D, dtype: 'f16',
    records: stats.records, matches: matchesDone, requestedMatches: MATCHES, stoppedEarly,
    lk: LK, cls: CLS, seed0: SEED0, split: SPLIT, valSplit: SPLIT === 'auto' ? 'uid%17==0' : SPLIT,
    mix: MIX, arenaShare: ARENA, mapsOther: MAPS_OTHER, explore: { p: EXPLORE_P, turns: EXPLORE_TURNS },
    extraRandomEnds: EXTRA, gt: { prob: GT_PROB, k: GT_K },
    champion: { ...C1, searchVersion: sb.SEARCH_VERSION, judge: 'heuristic' },
    labelDef: 'y = -(depth2Score C1)/1000: riposte maison simulée (h=1) puis juge main; perspective = joueur AU TRAIT de l après-état (adversaire du chercheur). NaN = rôle 4 (non étiqueté).',
    zDef: 'issue du match pour le joueur au trait de l après-état (+1/-1/0)',
    roles: { 1: 'P nominé k=0', 2: 'F finaliste k>=1', 3: 'R fin énumérée aléatoire', 4: 'Q rejeu GT non étiqueté' },
    states: 's.jsonl.gz (ligne N = après-état du record N), root.jsonl.gz (ligne N = racine de la décision N de dec.jsonl)',
    stats, results: res, aborts, provenance, wallSec: Math.round((Date.now() - t0) / 1000),
  };
  fs.writeFileSync(`${OUT}.meta.json.tmp`, JSON.stringify(meta));
  fs.renameSync(`${OUT}.meta.json.tmp`, `${OUT}.meta.json`);
  console.log(JSON.stringify({ final: true, records: stats.records, matches: matchesDone, aborts, wallSec: meta.wallSec }));
}

main().catch((e) => { console.error(e); process.exit(1); });
