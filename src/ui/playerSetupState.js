import { CLASSES, availableSpellGrades } from '../engine/classes';
import { MAPS } from '../engine/maps';

export const SETUP_STORAGE = 'dofus-lite-player-setup-v1';

export function readPlayerSetup(storage) {
  let saved;
  try { saved = JSON.parse(storage.getItem(SETUP_STORAGE)); } catch (_) { /* Use defaults. */ }
  return {
    playerClass: Object.prototype.hasOwnProperty.call(CLASSES, saved?.playerClass) ? saved.playerClass : 'IOP',
    botClass: Object.prototype.hasOwnProperty.call(CLASSES, saved?.botClass) ? saved.botClass : 'CRA',
    botId: typeof saved?.botId === 'string' ? saved.botId : 'maison',
    mapId: Object.prototype.hasOwnProperty.call(MAPS, saved?.mapId) ? saved.mapId : 'territoire_des_dopeuls_5383',
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
