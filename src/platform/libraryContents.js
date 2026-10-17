// Counts come from validated contents, including supplied heroes and all rooms.
// The publisher's main label is presentation metadata, not a content filter.
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
    : value;
const signature = value => JSON.stringify(canonical(value));

export function summarizeLibraryContents(contents = {}, catalogue = null) {
  const characters = new Set(), equipment = new Set(), monsters = new Set(), maps = new Set(), spells = new Set();
  const addSpell = spell => { if (spell) spells.add('custom:' + signature(spell)); };
  const addItem = item => { if (item) equipment.add('custom:' + signature(item)); };
  const addCharacter = character => {
    if (!character) return;
    characters.add('custom:' + signature({ name: character.name, classId: character.classId, loadout: character.loadout }));
    (character.loadout?.spells?.custom || []).forEach(addSpell);
    Object.values(character.loadout?.customEquipment || {}).forEach(addItem);
  };
  (contents.characters || []).forEach(addCharacter);
  (contents.equipment || []).forEach(addItem);
  let rooms = 0;
  for (const dungeon of contents.dungeons || []) {
    const list = dungeon.rooms?.length ? dungeon.rooms : [dungeon];
    rooms += list.length;
    (dungeon.adventure?.heroes || []).forEach(hero => addCharacter(hero.character));
    for (const room of list) {
      (room.adventure?.heroes || []).forEach(hero => addCharacter(hero.character));
      if (room.battlefield) maps.add('custom:' + signature(room.battlefield));
      for (const member of room.members || []) {
        addCharacter(member.character);
        if (member.customMonster) {
          monsters.add('custom:' + signature(member.customMonster));
          (member.customMonster.spells || []).forEach(addSpell);
        }
      }
    }
  }
  Object.keys(catalogue?.classData?.builds || {}).forEach(id => characters.add('catalogue:' + id));
  Object.keys(catalogue?.equipmentData?.items || {}).forEach(id => equipment.add('catalogue:' + id));
  Object.keys(catalogue?.monsterData?.monsters || {}).forEach(id => monsters.add('catalogue:' + id));
  Object.keys(catalogue?.spellLibrary?.spells || {}).forEach(id => spells.add('catalogue:' + id));
  [...(catalogue?.dungeonMaps || []), ...(catalogue?.outdoorMaps || [])].forEach(map => maps.add('catalogue:' + (map.id || signature(map))));
  const encounters = catalogue?.dungeonData?.encounters?.length || 0;
  return { characters: characters.size, dungeons: (contents.dungeons?.length || 0) + encounters,
    equipment: equipment.size, monsters: monsters.size, maps: maps.size, spells: spells.size,
    images: contents.records?.length || 0, rooms: rooms + encounters };
}

export const LIBRARY_CATEGORIES = [
  ['all', 'Tout'], ['adventure', 'Aventures'], ['characters', 'Classes'],
  ['equipment', 'Équipements'], ['mixed', 'Univers'],
];
export function libraryCategories(library) {
  const counts = library.counts;
  if (!counts) return [library.kind === 'catalogue' ? 'mixed' : library.kind].filter(Boolean);
  const result = [];
  if (counts.dungeons > 0) result.push('adventure');
  if (counts.characters > 0 || library.arena?.length > 0) result.push('characters');
  if (counts.equipment > 0) result.push('equipment');
  if (result.length > 1 || (counts.maps > 0 && counts.monsters > 0)
    || (library.kind === 'catalogue' && (result.length > 0 || counts.maps > 0 || counts.monsters > 0 || counts.spells > 0))) result.push('mixed');
  return result;
}
export const libraryMatchesCategory = (library, category) => category === 'all' || libraryCategories(library).includes(category);
export const libraryCategoryCounts = libraries => Object.fromEntries(LIBRARY_CATEGORIES.map(([id]) => [id, libraries.filter(l => libraryMatchesCategory(l, id)).length]));

export function libraryContentLabels(library, category = 'all') {
  const counts = library.counts || {};
  const labels = { dungeons: ['donjon', 'donjons'], rooms: ['salle', 'salles'], characters: ['personnage', 'personnages'],
    equipment: ['équipement', 'équipements'], monsters: ['créature', 'créatures'], maps: ['carte', 'cartes'], spells: ['sort', 'sorts'] };
  const first = { adventure: 'rooms', characters: 'characters', equipment: 'equipment', mixed: 'maps' }[category];
  const order = [first, 'characters', 'equipment', 'rooms', 'maps', 'monsters', 'spells', 'dungeons'].filter((key, i, all) => key && all.indexOf(key) === i);
  return order.filter(key => counts[key] > 0).map(key => ({ key,
    text: Number(counts[key]).toLocaleString('fr-FR') + ' ' + labels[key][counts[key] === 1 ? 0 : 1],
    selected: key === first,
  }));
}
