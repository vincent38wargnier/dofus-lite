import { combatPreset, updatedCommander } from '../ui/combatPreset';
import { POUTCH_ID, KANOJEDO_MAP_ID } from '../engine/monsters';
import { LiveMatch } from '../game/liveMatch';
import { runMatch } from '../arena/runner';
import { opponentRoster, opponentTeamErrors } from '../engine/opponentTeam';
import { persistOpponentTeam, readOpponentTeam } from '../ui/opponentTeamStore';
import { peerSettings } from '../game/peerMatch';
import { emptyLoadout } from '../engine/equipment';

const battlefield = require('../../examples/winterfell/battlefield.cjs');
const room = { id: 'army', name: 'A room', mapId: battlefield.id, battlefield,
  members: [{ monsterId: POUTCH_ID, grade: 1, count: 3 }, { monsterId: POUTCH_ID, grade: 2, count: 1 }, { monsterId: POUTCH_ID, grade: 1, count: 28 }],
  encounter: { version: 1, mode: 'army', commander: 1 } };
const team = [{ kind: 'character', classId: 'IOP', name: 'My hero', controller: 'player', loadout: emptyLoadout('IOP') }];

test('editing an army keeps every combatant, its map and commander without mutating the package', () => {
  const before = JSON.stringify(room), preset = combatPreset({ mode: 'boss', customDungeon: room });
  expect(preset.opponents).toHaveLength(32);
  expect(preset.encounter).toEqual({ version: 1, mode: 'army', commanderId: 'B4' });
  expect(preset.battlefield).toEqual(battlefield);
  expect(preset.battlefield).not.toBe(battlefield);
  const live = new LiveMatch({ mode: 'duel', ...preset, team, seed: 4 });
  expect(Object.keys(live.state.fighters)).toHaveLength(33);
  expect(live.state.fighters.B4.monsterGrade).toBe(2);
  expect(live.campaign).toBeNull();
  expect(JSON.stringify(room)).toBe(before);
});

test('army limits are explicit, survive storage and reach automatic and shared combat', () => {
  const preset = combatPreset({ mode: 'boss', customDungeon: room });
  expect(opponentTeamErrors(preset.opponents)).toEqual(['Le camp adverse accueille au maximum 8 combattants.']);
  expect(opponentRoster(preset.opponents, preset.encounter)).toHaveLength(32);
  expect(opponentTeamErrors([...preset.opponents, preset.opponents[0]], preset.encounter)).toEqual(['Le camp adverse accueille au maximum 32 combattants.']);
  persistOpponentTeam(localStorage, preset.opponents, preset.encounter);
  expect(readOpponentTeam(localStorage)).toMatchObject({ entries: preset.opponents, encounter: preset.encounter, error: '' });
  expect(peerSettings({ ...preset, mode: 'duel', seed: 5 }).encounter).toEqual(preset.encounter);
  const pass = { name: 'Pass', decide: () => ({ type: 'PASS' }) };
  const result = runMatch({ ...preset, opponents: [preset.opponents[0]], encounter: { version: 1, mode: 'army', commanderId: 'B' },
    classes: { A: 'IOP' }, bots: { A: pass }, team, collectFrames: false });
  expect(result.config.encounter).toEqual(result.finalState.encounter);
});

test('removing or editing enemies keeps the commander attached to the same fighter', () => {
  const { opponents, encounter } = combatPreset({ mode: 'boss', customDungeon: room });
  const after = opponents.slice(1);
  const next = updatedCommander(encounter, opponents, after);
  expect(next.commanderId).toBe('B3');
  expect(updatedCommander(next, after, after.map(e => ({ ...e })))).toEqual(next);
  expect(updatedCommander(next, after, after.filter((_, i) => i !== 2))).toEqual({ version: 1, mode: 'army' });
});

test('native dungeons and training can become independent free encounters', () => {
  const native = combatPreset({ mode: 'boss', bossId: 147, bossGrade: 1, seed: 19 });
  expect(native.mapId).toBe('dungeon_2083'); expect(native.opponents).toHaveLength(8);
  expect(native.opponents.some(e => e.monsterId === 147)).toBe(true);
  const training = combatPreset({ mode: 'kanojedo', monsterGrade: 2, customDungeon: room });
  expect(training.mapId).toBe(KANOJEDO_MAP_ID);
  expect(training.battlefield).toBeNull(); expect(training.encounter).toBeNull();
  expect(training.opponents).toMatchObject([{ monsterId: POUTCH_ID, grade: 2 }]);
});
