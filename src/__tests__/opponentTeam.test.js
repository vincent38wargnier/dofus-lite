import { emptyLoadout } from '../engine/equipment';
import { opponentRoster, opponentTeamErrors } from '../engine/opponentTeam';
import { LiveMatch } from '../game/liveMatch';
import { runMatch } from '../arena/runner';
import { readOpponentTeam, persistOpponentTeam, OPPONENTS_STORAGE } from '../ui/opponentTeamStore';
import { CREATION_SPELLS_BY_ID } from '../ui/creationCatalogue';
import { spellsOf } from '../engine/engine';

const loadout = { ...emptyLoadout('IOP'), level: 200, base: { force: 100 }, slots: { weapon: 2416 },
  spells: { custom: [202, 350].map(id => CREATION_SPELLS_BY_ID[id].grades.at(-1)), order: [350, 202] } };
const character = { kind: 'character', name: 'Sentinelle', classId: 'IOP', sourceId: 'profile', loadout };
const monster = { kind: 'monster', monsterId: 494, grade: 2 };

test('mixed opponents retain exact profiles and monster grades, get separate team IDs, and never mutate saved profiles', () => {
  const before = JSON.parse(JSON.stringify(character));
  const roster = opponentRoster([character, monster, character]);
  expect(roster.map(entry => [entry.id, entry.team])).toEqual([['B', 'B'], ['B2', 'B'], ['B3', 'B']]);
  expect(roster[1]).toMatchObject({ monsterId: 494, monsterGrade: 2 });
  roster[0].loadout.base.force = 0;
  expect(character).toEqual(before);
  expect(roster[2].loadout).toEqual(loadout);
});

test('legacy manual combat retains custom spells and still supports its shared fallback AI', () => {
  const decide = jest.fn(() => ({ type: 'PASS' }));
  const match = new LiveMatch({ playerClass: 'CRA', mode: 'duel', mapId: 'dungeon_2083', seed: 17,
    opponents: [character, monster, character], botDecide: decide, loadouts: { A: emptyLoadout('CRA') } });
  const enemies = Object.values(match.state.fighters).filter(f => f.team === 'B');
  expect(enemies).toHaveLength(3);
  expect(match.state.mapId).toBe('dungeon_2083');
  expect(new Set(Object.values(match.state.fighters).map(f => `${f.pos.x},${f.pos.y}`)).size).toBe(4);
  expect(Object.values(spellsOf(match.state.fighters.B)).filter(spell => !spell.isWeapon).map(spell => spell.id).sort()).toEqual([202, 350]);
  expect(match.state.fighters.B.loadout).toMatchObject(loadout);
  expect(match.state.fighters.B2).toMatchObject({ monsterId: 494, monsterGrade: 2, basePa: 0 });
  match.ready();
  const events = [];
  for (let i = 0; i < 12; i++) events.push(...(match.isHumanTurn() ? match.humanAct({ type: 'PASS' }) : match.botStep()).events);
  expect(decide.mock.calls.map(([view]) => view.you.id)).toEqual(expect.arrayContaining(['B', 'B3']));
  expect(events.some(event => event.t === 'bot_error')).toBe(false);
});

test('automatic combat controls every character in a mixed group and records all opponents for replay', () => {
  const acted = new Set();
  const opponents = [monster, character, character];
  const result = runMatch({ mode: 'duel', opponents, classes: { A: 'CRA' }, loadouts: { A: emptyLoadout('CRA') },
    mapId: 'canyon', seed: 73, bots: { A: { name: 'Vous', decide: () => ({ type: 'PASS' }) },
      B: { name: 'IA choisie', decide: view => { acted.add(view.you.id); return { type: 'PASS' }; } } } });
  expect([...acted].sort()).toEqual(['B2', 'B3']);
  expect(result.events.filter(event => ['bot_error', 'invalid'].includes(event.t))).toEqual([]);
  expect(result.config.opponents).toEqual(opponents);
  expect(result.finalState.fighters.B).toMatchObject({ isMonster: true, monsterGrade: 2 });
});

test('monster-only automatic groups do not need a character AI', () => {
  const result = runMatch({ mode: 'duel', opponents: [monster], classes: { A: 'IOP' }, seed: 3,
    bots: { A: { name: 'Vous', decide: () => ({ type: 'PASS' }) } } });
  expect(result.events.some(event => event.t === 'bot_error')).toBe(false);
});

test('empty, oversized, unknown and invalid-loadout groups are rejected before combat', () => {
  for (const entries of [[], Array(9).fill(monster), [{ ...monster, monsterId: -1 }], [{ ...monster, grade: 99 }],
    [{ ...character, loadout: { ...loadout, level: 1, base: { force: 99999 } } }]]) {
    expect(opponentTeamErrors(entries).length).toBeGreaterThan(0);
    expect(() => opponentRoster(entries)).toThrow();
  }
  expect(opponentRoster(Array(8).fill(monster))).toHaveLength(8);
});

test('the persisted selection includes copied equipment and exact grades; malformed data is reported without deleting it', () => {
  const data = new Map(); const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
  persistOpponentTeam(storage, [character, monster]);
  expect(readOpponentTeam(storage)).toEqual({ entries: [{ ...character, botId: 'maison' }, monster], error: '' });
  persistOpponentTeam(storage, []);
  expect(readOpponentTeam(storage).entries).toEqual([]);
  storage.setItem(OPPONENTS_STORAGE, '{broken');
  expect(readOpponentTeam(storage).error).toBeTruthy();
  expect(storage.getItem(OPPONENTS_STORAGE)).toBe('{broken');
  const malformed = JSON.stringify({ version: 1, entries: [{ ...character, loadout: { slots: null } }] });
  storage.setItem(OPPONENTS_STORAGE, malformed);
  expect(readOpponentTeam(storage)).toMatchObject({ entries: null });
  expect(readOpponentTeam(storage).error).toBeTruthy();
  expect(storage.getItem(OPPONENTS_STORAGE)).toBe(malformed);
});
