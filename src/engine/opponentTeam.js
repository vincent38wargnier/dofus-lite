import { CLASSES } from './classes';
import { resolveLoadout } from './equipment';
import { getMonster, monsterGrades } from './monsters';

export const MAX_OPPONENTS = 8;
export const opponentFighterId = index => index ? `B${index + 1}` : 'B';

export function isOpponentEntry(entry) {
  return !!entry && (entry.botId == null || (typeof entry.botId === 'string' && !!entry.botId.trim())) && (entry.kind === 'monster'
    ? Number.isInteger(entry.monsterId) && monsterGrades(entry.monsterId).some(grade => grade.grade === entry.grade)
    : entry.kind === 'character' && Object.prototype.hasOwnProperty.call(CLASSES, entry.classId)
      && typeof entry.name === 'string' && !!entry.name.trim() && entry.name.length <= 80
      && entry.loadout && typeof entry.loadout === 'object' && !Array.isArray(entry.loadout));
}

export function opponentSummary(entry) {
  if (!isOpponentEntry(entry)) throw new Error('Adversaire invalide.');
  if (entry.kind === 'monster') {
    const monster = getMonster(entry.monsterId, entry.grade);
    return { name: monster.name, level: monster.level, hp: monster.baseHp, pa: monster.basePa, pm: monster.basePm, valid: true, errors: [] };
  }
  return { ...resolveLoadout(entry.classId, entry.loadout), name: entry.name };
}

export function opponentTeamErrors(entries) {
  if (!Array.isArray(entries) || !entries.length) return ['Ajoutez au moins un adversaire.'];
  if (entries.length > MAX_OPPONENTS) return ['Le camp adverse accueille au maximum 8 combattants.'];
  return entries.flatMap(entry => {
    try {
      const summary = opponentSummary(entry);
      return summary.valid ? [] : summary.errors.map(message => `${summary.name} : ${message}`);
    } catch (_) { return ['Un adversaire est invalide. Sélectionnez-le à nouveau dans le catalogue.']; }
  });
}

export function opponentRoster(entries) {
  const errors = opponentTeamErrors(entries);
  if (errors.length) throw new Error(errors.join(' '));
  return entries.map((entry, index) => ({ id: opponentFighterId(index), team: 'B',
    ...(entry.kind === 'monster' ? { monsterId: entry.monsterId, monsterGrade: entry.grade }
      : { name: entry.name, classId: entry.classId, className: entry.className, loadout: JSON.parse(JSON.stringify(entry.loadout)) }) }));
}
