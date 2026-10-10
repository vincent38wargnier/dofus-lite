import { STAT_LABELS } from '../engine/equipment';
import { PUNISHMENT_STATS } from '../engine/engine';

export const activeEffects = fighter => (fighter.effects || []).filter(e => e.turnsLeft == null || e.turnsLeft > 0);
export const signed = value => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value)}`;

export function combatStatLabel(stat) {
  const labels = { erosion: '% érosion', armor: 'Réduction de dégâts', armorPhysical: 'Réduction physique',
    armorMagic: 'Réduction magique', dodgePa: '% esquive PA', dodgePm: '% esquive PM', range: 'PO' };
  const resistance = /^(res|fixed|pvpRes|pvpFixed)_(.+)$/.exec(stat || '');
  if (resistance) return `${['res', 'pvpRes'].includes(resistance[1]) ? '% résistance' : 'Résistance fixe'} ${resistance[2]}${resistance[1].startsWith('pvp') ? ' JcJ' : ''}`;
  return labels[stat] || STAT_LABELS[stat] || stat || 'Bonus';
}

export const statChange = (stat, value) => `${signed(value)} ${combatStatLabel(stat)}`;
export const statTone = (stat, value) => value === 0 ? 'neutral'
  : (['erosion', 'fail'].includes(stat) ? value < 0 : value > 0) ? 'positive' : 'negative';

export function temporaryBonuses(fighter) {
  return activeEffects(fighter).filter(e => e.kind === 'buff').reduce((totals, e) => {
    totals[e.stat] = (totals[e.stat] || 0) + e.value;
    return totals;
  }, {});
}

export function effectDuration(turns, isActive = false) {
  if (turns == null || turns >= 9999) return 'Sans limite';
  if (turns === 1 && isActive) return 'Fin du tour';
  return `${turns} tour${turns > 1 ? 's' : ''}`;
}

export function effectDescription(effect) {
  const e = effect;
  switch (e.kind) {
    case 'buff': return statChange(e.stat, e.value);
    case 'punishment': return `${combatStatLabel(PUNISHMENT_STATS[e.statEffectId] || e.stat || 'PV')} sur les coups reçus`;
    case 'poison': return `${e.value} dégâts${e.element ? ` ${e.element}` : ''} / tour avant résistances`;
    case 'regeneration': return `+${e.value} PV / tour`;
    case 'armor': return `Réduction de base : ${e.value}`;
    case 'weaponMastery': return `+${e.value} % dégâts de l’arme maîtrisée`;
    case 'damageReflection': return `Renvoi de dommages : ${e.value} de base`;
    case 'spellReflection': return `Renvoi des sorts de niveau ≤ ${e.value} (${e.chance ?? 100} %)`;
    case 'spellBoost': return `Bonus aux dégâts de base : +${e.value}`;
    case 'invisibility': return 'Invisible';
    case 'dodgeMelee': return 'Esquive des attaques au corps à corps';
    case 'sacrifice': return 'Dégâts transférés au lanceur';
    case 'minRolls': return 'Jets de dégâts minimisés';
    case 'maxRolls': return 'Dégâts reçus maximisés';
    case 'skipTurn': return 'Tour passé';
    case 'apPoison': return `${e.value} dégâts par tranche de ${e.step} PA utilisés`;
    case 'delayedSpell': return `Déclenchement dans ${e.delay} tour${e.delay > 1 ? 's' : ''}`;
    case 'ecaflipLuck': return `${e.chance} % : soins ×${e.healFactor} ; sinon dégâts ×${e.damageFactor}`;
    case 'state': return ({ 1: 'État saoul', 3: 'Porte un personnage', 6: 'Enraciné', 7: 'Pesanteur', 8: 'Porté' })[e.stateId] || `État ${e.stateId}`;
    default: return e.value != null ? `Valeur : ${e.value}` : 'Effet actif';
  }
}

export function effectTone(e) {
  if (e.kind === 'buff') return statTone(e.stat, e.value);
  if (['poison', 'apPoison', 'skipTurn', 'minRolls', 'maxRolls'].includes(e.kind)) return 'negative';
  if (['punishment', 'regeneration', 'armor', 'weaponMastery', 'damageReflection', 'spellReflection', 'dodgeMelee', 'spellBoost', 'invisibility'].includes(e.kind)) return 'positive';
  return 'neutral';
}

// Combine repeated hits, but retain different sources, signs and expiration dates.
export function groupCombatEffects(fighter) {
  const groups = new Map();
  activeEffects(fighter).forEach((effect, index) => {
    const key = JSON.stringify([effect.source || '', effect.spellId || effect.name || `${effect.kind}:${index}`]);
    if (!groups.has(key)) groups.set(key, { key, name: effect.name || 'Effet actif', spellId: effect.spellId,
      source: effect.source, rows: [] });
    const group = groups.get(key);
    const existing = effect.kind === 'buff' && group.rows.find(row => row.kind === 'buff'
      && row.stat === effect.stat && row.turnsLeft === effect.turnsLeft && Math.sign(row.value) === Math.sign(effect.value));
    if (existing) { existing.value += effect.value; existing.stacks += 1; }
    else group.rows.push({ ...effect, key: `${key}:${index}`, stacks: 1 });
  });
  const priority = effect => effect.kind === 'buff' ? (effectTone(effect) === 'positive' ? 0 : 1) : 2;
  return [...groups.values()].map(group => ({ ...group, rows: group.rows.sort((a, b) => priority(a) - priority(b)) }));
}
