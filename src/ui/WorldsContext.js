import React, { createContext, useContext, useMemo, useState } from 'react';
import { useCreations } from './CreationsContext';
import { useCustomEquipment } from './CustomEquipmentContext';
import { ALL_WORLDS, PERSONAL_WORLD, buildWorldCatalogue } from './worldCatalogue';
import { storageKey } from '../platform/config';
import '../styles/worlds.css';

const Context = createContext(null);
const STORAGE = storageKey('world-filter-v1');
export function WorldsProvider({ libraries = [], initialWorldId, children }) {
  const creations = useCreations();
  const equipment = useCustomEquipment()?.items;
  const characters = creations?.characters, dungeons = creations?.dungeons;
  const [selected, setSelected] = useState(() => {
    let saved; try { saved = localStorage.getItem(STORAGE); } catch (_) { /* Optional preference. */ }
    return initialWorldId || ([ALL_WORLDS, PERSONAL_WORLD, ...libraries.map(l => l.id)].includes(saved) ? saved : ALL_WORLDS);
  });
  const catalogue = useMemo(() => buildWorldCatalogue(libraries, { characters, dungeons, equipment }), [libraries, characters, dungeons, equipment]);
  const select = value => { setSelected(value); try { localStorage.setItem(STORAGE, value); } catch (_) { /* Keep the live filter. */ } };
  return <Context.Provider value={{ ...catalogue, libraries, selected, select }}>{children}</Context.Provider>;
}
export const useWorlds = () => useContext(Context);

export function WorldFilter({ onChange, label = 'Monde', hint = false }) {
  const worlds = useWorlds();
  if (!worlds?.libraries.length) return null;
  return <div className="world-filter"><label><span>{label}</span><select aria-label={label} value={worlds.selected} onChange={e => (onChange || worlds.select)(e.target.value)}>
    <option value={ALL_WORLDS}>Tous mes mondes</option><option value={PERSONAL_WORLD}>Mes créations et terrains libres</option>
    {worlds.libraries.map(l => <option key={l.id} value={l.id}>{l.name} · v{l.release}</option>)}
  </select></label>{hint && <small>Ce filtre ne retire aucun combattant. Mélangez librement vos mondes installés.</small>}</div>;
}
