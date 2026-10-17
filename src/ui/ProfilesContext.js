import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { makeProfile, persistProfiles, profileName, readProfiles } from './profileStore';

const Context = createContext(null);
export function ProfilesProvider({ children }) {
  const [initial] = useState(() => readProfiles(localStorage));
  const [value, setValue] = useState(initial.value);
  const current = useRef(value);
  const [error, setError] = useState(initial.error);
  useEffect(() => {
    try {
      if (initial.error) return;
      persistProfiles(localStorage, value); setError('');
    } catch (_) { setError('Profil non sauvegardé. Gardez cette page ouverte et libérez de l’espace dans le navigateur.'); }
  }, [value, initial.error]);
  const change = fn => { const next = fn(current.current); current.current = next; setValue(next); };
  const create = (classId, template, { activate = true } = {}) => {
    const profile = makeProfile(classId, template, current.current.profiles);
    change(previous => ({ ...previous, activeId: activate ? profile.id : previous.activeId, profiles: [...previous.profiles, profile] }));
    return profile;
  };
  const updateById = (id, fn) => change(previous => ({ ...previous, profiles: previous.profiles.map(profile => profile.id === id ? fn(profile) : profile) }));
  const update = fn => change(previous => ({ ...previous, profiles: previous.profiles.map(profile => profile.id === previous.activeId ? fn(profile) : profile) }));
  const active = value.profiles.find(profile => profile.id === value.activeId);
  return <Context.Provider value={{ ...value, active, error, create, update, updateById,
    select: id => change(previous => previous.profiles.some(profile => profile.id === id) ? { ...previous, activeId: id } : previous),
    rename: name => { const next = profileName(name); if (next) update(profile => ({ ...profile, name: next })); },
    remove: id => change(previous => previous.profiles.length < 2 ? previous : { ...previous,
      activeId: previous.activeId === id ? previous.profiles.find(profile => profile.id !== id).id : previous.activeId,
      profiles: previous.profiles.filter(profile => profile.id !== id) }),
    restore: profile => change(previous => previous.profiles.some(entry => entry.id === profile.id) ? previous
      : { ...previous, activeId: profile.id, profiles: [...previous.profiles, profile] }),
  }}>{children}</Context.Provider>;
}
export const useProfiles = () => useContext(Context);
