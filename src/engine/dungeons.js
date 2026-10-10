import DATA from './dungeonData.json';
import { BOSSES, getMonster, monsterGrades, defaultMonsterGrade } from './monsters';
import { createRng, hashSeed } from './rng';

export const DUNGEONS = DATA.encounters;
export const UNAVAILABLE_DUNGEONS = DATA.unavailable;
const BY_BOSS = new Map(DUNGEONS.flatMap(room => room.bossIds.map(id => [id, room])));
// The client's boss flag also includes Gladiatrool, roaming and retired
// monsters. Only documented encounters belong in the playable room picker.
export const DUNGEON_BOSSES = BOSSES.filter(boss => BY_BOSS.has(boss.id));
export function dungeonForBoss(bossId) { return BY_BOSS.get(bossId) || null; }
export function unavailableDungeonForBoss(bossId) {
  return UNAVAILABLE_DUNGEONS.find(row => row.bossId === bossId) || null;
}
export function dungeonMapId(bossId) {
  const room = dungeonForBoss(bossId);
  if (!room) throw new Error('La composition de la salle finale de ce boss n’est pas encore disponible.');
  return room.combatMapId;
}

// The preview and the actual fight share the same roster. Group generation
// has its own random stream so it cannot change combat rolls or placement.
export function dungeonRoster(bossId, bossGrade = defaultMonsterGrade(bossId), seed = 1) {
  const room = dungeonForBoss(bossId);
  if (!room) throw new Error('La composition de la salle finale de ce boss n’est pas encore disponible.');
  if (!getMonster(bossId, bossGrade)) throw new Error('Niveau de boss inconnu.');
  const rng = createRng(hashSeed(`${seed}:dungeon:${room.id}`));
  const roster = room.members.flatMap(member => Array.from({ length: member.count }, (_, i) => {
    const monsterGrade = member.monsterId === bossId ? bossGrade : rng.pick(monsterGrades(member.monsterId)).grade;
    const monster = getMonster(member.monsterId, monsterGrade);
    if (!monster) throw new Error('Un monstre de cette salle est indisponible.');
    return { monsterId: member.monsterId, monsterGrade,
      name: `${monster.name}${member.count > 1 ? ` ${i + 1}` : ''}` };
  }));
  const selected = roster.findIndex(f => f.monsterId === bossId);
  roster.unshift(...roster.splice(selected, 1));
  return roster.map((f, i) => ({ ...f, id: i ? `B${i + 1}` : 'B', team: 'B' }));
}
