import { useState } from 'react';
import { defaultAdventureChoice } from '../engine/adventures';

export const ADVENTURE_CHOICES_STORAGE = 'dofus-lite-adventure-choices-v1';
const signature = rules => JSON.stringify([rules.mode, rules.partySize, rules.allowAI, rules.heroes.map(h => h.id)]);
export default function useAdventureChoice(dungeon) {
  const [saved, setSaved] = useState(() => {
    try { const value = JSON.parse(localStorage.getItem(ADVENTURE_CHOICES_STORAGE)); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
    catch (_) { return {}; }
  });
  const [error, setError] = useState('');
  if (!dungeon?.adventure) return [undefined, () => {}, error];
  const stored = saved[dungeon.id], key = signature(dungeon.adventure);
  const choice = stored?.signature === key && Array.isArray(stored.heroIds) && stored.heroIds.every(id => typeof id === 'string') && typeof stored.automatic === 'boolean'
    ? stored : defaultAdventureChoice(dungeon);
  const change = next => {
    const value = { ...saved, [dungeon.id]: { heroIds: next.heroIds, automatic: !!next.automatic, signature: key } };
    setSaved(value);
    try { localStorage.setItem(ADVENTURE_CHOICES_STORAGE, JSON.stringify(value)); setError(''); }
    catch (_) { setError('Votre choix de héros n’a pas pu être mémorisé.'); }
  };
  return [choice, change, error];
}
