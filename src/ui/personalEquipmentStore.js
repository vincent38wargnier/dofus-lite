import { ITEMS, EQUIPMENT_SLOTS } from '../engine/equipment';
import { customEquipmentItem, equipmentItem } from '../engine/customEquipment';
import { fmEffect, isForgeSnapshot, matchingForge, replaceEquipment } from '../engine/forgedItems';

export const PERSONAL_EQUIPMENT_STORAGE = 'dofus-lite-personal-equipment-v1';
const clone = value => JSON.parse(JSON.stringify(value));
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const signature = value => JSON.stringify(canonical(value));

// A forge in progress has one latest snapshot per source/item, not a new tile
// for every rune. Saved stuffs remain separate sources for intentional variants.
export function collectForgedEquipment(sources) {
  return sources.flatMap(source => EQUIPMENT_SLOTS.flatMap(slot => {
    const item = equipmentItem(source.loadout?.slots?.[slot.id], source.loadout);
    const forge = matchingForge(item, source.loadout, slot.id);
    return item && isForgeSnapshot(forge) ? [{ key: `${source.key}:${slot.id}:${item.id}`, source: source.name, forge }] : [];
  }));
}

export function rememberForgedEquipment(previous, entries) {
  const byKey = new Map(previous.map(entry => [entry.key, entry]));
  let changed = false;
  for (const entry of entries) {
    if (signature(byKey.get(entry.key)) !== signature(entry)) { byKey.set(entry.key, clone(entry)); changed = true; }
  }
  return changed ? [...byKey.values()] : previous;
}

export function readPersonalEquipment(storage) {
  try {
    const raw = storage.getItem(PERSONAL_EQUIPMENT_STORAGE);
    if (!raw) return { entries: [], error: '' };
    const value = JSON.parse(raw);
    if (value?.version !== 1 || !Array.isArray(value.entries) || value.entries.some(entry => !entry || typeof entry.key !== 'string'
      || typeof entry.source !== 'string' || !isForgeSnapshot(entry.forge)) || new Set(value.entries.map(entry => entry.key)).size !== value.entries.length) throw new Error('format');
    return { entries: value.entries, error: '' };
  } catch (_) { return { entries: [], error: 'La collection FM est illisible. Sa sauvegarde est conservée.' }; }
}

export function personalEquipmentKey(entry) {
  // Different histories with the same usable jet should show only once.
  return entry.forge ? signature({ id: entry.item.id, stats: Object.fromEntries(Object.entries(entry.forge.stats).filter(([, value]) => value)),
    potion: entry.forge.weaponPotion || null, effects: entry.forge.baseEffects.filter(effect => !fmEffect(effect.row[0])) })
    : signature(entry.item.customEquipment);
}

export function personalEquipmentCollection(definitions, sources, remembered = []) {
  const created = [...definitions, ...sources.flatMap(source => Object.values(source.loadout?.slots || {})
    .map(id => source.loadout?.customEquipment?.[id]).filter(Boolean))]
    .map(definition => ({ item: customEquipmentItem(definition), source: 'Création' })).filter(entry => entry.item);
  const forged = [...collectForgedEquipment(sources), ...remembered].flatMap(entry => ITEMS[entry.forge.itemId]
    ? [{ item: ITEMS[entry.forge.itemId], forge: entry.forge, source: entry.source }] : []);
  const unique = new Map();
  for (const entry of [...created, ...forged]) {
    const key = personalEquipmentKey(entry);
    if (!unique.has(key)) unique.set(key, { ...entry, key });
  }
  return [...unique.values()].sort((a, b) => a.item.name.localeCompare(b.item.name, 'fr'));
}

export function personalEquipmentDrag(entry) {
  return { itemId: entry.item.id, ...(entry.forge ? { forgedItem: entry.forge } : {}),
    ...(entry.item.customEquipment ? { customEquipment: entry.item.customEquipment } : {}) };
}

// Also used by the inspector: previews must use the exact same item snapshot.
export function previewPersonalEquipment(loadout, entry, slotId) {
  const next = replaceEquipment(entry.item.customEquipment ? { ...loadout, customEquipment: { ...loadout.customEquipment, [entry.item.id]: entry.item.customEquipment } } : loadout, slotId, entry.item.id);
  return entry.forge ? { ...next, forgedItems: { ...next.forgedItems, [slotId]: entry.forge } } : next;
}
