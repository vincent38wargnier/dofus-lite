import { isOpponentEntry, opponentSummary, opponentRoster } from './opponentTeam';

// Legacy callers reserve one slot for the active profile. Complete teams do not.
export const MAX_ALLIES = 7;
export const allyFighterId = index => `A${index + 2}`;
export const teamFighterId = index => index === 0 ? 'A' : `A${index + 1}`;
export const isAutomaticTeam = (controller, allies = [], includePlayer = true) => (includePlayer || allies.length > 0)
  && (!includePlayer || controller === 'ai') && allies.every(entry => entry.controller === 'ai');
export const isAllyEntry = entry => isOpponentEntry(entry)
  && ['player', 'ai'].includes(entry.controller)
  && (entry.botId == null || (typeof entry.botId === 'string' && entry.botId.length > 0));

export function allyTeamErrors(entries = [], includePlayer = true) {
  if (!Array.isArray(entries) || entries.length > (includePlayer ? MAX_ALLIES : 8)) return ['Votre équipe accueille au maximum 8 combattants.'];
  if (!includePlayer && !entries.length) return ['Ajoutez au moins un personnage ou un monstre à votre équipe.'];
  return entries.flatMap(entry => {
    if (!isAllyEntry(entry)) return ['Un allié est invalide. Choisissez son profil et son mode de contrôle.'];
    try {
      const summary = opponentSummary(entry);
      return summary.valid ? [] : summary.errors.map(error => `${summary.name} : ${error}`);
    } catch (_) { return ['La préparation d’un allié est invalide.']; }
  });
}

export function teamRoster(entries) {
  const errors = allyTeamErrors(entries, false);
  if (errors.length) throw new Error(errors.join(' '));
  return opponentRoster(entries).map((fighter, index) => ({ ...fighter, id: teamFighterId(index), team: 'A' }));
}

export function allyRoster(entries = []) {
  const errors = allyTeamErrors(entries);
  if (errors.length) throw new Error(errors.join(' '));
  return entries.length ? opponentRoster(entries).map((fighter, index) => ({ ...fighter, id: allyFighterId(index), team: 'A' })) : [];
}
