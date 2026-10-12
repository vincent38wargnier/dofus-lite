// Verrous de parité du port navigateur du réseau de valeur (valueNet.js):
// 1) encodeur V3 bit-à-bit identique à scripts/rl/encoder.cjs sur des états
//    RÉELS (mirroirs CRA l100/l200gear + SRAM pour pièges/invisibilité);
// 2) forward identique aux fixtures torch du modèle (même barre que le banc:
//    maxDiff < 2e-3). Les deux ensemble ⇒ même jugement que value_net.cjs.
import fs from 'node:fs';
import path from 'node:path';
import { createGame, applyAction, getView, currentFighter } from '../engine/engine';
import { createRng, hashSeed } from '../engine/rng';
import { makeBotApi } from '../bots/api';
import { utilityDecide } from '../bots/utilityBrain';
import { emptyLoadout } from '../engine/equipment';
import { buildValueModel, encodeSampleV3, makeStateEvaluator, OBS_DIM_V3 } from '../bots/valueNet';

const refEnc = require('../../scripts/rl/encoder.cjs'); // pur: aucune dépendance

const MODEL_DIR = path.join(__dirname, '../../local-observations/rl/value-cra3/model-sv');
const hasModel = fs.existsSync(path.join(MODEL_DIR, 'weights.bin'));

const mkFighters = (cls, loadout) => ['A', 'B'].map((id) => {
  const f = { id, name: id, classId: cls };
  if (loadout) f.loadout = loadout(cls);
  return f;
});
const l200gear = (cls) => ({ ...emptyLoadout(cls), level: 200, base: { force: 100 }, slots: { weapon: 2416 } });

// Joue un match maison (utilityDecide des 2 côtés) et compare l'encodage de
// CHAQUE état de décision entre l'encodeur de référence et le port.
function compareGame(cls, loadout, seed, bufs) {
  let { state } = createGame({ mapId: 'arene', seed: hashSeed(`vnp:${seed}`), fighters: mkFighters(cls, loadout) });
  const rngs = {};
  let steps = 0;
  let states = 0;
  let diffs = 0;
  while (!state.over && steps++ < 400) {
    const actor = currentFighter(state);
    const view = getView(state, actor.id);
    refEnc.encodeSampleV3({ view, board: view.board }, null, bufs.ref);
    encodeSampleV3({ view, board: view.board }, null, bufs.port);
    states++;
    for (let i = 0; i < OBS_DIM_V3; i++) if (bufs.ref[i] !== bufs.port[i]) { diffs++; break; }
    const api = makeBotApi(view, rngs[actor.id] ||= createRng(hashSeed(`vnp:${seed}:${actor.id}`)));
    let action;
    try { action = utilityDecide(view, api) || { type: 'PASS' }; } catch { action = { type: 'PASS' }; }
    const r = applyAction(state, action);
    state = r.ok ? r.state : applyAction(state, { type: 'PASS' }).state;
  }
  return { states, diffs };
}

test('encodeur V3 porté = référence, bit à bit, sur des états réels', () => {
  expect(refEnc.OBS_DIM_V3).toBe(OBS_DIM_V3);
  const bufs = { ref: new Float32Array(OBS_DIM_V3), port: new Float32Array(OBS_DIM_V3) };
  let states = 0;
  let diffs = 0;
  for (const [cls, loadout, seed] of [['CRA', null, 1], ['CRA', l200gear, 2], ['SRAM', null, 3]]) {
    const r = compareGame(cls, loadout, seed, bufs);
    states += r.states;
    diffs += r.diffs;
  }
  expect(states).toBeGreaterThan(100); // le verrou doit couvrir assez d'états
  expect(diffs).toBe(0);
});

(hasModel ? test : test.skip)('forward porté = fixtures torch du modèle V4 (maxDiff < 2e-3)', () => {
  const shapes = JSON.parse(fs.readFileSync(path.join(MODEL_DIR, 'shapes.json'), 'utf8'));
  const model = buildValueModel(shapes, fs.readFileSync(path.join(MODEL_DIR, 'weights.bin')));
  const raw = fs.readFileSync(path.join(MODEL_DIR, 'parity_obs.bin'));
  const expected = JSON.parse(fs.readFileSync(path.join(MODEL_DIR, 'parity_v.json'), 'utf8'));
  expect(expected.length).toBeGreaterThan(0);
  let maxDiff = 0;
  for (let i = 0; i < expected.length; i++) {
    const obs = new Float32Array(raw.buffer, raw.byteOffset + i * shapes.obsDim * 4, shapes.obsDim);
    maxDiff = Math.max(maxDiff, Math.abs(model.forward(obs) - expected[i]));
  }
  expect(maxDiff).toBeLessThan(2e-3);
});

(hasModel ? test : test.skip)('évaluateur branché: V ∈ [−1,1] sur un état initial réel', () => {
  const shapes = JSON.parse(fs.readFileSync(path.join(MODEL_DIR, 'shapes.json'), 'utf8'));
  const model = buildValueModel(shapes, fs.readFileSync(path.join(MODEL_DIR, 'weights.bin')));
  const netV = makeStateEvaluator(model, getView);
  const { state } = createGame({ mapId: 'arene', seed: 7, fighters: mkFighters('CRA', l200gear) });
  const counters = { applies: 0 };
  const v = netV(state, 'A', counters);
  expect(Number.isFinite(v)).toBe(true);
  expect(Math.abs(v)).toBeLessThanOrEqual(1);
  expect(counters.applies).toBe(1);
});
