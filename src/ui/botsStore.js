import { useCallback, useState } from 'react';
import { BUILTIN_BOTS } from '../bots/builtins';

// Custom bots live in localStorage — the Koliséum is a local playground.
const STORAGE_KEY = 'koliseum.bots.v1';

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

  const addBot = useCallback((bot) => {
    const id = `custom-${Date.now().toString(36)}`;
    const entry = { id, emoji: '🤖', ...bot, custom: true, updatedAt: Date.now() };
    setCustomBots((prev) => {
      const next = [...prev, entry];
      persist(next);
      return next;
    });
    return id;
  }, []);

  const updateBot = useCallback((id, patch) => {
    setCustomBots((prev) => {
      const next = prev.map((b) => (b.id === id ? { ...b, ...patch, updatedAt: Date.now() } : b));
      persist(next);
      return next;
    });
  }, []);

  const deleteBot = useCallback((id) => {
    setCustomBots((prev) => {
      const next = prev.filter((b) => b.id !== id);
      persist(next);
      return next;
    });
  }, []);

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
