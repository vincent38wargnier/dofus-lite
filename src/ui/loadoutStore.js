import { storageKey } from '../platform/config';
import { customEquipmentShape } from '../engine/customEquipment';
import { CLASSES } from '../engine/classes';
import { isCustomSpellbookDraft } from '../engine/customSpells';
import { isForgeSnapshot } from '../engine/forgedItems';
import { EQUIPMENT_SLOTS } from '../engine/equipment';

export const DRAFT_STORAGE = storageKey('dofus-lite-loadouts-v1');
export const LIBRARY_STORAGE = storageKey('dofus-lite-stuff-library-v1');
export const emptyLibrary = () => ({ version: 1, builds: [], active: {} });
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const clone = value => JSON.parse(JSON.stringify(value));
const integer = value => Number.isInteger(value) && value >= 0;

// Accept unfinished builds too: combat validation still belongs to the engine.
export function isLoadout(value) {
  return record(value) && value.version === 1 && record(value.slots) && record(value.base)
    && Object.values(value.slots).every(id => id == null || integer(id))
    && Object.values(value.base).every(Number.isFinite)
    && (value.level == null || (integer(value.level) && value.level >= 1 && value.level <= 200))
    && ['max', 'average', 'random'].includes(value.rollMode)
    && (value.rollSeed == null || Number.isFinite(value.rollSeed))
    && (value.rollOrigins == null || (record(value.rollOrigins) && Object.entries(value.rollOrigins)
      .every(([slot, origin]) => EQUIPMENT_SLOTS.some(s => s.id === slot) && EQUIPMENT_SLOTS.some(s => s.id === origin))))
    && (value.profile == null || record(value.profile))
    && (value.artworkId == null || (typeof value.artworkId === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value.artworkId)))
    && (value.petBonuses == null || (record(value.petBonuses) && Object.values(value.petBonuses).every(integer)))
    && (value.customEquipment == null || (record(value.customEquipment) && Object.entries(value.customEquipment).every(([id, definition]) => customEquipmentShape(definition) && String(definition.id) === id)))
    && (value.forgedItems == null || (record(value.forgedItems) && Object.values(value.forgedItems).every(isForgeSnapshot)))
    && (value.spells == null || (record(value.spells)
      && (value.spells.custom === undefined || isCustomSpellbookDraft(value.spells.custom))
      && ['common', 'order'].every(key => value.spells[key] == null || (Array.isArray(value.spells[key]) && value.spells[key].every(integer)))
      && (value.spells.grades == null || (record(value.spells.grades) && Object.values(value.spells.grades).every(grade => integer(grade) && grade >= 1 && grade <= 6)))));
}

export function readLibrary(storage) {
  try {
    const raw = storage.getItem(LIBRARY_STORAGE);
    if (!raw) return { library: emptyLibrary(), error: '' };
    const library = JSON.parse(raw);
    if (library?.version !== 1 || !Array.isArray(library.builds) || !record(library.active)
      || library.builds.some(b => !record(b) || typeof b.id !== 'string' || !b.id || typeof b.name !== 'string'
        || !b.name.trim() || (b.classId != null && !CLASSES[b.classId]) || !isLoadout(b.loadout))
      || new Set(library.builds.map(b => b.id)).size !== library.builds.length) throw new Error('format');
    return { library, error: '' };
  } catch (_) {
    // Never overwrite an unreadable library on mount.
    return { library: emptyLibrary(), error: 'Bibliothèque locale illisible ou inaccessible. Les données enregistrées n’ont pas été effacées.' };
  }
}

export function buildName(name) {
  const result = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  if (!result) throw new Error('Donnez un nom à ce stuff.');
  return result;
}

export function uniqueBuildName(builds, name, exceptId) {
  const base = buildName(name);
  const used = new Set(builds.filter(b => b.id !== exceptId).map(b => b.name.toLocaleLowerCase('fr')));
  let result = base, index = 2;
  while (used.has(result.toLocaleLowerCase('fr'))) result = `${base.slice(0, 74)} (${index++})`;
  return result;
}

export function sameLoadout(a, b) {
  // Object insertion order must not make an unchanged build look modified.
  const canonical = value => Array.isArray(value) ? value.map(canonical)
    : record(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

const EQUIPMENT_FIELDS = ['slots', 'rollMode', 'rollSeed', 'rollOrigins', 'forgedItems', 'petBonuses', 'customEquipment'];

export function equipmentSnapshot(loadout) {
  return clone(Object.fromEntries(EQUIPMENT_FIELDS.filter(key => loadout[key] !== undefined).map(key => [key, loadout[key]])));
}

// A stuff replaces equipment only. Remove absent optional fields too, so the
// previous weapon's forge or slot roll origins cannot leak into the new stuff.
export function applySavedEquipment(current, saved) {
  const next = clone(current);
  EQUIPMENT_FIELDS.forEach(key => { delete next[key]; });
  return { ...next, ...equipmentSnapshot(saved) };
}

export const sameEquipment = (a, b) => sameLoadout(equipmentSnapshot(a), equipmentSnapshot(b));

export function libraryReducer(library, action) {
  const existing = library.builds.find(b => b.id === action.id);
  switch (action.type) {
    case 'save': {
      if (!isLoadout(action.loadout)) throw new Error('Configuration de stuff invalide.');
      if (!action.id || (action.replace && !existing)) throw new Error('Ce stuff n’existe plus. Enregistrez une copie.');
      if (existing && !action.replace) throw new Error('Choisissez un autre emplacement de sauvegarde.');
      const build = { id: action.id,
        name: uniqueBuildName(library.builds, action.name, existing?.id),
        createdAt: existing?.createdAt || action.now, updatedAt: action.now,
        // Keep legacy character settings stored, without applying them to a
        // different character or requiring a class for newly saved equipment.
        loadout: applySavedEquipment(existing?.loadout || { version: 1, base: {} }, action.loadout) };
      return { ...library, builds: existing ? library.builds.map(b => b.id === build.id ? build : b) : [build, ...library.builds],
        active: action.key ? { ...library.active, [action.key]: build.id } : library.active };
    }
    case 'activate':
      if (!existing) throw new Error('Ce stuff n’existe plus.');
      return { ...library, active: { ...library.active, [action.key]: action.id } };
    case 'clear-active':
      return { ...library, active: Object.fromEntries(Object.entries(library.active).filter(([key]) => key !== action.key)) };
    case 'rename':
      if (!existing) throw new Error('Ce stuff n’existe plus.');
      return { ...library, builds: library.builds.map(b => b.id === action.id
        ? { ...b, name: uniqueBuildName(library.builds, action.name, b.id), updatedAt: action.now } : b) };
    case 'delete':
      return { ...library, builds: library.builds.filter(b => b.id !== action.id),
        active: Object.fromEntries(Object.entries(library.active).filter(([, id]) => id !== action.id)) };
    case 'restore':
      if (!action.build || library.builds.some(b => b.id === action.build.id)) return library;
      return { ...library, builds: [clone(action.build), ...library.builds], active: { ...library.active, ...action.active } };
    default: return library;
  }
}

export function persistLibrary(storage, library, action) {
  const next = libraryReducer(library, action);
  storage.setItem(LIBRARY_STORAGE, JSON.stringify(next));
  return next;
}
