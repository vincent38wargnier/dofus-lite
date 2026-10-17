import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { buildWorldCatalogue, worldCombatChoice } from '../ui/worldCatalogue';
import { selectionForCatalogue } from '../platform/playNavigation';
import { WorldsProvider } from '../ui/WorldsContext';
import { LoadoutsProvider } from '../ui/LoadoutsContext';
import { CreationsProvider } from '../ui/CreationsContext';
import { ProfilesProvider } from '../ui/ProfilesContext';
import { CREATIONS_STORAGE } from '../ui/creationsStore';
import { readPlayerSetup, SETUP_STORAGE } from '../ui/playerSetupState';
import { emptyLoadout } from '../engine/equipment';
import { newWorkshopCreature, starterSpell } from '../ui/workshopStarters';
import { MAPS } from '../engine/maps';
import { LiveMatch } from '../game/liveMatch';
import { runMatch } from '../arena/runner';
import { peerSettings } from '../game/peerMatch';
import { opponentRoster, opponentSummary } from '../engine/opponentTeam';
import { persistOpponentTeam, readOpponentTeam } from '../ui/opponentTeamStore';
import { spellsOf } from '../engine/engine';
import { BUILTIN_BOTS } from '../bots/builtins';
import PlayScreen from '../ui/PlayScreen';
import { creationSpellCatalogue } from '../ui/creationCatalogue';
import { originalCombatVisuals } from '../visuals/spellVisuals';

const battlefield = require('../../examples/winterfell/battlefield.cjs');
const dofus = { id: 'dofus-hash', name: 'Dofus', release: '1.0.0', kind: 'catalogue', catalogue: {
  classData: { names: { IOP: 'Iop', CRA: 'Crâ' } }, dungeonData: { encounters: [{ id: 'native-room', bossIds: [147], combatMapId: 'dungeon_2083' }] },
  outdoorMaps: [{ id: 'arene' }], monsterData: { monsters: {} },
} };
const hero = { id: 'hero', name: 'Héroïne du Nord', classId: 'IOP', loadout: { ...emptyLoadout('IOP'), level: 200, spells: { custom: [starterSpell()] } } };
const room = { id: 'old-asterix', name: 'Ancien Astérix', mapId: battlefield.id, battlefield, members: [{ customMonster: newWorkshopCreature(), count: 1 }] };
const world = { id: 'north-hash', name: 'Nord', release: '2.0.0', imported: { dungeons: [room.id], characters: [hero.id] } };
const libraries = [dofus, world];
beforeAll(() => { HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); }; HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); }; });
beforeEach(() => localStorage.clear());

test('Dofus navigation explicitly replaces a saved custom adventure and selects its own catalogue', () => {
  localStorage.setItem(CREATIONS_STORAGE, JSON.stringify({ version: 1, characters: [hero], dungeons: [room] }));
  localStorage.setItem(SETUP_STORAGE, JSON.stringify({ mode: 'boss', customDungeonId: room.id, playerClass: 'IOP' }));
  render(<LoadoutsProvider><CreationsProvider><WorldsProvider libraries={libraries} initialWorldId={dofus.id}><ProfilesProvider>
    <PlayScreen allBots={BUILTIN_BOTS} selectionRequest={selectionForCatalogue(dofus)} />
  </ProfilesProvider></WorldsProvider></CreationsProvider></LoadoutsProvider>);
  const dialog = within(screen.getByRole('dialog', { name: 'Choisir un combat' }));
  expect(dialog.getByLabelText('Monde')).toHaveValue(dofus.id);
  expect(dialog.queryByRole('button', { name: /Ancien Astérix/ })).not.toBeInTheDocument();
  expect(dialog.getByRole('button', { name: /Choisir Bouftou Royal/ })).toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem(SETUP_STORAGE))).toMatchObject({ mode: 'boss', bossId: 147, customDungeonId: null });
  fireEvent.click(dialog.getByRole('button', { name: 'C’est prêt' }));
  fireEvent.change(dialog.getByLabelText('Monde'), { target: { value: 'all' } });
  expect(dialog.getByLabelText('Monde')).toHaveValue('all');
  expect(JSON.parse(localStorage.getItem(SETUP_STORAGE))).toMatchObject({ mode: 'duel', customDungeonId: null });
});

