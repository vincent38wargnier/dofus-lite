import { storageKey } from '../platform/config';
import { useCallback, useRef, useState } from 'react';
import { BUILTIN_BOTS } from '../bots/builtins';
import { ensureNeuralLoading } from '../bots/neural';

// Précharge les poids de Synapse dès que l'app liste les bots — sinon le
// premier tour contre lui jouerait en repli IA Maison le temps du fetch.
if (process.env.NODE_ENV !== 'test') if (process.env.REACT_APP_PLATFORM !== '1') ensureNeuralLoading();

// Custom bots live in localStorage — the Koliséum is a local playground.
const STORAGE_KEY = storageKey('koliseum.bots.v1');

function load() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function persist(list) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function useCustomBots() {
  const [customBots, setCustomBots] = useState(load);
  const current = useRef(customBots);
  const commit = useCallback(change => {
    const next = change(current.current);
    // Persist before publishing, so a quota failure reaches the editor and
    // never registers an AI that will disappear on the next reload.
    persist(next); current.current = next; setCustomBots(next);
  }, []);

  const addBot = useCallback((bot) => {
    const id = `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
    const entry = { id, emoji: '🤖', ...bot, custom: true, updatedAt: Date.now() };
    commit(prev => [...prev, entry]);
    return id;
  }, [commit]);

  const updateBot = useCallback((id, patch) => {
    commit(prev => prev.map(b => b.id === id ? { ...b, ...patch, updatedAt: Date.now() } : b));
  }, [commit]);

  const deleteBot = useCallback((id) => {
    commit(prev => prev.filter(b => b.id !== id));
  }, [commit]);

  return { customBots, addBot, updateBot, deleteBot };
}

// Builtins + customs, same shape everywhere in the UI.
export function listAllBots(customBots) {
  return [
    ...BUILTIN_BOTS.map((b) => ({ ...b, custom: false })),
    ...customBots,
  ];
}

export function findBot(allBots, id) {
  return allBots.find((b) => b.id === id) || null;
}
