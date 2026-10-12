// Parité du port navigateur de Synapse (src/bots/netEncoder + neural) avec
// la source de vérité d'entraînement (scripts/rl/encoder.cjs + bot_net.cjs).
// Toute divergence d'encodage ou de forward casse ce test — c'est le garde-fou
// anti-drift entre le modèle entraîné et le bot joué en jeu.
import { createGame, getView, applyAction, currentFighter } from '../engine/engine';
import { createRng, hashSeed } from '../engine/rng';
import { makeBotApi } from '../bots/api';
import { utilityDecide } from '../bots/utilityBrain';
import { compileBot } from '../bots/compile';
import { getBuiltinBot } from '../bots/builtins';
import * as webEnc from '../bots/netEncoder';
import { initNeural, neuralDecide, neuralReady } from '../bots/neural';

const fs = require('fs');
const os = require('os');
const path = require('path');
const nodeEnc = require('../../scripts/rl/encoder.cjs');
const nodeNet = require('../../scripts/rl/bot_net.cjs');

function playSomeTurns(state, nActions, seed) {
  const rngs = {};
  const states = [state];
  for (let i = 0; i < nActions && !state.over; i++) {
    const actor = currentFighter(state);
    const view = getView(state, actor.id);
    const api = makeBotApi(view, rngs[actor.id] ||= createRng(hashSeed(`${seed}:${actor.id}`)));
    let action;
    try { action = utilityDecide(view, api) || { type: 'PASS' }; } catch { action = { type: 'PASS' }; }
    state = applyAction(state, action).state;
    states.push(state);
  }
  return states;
}

