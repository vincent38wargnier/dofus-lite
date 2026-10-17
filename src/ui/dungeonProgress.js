import { storageKey } from '../platform/config';
import { useEffect, useMemo, useState } from 'react';
import { advanceCampaign, campaignProgress } from '../engine/dungeonCampaign';

export const DUNGEON_PROGRESS_STORAGE = storageKey('dofus-lite-dungeon-progress-v1');
const changed = 'dofus-dungeon-progress';
function readAll(storage = localStorage) {
  try { const value = JSON.parse(storage.getItem(DUNGEON_PROGRESS_STORAGE)); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
  catch (_) { return {}; }
}
export const readDungeonProgress = (dungeon, storage = localStorage) => campaignProgress(dungeon, readAll(storage)[dungeon?.id]);
function write(dungeon, progress, storage) {
  const previous = readAll(storage);
  if (JSON.stringify(previous[dungeon.id]) === JSON.stringify(progress)) return progress;
  storage.setItem(DUNGEON_PROGRESS_STORAGE, JSON.stringify({ ...previous, [dungeon.id]: progress }));
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(changed));
  return progress;
}
export function selectDungeonRoom(dungeon, index, storage = localStorage) {
  const progress = readDungeonProgress(dungeon, storage);
  if (!Number.isInteger(index) || index < 0 || index > progress.unlocked) throw new Error('Battez la salle précédente pour continuer.');
  return write(dungeon, { ...progress, roomIndex: index }, storage);
}
export function saveDungeonVictory(dungeon, index, state, storage = localStorage) {
  const previous = readDungeonProgress(dungeon, storage);
  return write(dungeon, advanceCampaign(dungeon, previous, index, state), storage);
}
export default function useDungeonProgress(dungeon) {
  const [revision, refresh] = useState(0), [error, setError] = useState('');
  useEffect(() => {
    const update = () => refresh(value => value + 1);
    window.addEventListener(changed, update); window.addEventListener('storage', update);
    return () => { window.removeEventListener(changed, update); window.removeEventListener('storage', update); };
  }, []);
  const progress = useMemo(() => readDungeonProgress(dungeon), [dungeon, revision]);
  return { ...progress, error, select(index) {
    try { selectDungeonRoom(dungeon, index); setError(''); }
    catch (e) { setError(e.message || 'Progression non sauvegardée.'); }
  } };
}
