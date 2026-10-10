import { MAPS } from './maps';
import { getMonster, monsterGrades } from './monsters';
import { validCustomMonster, resolveCustomMonster } from './customMonsters';

export const MAX_DUNGEON_MONSTERS = 8;

// The catalogue's button and drag-and-drop share the same addition rules.
export function addCustomDungeonMonster(dungeon, { monsterId, grade } = {}) {
  if (!Number.isInteger(monsterId) || !monsterGrades(monsterId).some(value => value.grade === grade)
    || dungeon.members.reduce((sum, member) => sum + member.count, 0) >= MAX_DUNGEON_MONSTERS) return dungeon;
  const index = dungeon.members.findIndex(member => member.monsterId === monsterId && member.grade === grade);
  return { ...dungeon, members: index < 0 ? [...dungeon.members, { monsterId, grade, count: 1 }]
    : dungeon.members.map((member, i) => i === index ? { ...member, count: member.count + 1 } : member) };
}

export function customDungeonErrors(dungeon) {
  const errors = [];
  if (!dungeon || typeof dungeon.name !== 'string' || !dungeon.name.trim()) errors.push('Donnez un nom à la salle.');
  if (!Object.prototype.hasOwnProperty.call(MAPS, dungeon?.mapId)) errors.push('Choisissez une carte disponible.');
  const members = dungeon?.members;
  if (!Array.isArray(members) || !members.length) errors.push('Ajoutez au moins un monstre.');
  else {
    if (members.some(member => !member || !(member.customMonster ? validCustomMonster(member.customMonster)
      : Number.isInteger(member.monsterId) && monsterGrades(member.monsterId).some(grade => grade.grade === member.grade))
      || !Number.isInteger(member.count) || member.count < 1)) errors.push('Monstre, niveau ou quantité invalide.');
    if (members.reduce((sum, member) => sum + (member?.count || 0), 0) > MAX_DUNGEON_MONSTERS) errors.push('Une salle accueille au maximum 8 monstres.');
  }
  return errors;
}

export function customDungeonRoster(dungeon) {
  const errors = customDungeonErrors(dungeon);
  if (errors.length) throw new Error(errors.join(' '));
  const members = dungeon.members.flatMap(member => Array.from({ length: member.count }, () => member));
  const occurrences = {};
  return members.map((member, index) => {
    const monster = member.customMonster ? resolveCustomMonster(member.customMonster) : getMonster(member.monsterId, member.grade);
    const identity = member.customMonster ? `custom:${member.customMonster.key}` : `native:${member.monsterId}`;
    occurrences[identity] = (occurrences[identity] || 0) + 1;
    const repeated = members.filter(other => member.customMonster ? other.customMonster?.key === member.customMonster.key : other.monsterId === member.monsterId).length > 1;
    return { id: index ? `B${index + 1}` : 'B', team: 'B',
      ...(member.customMonster ? { customMonster: member.customMonster } : { monsterId: member.monsterId, monsterGrade: member.grade }),
      name: monster.name + (repeated ? ` ${occurrences[identity]}` : '') };
  });
}
