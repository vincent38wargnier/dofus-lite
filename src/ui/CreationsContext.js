import React, { createContext, useContext, useRef, useState } from 'react';
import { readCreations, persistCreations, persistCreationsTogether } from './creationsStore';

const Context = createContext(null);
export function CreationsProvider({ children }) {
  const [initial] = useState(() => readCreations(localStorage));
  const [value, setValue] = useState(initial.value);
  const current = useRef(value);
  const [error, setError] = useState(initial.error);
  const update = change => {
    const next = change(current.current);
    // Keep the editable draft on failure, but never claim it was saved.
    current.current = next; setValue(next);
    try {
      if (initial.error) throw new Error(initial.error);
      persistCreations(localStorage, next); setError('');
    } catch (e) { setError(initial.error || 'Sauvegarde impossible dans ce navigateur. Gardez cette page ouverte pour conserver vos modifications.'); }
  };
  const commit = (change, persistOther) => {
    if (initial.error) throw new Error(initial.error);
    const next = change(current.current);
    persistCreationsTogether(localStorage, next, persistOther);
    current.current = next; setValue(next); setError('');
  };
  return <Context.Provider value={{ ...value, update, commit, error }}>{children}</Context.Provider>;
}
export const useCreations = () => useContext(Context);
