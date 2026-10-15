import { TextEncoder, TextDecoder } from 'util';
import { createGame, applyAction, getView } from '../engine/engine';
import { customDungeonErrors, customDungeonRoster, addCustomDungeonMonster } from '../engine/customDungeons';
import { dungeonEncounter, dungeonCapacity, removeDungeonMember } from '../engine/encounters';
import { customMapErrors } from '../engine/customMaps';
import { emptyCreations, validCreations, persistCreations, readCreations } from '../ui/creationsStore';
import { buildAtelierArchive, prepareAtelierFiles } from '../ui/atelierArchive';
import { LiveMatch } from '../game/liveMatch';
import { runMatch } from '../arena/runner';
import { peerSettings, PeerMatch, stateHash } from '../game/peerMatch';
import { emptyLoadout } from '../engine/equipment';

const battlefield = require('../../examples/winterfell-last-stand/battlefield.cjs');
const clone = x => JSON.parse(JSON.stringify(x));
const room = () => ({ id: 'army', name: 'La dernière bataille', mapId: battlefield.id, battlefield: clone(battlefield),
  encounter: { version: 1, mode: 'army', commander: 0 }, members: [{ monsterId: 494, grade: 1, count: 1 }, { monsterId: 494, grade: 2, count: 31 }] });
const fighter = { id: 'A', team: 'A', classId: 'IOP' };
const begin = dungeon => createGame({ mapId: dungeon.mapId, battlefield: dungeon.battlefield, encounter: dungeonEncounter(dungeon),
  seed: 7, fighters: [fighter, ...customDungeonRoster(dungeon)] }).state;
beforeAll(() => { global.TextEncoder = TextEncoder; global.TextDecoder = TextDecoder; });

