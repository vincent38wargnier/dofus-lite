// The referee. Runs a full bot-vs-bot match headlessly and records every
// event plus a state snapshot per step, so the UI can replay the fight at
// any speed (or a tournament can just read the result).
//
// Fairness rules enforced here, not in the bots:
//   - a bot only ever sees a cloned view + the api
//   - one action per decide() call, MAX_ACTIONS_PER_TURN per turn
//   - 3 invalid actions in a turn, or an exception => turn is forfeited
//   - api.random() is seeded => a match is 100% reproducible from its config

import { createGame, applyAction, getView, currentFighter } from '../engine/engine';
import { createRng, hashSeed } from '../engine/rng';
import { makeBotApi } from '../bots/api';
import { utilityDecide } from '../bots/utilityBrain';

export const MAX_ACTIONS_PER_TURN = 25;
export const MAX_SAYS_PER_TURN = 2;
export const MAX_INVALID_PER_TURN = 3;

export function runMatch({
  bots,            // { A: {name, decide}, B: {name, decide} }
  classes,         // { A: 'IOP', B: 'CRA' }
  mapId = 'arene',
  seed = 1,
  collectFrames = true,
}) {
  const init = createGame({
    mapId,
    seed,
    fighters: [
      { id: 'A', name: bots.A.name, botName: bots.A.name, classId: classes.A },
      { id: 'B', name: bots.B.name, botName: bots.B.name, classId: classes.B },
    ],
  });

  let state = init.state;
  const frames = [];
  const allEvents = [];
  const stats = {
    A: { damageDealt: 0, healingDone: 0, actions: 0, invalid: 0, errors: 0 },
    B: { damageDealt: 0, healingDone: 0, actions: 0, invalid: 0, errors: 0 },
  };

  const record = (events) => {
    allEvents.push(...events);
    for (const e of events) {
      if (e.t === 'damage' && (e.source === 'A' || e.source === 'B')) {
        stats[e.source].damageDealt += e.amount;
      }
      if (e.t === 'heal' && (e.target === 'A' || e.target === 'B')) {
        stats[e.target].healingDone += e.amount;
      }
    }
    if (collectFrames && events.length) {
      frames.push({ events, state });
    }
  };

  record(init.events);

  // One RNG stream per bot, derived from the match seed: deterministic,
  // and a bot can't drain the opponent's stream.
  const botRngs = {
    A: createRng(hashSeed(`${seed}:A`)),
    B: createRng(hashSeed(`${seed}:B`)),
  };

  // Les invocations sont autonomes: le cerveau utilitaire joue leur tour
  // (comme les serveurs 1.29 où chaque monstre a sa propre IA).
  const summonRngs = {};
  const summonBot = (fid) => {
    if (!summonRngs[fid]) summonRngs[fid] = createRng(hashSeed(`${seed}:${fid}`));
    return {
      name: fid,
      decide: (view, api) => utilityDecide(view, api),
      rng: summonRngs[fid],
    };
  };

  let guard = 0;
  while (!state.over && guard < 20000) {
    guard += 1;
    const current = currentFighter(state);
    const fid = current.id;
    const bot = current.isSummon ? summonBot(fid) : bots[fid];
    const turnAtStart = state.turn;

    let actionsThisTurn = 0;
    let saysThisTurn = 0;
    let invalidThisTurn = 0;

    // Play out this fighter's whole turn.
    while (!state.over) {
      let action = null;
      try {
        const view = getView(state, fid);
        const api = makeBotApi(view, bot.rng || botRngs[fid]);
        action = bot.decide(view, api);
      } catch (err) {
        if (stats[fid]) stats[fid].errors += 1;
        record([{ t: 'bot_error', fighter: fid, message: String(err && err.message ? err.message : err) }]);
        action = { type: 'PASS' };
      }

      if (!action || typeof action.type !== 'string') {
        invalidThisTurn += 1;
        record([{ t: 'invalid', fighter: fid, reason: 'decide() n\'a pas retourné d\'action' }]);
        action = invalidThisTurn >= MAX_INVALID_PER_TURN ? { type: 'PASS' } : null;
        if (!action) continue;
      }

      // "say" is arena flavor, not an engine action.
      if (action.type === 'SAY') {
        saysThisTurn += 1;
        if (saysThisTurn <= MAX_SAYS_PER_TURN) {
          record([{ t: 'say', fighter: fid, text: String(action.text || '').slice(0, 80) }]);
        }
        actionsThisTurn += 1;
        if (actionsThisTurn >= MAX_ACTIONS_PER_TURN) action = { type: 'PASS' };
        else continue;
      }

      const result = applyAction(state, action);
      state = result.state; // d'abord l'état, ensuite le frame: un frame montre l'état APRÈS ses événements
      record(result.events);
      if (stats[fid]) stats[fid].actions += 1;

      if (!result.ok) {
        invalidThisTurn += 1;
        if (stats[fid]) stats[fid].invalid += 1;
        if (invalidThisTurn >= MAX_INVALID_PER_TURN) {
          record([{ t: 'forfeit_turn', fighter: fid, reason: 'Trop d\'actions invalides' }]);
          const pass = applyAction(state, { type: 'PASS' });
          state = pass.state;
          record(pass.events);
          break;
        }
        continue;
      }

      actionsThisTurn += 1;

      // Turn is over when PASS was applied (current fighter or turn changed).
      if (action.type === 'PASS') break;
      if (state.over) break;

      if (actionsThisTurn >= MAX_ACTIONS_PER_TURN) {
        record([{ t: 'forfeit_turn', fighter: fid, reason: 'Budget d\'actions épuisé' }]);
        const pass = applyAction(state, { type: 'PASS' });
        record(pass.events);
        state = pass.state;
        break;
      }
    }

    // Safety: a turn must actually have ended or the match be over.
    if (!state.over && currentFighter(state).id === fid && state.turn === turnAtStart) {
      const pass = applyAction(state, { type: 'PASS' });
      record(pass.events);
      state = pass.state;
    }
  }

  if (!state.over) {
    // Guard tripped — should never happen, but never hang the browser.
    record([{ t: 'match_end', winner: null, reason: 'guard' }]);
  }

  return {
    config: { mapId, seed, classes, botNames: { A: bots.A.name, B: bots.B.name } },
    winner: state.winner,          // 'A' | 'B' | null (draw)
    endReason: state.endReason,
    turns: state.turn,
    finalState: state,
    stats,
    events: allEvents,
    frames,
  };
}
