// Génère le dataset du réseau de VALEUR — miroir CRA niveau 100 sans
// équipement. Chaque point de décision des DEUX joueurs est encodé (V3,
// vue du joueur au trait) et étiqueté à la fin du match: z = ±1 / 0.
//
// Durci après audit expert (F09/F11/F13):
//  - écriture par match avec BACKPRESSURE réelle (await drain) — plus de
//    tampon process qui grossit en silence;
//  - manifest .meta.json écrit ATOMIQUEMENT (tmp+rename) en fin de shard:
//    un shard sans meta = incomplet, à jeter — jamais ambigu;
//  - split train/val STABLE par match: flag écrit à la GÉNÉRATION (.v.u8,
//    1 octet/record) depuis l'uid du match (= seed moteur) — réordonner,
//    renommer ou ajouter des shards ne déplace plus la frontière;
//  - provenance: version de recherche, juge, budget, eps, mode — un shard
//    redevient attribuable à un code précis;
//  - aborts (plafond d'actions) comptés SÉPARÉMENT des vrais nuls.
//
// Modes: maison (maison±ε des 2 côtés) | search (côté alterné = calculateur,
// l'autre maison±ε) | self (calculateur des 2 côtés, ε appliqué AVANT la
// recherche — une action bruitée ne paie pas le coût d'un plan).
//
//   node scripts/rl/value_gen.cjs --out shards/c1-m0 --matches 1000 \
//     --mode maison --seed0 0 --eps 0.08 [--model DIR] [--budget 4000]
require('../ai_runtime.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { createGame, applyAction, getView, currentFighter } = require('../../src/engine/engine');
const { createRng, hashSeed } = require('../../src/engine/rng');
const { makeBotApi } = require('../../src/bots/api');
const enc = require('./encoder.cjs');
const sb = require('./search_bot.cjs');

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
const OUT = args.out;
const MATCHES = Number(args.matches || 500);
const MODE = args.mode || 'maison';
const SEED0 = Number(args.seed0 || 0);
const EPS = Number(args.eps ?? 0.08);
const CLS = args.cls || 'CRA';
const LK = args.lk || 'l100'; // clé LOADOUTS du banc (l100 | l200 | l200gear)
if (!sb.LOADOUTS[LK]) { console.error(`--lk inconnu: ${LK}`); process.exit(1); }
if (args.budget) process.env.SB_BUDGET = args.budget; // AVANT tout searchDecide
const JUDGE = args.model ? (sb.useValueModel(args.model), args.model) : 'heuristic';
if (!OUT) { console.error('--out requis'); process.exit(1); }
fs.mkdirSync(path.dirname(OUT), { recursive: true });

const MAPS = ['arene', 'muraille', 'canyon', 'amakna_1571', 'territoire_des_dopeuls_5383'];
const MAX_ACTIONS = 800;

const streams = {
  obs: fs.createWriteStream(`${OUT}.obs.f32`),
  z: fs.createWriteStream(`${OUT}.z.f32`),
  m: fs.createWriteStream(`${OUT}.m.u32`),
  v: fs.createWriteStream(`${OUT}.v.u8`),
  // Valeur de recherche du joueur au trait à CETTE décision (∈[−1,1]),
  // sentinelle 2.0 quand le joueur n'est pas un calculateur (maison/ε) —
  // cible dense « verdict du prof » (C2), en plus de l'issue z.
  sv: fs.createWriteStream(`${OUT}.sv.f32`),
};
function writeChunk(stream, buf) {
  return stream.write(buf) ? Promise.resolve() : new Promise((res) => stream.once('drain', res));
}

function randomLegal(view, api, rnd) {
  const acts = [{ type: 'PASS' }];
  for (const c of api.reachable()) acts.push({ type: 'MOVE', to: { x: c.pos.x, y: c.pos.y } });
  acts.push(...sb.candidateCasts(view, api));
  return acts[Math.floor(rnd.next() * acts.length)];
}

async function main() {
  let records = 0;
  const wins = { A: 0, B: 0, D: 0 };
  let aborts = 0; // plafond d'actions ≠ vrai nul (audit: ne pas confondre)
  let searchWins = 0; let searchGames = 0; // tripwire: le prof doit rester fort
  const buf = new Float32Array(enc.OBS_DIM_V3);
  const t0 = Date.now();

  for (let i = 0; i < MATCHES; i++) {
    // Identité STABLE du match. LK absent de la clé historique (l100): les
    // shards C1/C2 gardent exactement leurs uid/splits d'origine.
    const uid = hashSeed(LK === 'l100' ? `vg:${MODE}:${CLS}:${SEED0 + i}` : `vg:${MODE}:${CLS}:${LK}:${SEED0 + i}`);
    const isVal = uid % 17 === 0;
    const map = MAPS[(SEED0 + i) % MAPS.length];
    const searchId = i % 2 === 0 ? 'A' : 'B';
    let { state } = createGame({ mapId: map, seed: uid, fighters: sb.makeFighters(LK, CLS, CLS) });
    const rngs = {};
    const noiseRng = createRng(hashSeed(`eps:${uid}`));
    const counters = { applies: 0, ms: 0, decisions: 0, endsSum: 0, invalid: 0 };
    const match = []; // { obs: Buffer, team }
    let guard = 0;
    while (!state.over && guard++ < MAX_ACTIONS) {
      const actor = currentFighter(state);
      const view = getView(state, actor.id);
      const api = makeBotApi(view, rngs[actor.id] ||= createRng(hashSeed(`vg:${uid}:${actor.id}`)));
      enc.encodeSampleV3({ view, board: view.board }, null, buf);
      const rec = { obs: Buffer.from(Buffer.from(buf.buffer, 0, buf.byteLength)), team: actor.team, sv: 2.0 };
      match.push(rec);
      const isSearchSide = MODE === 'self' || (MODE === 'search' && actor.id === searchId);
      let action;
      if (EPS > 0 && noiseRng.next() < EPS && (MODE !== 'search' || !isSearchSide)) {
        // ε AVANT la recherche: l'exploration ne paie pas un plan complet.
        // En mode search, le côté calculateur reste PROPRE (qualité du prof).
        action = randomLegal(view, api, noiseRng);
      } else if (isSearchSide) {
        action = sb.searchDecide(state, counters);
        rec.sv = counters.lastSearchValue ?? 2.0; // verdict du prof à CETTE décision
      } else {
        try { action = api.maison() || { type: 'PASS' }; } catch { action = { type: 'PASS' }; }
      }
      const r = applyAction(state, action);
      state = r.ok ? r.state : applyAction(state, { type: 'PASS' }).state;
    }
    const aborted = !state.over;
    if (aborted) aborts++;
    const winner = state.over ? state.winner : null;
    wins[winner || 'D'] = (wins[winner || 'D'] || 0) + 1;
    if (MODE === 'search') {
      searchGames++;
      if (winner === searchId) searchWins++;
    }
    const zBuf = Buffer.alloc(4 * match.length);
    const mBuf = Buffer.alloc(4 * match.length);
    const vBuf = Buffer.alloc(match.length, isVal ? 1 : 0);
    const svBuf = Buffer.alloc(4 * match.length);
    const obsBufs = [];
    match.forEach((rec, k) => {
      const z = winner == null ? 0 : winner === rec.team ? 1 : -1;
      zBuf.writeFloatLE(z, 4 * k);
      mBuf.writeUInt32LE(SEED0 + i, 4 * k);
      svBuf.writeFloatLE(rec.sv, 4 * k);
      obsBufs.push(rec.obs);
    });
    await writeChunk(streams.obs, Buffer.concat(obsBufs));
    await writeChunk(streams.z, zBuf);
    await writeChunk(streams.m, mBuf);
    await writeChunk(streams.v, vBuf);
    await writeChunk(streams.sv, svBuf);
    records += match.length;
    if ((i + 1) % 10 === 0 || i === MATCHES - 1) {
      console.log(JSON.stringify({ mode: MODE, done: i + 1, records, wins, aborts,
        searchWinRate: searchGames ? +(searchWins / searchGames).toFixed(3) : null,
        recPerMatch: +(records / (i + 1)).toFixed(1), sec: Math.round((Date.now() - t0) / 1000) }));
    }
  }

  await Promise.all(Object.values(streams).map((s) => new Promise((res) => s.end(res))));
  // Manifest ATOMIQUE: présent ⇔ shard complet et flush terminé.
  const meta = {
    featureVersion: enc.FEATURE_VERSION_V3, obsDim: enc.OBS_DIM_V3, records, matches: MATCHES,
    mode: MODE, cls: CLS, lk: LK, eps: EPS, seed0: SEED0, maps: MAPS, wins, aborts,
    searchVersion: sb.SEARCH_VERSION, judge: JUDGE, budget: Number(process.env.SB_BUDGET || 8000),
    valSplit: 'uid%17==0 (flag .v.u8 écrit à la génération)',
  };
  fs.writeFileSync(`${OUT}.meta.json.tmp`, JSON.stringify(meta));
  fs.renameSync(`${OUT}.meta.json.tmp`, `${OUT}.meta.json`);
  console.log(JSON.stringify({ done: true, records, aborts, wallSec: Math.round((Date.now() - t0) / 1000) }));
}

main().catch((e) => { console.error(e); process.exit(1); });
