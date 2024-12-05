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
};
