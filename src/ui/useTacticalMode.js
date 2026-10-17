import { storageKey } from '../platform/config';
import { useSyncExternalStore } from 'react';

const STORAGE_KEY = storageKey('dofus-lite-tactical-mode-v1');
const CHANGE_EVENT = 'dofus-lite-tactical-mode-change';
let memoryValue = null;

function read() {
  if (memoryValue !== null) return memoryValue;
  try { return localStorage.getItem(STORAGE_KEY) === 'true'; }
  catch (_) { return false; }
}

function subscribe(listener) {
  const onStorage = event => {
    if (event.key === STORAGE_KEY || event.key === null) { memoryValue = null; listener(); }
  };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener('storage', onStorage);
  return () => { window.removeEventListener(CHANGE_EVENT, listener); window.removeEventListener('storage', onStorage); };
}

export default function useTacticalMode() {
  const enabled = useSyncExternalStore(subscribe, read, () => false);
  const toggle = () => {
    memoryValue = !enabled;
    try { localStorage.setItem(STORAGE_KEY, String(memoryValue)); } catch (_) { /* Keep the switch usable without storage. */ }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };
  return [enabled, toggle];
}
