import { advanceCampaign, campaignProgress, dungeonRoom, dungeonRooms, roomVictory, validCampaignShape, withDungeonRooms } from '../engine/dungeonCampaign';
import { customDungeonErrors } from '../engine/customDungeons';
import { LiveMatch } from '../game/liveMatch';
import { runMatch } from '../arena/runner';
import { KANOJEDO_MAP_ID, POUTCH_ID } from '../engine/monsters';
import { emptyLoadout } from '../engine/equipment';
import { newAdventure, addAdventureHero } from '../engine/adventures';
import { emptyCreations, validCreations } from '../ui/creationsStore';
import { readDungeonProgress, saveDungeonVictory, selectDungeonRoom } from '../ui/dungeonProgress';

const room = (id, grade = 1) => ({ id, name: id, mapId: KANOJEDO_MAP_ID, members: [{ monsterId: POUTCH_ID, grade, count: 1 }] });
const campaign = () => withDungeonRooms({ ...room('campaign'), adventure: addAdventureHero(newAdventure(),
  { name: 'Héros', classId: 'IOP', loadout: { ...emptyLoadout('IOP'), level: 200 } }, 'hero') }, [room('one'), room('two', 2), room('three', 3)]);
const victory = { over: true, endReason: 'ko', fighters: { A: { team: 'A', hp: 200 }, B: { team: 'B', hp: 0 } } };
const pass = { name: 'Pass', decide: () => ({ type: 'PASS' }) };
beforeEach(() => localStorage.clear());

test('single rooms remain compatible; room selection preserves shared heroes, not another room’s map', () => {
  const legacy = room('legacy'); expect(dungeonRoom(legacy)).toBe(legacy); expect(dungeonRooms(legacy)).toEqual([legacy]);
  const d = campaign(); expect(customDungeonErrors(d)).toEqual([]);
  expect(validCreations({ ...emptyCreations(), dungeons: [d] })).toBe(true);
  expect(dungeonRoom(d, 1)).toMatchObject({ id: 'campaign', name: 'two', adventure: d.adventure, members: [room('two', 2).members[0]] });
  d.rooms[0].encounter = { version: 1, mode: 'army', commander: 0 };
  expect(dungeonRoom(d, 1).encounter).toBeUndefined();
  expect(() => dungeonRoom(d, 3)).toThrow();
});

test.each([d => { d.rooms = []; }, d => { d.rooms = Array.from({ length: 21 }, (_, i) => room(`r${i}`)); },
  d => { d.rooms[1].id = d.rooms[0].id; }, d => { d.rooms[1].intro = 'x'.repeat(3001); },
  d => { d.rooms[1].adventure = {}; }, d => { d.rooms[1].rooms = [room('nested')]; }])('malformed campaign is rejected', change => {
  const d = campaign(); change(d); expect(validCampaignShape(d)).toBe(false);
  expect(customDungeonErrors(d).length).toBeGreaterThan(0); expect(validCreations({ ...emptyCreations(), dungeons: [d] })).toBe(false);
});

test('unplayed rooms are also validated; empty rooms save as drafts and cannot launch', () => {
  const d = campaign(); d.rooms[2].members = [];
  expect(validCreations({ ...emptyCreations(), dungeons: [d] })).toBe(true);
  expect(customDungeonErrors(d).some(error => error.startsWith('Salle 3'))).toBe(true);
  expect(() => new LiveMatch({ mode: 'custom', dungeon: d, roomIndex: 0, seed: 1 })).toThrow(/Salle 3/);
  expect(() => runMatch({ mode: 'custom', dungeon: d, roomIndex: 0, seed: 1 })).toThrow(/Salle 3/);
  d.rooms[2].members = [{ monsterId: -1, grade: 1, count: 1 }];
  expect(customDungeonErrors(d).length).toBeGreaterThan(0);
});

test('only a genuine team victory unlocks the next room, once, in order', () => {
  const d = campaign(); const fresh = campaignProgress(d);
  expect(fresh).toMatchObject({ cleared: 0, roomIndex: 0, unlocked: 0, complete: false });
  for (const state of [{ ...victory, over: false }, { ...victory, endReason: 'maxTurns' },
    { ...victory, fighters: { A: { team: 'A', hp: 0 }, B: { team: 'B', hp: 1 } } },
    { ...victory, fighters: { ...victory.fighters, B2: { team: 'B', hp: 1 } } }]) {
    expect(roomVictory(state)).toBe(false); expect(advanceCampaign(d, fresh, 0, state)).toEqual(fresh);
  }
  expect(advanceCampaign(d, fresh, 2, victory)).toEqual(fresh);
  let progress = advanceCampaign(d, fresh, 0, victory);
  expect(progress).toMatchObject({ cleared: 1, roomIndex: 1, unlocked: 1 });
  expect(advanceCampaign(d, progress, 0, victory)).toEqual(progress);
  progress = advanceCampaign(d, advanceCampaign(d, progress, 1, victory), 2, victory);
  expect(progress).toMatchObject({ cleared: 3, roomIndex: 2, unlocked: 2, complete: true });
});

test('victories persist; replay cannot skip a room, and changed definitions invalidate old progress', () => {
  const d = campaign(); expect(() => selectDungeonRoom(d, 1)).toThrow();
  saveDungeonVictory(d, 0, victory); expect(readDungeonProgress(JSON.parse(JSON.stringify(d))).unlocked).toBe(1);
  selectDungeonRoom(d, 0); expect(readDungeonProgress(d).roomIndex).toBe(0);
  expect(readDungeonProgress({ ...d, id: 'copy' }).cleared).toBe(0);
  d.rooms[1].members[0].count = 2; expect(readDungeonProgress(d).cleared).toBe(0);
});

test('manual and AI fights use the chosen room and start a fresh supplied party', () => {
  const d = campaign(); const first = new LiveMatch({ mode: 'custom', dungeon: d, seed: 1 });
  first.state.fighters.A.hp = 1; first.state.fighters.A.pa = 0;
  const second = new LiveMatch({ mode: 'custom', dungeon: d, roomIndex: 1, seed: 1 });
  expect(second.campaign.roomIndex).toBe(1); expect(second.state.fighters.B.hp).not.toBe(first.state.fighters.B.hp);
  expect(second.state.fighters.A.hp).toBeGreaterThan(1); expect(second.state.fighters.A.pa).toBeGreaterThan(0);
  const result = runMatch({ mode: 'custom', dungeon: d, roomIndex: 1, classes: { A: 'IOP', B: 'IOP' }, bots: { A: pass, B: pass }, seed: 1 });
  expect(result.frames[0].state.fighters.B.hp).toBe(second.state.fighters.B.hp);
  expect(result.config.roomIndex).toBe(1); expect(result.config.dungeon.rooms).toHaveLength(3);
  expect(roomVictory(result.finalState)).toBe(false);
});
