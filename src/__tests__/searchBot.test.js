// Garde-fou du Stratège (calculateur en jeu, src/bots/searchBrain.js).
// 1) Le builtin joue un duel COMPLET via le vrai chemin du jeu
//    (builtins → compileBot → api.stratege) sans une seule action invalide
//    et bat l'IA Maison — c'est sa promesse de fiche (champion des bancs).
// 2) Déterminisme: même vue ⇒ même action (replays/équité P2P).
// La parité algorithmique port ↔ banc (scripts/rl/search_bot.cjs) est
// vérifiée côté Node (sonde 25 décisions identiques, 2026-10-12) — ici on
// garde le chemin navigateur pur, sans dépendre de scripts/.
import { createGame, getView, applyAction, currentFighter } from '../engine/engine';
import { createRng, hashSeed } from '../engine/rng';
import { makeBotApi } from '../bots/api';
import { compileBot } from '../bots/compile';
import { getBuiltinBot } from '../bots/builtins';

describe('Stratège (calculateur) — builtin en jeu', () => {
  test('duel complet via la sandbox: zéro action invalide, victoire vs IA Maison', () => {
    const bot = getBuiltinBot('stratege');
    expect(bot).toBeTruthy();
    const decideStratege = compileBot(bot.code);
    let { state } = createGame({
      mapId: 'arene',
      seed: hashSeed('stratege:duel:0'),
      fighters: [
        { id: 'A', name: 'Stratège', classId: 'CRA' },
        { id: 'B', name: 'Maison', classId: 'CRA' },
      ],
    });
    const rngs = {};
    let invalid = 0;
    let guard = 0;
    while (!state.over && guard++ < 400) {
      const actor = currentFighter(state);
      const view = getView(state, actor.id);
      const api = makeBotApi(view, rngs[actor.id] ||= createRng(hashSeed(`sd:${actor.id}`)));
      let action;
      if (actor.id === 'A') action = decideStratege(view, api) || { type: 'PASS' };
      else {
        try { action = api.maison() || { type: 'PASS' }; } catch { action = { type: 'PASS' }; }
      }
      const r = applyAction(state, action);
      if (!r.ok) {
        if (actor.id === 'A') invalid++;
        state = applyAction(state, { type: 'PASS' }).state;
        continue;
      }
      state = r.state;
    }
    expect(invalid).toBe(0);
    expect(state.over).toBe(true);
    expect(state.winner).toBe('A');
  }, 180000);

  test('déterminisme: même vue ⇒ même action', () => {
    let { state } = createGame({
      mapId: 'arene',
      seed: hashSeed('stratege:det:0'),
      fighters: [
        { id: 'A', name: 'S', classId: 'CRA' },
        { id: 'B', name: 'M', classId: 'CRA' },
      ],
    });
    const view = getView(state, currentFighter(state).id);
    const api1 = makeBotApi(view, createRng(hashSeed('det:1')));
    const api2 = makeBotApi(view, createRng(hashSeed('det:2')));
    const a1 = api1.stratege(400);
    const a2 = api2.stratege(400);
    expect(a2).toEqual(a1);
  }, 120000);
});
