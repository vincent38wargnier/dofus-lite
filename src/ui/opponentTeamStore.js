import { isOpponentEntry, MAX_OPPONENTS } from '../engine/opponentTeam';
import { isLoadout } from './loadoutStore';

export const OPPONENTS_STORAGE = 'dofus-lite-opponent-team-v1';
export const OPPONENT_DRAG_TYPE = 'application/x-dofus-opponent';
const isSavedOpponent = entry => isOpponentEntry(entry) && (entry.kind === 'monster' || isLoadout(entry.loadout));

export function readOpponentTeam(storage, defaultBotId = 'maison') {
  try {
    const raw = storage.getItem(OPPONENTS_STORAGE);
    if (!raw) return { entries: null, error: '' };
    const saved = JSON.parse(raw);
    if (saved?.version !== 1 || !Array.isArray(saved.entries) || saved.entries.length > MAX_OPPONENTS || !saved.entries.every(isSavedOpponent)) throw new Error('format');
    // Capture the former shared choice on each character once. Subsequent
    // changes or removals then stay attached to the correct opponent.
    return { entries: saved.entries.map(entry => entry.kind === 'character' && entry.botId == null
      ? { ...entry, botId: defaultBotId } : entry), error: '' };
  } catch (_) { return { entries: null, error: 'Le dernier groupe ne peut pas être chargé. Choisissez vos adversaires à nouveau.' }; }
}

export function persistOpponentTeam(storage, entries) {
  if (!Array.isArray(entries) || entries.length > MAX_OPPONENTS || !entries.every(isSavedOpponent)) throw new Error('Groupe invalide.');
  storage.setItem(OPPONENTS_STORAGE, JSON.stringify({ version: 1, entries }));
}
