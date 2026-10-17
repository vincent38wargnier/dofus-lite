import { storageKey } from '../platform/config';
import { DEFAULT_CLASS_ID, DEFAULT_OPPONENT_ID } from '../engine/classes';
import { CLASSES, availableSpellGrades } from '../engine/classes';
import { MAPS } from '../engine/maps';
import { customMapErrors } from '../engine/customMaps';
import { POUTCH_GRADES, BOSSES, DEFAULT_BOSS_ID, defaultMonsterGrade, monsterGrades } from '../engine/monsters';

export const SETUP_STORAGE = storageKey('dofus-lite-player-setup-v1');

export function readPlayerSetup(storage) {
  let saved;
  try { saved = JSON.parse(storage.getItem(SETUP_STORAGE)); } catch (_) { /* Use defaults. */ }
  const bossId = BOSSES.some(boss => boss.id === saved?.bossId) ? saved.bossId : DEFAULT_BOSS_ID;
  const battlefield = saved?.battlefield && saved.battlefield.id === saved.mapId && !customMapErrors(saved.battlefield).length ? saved.battlefield : null;
  return {
    playerClass: Object.prototype.hasOwnProperty.call(CLASSES, saved?.playerClass) ? saved.playerClass : DEFAULT_CLASS_ID,
    customCharacterId: typeof saved?.customCharacterId === 'string' ? saved.customCharacterId : null,
    customDungeonId: typeof saved?.customDungeonId === 'string' ? saved.customDungeonId : null,
    botClass: Object.prototype.hasOwnProperty.call(CLASSES, saved?.botClass) ? saved.botClass : DEFAULT_OPPONENT_ID,
    botId: typeof saved?.botId === 'string' ? saved.botId : 'maison',
    playerBotId: typeof saved?.playerBotId === 'string' ? saved.playerBotId : 'maison',
    controller: saved?.controller === 'ai' ? 'ai' : 'player',
    mapId: battlefield || Object.prototype.hasOwnProperty.call(MAPS, saved?.mapId) ? saved.mapId : (process.env.REACT_APP_PLATFORM === '1' ? 'arene' : 'territoire_des_dopeuls_5383'),
    battlefield,
    mode: saved?.mode === 'boss-auto' ? 'boss' : ['kanojedo', 'boss'].includes(saved?.mode) ? saved.mode : 'duel',
    monsterGrade: POUTCH_GRADES.some(g => g.grade === saved?.monsterGrade) ? saved.monsterGrade : 5,
    bossId,
    bossGrade: monsterGrades(bossId).some(g => g.grade === saved?.bossGrade) ? saved.bossGrade : defaultMonsterGrade(bossId),
  };
}

// Keep the player's allocation and equipment even when lowering the level.
// The engine blocks combat until any excess capital/gear is corrected manually.
// Only inaccessible spell grades reset.
export function loadoutAtLevel(classId, loadout, level) {
  const next = Math.max(1, Math.min(200, Math.round(Number(level) || 1)));
  return {
    ...loadout,
    level: next,
    spells: {
      ...loadout.spells,
      grades: Object.fromEntries(Object.entries(loadout.spells?.grades || {})
        .filter(([id, grade]) => availableSpellGrades(Number(id), next).includes(grade))),
    },
  };
}
