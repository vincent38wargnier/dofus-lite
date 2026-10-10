import { EQUIPMENT, EQUIPMENT_LEVEL, PARCHMENT_STAT, allocatedPoints, pointCost } from './equipment';

// Retro capital starts at zero at level 1. Equipment never enters these costs.
export const characteristicBudget = (level = EQUIPMENT_LEVEL) => Number.isInteger(level) && level >= 1 && level <= 200 ? (level - 1) * 5 : 0;

export function characteristicStep(classId, stat, amount = 0, startingStat = PARCHMENT_STAT) {
  const tiers = EQUIPMENT.caps[classId]?.[stat] || [];
  const tier = [...tiers].reverse().find(([threshold]) => startingStat + amount >= threshold);
  return tier ? { cost: tier[1], gain: tier[2] || 1 } : null;
}

// Spend only the available capital on this characteristic, leaving every other
// allocation untouched. Any remainder stays available for the player's choice.
export function maximumCharacteristic(classId, stat, base, level) {
  const others = allocatedPoints(classId, { ...base, [stat]: 0 });
  let budget = characteristicBudget(level) - others;
  let amount = 0;
  while (budget > 0) {
    const step = characteristicStep(classId, stat, amount);
    if (!step || step.cost > budget) break;
    amount += step.gain;
    budget -= step.cost;
  }
  return amount;
}

export function allocateCharacteristic(classId, stat, amount, base, level) {
  if (!Number.isInteger(amount) || amount < 0 || amount > 1990) {
    return { error: 'Saisissez un entier positif ou nul (maximum 1 990).' };
  }
  if (!Number.isFinite(pointCost(classId, stat, amount))) {
    return { error: classId === 'SACRIEUR' && stat === 'vitalite'
      ? 'Le Sacrieur gagne 2 en vitalité par point de capital : saisissez un nombre pair.'
      : 'Cette valeur ne respecte pas les paliers de votre classe.' };
  }
  const next = { ...base, [stat]: amount };
  const spent = allocatedPoints(classId, next);
  const budget = characteristicBudget(level);
  // After a level reduction, allow refunds until the retained draft fits again.
  if (spent > budget && spent >= allocatedPoints(classId, base)) {
    return { error: `Capital insuffisant : il manque ${spent - budget} point${spent - budget > 1 ? 's' : ''}. Retirez des points ailleurs ou augmentez votre niveau.` };
  }
  return { base: next };
}
