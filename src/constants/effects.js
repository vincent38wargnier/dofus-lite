export const EFFECTS = {
  POISON: {
    type: 'DOT_DAMAGE',
    damagePerTurn: 5,
  },
  BURN: {
    type: 'DOT_DAMAGE',
    damagePerTurn: 8,
  },
  DEFENSE_UP: {
    type: 'BUFF',
    value: 20, // 20% damage reduction
  },
  STRENGTH_UP: {
    type: 'BUFF',
    value: 20, // 20% damage increase
  },
  STUN: {
    type: 'DEBUFF',
    skipTurn: true,
  },
  PA_BOOST: {
    type: 'BUFF',
    pa_bonus: 2,
  },
  PM_BOOST: {
    type: 'BUFF',
    pm_bonus: 2,
  },
  PA_DRAIN: {
    type: 'DEBUFF',
    pa_reduction: 2,
  },
  EXHAUSTED: {
    type: 'DEBUFF',
    pa_reduction: 1,
    pm_reduction: 1,
  },
};