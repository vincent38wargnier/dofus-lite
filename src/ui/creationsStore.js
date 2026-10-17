import { storageKey } from '../platform/config';
import { validAdventure } from '../engine/adventures';
import { CLASSES } from '../engine/classes';
import { MAPS } from '../engine/maps';
import { customMapErrors } from '../engine/customMaps';
import { monsterGrades } from '../engine/monsters';
import { validCustomMonster } from '../engine/customMonsters';
import { dungeonMemberKind, isDungeonCharacter } from '../engine/customDungeons';
import { isLoadout } from './loadoutStore';
import { dungeonCapacity, validDungeonEncounter } from '../engine/encounters';
import { dungeonRoom, dungeonRooms, validCampaignShape } from '../engine/dungeonCampaign';

export const CREATIONS_STORAGE = storageKey('dofus-lite-creations-v1');
export const emptyCreations = () => ({ version: 1, characters: [], dungeons: [] });
export const newCreationId = () => window.crypto?.randomUUID?.() || `creation-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const cloneCreation = value => JSON.parse(JSON.stringify(value));

export function validCreations(value) {
  const identified = entries => Array.isArray(entries) && entries.every(entry => entry && typeof entry.id === 'string'
    && entry.id && typeof entry.name === 'string') && new Set(entries.map(entry => entry.id)).size === entries.length;
  return value?.version === 1 && identified(value.characters) && identified(value.dungeons)
    && value.characters.every(entry => CLASSES[entry.classId] && isLoadout(entry.loadout))
    && value.dungeons.every(dungeon => validCampaignShape(dungeon) && dungeonRooms(dungeon).every((_, index) => {
      const entry = dungeonRoom(dungeon, index);
      return (entry.adventure == null || (validAdventure(entry.adventure) && entry.adventure.heroes.every(hero => isLoadout(hero.character.loadout))))
      && validDungeonEncounter(entry)
      && (entry.battlefield ? entry.mapId === entry.battlefield.id && !customMapErrors(entry.battlefield).length : Object.prototype.hasOwnProperty.call(MAPS, entry.mapId)) && Array.isArray(entry.members) && entry.members.length <= dungeonCapacity(entry)
      && entry.members.every(member => dungeonMemberKind(member) && (member.character ? isDungeonCharacter(member.character) && isLoadout(member.character.loadout)
        : member.customMonster ? validCustomMonster(member.customMonster, { allowEmpty: true }) : monsterGrades(member.monsterId).some(grade => grade.grade === member.grade))
        && Number.isInteger(member.count) && member.count >= 1 && member.count <= dungeonCapacity(entry))
      && entry.members.reduce((sum, member) => sum + member.count, 0) <= dungeonCapacity(entry);
    }));
}
export function readCreations(storage) {
  try {
    const raw = storage.getItem(CREATIONS_STORAGE);
    if (!raw) return { value: emptyCreations(), error: '' };
    const value = JSON.parse(raw);
    if (!validCreations(value)) throw new Error('Format de sauvegarde invalide.');
    return { value, error: '' };
  } catch (_) { return { value: emptyCreations(), error: 'Impossible de lire vos créations. La sauvegarde existante est conservée.' }; }
}
export function persistCreations(storage, value) {
  if (!validCreations(value)) throw new Error('Création invalide.');
  storage.setItem(CREATIONS_STORAGE, JSON.stringify(value));
}

// Coordinate the two localStorage collections without exposing a half-import
// to React. If equipment persistence fails, restore the exact previous bytes.
export function persistCreationsTogether(storage, value, persistOther) {
  const previous = storage.getItem(CREATIONS_STORAGE);
  persistCreations(storage, value);
  try { persistOther?.(); }
  catch (error) {
    if (previous === null) storage.removeItem(CREATIONS_STORAGE);
    else storage.setItem(CREATIONS_STORAGE, previous);
    throw error;
  }
}