test('army capacity is explicit; standard rooms keep eight and malformed rules are rejected', () => {
  const dungeon = room(); expect(customDungeonErrors(dungeon)).toEqual([]); expect(dungeonCapacity(dungeon)).toBe(32);
  expect(customDungeonRoster(dungeon)).toHaveLength(32);
  expect(addCustomDungeonMonster(dungeon, { monsterId: 494, grade: 1 })).toBe(dungeon);
  for (const mutate of [d => delete d.encounter, d => d.members[1].count++, d => d.encounter.commander = 1,
    d => d.encounter.commander = 100, d => d.encounter.extra = true, d => d.encounter.mode = 'unlimited']) {
    const bad = room(); mutate(bad); expect(customDungeonErrors(bad).length).toBeGreaterThan(0);
    expect(validCreations({ ...emptyCreations(), dungeons: [bad] })).toBe(false);
  }
});
test('32 enemies get distinct legal starts; army never expands the player team or grants summon status', () => {
  const state = begin(room()); expect(Object.values(state.fighters)).toHaveLength(33);
  expect(new Set(Object.values(state.fighters).map(f => JSON.stringify(f.pos))).size).toBe(33);
  expect(Object.values(state.fighters).every(f => !f.isSummon && !f.ownerId && f.leader)).toBe(true);
  expect(state.fighters.B.pos).toEqual(battlefield.startingCells[1][0]);
  const cfg = { mapId: battlefield.id, battlefield, encounter: { version: 1, mode: 'army' }, fighters: [fighter, ...customDungeonRoster(room())] };
  expect(() => createGame({ ...cfg, fighters: [...cfg.fighters, { id: 'B33', team: 'B', monsterId: 494, monsterGrade: 1 }] })).toThrow();
  expect(() => createGame({ ...cfg, fighters: [...cfg.fighters, ...Array.from({ length: 8 }, (_, i) => ({ ...fighter, id: `A${i+2}` }))] })).toThrow();
  expect(() => createGame({ ...cfg, encounter: { version: 1, mode: 'army', commanderId: 'A' } })).toThrow();
});
test('actual killing blow to the commander removes 31 followers, their debuffs, and wins once', () => {
  const state = begin(room());
  state.currentIndex = state.order.indexOf('A'); state.fighters.A.pos = { x: 15, y: 24 }; state.fighters.B.pos = { x: 15, y: 23 };
  state.fighters.B.hp = 1; state.fighters.A.pa = 100;
  state.fighters.A.effects.push({ kind: 'buff', stat: 'pm', value: -1, turnsLeft: 4, name: 'Malédiction', source: 'B8' });
  const spell = getView(state, 'A').you.spells.find(s => s.effects.some(e => e.kind === 'damage') && s.range[0] <= 1 && s.range[1] >= 1);
  const result = applyAction(state, { type: 'CAST', spell: spell.key, target: state.fighters.B.pos });
  expect(result.ok).toBe(true); expect(result.state.winner).toBe('A'); expect(result.state.endReason).toBe('ko');
  expect(result.events.filter(e => e.t === 'death')).toHaveLength(32);
  expect(result.events.filter(e => e.t === 'match_end')).toHaveLength(1);
  expect(result.state.fighters.A.effects.some(e => e.source === 'B8')).toBe(false);
  expect(getView(state, 'A').enemies.find(f => f.id === 'B8').defeatWith).toBe('B');
});
test('removing a member preserves the commander identity or clears it when that member is removed', () => {
  const dungeon = room(); dungeon.members.reverse(); dungeon.encounter.commander = 1;
  expect(dungeonEncounter(dungeon).commanderId).toBe('B32');
  expect(removeDungeonMember(dungeon, 0).encounter.commander).toBe(0);
  expect(removeDungeonMember(dungeon, 1).encounter.commander).toBeNull();
});
test('army saves and exports as a standalone room without changing ordinary rooms', async () => {
  const dungeon = room(); delete dungeon.battlefield; dungeon.mapId = 'arene';
  const data = { ...emptyCreations(), dungeons: [dungeon] };
  persistCreations(localStorage, data); expect(readCreations(localStorage).value).toEqual(data);
  const archive = await buildAtelierArchive({ dungeons: [dungeon] });
  expect(archive.warnings).toEqual([]);
  const files = new Map([['atelier.json', new TextEncoder().encode(JSON.stringify(archive.manifest))]]);
  const imported = await prepareAtelierFiles(files, { newId: () => 'imported-army' });
  expect(imported.dungeons[0].encounter).toEqual(dungeon.encounter);
  expect(begin({ ...imported.dungeons[0], mapId: battlefield.id, battlefield }).fighters.B32).toBeDefined();
});
test('manual, AI and guest snapshots preserve army rules and the original large map', () => {
  const dungeon = room(), decide = () => ({ type: 'PASS' });
  const live = new LiveMatch({ mode: 'custom', dungeon, playerClass: 'IOP', botClass: 'IOP', botName: 'IA', botDecide: decide, seed: 7 });
  const auto = runMatch({ mode: 'custom', dungeon, seed: 7, classes: { A: 'IOP', B: 'IOP' }, collectFrames: false,
    bots: { A: { name: 'A', decide }, B: { name: 'B', decide } } });
  const settings = peerSettings({ mode: 'custom', mapId: battlefield.id, battlefield, encounter: dungeonEncounter(dungeon), seed: 7 });
  const units = [{ id: 'a', team: 'A', owner: 'host', controller: 'player', member: { count: 1, character: { name: 'A', classId: 'IOP', loadout: emptyLoadout('IOP') } } },
    ...Array.from({ length: 32 }, (_, i) => ({ id: `b${i}`, team: 'B', owner: 'host', controller: 'ai', member: { monsterId: 494, grade: 1, count: 1 } }))];
  const host = new PeerMatch(settings, units, 'host'), guest = new PeerMatch(settings, units, 'guest', { state: clone(host.state), events: host.initialEvents });
  for (const state of [live.state, auto.finalState, host.state, guest.state]) {
    expect(state.board.width).toBe(32); expect(state.fighters.B32.defeatWith).toBe('B');
  }
  expect(stateHash(host.state)).toBe(stateHash(guest.state));
});
test('large map bounds remain checked against its artwork and paths', () => {
  expect(customMapErrors(battlefield)).toEqual([]);
  const huge = clone(battlefield); huge.width = 41; expect(customMapErrors(huge).length).toBeGreaterThan(0);
  const clipped = clone(battlefield); clipped.background.width = 1000; expect(customMapErrors(clipped).length).toBeGreaterThan(0);
});
