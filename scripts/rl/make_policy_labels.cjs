// Convertit les shards d1 (obs V3 + sidecar .act.jsonl) en jeu d'entraînement
// POLITIQUE pour le clone (imitation du PROF): map position → action du prof.
//
// Ne garde QUE les décisions du prof (src==='search') — on clone le
// calculateur, pas maison ni le bruit ε. Les labels (index plat 0..5250)
// sont reconstruits via encoder.actionToLabel sur une vue CANONIQUE de la
// classe/loadout (l'ordre du kit CRA est fixe par classe → même slotting
// qu'à la génération; round-trip vérifié 2499/2499 sur d1-s0).
//
//   node scripts/rl/make_policy_labels.cjs --shards DIR --out DIR_OUT
require('../ai_runtime.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { createGame, getView, currentFighter } = require('../../src/engine/engine');
const sb = require('./search_bot.cjs');
const enc = require('./encoder.cjs');

const args = {};
for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
const SHARDS = args.shards || 'local-observations/rl/value-cra3/shards';
const OUT = args.out || 'local-observations/rl/value-cra3/policy-d1';
// --prefix accepte une liste: d1-,d2-,dg1- (shards de plusieurs campagnes fusionnés).
const PREFIXES = (args.prefix || 'd1-').split(',').filter(Boolean);

// Vue canonique par loadout (ordre du kit = déterministe par classe).
const canonView = {};
function viewFor(lk, cls) {
  const key = `${lk}:${cls}`;
  if (!canonView[key]) {
    const { state } = createGame({ mapId: 'arene', seed: 1, fighters: sb.makeFighters(lk, cls, cls) });
    canonView[key] = getView(state, currentFighter(state).id);
  }
  return canonView[key];
}

fs.mkdirSync(OUT, { recursive: true });
// --before ISO: seulement les shards TERMINÉS avant cet instant (le manifest est écrit
// atomiquement en fin de shard) → reconstruire exactement l'instantané d'un dataset passé.
const BEFORE = args.before ? new Date(args.before).getTime() : Infinity;
const metas = fs.readdirSync(SHARDS).filter((f) => PREFIXES.some((p) => f.startsWith(p)) && f.endsWith('.meta.json')
  && fs.statSync(path.join(SHARDS, f)).mtimeMs < BEFORE);

const obsOut = fs.createWriteStream(path.join(OUT, 'obs.f32'));
const labOut = fs.createWriteStream(path.join(OUT, 'lab.i32'));
const vOut = fs.createWriteStream(path.join(OUT, 'v.u8'));
// Niveau de chaque ligne (lk.u8): 0=l100, 1=l200gear, 2=l200 — pour échantillonner
// les niveaux à parts égales (d12: tout le neuf était l100 → l200 a régressé).
const lkOut = fs.createWriteStream(path.join(OUT, 'lk.u8'));
const LK_CODE = { l100: 0, l200gear: 1, l200: 2 };
// Classement complet du prof (sidecar c = [[action, s0, s3|null], ...]) → cibles
// souples: K paires (label, score s3 des FINALISTES) par ligne, groupées par
// 1re action (max); -1 = vide (shards sans classement).
const K_CAND = 32;
const candLabOut = fs.createWriteStream(path.join(OUT, 'cand_lab.i32'));
const candSOut = fs.createWriteStream(path.join(OUT, 'cand_s.f32'));
function w(stream, buf) { return stream.write(buf) ? Promise.resolve() : new Promise((r) => stream.once('drain', r)); }

async function main() {
  let obsDim = null; let kept = 0; let skipped = 0; let badLabel = 0; let softRows = 0;
  const bySrc = {}; const byType = {};
  for (const mf of metas.sort()) {
    const meta = JSON.parse(fs.readFileSync(path.join(SHARDS, mf)));
    const base = path.join(SHARDS, mf.slice(0, -'.meta.json'.length));
    const n = meta.records;
    obsDim = obsDim || meta.obsDim;
    if (meta.obsDim !== obsDim) throw new Error(`obsDim mixte ${meta.obsDim} vs ${obsDim}`);
    if (!fs.existsSync(`${base}.act.jsonl`)) { console.log(`skip ${mf}: pas de .act.jsonl`); continue; }
    const view = viewFor(meta.lk || 'l100', meta.cls || 'CRA');
    const obs = fs.readFileSync(`${base}.obs.f32`);           // n × obsDim f32
    const vflags = fs.readFileSync(`${base}.v.u8`);           // n u8
    const acts = fs.readFileSync(`${base}.act.jsonl`, 'utf8').trim().split('\n');
    if (acts.length !== n) throw new Error(`${mf}: act lines ${acts.length} ≠ records ${n}`);
    const recBytes = obsDim * 4;
    const keepObs = []; const keepLab = []; const keepV = []; const keepCand = [];
    const lkCode = LK_CODE[meta.lk || 'l100'];
    if (lkCode === undefined) throw new Error(`${mf}: lk inconnu ${meta.lk}`);
    for (let i = 0; i < n; i++) {
      const a = JSON.parse(acts[i]);
      bySrc[a.src] = (bySrc[a.src] || 0) + 1;
      if (a.src !== 'search') { skipped++; continue; }   // clone le PROF uniquement
      const lab = enc.actionToLabel(a.a, view);
      if (lab < 0) { badLabel++; continue; }             // action non-encodable (ne devrait pas arriver)
      byType[a.a.type] = (byType[a.a.type] || 0) + 1;
      keepObs.push(obs.subarray(i * recBytes, (i + 1) * recBytes));
      keepLab.push(lab);
      keepV.push(vflags[i]);
      let cand = null;
      if (Array.isArray(a.c)) {
        const byLab = new Map();
        for (const [ca, , s3] of a.c) {
          // FINALISTES seulement (s3 = moyenne 3 échantillons): la décision du prof
          // est l'argmax de s3; un s0 (1 échantillon) n'est pas comparable.
          if (s3 == null) continue;
          const cl = enc.actionToLabel(ca || { type: 'PASS' }, view); // null = plan vide = PASS
          if (cl < 0) continue;
          const sc = s3;
          if (!byLab.has(cl) || sc > byLab.get(cl)) byLab.set(cl, sc);
        }
        cand = [...byLab.entries()].sort((x, y) => y[1] - x[1]).slice(0, K_CAND);
        softRows++;
      }
      keepCand.push(cand);
      kept++;
    }
    if (keepLab.length) {
      await w(obsOut, Buffer.concat(keepObs));
      const labBuf = Buffer.alloc(keepLab.length * 4);
      keepLab.forEach((l, k) => labBuf.writeInt32LE(l, k * 4));
      await w(labOut, labBuf);
      await w(vOut, Buffer.from(keepV));
      await w(lkOut, Buffer.alloc(keepLab.length, lkCode));
      const cl = Buffer.alloc(keepLab.length * K_CAND * 4); const cs = Buffer.alloc(keepLab.length * K_CAND * 4);
      keepCand.forEach((cand, r) => {
        for (let k = 0; k < K_CAND; k++) {
          const e = cand && cand[k];
          cl.writeInt32LE(e ? e[0] : -1, (r * K_CAND + k) * 4);
          cs.writeFloatLE(e ? e[1] : 0, (r * K_CAND + k) * 4);
        }
      });
      await w(candLabOut, cl);
      await w(candSOut, cs);
    }
    console.log(`${mf}: kept ${keepLab.length}/${n} (${meta.mode} ${meta.lk})`);
  }
  await Promise.all([obsOut, labOut, vOut, lkOut, candLabOut, candSOut].map((s) => new Promise((r) => s.end(r))));
  const metaOut = { obsDim, featureVersion: enc.FEATURE_VERSION_V3, actionDim: enc.ACTION_DIM,
    rows: kept, source: PREFIXES.join(','), shards: metas.length, bySrc, byType, badLabel, softRows, kCand: K_CAND, valSplit: 'v.u8 hérité de la génération' };
  fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(metaOut, null, 2));
  fs.writeFileSync(path.join(OUT, 'shards.txt'), metas.sort().join('\n') + '\n'); // provenance exacte
  console.log(JSON.stringify({ done: true, kept, skipped, badLabel, softRows, byType, actionDim: enc.ACTION_DIM }));
}
main().catch((e) => { console.error(e); process.exit(1); });
