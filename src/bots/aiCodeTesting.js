// Shared by Studio imports and the portable Node test kit. No browser storage.
import { parse } from 'acorn';
import { compileBot } from './compile';
import { createGame, getView, validateAction, spellsOf } from '../engine/engine';
import { makeBotApi, stateFromView } from './api';
import { createRng } from '../engine/rng';
import { runMatchAsync } from '../arena/runner';
import { BUILTIN_BOTS } from './builtins';

export const AI_CODE_LIMIT = 250000;
export const TEST_OPPONENTS = ['maison', 'cortex', 'brutus', 'plume', 'toubib', 'pantin'];

// Parse without evaluating top-level JavaScript. Importing a file is not a test run.
export function inspectAiSource(code) {
  if (typeof code !== 'string' || !code.trim() || code.length > AI_CODE_LIMIT) {
    return { ok: false, error: 'Code JavaScript requis, limité à 250 Ko.' };
  }
  try {
    const ast = parse(code, { ecmaVersion: 'latest', sourceType: 'script' });
    const binding = ast.body.find(n => n.type === 'FunctionDeclaration' && n.id?.name === 'decide')
      || ast.body.flatMap(n => n.type === 'VariableDeclaration' ? n.declarations : []).find(n => n.id?.name === 'decide');
    if (!binding) throw new Error('Définissez function decide(view, api) à la racine du fichier, sans import/export.');
    if (binding.async || binding.generator || binding.init?.async || binding.init?.generator) {
      throw new Error('decide doit retourner une action immédiatement, sans async ni générateur.');
    }
    return { ok: true, error: null };
  } catch (error) { return { ok: false, error: error.message }; }
}

export function checkAiAction(view, action) {
  if (!action || typeof action !== 'object' || Array.isArray(action) || typeof action.then === 'function') {
    return { ok: false, error: 'decide doit retourner une action synchrone.' };
  }
  if (action.type === 'SAY') return typeof action.text === 'string' && action.text.length <= 80
    ? { ok: true, error: null } : { ok: false, error: 'SAY : texte requis, 80 caractères maximum.' };
  try {
    const result = validateAction(stateFromView(view), action);
    return { ok: result.ok, error: result.reason || null };
  } catch (error) { return { ok: false, error: error.message }; }
}

// Deliberately expose unsupported model calls instead of silently testing Maison
// when a neural model or browser worker has not been loaded in Node.
function portableApi(api) {
  return { ...api, neural: () => { throw new Error('api.neural nécessite les modèles du navigateur ; utilisez le laboratoire du jeu.'); },
    strategeNet: () => { throw new Error('api.strategeNet nécessite le worker et les modèles du navigateur.'); } };
}

export function aiTestCases(fighter) {
  const make = (mapId = 'arene', allies = false) => {
    const { state } = createGame({ seed: 12000, mapId, fighters: [
      { ...fighter, id: 'A', team: 'A' }, { id: 'B', team: 'B', classId: 'CRA' },
      ...(allies ? [{ id: 'A2', team: 'A', classId: 'IOP', name: 'Allié blessé' }] : []),
    ] });
    state.currentIndex = state.order.indexOf('A');
    return state;
  };
  const scenario = (name, edit = () => {}, mapId, allies) => {
    const state = make(mapId, allies); edit(state);
    return { name, view: getView(state, 'A') };
  };
  return [
    scenario('Ouverture'),
    scenario('Obstacles', undefined, 'muraille'),
    scenario('Contact', state => {
      const me = state.fighters.A, api = makeBotApi(getView(state, 'A'), createRng(1));
      const pos = [[1,0],[-1,0],[0,1],[0,-1]].map(([x,y]) => ({ x: me.pos.x+x, y: me.pos.y+y })).find(api.isFree);
      if (pos) state.fighters.B.pos = pos;
    }),
    scenario('PV bas', s => { s.fighters.A.hp = Math.max(1, Math.floor(s.fighters.A.maxHp * .2)); }),
    scenario('Allié blessé', s => { s.fighters.A2.hp = 1; }, 'arene', true),
    scenario('Aucun PA', s => { s.fighters.A.pa = 0; }),
    scenario('Aucun PM', s => { s.fighters.A.pm = 0; }),
    scenario('PA et PM épuisés', s => { s.fighters.A.pa = 0; s.fighters.A.pm = 0; }),
    scenario('Sorts en relance', s => { s.fighters.A.cooldowns = Object.fromEntries(Object.keys(spellsOf(s.fighters.A)).map(key => [key, 2])); }),
    scenario('Ennemi invisible', s => { s.fighters.B.effects.push({ kind: 'invisibility', remaining: 2, source: 'B' }); }),
  ];
}

