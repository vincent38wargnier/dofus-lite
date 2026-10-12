import { MAPS } from './maps';
import { getMonster, monsterGrades } from './monsters';
import { validCustomMonster, resolveCustomMonster } from './customMonsters';
import { CLASSES } from './classes';
import { resolveLoadout } from './equipment';

export const MAX_DUNGEON_MONSTERS = 8;
export const dungeonMemberKind = member => {
  if (!member || [member.character != null, member.customMonster != null, member.monsterId != null].filter(Boolean).length !== 1) return null;
  return member.character ? 'character' : member.customMonster ? 'customMonster' : 'monster';
};
export const isDungeonCharacter = character => !!character && typeof character.name === 'string' && !!character.name.trim()
  && character.name.length <= 80 && Object.prototype.hasOwnProperty.call(CLASSES, character.classId)
  && character.loadout && typeof character.loadout === 'object' && !Array.isArray(character.loadout);

// A room owns the snapshot. It never resolves a profile ID from another library.
export function addCustomDungeonCharacter(dungeon, profile) {
  if (!isDungeonCharacter(profile) || dungeon.members.reduce((sum, member) => sum + member.count, 0) >= MAX_DUNGEON_MONSTERS) return dungeon;
  const character = JSON.parse(JSON.stringify({ name: profile.name, classId: profile.classId,
    className: profile.className || (profile.loadout.spells?.custom ? profile.name : CLASSES[profile.classId].name), loadout: profile.loadout }));
  const index = dungeon.members.findIndex(member => member.character && JSON.stringify(member.character) === JSON.stringify(character));
  return { ...dungeon, members: index < 0 ? [...dungeon.members, { character, count: 1 }]
    : dungeon.members.map((member, i) => i === index ? { ...member, count: member.count + 1 } : member) };
}

export function customDungeonMemberPreview(member) {
  if (member.character) return { kind: 'character', ...member.character };
  return { kind: 'monster', monsterId: member.customMonster?.reference.monsterId || member.monsterId,
    grade: member.customMonster?.reference.grade || member.grade, name: member.customMonster?.name, artworkId: member.customMonster?.artworkId };
}

// The catalogue's button and drag-and-drop share the same addition rules.
export function addCustomDungeonMonster(dungeon, { monsterId, grade } = {}) {
  if (!Number.isInteger(monsterId) || !monsterGrades(monsterId).some(value => value.grade === grade)
    || dungeon.members.reduce((sum, member) => sum + member.count, 0) >= MAX_DUNGEON_MONSTERS) return dungeon;
  const index = dungeon.members.findIndex(member => dungeonMemberKind(member) === 'monster' && member.monsterId === monsterId && member.grade === grade);
  return { ...dungeon, members: index < 0 ? [...dungeon.members, { monsterId, grade, count: 1 }]
    : dungeon.members.map((member, i) => i === index ? { ...member, count: member.count + 1 } : member) };
}

export function customDungeonErrors(dungeon) {
  const errors = [];
  if (!dungeon || typeof dungeon.name !== 'string' || !dungeon.name.trim()) errors.push('Donnez un nom à la salle.');
  if (!Object.prototype.hasOwnProperty.call(MAPS, dungeon?.mapId)) errors.push('Choisissez une carte disponible.');
  const members = dungeon?.members;
  if (!Array.isArray(members) || !members.length) errors.push('Ajoutez au moins un combattant.');
  else {
    for (const member of members) {
      const kind = dungeonMemberKind(member);
      if (!kind || !Number.isInteger(member.count) || member.count < 1) { errors.push('Combattant ou quantité invalide.'); continue; }
      if (kind === 'character') {
        if (!isDungeonCharacter(member.character)) { errors.push('Personnage du donjon invalide.'); continue; }
        try { errors.push(...resolveLoadout(member.character.classId, member.character.loadout).errors.map(error => `${member.character.name} : ${error}`)); }
        catch (_) { errors.push(`${member.character.name} : équipement ou sorts invalides.`); }
      } else if (kind === 'customMonster' ? !validCustomMonster(member.customMonster)
        : !Number.isInteger(member.monsterId) || !monsterGrades(member.monsterId).some(grade => grade.grade === member.grade)) errors.push('Monstre ou niveau invalide.');
    }
    if (members.reduce((sum, member) => sum + (member?.count || 0), 0) > MAX_DUNGEON_MONSTERS) errors.push('Une salle accueille au maximum 8 combattants.');
  }
  return errors;
}

export function customDungeonRoster(dungeon) {
  const errors = customDungeonErrors(dungeon);
  if (errors.length) throw new Error(errors.join(' '));
  const members = dungeon.members.flatMap(member => Array.from({ length: member.count }, () => member));
  const occurrences = {};
  const identityOf = member => member.character ? `character:${JSON.stringify(member.character)}`
    : member.customMonster ? `custom:${member.customMonster.key}` : `native:${member.monsterId}`;
  return members.map((member, index) => {
    const monster = member.character || (member.customMonster ? resolveCustomMonster(member.customMonster) : getMonster(member.monsterId, member.grade));
    const identity = identityOf(member);
    occurrences[identity] = (occurrences[identity] || 0) + 1;
    const repeated = members.filter(other => identityOf(other) === identity).length > 1;
    return { id: index ? `B${index + 1}` : 'B', team: 'B',
      ...(member.character ? { classId: member.character.classId, loadout: JSON.parse(JSON.stringify(member.character.loadout)) }
        : member.customMonster ? { customMonster: JSON.parse(JSON.stringify(member.customMonster)) } : { monsterId: member.monsterId, monsterGrade: member.grade }),
      name: monster.name + (repeated ? ` ${occurrences[identity]}` : '') };
  });
}
