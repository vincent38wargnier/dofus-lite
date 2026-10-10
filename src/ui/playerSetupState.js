import { CLASSES, availableSpellGrades } from '../engine/classes';
import { MAP_IDS } from '../engine/maps';
import { POUTCH_GRADES, BOSSES, DEFAULT_BOSS_ID, defaultMonsterGrade, monsterGrades } from '../engine/monsters';

export const SETUP_STORAGE = 'dofus-lite-player-setup-v1';

export function readPlayerSetup(storage) {
  let saved;
  try { saved = JSON.parse(storage.getItem(SETUP_STORAGE)); } catch (_) { /* Use defaults. */ }
  const bossId = BOSSES.some(boss => boss.id === saved?.bossId) ? saved.bossId : DEFAULT_BOSS_ID;
  return {
    playerClass: Object.prototype.hasOwnProperty.call(CLASSES, saved?.playerClass) ? saved.playerClass : 'IOP',
    botClass: Object.prototype.hasOwnProperty.call(CLASSES, saved?.botClass) ? saved.botClass : 'CRA',
    botId: typeof saved?.botId === 'string' ? saved.botId : 'maison',
    playerBotId: typeof saved?.playerBotId === 'string' ? saved.playerBotId : 'maison',
    mapId: MAP_IDS.includes(saved?.mapId) ? saved.mapId : 'territoire_des_dopeuls_5383',
    mode: ['kanojedo', 'boss', 'boss-auto'].includes(saved?.mode) ? saved.mode : 'duel',
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
