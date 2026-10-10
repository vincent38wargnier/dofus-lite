import { turnResources } from '../engine/formulas';

// Outside a fighter's turn, spent points are stale. Preview the next allocation
// from the same active effects as startTurn, without giving any actions back.
export function combatResources(fighter, state) {
  if (fighter.hp <= 0) return { pa: 0, pm: 0, preview: false };
  const preview = state.phase !== 'placement' && !state.over && state.order[state.currentIndex] !== fighter.id;
  return { ...(preview ? turnResources(fighter) : { pa: fighter.pa, pm: fighter.pm }), preview };
}
