import { storageKey } from '../platform/config';
import { isOpponentEntry } from '../engine/opponentTeam';
import { encounterCapacity, validCombatEncounter } from '../engine/encounters';
import { isLoadout } from './loadoutStore';

export const OPPONENTS_STORAGE = storageKey('dofus-lite-opponent-team-v1');
export const OPPONENT_DRAG_TYPE = 'application/x-dofus-opponent';
const isSavedOpponent = entry => isOpponentEntry(entry) && (entry.kind === 'monster' || isLoadout(entry.loadout));

export function readOpponentTeam(storage, defaultBotId = 'maison') {
  try {
    const raw = storage.getItem(OPPONENTS_STORAGE);
    if (!raw) return { entries: null, error: '' };
    const saved = JSON.parse(raw);
    if (saved?.version !== 1 || !validCombatEncounter(saved.encounter) || !Array.isArray(saved.entries) || saved.entries.length > encounterCapacity(saved.encounter) || !saved.entries.every(isSavedOpponent)) throw new Error('format');
    // Capture the former shared choice on each character once. Subsequent
    // changes or removals then stay attached to the correct opponent.
    return { entries: saved.entries.map(entry => entry.kind === 'character' && entry.botId == null
      ? { ...entry, botId: defaultBotId } : entry), ...(saved.encounter ? { encounter: saved.encounter } : {}), error: '' };
  } catch (_) { return { entries: null, error: 'Le dernier groupe ne peut pas être chargé. Choisissez vos adversaires à nouveau.' }; }
}

export function persistOpponentTeam(storage, entries, encounter) {
  if (!validCombatEncounter(encounter) || !Array.isArray(entries) || entries.length > encounterCapacity(encounter) || !entries.every(isSavedOpponent)) throw new Error('Groupe invalide.');
  storage.setItem(OPPONENTS_STORAGE, JSON.stringify({ version: 1, entries, ...(encounter ? { encounter } : {}) }));
}