describe('Synapse (bot neuronal) — parité navigateur ↔ entraînement', () => {
  test('encodeur: mêmes features que scripts/rl/encoder.cjs sur une vraie partie', () => {
    expect(webEnc.OBS_DIM).toBe(nodeEnc.OBS_DIM);
    expect(webEnc.ACTION_DIM).toBe(nodeEnc.ACTION_DIM);
    expect(webEnc.FEATURE_VERSION).toBe(nodeEnc.FEATURE_VERSION);
    let { state } = createGame({
      mapId: 'arene', seed: hashSeed('parity:enc'),
      fighters: [
        { id: 'A', name: 'A', classId: 'IOP' },
        { id: 'B', name: 'B', classId: 'CRA' },
      ],
    });
    const states = playSomeTurns(state, 40, 'parity');
    const a = new Float32Array(webEnc.OBS_DIM);
    const b = new Float32Array(nodeEnc.OBS_DIM);
    let checked = 0;
    for (const st of states) {
      if (st.over) break;
      const actor = currentFighter(st);
      const view = getView(st, actor.id);
      webEnc.encodeSample({ view, board: view.board }, null, a);
      nodeEnc.encodeSample({ view, board: view.board }, null, b);
      for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
          throw new Error(`divergence encodeur à l'étape ${checked}, feature ${i}: ${a[i]} ≠ ${b[i]}`);
        }
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(10);
  });

  test('forward: mêmes logits que scripts/rl/bot_net.cjs (petit modèle aléatoire)', () => {
    // Petit spatial-v2 aléatoire: assez pour vérifier chaque opérateur.
    const ch = 4; const gdim = 8;
    const restDim = webEnc.OBS_DIM - webEnc.N_PLANES * webEnc.CELLS;
    const layerSpecs = [
      { name: 'conv1', type: 'conv', shape: [ch, webEnc.N_PLANES, 3, 3] },
      { name: 'conv2', type: 'conv', shape: [ch, ch, 3, 3] },
      { name: 'conv3', type: 'conv', shape: [ch, ch, 3, 3] },
      { name: 'g1', type: 'linear', shape: [16, restDim] },
      { name: 'g2', type: 'linear', shape: [gdim, 16] },
      { name: 'fuse', type: 'conv', shape: [6, ch + gdim, 1, 1] },
      { name: 'move_head', type: 'conv', shape: [1, 6, 1, 1] },
      { name: 'cast_head', type: 'conv', shape: [webEnc.SPELL_SLOTS, 6, 1, 1] },
      { name: 'pass_head', type: 'linear', shape: [1, gdim + ch] },
    ];
    const shapes = {
      arch: 'spatial-v2', featureVersion: webEnc.FEATURE_VERSION,
      obsDim: webEnc.OBS_DIM, actionDim: webEnc.ACTION_DIM,
      planes: { n: webEnc.N_PLANES, h: webEnc.MAX_H, w: webEnc.MAX_W },
      spellSlots: webEnc.SPELL_SLOTS, ch, layers: layerSpecs,
    };
    const rng = createRng(hashSeed('parity:weights'));
    const chunks = [];
    let total = 0;
    for (const spec of layerSpecs) {
      const size = spec.shape.reduce((x, y) => x * y, 1) + spec.shape[0];
      total += size;
    }
    const all = new Float32Array(total);
    for (let i = 0; i < total; i++) all[i] = (rng.next() - 0.5) * 0.2;
    void chunks;

    // Côté entraînement: fichiers sur disque.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'synapse-parity-'));
    fs.writeFileSync(path.join(dir, 'shapes.json'), JSON.stringify(shapes));
    fs.writeFileSync(path.join(dir, 'weights.bin'), Buffer.from(all.buffer));
    const nodeModel = nodeNet.loadModel(dir);
    // Côté navigateur: ArrayBuffer direct.
    const webModel = initNeural(shapes, all.buffer.slice(0));
    expect(neuralReady()).toBe(true);

    let { state } = createGame({
      mapId: 'canyon', seed: hashSeed('parity:fwd'),
      fighters: [
        { id: 'A', name: 'A', classId: 'SRAM' },
        { id: 'B', name: 'B', classId: 'ENIRIPSA' },
      ],
    });
    const actor = currentFighter(state);
    const view = getView(state, actor.id);
    const obs = new Float32Array(webEnc.OBS_DIM);
    webEnc.encodeSample({ view, board: view.board }, null, obs);
    const la = webModel.forward(obs);
    const lb = nodeModel.forward(obs);
    expect(la.length).toBe(lb.length);
    for (let i = 0; i < la.length; i++) {
      if (la[i] !== lb[i]) throw new Error(`divergence forward au logit ${i}: ${la[i]} ≠ ${lb[i]}`);
    }
  });

  test('neuralDecide ne joue que des actions légales (cascade api officielle)', () => {
    expect(neuralReady()).toBe(true); // modèle du test précédent
    let { state } = createGame({
      mapId: 'canyon', seed: hashSeed('parity:legal'),
      fighters: [
        { id: 'A', name: 'A', classId: 'IOP' },
        { id: 'B', name: 'B', classId: 'XELOR' },
      ],
    });
    const rngs = {};
    for (let i = 0; i < 30 && !state.over; i++) {
      const actor = currentFighter(state);
      const view = getView(state, actor.id);
      const api = makeBotApi(view, rngs[actor.id] ||= createRng(hashSeed(`legal:${actor.id}`)));
      const action = neuralDecide(view, api);
      const result = applyAction(state, action);
      expect(result.ok).toBe(true);
      state = result.state;
    }
  });

  const championShapes = 'public/models/synapse/shapes.json';
  (fs.existsSync(championShapes) ? test : test.skip)('les poids servis dans public/ se chargent (champion iter_0120)', () => {
    const shapes = JSON.parse(fs.readFileSync(championShapes, 'utf8'));
    const raw = fs.readFileSync('public/models/synapse/weights.bin');
    const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
    const model = initNeural(shapes, buf);
    expect(model.shapes.arch).toBe('spatial-v2');
    // Un forward réel sur une vraie vue doit sortir des logits finis.
    let { state } = createGame({
      mapId: 'arene', seed: hashSeed('parity:champion'),
      fighters: [
        { id: 'A', name: 'A', classId: 'IOP' },
        { id: 'B', name: 'B', classId: 'CRA' },
      ],
    });
    const view = getView(state, currentFighter(state).id);
    const obs = new Float32Array(webEnc.OBS_DIM);
    webEnc.encodeSample({ view, board: view.board }, null, obs);
    const logits = model.forward(obs);
    expect(logits.length).toBe(webEnc.ACTION_DIM);
    for (const v of logits) expect(Number.isFinite(v)).toBe(true);
  });

  (fs.existsSync(championShapes) ? test : test.skip)('le builtin « Synapse » joue un duel complet via la sandbox du jeu', () => {
    // Exactement le chemin du jeu: entrée builtin → compileBot → api.neural()
    // → poids de public/ → actions légales jusqu'à la fin du combat.
    const shapes = JSON.parse(fs.readFileSync(championShapes, 'utf8'));
    const raw = fs.readFileSync('public/models/synapse/weights.bin');
    initNeural(shapes, raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
    const bot = getBuiltinBot('synapse');
    expect(bot).toBeTruthy();
    expect(bot.name).toBe('Synapse');
    const decideSynapse = compileBot(bot.code);
    let { state } = createGame({
      mapId: 'arene', seed: hashSeed('synapse:duel'),
      fighters: [
        { id: 'A', name: 'Synapse', classId: 'IOP' },
        { id: 'B', name: 'Maison', classId: 'CRA' },
      ],
    });
    const rngs = {};
    let guard = 0;
    let invalid = 0;
    let invalidThisTurn = 0;
    let turnKey = '';
    while (!state.over && guard++ < 5000) {
      const actor = currentFighter(state);
      const nextKey = `${state.turn}:${actor.id}`;
      if (turnKey !== nextKey) { turnKey = nextKey; invalidThisTurn = 0; }
      const view = getView(state, actor.id);
      const api = makeBotApi(view, rngs[actor.id] ||= createRng(hashSeed(`duel:${actor.id}`)));
      let action;
      try {
        action = (actor.team === 'A' ? decideSynapse(view, api) : api.maison()) || { type: 'PASS' };
      } catch { action = { type: 'PASS' }; }
      const res = applyAction(state, action);
      state = res.state;
      if (!res.ok) {
        invalid++;
        if (++invalidThisTurn >= 3) { state = applyAction(state, { type: 'PASS' }).state; invalidThisTurn = 0; }
      }
    }
    expect(state.over).toBe(true);
    expect(state.winner === 'A' || state.winner === 'B' || state.winner === null).toBe(true);
    // Synapse (côté net, cascade légale) ne doit produire aucune action invalide.
    expect(invalid).toBe(0);
  });
});
