import { emptyLoadout } from '../engine/equipment';
import { opponentTeamErrors } from '../engine/opponentTeam';
import { LiveMatch } from '../game/liveMatch';
import { runMatch } from '../arena/runner';
import { compileOpponentBots } from '../ui/opponentBots';
import { readOpponentTeam, persistOpponentTeam, OPPONENTS_STORAGE } from '../ui/opponentTeamStore';

const character = (name, botId) => ({ kind: 'character', name, classId: 'CRA', botId,
  loadout: { ...emptyLoadout('CRA'), level: 200, base: {} } });
const monster = { kind: 'monster', monsterId: 494, grade: 2 };
const bot = id => ({ id, name: id, code: `let calls = 0; function decide() {
  calls++; return calls % 2 ? { type: 'SAY', text: '${id}-' + calls } : { type: 'PASS' }; }` });
const bots = [bot('alpha'), bot('beta')];
const speakers = events => Object.fromEntries(['B', 'B2', 'B3'].map(id => [id, events.find(e => e.t === 'say' && e.fighter === id)?.text]));

test('each opponent gets its selected AI and independent memory, even when the same profile or script is repeated', () => {
  const compiled = compileOpponentBots([character('Un', 'alpha'), monster, character('Deux', 'beta'), character('Copie', 'alpha')], bots);
  expect(Object.keys(compiled)).toEqual(['B', 'B3', 'B4']);
  expect(compiled.B.decide().text).toBe('alpha-1');
  expect(compiled.B.decide().type).toBe('PASS');
  expect(compiled.B3.decide().text).toBe('beta-1');
  expect(compiled.B4.decide().text).toBe('alpha-1');
  expect(compileOpponentBots([character('Ancien')], bots, 'beta').B.name).toBe('beta');
});

test('live combat runs the selected AI on each opponent, including an explicit monster override', () => {
  const opponents = [character('Un', 'alpha'), character('Deux', 'beta'), { ...monster, botId: 'beta' }];
  const fallback = jest.fn(() => ({ type: 'PASS' }));
  const match = new LiveMatch({ playerClass: 'IOP', mode: 'duel', mapId: 'canyon', seed: 17,
    opponents, opponentBots: compileOpponentBots(opponents, bots), botDecide: fallback });
  match.ready(); match.state.order = ['A', 'B', 'B2', 'B3']; match.state.currentIndex = 0;
  const events = [];
  for (let i = 0; i < 8; i++) events.push(...(match.isHumanTurn() ? match.humanAct({ type: 'PASS' }) : match.botStep()).events);
  expect(speakers(events)).toEqual({ B: 'alpha-1', B2: 'beta-1', B3: 'beta-1' });
  expect(fallback).not.toHaveBeenCalled();
  expect(events.filter(e => e.t === 'bot_error')).toEqual([]);
});

test('automatic combat keeps per-opponent choices in its replay and runs distinct character and monster AIs', () => {
  const opponents = [{ ...monster, botId: 'beta' }, character('Un', 'alpha'), character('Deux', 'beta')];
  const result = runMatch({ classes: { A: 'IOP' }, mapId: 'canyon', seed: 17, opponents,
    bots: { A: { name: 'Vous', decide: () => ({ type: 'PASS' }) }, ...compileOpponentBots(opponents, bots) } });
  expect(speakers(result.events)).toEqual({ B: 'beta-1', B2: 'alpha-1', B3: 'beta-1' });
  expect(result.config.opponents).toEqual(opponents);
  expect(result.events.filter(e => ['bot_error', 'invalid'].includes(e.t))).toEqual([]);
});

test('an unconfigured monster keeps its native AI when another enemy uses a selected script', () => {
  const opponents = [monster, character('Un', 'alpha')];
  const match = new LiveMatch({ playerClass: 'IOP', mode: 'duel', mapId: 'canyon', seed: 17,
    opponents, opponentBots: compileOpponentBots(opponents, bots) });
  match.ready(); match.state.order = ['B', 'B2', 'A']; match.state.currentIndex = 0;
  expect(match.botStep().events.some(e => e.t === 'say')).toBe(false);
  expect(match.current().id).toBe('B2');
  expect(match.botStep().events).toContainEqual(expect.objectContaining({ t: 'say', fighter: 'B2', text: 'alpha-1' }));
  const result = runMatch({ classes: { A: 'IOP' }, opponents, seed: 17,
    bots: { A: { name: 'Vous', decide: () => ({ type: 'PASS' }) }, ...compileOpponentBots(opponents, bots) } });
  expect(result.events.some(e => e.t === 'say' && e.fighter === 'B')).toBe(false);
  expect(result.events.some(e => e.t === 'bot_error')).toBe(false);
});

test('old shared choices migrate once; reload and removing another fighter preserve independent AI selections', () => {
  const data = new Map(), storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
  persistOpponentTeam(storage, [character('Ancien'), character('Choisi', 'alpha'), monster]);
  const restored = readOpponentTeam(storage, 'beta');
  expect(restored.entries.map(e => e.botId)).toEqual(['beta', 'alpha', undefined]);
  persistOpponentTeam(storage, restored.entries);
  expect(readOpponentTeam(storage, 'alpha')).toEqual(restored);
  persistOpponentTeam(storage, restored.entries.slice(1));
  expect(compileOpponentBots(readOpponentTeam(storage).entries, bots).B.name).toBe('alpha');
  expect(readOpponentTeam(storage).entries[0].loadout).toEqual(restored.entries[1].loadout);
  expect(JSON.parse(storage.getItem(OPPONENTS_STORAGE)).version).toBe(1);
});

test('missing, broken or malformed individual AI choices are rejected with the affected opponent name', () => {
  expect(() => compileOpponentBots([character('Gardienne', 'removed')], bots)).toThrow(/Gardienne.*IA disponible/);
  expect(() => compileOpponentBots([{ ...monster, botId: 'removed' }], bots)).toThrow(/Poutch Ingball.*IA disponible/);
  expect(() => compileOpponentBots([character('Gardienne', 'bad')], [...bots, { id: 'bad', name: 'Cassée', code: '!!! invalid syntax' }])).toThrow(/Gardienne · Cassée/);
  for (const botId of [17, {}, [], '', ' ']) expect(opponentTeamErrors([character('Invalide', botId)]).length).toBeGreaterThan(0);
  expect(compileOpponentBots([monster], bots, 'removed')).toEqual({});
  expect(compileOpponentBots([character('Valide', 'alpha')], bots, 'removed').B.name).toBe('alpha');
});
