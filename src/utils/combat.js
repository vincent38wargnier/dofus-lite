import { SORTS } from './constants';

export const calculateDamage = (attacker, defender, sort) => {
  const baseDamage = sort.damage;
  let finalDamage = baseDamage;

  // Apply attacker's bonuses
  if (attacker.statusEffects.some(effect => effect.type === 'DAMAGE_BOOST')) {
    finalDamage *= 1.2; // 20% damage boost
  }

  // Apply defender's defenses
  if (defender.statusEffects.some(effect => effect.type === 'DEFENSE_UP')) {
    finalDamage *= 0.8; // 20% damage reduction
  }

  return Math.round(finalDamage);
};

export const applySortEffect = (sort, caster, target) => {
  const sortData = SORTS[sort];
  const effects = [];

  switch (sortData.type) {
    case 'DAMAGE':
      const damage = calculateDamage(caster, target, sortData);
      target.reduceHP(damage);
      effects.push({
        type: 'DAMAGE',
        value: damage,
        target: target
      });
      break;

    case 'HEAL':
      const healing = sortData.healing;
      target.increaseHP(healing);
      effects.push({
        type: 'HEAL',
        value: healing,
        target: target
      });
      break;

    case 'BUFF':
      target.addStatusEffect({
        type: sortData.effect,
        duration: sortData.duration,
        value: sortData.value
      });
      effects.push({
        type: 'STATUS_EFFECT',
        effect: sortData.effect,
        duration: sortData.duration,
        target: target
      });
      break;

    case 'DOT_DAMAGE':
      target.addStatusEffect({
        type: 'DAMAGE_OVER_TIME',
        duration: sortData.duration,
        value: sortData.damage
      });
      effects.push({
        type: 'STATUS_EFFECT',
        effect: 'DAMAGE_OVER_TIME',
        duration: sortData.duration,
        target: target
      });
      break;
  }

  return effects;
};

export const processStatusEffects = (player) => {
  const effects = [];

  player.statusEffects = player.statusEffects.filter(effect => {
    // Process effect
    switch (effect.type) {
      case 'DAMAGE_OVER_TIME':
        player.reduceHP(effect.value);
        effects.push({
          type: 'DAMAGE',
          value: effect.value,
          target: player
        });
        break;
      case 'HEAL_OVER_TIME':
        player.increaseHP(effect.value);
        effects.push({
          type: 'HEAL',
          value: effect.value,
          target: player
        });
        break;
    }

    // Reduce duration and keep effect if duration > 0
    effect.duration--;
    return effect.duration > 0;
  });

  return effects;
};
