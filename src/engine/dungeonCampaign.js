import { hashSeed } from './rng';

export const MAX_DUNGEON_ROOMS = 20;
const fields = ['id', 'name', 'mapId', 'members', 'battlefield', 'encounter', 'intro', 'outro'];
const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
export const dungeonRooms = dungeon => dungeon?.rooms || (dungeon ? [dungeon] : []);
export const isCampaign = dungeon => dungeonRooms(dungeon).length > 1;
export const roomSnapshot = room => Object.fromEntries(fields.filter(key => room[key] !== undefined).map(key => [key, room[key]]));

// The legacy first-room fields remain synchronized for catalogue thumbnails and
// old single-room saves. Combat always selects from the authoritative room list.
export function withDungeonRooms(dungeon, rooms) {
  const { battlefield, encounter, intro, outro, ...rest } = dungeon;
  const first = roomSnapshot(rooms[0]);
  return { ...rest, ...first, id: dungeon.id, name: dungeon.name, rooms };
}
export function validCampaignShape(dungeon) {
  if (dungeon?.rooms === undefined) return true;
  return Array.isArray(dungeon.rooms) && dungeon.rooms.length >= 1 && dungeon.rooms.length <= MAX_DUNGEON_ROOMS
    && dungeon.rooms.every(room => record(room) && Object.keys(room).every(key => fields.includes(key))
      && typeof room.id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(room.id)
      && typeof room.name === 'string' && room.name.length <= 200
      && ['intro', 'outro'].every(key => room[key] === undefined || typeof room[key] === 'string' && room[key].length <= 3000))
    && new Set(dungeon.rooms.map(room => room.id)).size === dungeon.rooms.length;
}
export function dungeonRoom(dungeon, index = 0) {
  if (!dungeon) return dungeon;
  if (!validCampaignShape(dungeon) || !Number.isInteger(index) || index < 0 || index >= dungeonRooms(dungeon).length) throw new Error('Salle de donjon inconnue.');
  if (!dungeon.rooms) return dungeon;
  const { rooms, mapId, members, battlefield, encounter, intro, outro, ...shared } = dungeon;
  return { ...shared, ...rooms[index], id: dungeon.id };
}
export function campaignSignature(dungeon) {
  const content = JSON.stringify([dungeonRooms(dungeon), dungeon?.adventure]);
  return `${content.length}-${hashSeed(content)}`;
}
export function campaignProgress(dungeon, saved) {
  const count = dungeonRooms(dungeon).length;
  const signature = campaignSignature(dungeon);
  const cleared = saved?.signature === signature && Number.isInteger(saved.cleared) ? Math.max(0, Math.min(count, saved.cleared)) : 0;
  const unlocked = Math.min(cleared, Math.max(0, count - 1));
  const roomIndex = saved?.signature === signature && Number.isInteger(saved.roomIndex)
    ? Math.max(0, Math.min(unlocked, saved.roomIndex)) : unlocked;
  return { signature, cleared, roomIndex, unlocked, count, complete: cleared === count && count > 0 };
}
export const roomVictory = state => !!(state?.over && state.endReason === 'ko'
  && Object.values(state.fighters).some(f => f.team === 'A' && f.hp > 0 && !f.isSummon)
  && Object.values(state.fighters).some(f => f.team === 'B')
  && Object.values(state.fighters).filter(f => f.team === 'B').every(f => f.hp <= 0));
export function advanceCampaign(dungeon, saved, roomIndex, state) {
  const progress = campaignProgress(dungeon, saved);
  if (!roomVictory(state) || !Number.isInteger(roomIndex) || roomIndex < 0 || roomIndex > progress.unlocked || roomIndex >= progress.count) return progress;
  const cleared = Math.max(progress.cleared, roomIndex + 1);
  return { ...progress, cleared, unlocked: Math.min(cleared, progress.count - 1),
    roomIndex: Math.min(cleared, progress.count - 1), complete: cleared === progress.count };
}
