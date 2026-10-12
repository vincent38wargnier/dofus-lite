import { isAllyEntry } from '../engine/allyTeam';
import { isLoadout } from './loadoutStore';

export const ALLIES_STORAGE = 'dofus-lite-ally-team-v1';
const valid = (entries, includePlayer) => typeof includePlayer === 'boolean' && Array.isArray(entries) && entries.length <= (includePlayer ? 7 : 8)
  && entries.every(entry => isAllyEntry(entry) && (entry.kind === 'monster' || isLoadout(entry.loadout)));

export function readAllyTeam(storage) {
  try {
    const raw = storage.getItem(ALLIES_STORAGE);
    if (!raw) return { entries: [], includePlayer: true, error: '' };
    const saved = JSON.parse(raw);
    const includePlayer = saved.includePlayer ?? true;
    if (saved?.version !== 1 || !valid(saved.entries, includePlayer)) throw new Error('format');
    return { entries: saved.entries, includePlayer, error: '' };
  } catch (_) { return { entries: [], includePlayer: true, error: 'Votre équipe ne peut pas être chargée. La sauvegarde existante est conservée.' }; }
}

export function persistAllyTeam(storage, entries, includePlayer = true) {
  if (!valid(entries, includePlayer)) throw new Error('Équipe alliée invalide.');
  storage.setItem(ALLIES_STORAGE, JSON.stringify({ version: 1, entries, includePlayer }));
}