test('world filtering uses archive ownership and exposes embedded heroes, maps and creature spellbooks', () => {
  const embedded = { ...room, adventure: { heroes: [{ id: 'provided', character: hero }] } };
  const catalogue = buildWorldCatalogue(libraries, { characters: [], dungeons: [embedded] });
  expect(catalogue.characters).toHaveLength(1);
  expect(catalogue.matches('characters', catalogue.characters[0].id, world.id)).toBe(true);
  expect(catalogue.matches('characters', catalogue.characters[0].id, dofus.id)).toBe(false);
  expect(catalogue.matches('classes', 'IOP', dofus.id)).toBe(true);
  expect(catalogue.matches('classes', 'IOP', 'personal')).toBe(false);
  expect(catalogue.monsters[0].customMonster).toEqual(room.members[0].customMonster);
  expect(catalogue.maps.find(m => m.battlefield).background).toEqual(battlefield.background);
  expect(worldCombatChoice(dofus.id, libraries, [room])).toMatchObject({ mode: 'boss', bossId: 147, customDungeonId: null });
  expect(worldCombatChoice(world.id, libraries, [room])).toMatchObject({ mode: 'boss', customDungeonId: room.id });
});

test('same map IDs in different archives stay independent and persist as a free-combat snapshot', () => {
  const other = { ...room, id: 'other-room', battlefield: { ...battlefield, name: 'Other field', obstacles: [] } };
  const catalogue = buildWorldCatalogue(libraries, { dungeons: [room, other] });
  const maps = catalogue.maps.filter(m => m.battlefield);
  expect(maps).toHaveLength(2); expect(maps[0].id).not.toBe(maps[1].id);
  expect(Object.keys(maps[0].obstacles).length).toBeGreaterThan(0); expect(maps[1].obstacles).toEqual({});
  expect(MAPS[maps[0].id]).toBeUndefined(); expect(MAPS[battlefield.id]).toBeUndefined();
  localStorage.setItem(SETUP_STORAGE, JSON.stringify({ mapId: maps[0].id, battlefield: maps[0].battlefield }));
  expect(readPlayerSetup(localStorage)).toMatchObject({ mapId: maps[0].id, battlefield: maps[0].battlefield });
  expect(peerSettings({ mode: 'duel', mapId: maps[0].id, battlefield: maps[0].battlefield, seed: 3 }).battlefield).toEqual(maps[0].battlefield);
});

test('custom creatures and native classes can fight manually and automatically on another world’s map', () => {
  const creature = { kind: 'monster', customMonster: room.members[0].customMonster };
  persistOpponentTeam(localStorage, [creature]); expect(readOpponentTeam(localStorage).entries).toEqual([creature]);
  const roster = opponentRoster([creature]); expect(roster[0].customMonster).toEqual(creature.customMonster);
  roster[0].customMonster.name = 'Independent'; expect(creature.customMonster.name).not.toBe('Independent');
  const config = { mode: 'duel', mapId: battlefield.id, battlefield, seed: 23, playerClass: 'IOP', classes: { A: 'IOP' },
    loadouts: { A: hero.loadout }, opponents: [creature], bots: { A: { name: 'Test', decide: () => ({ type: 'PASS' }) } } };
  const live = new LiveMatch(config); expect(live.state.board.name).toBe(battlefield.name);
  expect(live.state.fighters.B.hp).toBe(opponentSummary(creature).hp);
  expect(Object.values(spellsOf(live.state.fighters.B)).map(s => s.name)).toEqual(creature.customMonster.spells.map(s => s.name));
  const auto = runMatch({ ...config, collectFrames: false });
  expect(auto.finalState.board).toEqual(live.state.board);
  expect(Object.values(auto.stats).every(s => s.errors === 0 && s.invalid === 0)).toBe(true);
  expect(auto.config.battlefield).toEqual(battlefield);
});

test('the spell creator includes imported custom spells without altering native definitions', () => {
  const raw = hero.loadout.spells.custom[0];
  const catalogue = creationSpellCatalogue([{ spells: [raw], source: { id: 'custom-class:hero', type: 'class', name: hero.name } }]);
  expect(catalogue.find(s => s.id === raw.id).sources).toContainEqual({ id: 'custom-class:hero', type: 'class', name: hero.name });
  expect(catalogue.some(s => s.sources.some(source => source.id === 'class:IOP'))).toBe(true);
});

test('custom terrain preserves native guests’ actors and effects alongside authored creatures', () => {
  const live = new LiveMatch({ playerClass: 'IOP', mapId: battlefield.id, battlefield, seed: 3,
    opponents: [{ kind: 'monster', customMonster: room.members[0].customMonster }, { kind: 'monster', monsterId: 147, grade: 1 }] });
  const { board, fighters } = live.state;
  expect(board.originalVisuals).toBe(true);
  expect(originalCombatVisuals(board.originalVisuals, fighters.A)).toBe(false);
  expect(originalCombatVisuals(board.originalVisuals, fighters.B)).toBe(true);
  expect(originalCombatVisuals(board.originalVisuals, fighters.B2)).toBe(false);
  // Selecting a shorter spellbook does not replace a native class's appearance.
  expect(originalCombatVisuals(true, { ...fighters.A, loadout: hero.loadout })).toBe(false);
  expect(originalCombatVisuals(true, { ...fighters.A, loadout: { ...hero.loadout, artworkId: 'my-art' } })).toBe(true);
});
