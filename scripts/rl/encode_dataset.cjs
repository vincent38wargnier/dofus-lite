// JSONL.gz (gen_dataset) → tenseurs binaires pour l'entraînement PyTorch.
//   node scripts/rl/encode_dataset.cjs --in local-observations/rl/ds-v1
// Sortie dans <in>/tensors/: features.f32 (N×OBS_DIM), labels.u32 (N),
// aux.f32 (N×4: issue, invocation, hash de match ‰, type d'action), meta.json.
// Filtre: décisions valides (ok=1) et encodables uniquement.
require('../ai_runtime.cjs');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const readline = require('node:readline');
const enc = require('./encoder.cjs');
const { hashSeed } = require('../../src/engine/rng');

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => (a.startsWith('--') ? [a.slice(2), arr[i + 1]] : null)).filter(Boolean));
  const inDir = path.resolve(args.in || 'local-observations/rl/ds-v1');
  const outDir = path.join(inDir, 'tensors');
  fs.mkdirSync(outDir, { recursive: true });
  const catalog = JSON.parse(fs.readFileSync(path.join(inDir, 'catalog.json'), 'utf8'));
  const shards = fs.readdirSync(inDir).filter((f) => f.endsWith('.jsonl.gz')).sort();

  const fFeat = fs.openSync(path.join(outDir, 'features.f32'), 'w');
  const fLab = fs.openSync(path.join(outDir, 'labels.u32'), 'w');
  const fAux = fs.openSync(path.join(outDir, 'aux.f32'), 'w');
  const BATCH = 512;
  const featBuf = Buffer.alloc(BATCH * enc.OBS_DIM * 4);
  const labBuf = Buffer.alloc(BATCH * 4);
  const auxBuf = Buffer.alloc(BATCH * 4 * 4);
  const featView = new Float32Array(featBuf.buffer);
  const labView = new Uint32Array(labBuf.buffer);
  const auxView = new Float32Array(auxBuf.buffer);
  const row = new Float32Array(enc.OBS_DIM);

  let n = 0;
  let inBatch = 0;
  const skipped = { invalid: 0, badLabel: 0 };
  const byType = { pass: 0, move: 0, cast: 0 };
  const t0 = performance.now();

  const flush = () => {
    if (!inBatch) return;
    fs.writeSync(fFeat, featBuf, 0, inBatch * enc.OBS_DIM * 4);
    fs.writeSync(fLab, labBuf, 0, inBatch * 4);
    fs.writeSync(fAux, auxBuf, 0, inBatch * 4 * 4);
    inBatch = 0;
  };

  for (const shard of shards) {
    const rl = readline.createInterface({
      input: fs.createReadStream(path.join(inDir, shard)).pipe(zlib.createGunzip()),
      crlfDelay: Infinity,
    });
    for await (const line of rl) {
      if (!line) continue;
      const r = JSON.parse(line);
      if (!r.ok) { skipped.invalid++; continue; }
      const label = enc.actionToLabel(r.act, r.view);
      if (label < 0) { skipped.badLabel++; continue; }
      const board = catalog.maps[r.map];
      enc.encodeSample({ view: r.view, board }, catalog, row);
      featView.set(row, inBatch * enc.OBS_DIM);
      labView[inBatch] = label;
      const type = label === 0 ? 0 : label <= enc.CELLS ? 1 : 2;
      byType[['pass', 'move', 'cast'][type]]++;
      const matchHash = hashSeed(`${r.seed}:${r.cls.A}:${r.cls.B}:${r.map}`) % 1000;
      auxView[inBatch * 4 + 0] = r.out;
      auxView[inBatch * 4 + 1] = r.summon;
      auxView[inBatch * 4 + 2] = matchHash;
      auxView[inBatch * 4 + 3] = type;
      n++;
      if (++inBatch === BATCH) flush();
    }
    console.log(`${shard}: cumul ${n} lignes`);
  }
  flush();
  fs.closeSync(fFeat); fs.closeSync(fLab); fs.closeSync(fAux);

  const meta = {
    featureVersion: enc.FEATURE_VERSION,
    obsDim: enc.OBS_DIM,
    actionDim: enc.ACTION_DIM,
    rows: n,
    skipped,
    byType,
    valPermil: 100, // aux[:,2] < 100 → validation (split par match, ~10%)
    source: inDir,
    encodeSec: +((performance.now() - t0) / 1000).toFixed(1),
  };
  fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify(meta, null, 2));
  console.log(JSON.stringify(meta, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