// In-process helpers are intended for trusted local code. The CLI runs them in
// a worker with a deadline, so non-terminating user code can be stopped.
export function checkAiCode({ code, fighter, cases = aiTestCases(fighter), seed = 12000 }) {
  const syntax = inspectAiSource(code);
  if (!syntax.ok) return { ok: false, syntax, cases: [], errors: [syntax.error] };
  const results = cases.map(({ name, view }, i) => {
    try {
      const decide = compileBot(code), input = JSON.parse(JSON.stringify(view));
      const action = decide(input, portableApi(makeBotApi(input, createRng(seed + i))));
      // Check against the untouched view, not an object the AI could mutate.
      const result = checkAiAction(view, action);
      return { name, ...result, action };
    } catch (error) { return { name, ok: false, error: error.message }; }
  });
  return { ok: results.every(r => r.ok), syntax, cases: results,
    errors: results.filter(r => !r.ok).map(r => `${r.name}: ${r.error}`) };
}

export async function benchmarkAiCode({ code, fighter, opponent = fighter, against = 'maison', opponentCode,
  seed = 12000, count = 6 }, { onProgress } = {}) {
  if (![1, 6].includes(count)) throw new Error('Choisissez 1 ou 6 combats.');
  if (!Number.isInteger(seed) || seed < 0 || seed > 2147483644) throw new Error('Graine : entier entre 0 et 2 147 483 644.');
  const rival = opponentCode || BUILTIN_BOTS.find(b => b.id === against && TEST_OPPONENTS.includes(b.id))?.code;
  if (!rival) throw new Error(`Adversaire inconnu. Choix : ${TEST_OPPONENTS.join(', ')} ou fichier .js.`);
  for (const source of [code, rival]) { const r = inspectAiSource(source); if (!r.ok) throw new Error(r.error); }
  const games = [];
  for (let i = 0; i < count; i++) {
    const side = i % 2 ? 'B' : 'A', other = side === 'A' ? 'B' : 'A';
    const observed = [], calls = { [side]: 0, [other]: 0 };
    const track = (source, id) => {
      const decide = compileBot(source);
      return (view, api) => {
        calls[id]++;
        const original = JSON.parse(JSON.stringify(view));
        const action = decide(view, portableApi(api));
        const checked = checkAiAction(original, action);
        if (!checked.ok) observed.push({ fighter: id, turn: view.turn, reason: checked.error, action });
        return action;
      };
    };
    const mapId = ['arene', 'muraille', 'canyon'][Math.floor(i / 2)];
    const match = await runMatchAsync({
      bots: { [side]: { name: 'Mon IA', decide: track(code, side) }, [other]: { name: against, decide: track(rival, other) } },
      classes: { [side]: fighter.classId, [other]: opponent.classId },
      loadouts: { [side]: fighter.loadout, [other]: opponent.loadout },
      seed: seed + Math.floor(i / 2), mapId, collectFrames: false,
    }, { onProgress: progress => onProgress?.({ game: i + 1, count, ...progress }), yieldControl: async () => {} });
    const events = match.events.filter(e => ['invalid', 'bot_error', 'forfeit_turn'].includes(e.t));
    const ownEvents = events.filter(e => e.fighter === side), otherEvents = events.filter(e => e.fighter === other);
    const ownObserved = observed.filter(e => e.fighter === side);
    const game = { side, mapId, seed: seed + Math.floor(i / 2), turns: match.turns, endReason: match.endReason,
      outcome: match.winner === side ? 'win' : match.winner === null ? 'draw' : 'loss',
      decisions: calls[side], stats: match.stats[side], opponentStats: match.stats[other],
      remainingHp: match.finalState.fighters[side].hp, opponentHp: match.finalState.fighters[other].hp,
      invalidActions: Math.max(ownObserved.length, ownEvents.filter(e => e.t === 'invalid').length),
      errors: ownEvents.filter(e => e.t === 'bot_error').length,
      problems: [...ownObserved, ...ownEvents].slice(0, 20),
      opponentProblems: [...observed.filter(e => e.fighter === other), ...otherEvents].slice(0, 20) };
    games.push(game);
  }
  const summary = { wins: games.filter(g => g.outcome === 'win').length, losses: games.filter(g => g.outcome === 'loss').length,
    draws: games.filter(g => g.outcome === 'draw').length, invalidActions: games.reduce((n,g) => n + g.invalidActions, 0),
    errors: games.reduce((n,g) => n + g.errors, 0), meanTurns: games.reduce((n,g) => n + g.turns, 0) / games.length };
  return { ok: !summary.invalidActions && !summary.errors, summary, games,
    comparisonValid: games.every(g => !g.opponentProblems.length) };
}
