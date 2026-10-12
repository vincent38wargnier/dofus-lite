import { useSyncExternalStore } from 'react';

export const CREATURE_MODE_STORAGE = 'dofus-lite-creature-mode-v1';
const CHANGE_EVENT = 'dofus-lite-creature-mode-change';
let fallback = false;
const read = () => {
  try { return localStorage.getItem(CREATURE_MODE_STORAGE) === 'true'; }
  catch (_) { return fallback; }
};
const subscribe = listener => {
  const stored = event => { if (event.key === CREATURE_MODE_STORAGE || event.key === null) listener(); };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener('storage', stored);
  return () => { window.removeEventListener(CHANGE_EVENT, listener); window.removeEventListener('storage', stored); };
};

export default function useCreatureMode() {
  const enabled = useSyncExternalStore(subscribe, read, () => false);
  const toggle = () => {
    fallback = !read();
    try { localStorage.setItem(CREATURE_MODE_STORAGE, String(fallback)); } catch (_) { /* Still usable without storage. */ }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };
  return [enabled, toggle];
}
