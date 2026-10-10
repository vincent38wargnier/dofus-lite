import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { emptyLoadout, equipSet, resolveLoadout } from '../engine/equipment';
import { DRAFT_STORAGE, isLoadout, readLibrary, persistLibrary } from './loadoutStore';

const Context = createContext(null);
const defaultDraft = classId => equipSet(emptyLoadout(classId), 1);

export function LoadoutsProvider({ children }) {
  const [saved, setSaved] = useState(() => {
    try { const value = JSON.parse(localStorage.getItem(DRAFT_STORAGE)); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
    catch (_) { return {}; }
  });
  const [saveError, setSaveError] = useState(false);
  const [initial] = useState(() => readLibrary({ getItem: key => localStorage.getItem(key) }));
  const [library, setLibrary] = useState(initial.library);
  const [libraryError, setLibraryError] = useState(initial.error);
  const currentLibrary = useRef(library);
  useEffect(() => {
    try { localStorage.setItem(DRAFT_STORAGE, JSON.stringify(saved)); setSaveError(false); }
    catch (_) { setSaveError(true); }
  }, [saved]);
  const commit = action => {
    // Persist before announcing success. Failed writes leave saved builds intact.
    try {
      if (initial.error) throw new Error(initial.error);
      const next = persistLibrary(localStorage, currentLibrary.current, action);
      currentLibrary.current = next;
      setLibrary(next); setLibraryError('');
      return next;
    } catch (error) {
      setLibraryError(error.name === 'QuotaExceededError' || error.name === 'SecurityError'
        ? 'Sauvegarde impossible dans ce navigateur. Votre bibliothèque précédente est conservée.' : error.message);
      return null;
    }
  };
  return <Context.Provider value={{ saved, setSaved, saveError, library, commit, libraryError }}>{children}</Context.Provider>;
}

export const useLoadoutLibrary = () => useContext(Context);

export function useLoadouts(classA, classB) {
  const { saved, setSaved, saveError } = useContext(Context);
  const loadouts = useMemo(() => {
    const get = (side, classId) => isLoadout(saved[`${side}:${classId}`]) ? saved[`${side}:${classId}`] : defaultDraft(classId);
    return { A: get('A', classA), B: get('B', classB) };
  }, [saved, classA, classB]);
  const update = (side, change, targetClass) => {
    const classId = targetClass || (side === 'A' ? classA : classB);
    const id = `${side}:${classId}`;
    setSaved(previous => {
      const draft = isLoadout(previous[id]) ? previous[id] : defaultDraft(classId);
      return { ...previous, [id]: typeof change === 'function' ? change(draft) : change };
    });
  };
  const summaries = useMemo(() => ({ A: resolveLoadout(classA, loadouts.A), B: resolveLoadout(classB, loadouts.B) }), [classA, classB, loadouts]);
  return { loadouts, update, summaries, saveError };
}
