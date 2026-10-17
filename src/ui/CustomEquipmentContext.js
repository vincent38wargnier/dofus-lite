import { storageKey } from '../platform/config';
import React, { createContext, useContext, useCallback, useRef, useState } from 'react';
import { customEquipmentShape, validateCustomEquipment } from '../engine/customEquipment';
import { PERSONAL_EQUIPMENT_STORAGE, readPersonalEquipment, rememberForgedEquipment } from './personalEquipmentStore';

export const CUSTOM_EQUIPMENT_STORAGE = storageKey('dofus-lite-custom-equipment-v1');
const Context = createContext(null);
export function readCustomEquipment(storage) {
  try {
    const raw = storage.getItem(CUSTOM_EQUIPMENT_STORAGE);
    if (!raw) return { items: [], error: '' };
    const parsed = JSON.parse(raw);
    // Keep old drafts readable if a future budget changes. Admission is checked
    // again when saving/equipping, rather than deleting the user's library.
    if (parsed?.version !== 1 || !Array.isArray(parsed.items) || !parsed.items.every(customEquipmentShape)
      || new Set(parsed.items.map(item => item.id)).size !== parsed.items.length) throw new Error('format');
    return { items: parsed.items, error: '' };
  } catch (_) { return { items: [], error: 'Bibliothèque d’équipements illisible. La sauvegarde existante est conservée.' }; }
}
export function saveCustomEquipment(storage, items) {
  if (!Array.isArray(items) || items.some(item => !validateCustomEquipment(item).valid)) throw new Error('Un équipement dépasse les règles du créateur.');
  storage.setItem(CUSTOM_EQUIPMENT_STORAGE, JSON.stringify({ version: 1, items }));
}
export function CustomEquipmentProvider({ children }) {
  const [initial] = useState(() => readCustomEquipment(localStorage));
  const [forgeInitial] = useState(() => readPersonalEquipment(localStorage));
  const [forged, setForged] = useState(forgeInitial.entries), forgeCurrent = useRef(forged);
  const [forgeError, setForgeError] = useState(forgeInitial.error);
  const rememberForged = useCallback(entries => {
    if (forgeInitial.error) return;
    const next = rememberForgedEquipment(forgeCurrent.current, entries);
    if (next === forgeCurrent.current) return;
    try {
      localStorage.setItem(PERSONAL_EQUIPMENT_STORAGE, JSON.stringify({ version: 1, entries: next }));
      forgeCurrent.current = next; setForged(next); setForgeError('');
    } catch (_) { setForgeError('Collection FM non sauvegardée : vérifiez l’espace disponible dans le navigateur.'); }
  }, [forgeInitial.error]);
  const [items, setItems] = useState(initial.items), current = useRef(items);
  const [error, setError] = useState(initial.error);
  const commit = next => {
    try {
      if (initial.error) throw new Error(initial.error);
      // Only modified definitions require new validation. Previously valid but
      // now over-budget entries remain editable without blocking other work.
      localStorage.setItem(CUSTOM_EQUIPMENT_STORAGE, JSON.stringify({ version: 1, items: next }));
      current.current = next; setItems(next); setError('');
    } catch (e) { setError(e.message || 'Sauvegarde impossible.'); throw e; }
  };
  const save = (item, replacing) => {
    const result = validateCustomEquipment(item);
    if (!result.valid) throw new Error(result.errors.join(' '));
    if (current.current.some(value => value.id === item.id && value.id !== replacing)) throw new Error('Identifiant déjà utilisé.');
    const exists = current.current.some(value => value.id === replacing);
    commit(exists ? current.current.map(value => value.id === replacing ? item : value) : [item, ...current.current]);
  };
  const remove = id => commit(current.current.filter(item => item.id !== id));
  const importItems = entries => {
    if (!Array.isArray(entries) || !entries.every(customEquipmentShape)) throw new Error('Équipements importés illisibles.');
    const next = [...entries, ...current.current];
    if (new Set(next.map(item => item.id)).size !== next.length) throw new Error('Identifiant d’équipement déjà utilisé. Relancez l’import.');
    commit(next);
  };
  return <Context.Provider value={{ items, error, blocked: !!initial.error, save, remove, importItems, forged, forgeError, rememberForged }}>{children}</Context.Provider>;
}
export const useCustomEquipment = () => useContext(Context);
