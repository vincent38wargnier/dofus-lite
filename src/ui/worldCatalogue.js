import { MAPS } from '../engine/maps';
import { customMapErrors, resolveCustomMap } from '../engine/customMaps';
import { dungeonRooms } from '../engine/dungeonCampaign';

export const ALL_WORLDS = 'all';
export const PERSONAL_WORLD = 'personal';

// Provenance is based on installed archive IDs, never on a world's title.
// Private room maps stay snapshots; they must not overwrite the native MAPS table.
export function buildWorldCatalogue(libraries = [], creations = {}) {
  const origins = new Map();
  const add = (kind, id, world) => {
    const key = `${kind}:${id}`, owners = origins.get(key) || new Set();
    if (world) owners.add(world);
    origins.set(key, owners);
  };
  for (const library of libraries) {
    for (const kind of ['characters', 'dungeons', 'equipment']) for (const id of library.imported?.[kind] || []) add(kind, id, library.id);
    const c = library.catalogue;
    for (const id of Object.keys(c?.classData?.names || {})) add('classes', id, library.id);
    for (const id of Object.keys(c?.equipmentData?.items || {})) add('equipment', id, library.id);
    for (const id of Object.keys(c?.equipmentData?.sets || {})) add('equipmentSets', id, library.id);
    for (const id of Object.keys(c?.monsterData?.monsters || {})) add('monsters', id, library.id);
    for (const id of Object.keys(c?.spellLibrary?.spells || {})) add('spells', id, library.id);
    for (const m of Object.values(c?.monsterData?.monsters || {})) for (const g of Object.values(m.grades)) for (const spell of g.spells) add('spells', spell.id, library.id);
    for (const map of [...(c?.outdoorMaps || []), ...(c?.dungeonMaps || [])]) add('maps', map.id, library.id);
    for (const room of c?.dungeonData?.encounters || []) {
      add('monsterRooms', room.id, library.id);
      for (const bossId of room.bossIds || []) add('nativeDungeons', bossId, library.id);
    }
  }
  const characters = [...(creations.characters || [])], monsters = [], maps = Object.values(MAPS).map(map => ({ ...map, battlefield: null }));
  const equipment = new Map((creations.equipment || []).map(item => [item.id, item]));
  const signatures = new Map(characters.map(c => [JSON.stringify([c.name, c.classId, c.loadout]), c.id]));
  const addCharacter = (character, fallbackId, owners) => {
    const signature = JSON.stringify([character.name, character.classId, character.loadout]);
    let id = signatures.get(signature);
    if (!id) { id = fallbackId; characters.push({ ...character, id }); signatures.set(signature, id); }
    for (const owner of owners) add('characters', id, owner);
  };
  const seenMonsters = new Map();
  for (const dungeon of creations.dungeons || []) {
    const owners = origins.get(`dungeons:${dungeon.id}`) || new Set();
    const monsterRoom = { id: `custom-dungeon:${dungeon.id}`, name: dungeon.name };
    for (const owner of owners) add('monsterRooms', monsterRoom.id, owner);
    for (const hero of dungeon.adventure?.heroes || []) {
      addCharacter(hero.character, `hero:${dungeon.id}:${hero.id}`, owners);
    }
    dungeonRooms(dungeon).forEach((room, index) => {
      if (room.battlefield && !customMapErrors(room.battlefield).length) {
        const id = `custom-free-${dungeon.id.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 48)}-${index}`;
        const battlefield = { ...room.battlefield, id };
        maps.push({ ...resolveCustomMap(battlefield), battlefield, roomName: room.name });
        for (const owner of owners) add('maps', id, owner);
      }
      for (const [memberIndex, member] of (room.members || []).entries()) {
        if (member.character) addCharacter(member.character, `opponent:${dungeon.id}:${index}:${memberIndex}`, owners);
        if (!member.customMonster) continue;
        const signature = JSON.stringify(member.customMonster);
        let monster = seenMonsters.get(signature);
        if (!monster) {
          monster = { id: `creature:${dungeon.id}:${index}:${monsters.length}`, name: member.customMonster.name,
            customMonster: member.customMonster, roomName: room.name || dungeon.name, rooms: [] };
          seenMonsters.set(signature, monster);
          monsters.push(monster);
        }
        if (!monster.rooms.some(entry => entry.id === monsterRoom.id)) monster.rooms.push(monsterRoom);
        for (const owner of owners) add('customMonsters', monster.id, owner);
      }
    });
  }
  for (const c of characters) {
    const owners = origins.get(`characters:${c.id}`) || [];
    for (const spell of c.loadout.spells?.custom || []) for (const owner of owners) add('spells', spell.id, owner);
    for (const item of Object.values(c.loadout.customEquipment || {})) {
      if (!equipment.has(item.id)) equipment.set(item.id, item);
      for (const owner of owners) add('equipment', item.id, owner);
    }
  }
  for (const m of monsters) for (const spell of m.customMonster.spells) for (const owner of origins.get(`customMonsters:${m.id}`) || []) add('spells', spell.id, owner);
  const matches = (kind, id, world = ALL_WORLDS) => world === ALL_WORLDS
    || (world === PERSONAL_WORLD ? !origins.get(`${kind}:${id}`)?.size : !!origins.get(`${kind}:${id}`)?.has(world));
  return { characters, monsters, maps, equipment: [...equipment.values()], matches, origins };
}

export function characterMatchesWorld(worlds, character) {
  return !worlds || worlds.matches('characters', character.customCharacterId || character.id, worlds.selected)
    || (!character.loadout.spells?.custom && worlds.matches('classes', character.classId, worlds.selected));
}

export function worldCombatChoice(worldId, libraries, dungeons) {
  const world = libraries.find(entry => entry.id === worldId);
  if (!world) return { mode: 'duel', customDungeonId: null, panel: 'overview' };
  const custom = dungeons.filter(d => world.imported?.dungeons?.includes(d.id));
  if (custom.length) return { mode: 'boss', customDungeonId: custom[0].id, panel: custom.length === 1 ? 'overview' : 'dungeons' };
  const room = world.catalogue?.dungeonData?.encounters?.[0];
  return room ? { mode: 'boss', customDungeonId: null, bossId: room.bossIds[0], panel: 'dungeons' }
    : { mode: 'duel', customDungeonId: null, panel: 'overview' };
}
