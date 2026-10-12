// Local, versioned design budget. This is not Ankama's balancing formula.
// Calibrated against native items only; a custom library can never move the limits.
import DATA from './equipmentData.json';
import FM from './forgemagieData.json';
import { effectDefinition, WEAPON_EFFECTS, STAT_LABELS } from './equipmentEffects';

export const EQUIPMENT_BUDGET_VERSION = 2;
export const MAX_ITEM_SCORE = 100;
// Allow an optimized native outfit with legal exos (1,606.5 points in the
// reference build), with a small margin. Individual creation caps stay at 100.
export const MAX_EQUIPMENT_SCORE = 1650;
export const WEAPON_TYPES = [2, 3, 4, 5, 6, 7, 8, 19];
export const EQUIPMENT_FAMILIES = [
  ['hat', 'Coiffe', [16]], ['cape', 'Cape / sac', [17, 81]], ['amulet', 'Amulette', [1]],
  ['ring', 'Anneau', [9]], ['belt', 'Ceinture', [10]], ['boots', 'Bottes', [11]],
  ...WEAPON_TYPES.map(type => [`weapon-${type}`, DATA.types[type], [type]]),
  ['shield', 'Bouclier', [82]], ['pet', 'Familier', [18]], ['mount', 'Monture', [97]],
].map(([id, name, types]) => ({ id, name, types }));
export const equipmentFamily = item => EQUIPMENT_FAMILIES.find(family => family.types.includes(item?.type));
export const equipmentStatLabel = stat => STAT_LABELS[stat] || `${stat.includes('Fixed') || stat.startsWith('fixed_') ? 'Résistance fixe' : 'Résistance %'} ${stat.split('_')[1]}${stat.startsWith('pvp') ? ' JcJ' : ''}`;

// Utility has a separate numeric bound, but cannot pay for combat strength.
export const EQUIPMENT_STAT_RULES = Object.fromEntries(Object.entries(FM.stats).map(([stat, rule]) => [stat, {
  ...rule, weight: ['pods', 'prospecting'].includes(stat) ? 0 : rule.weight, label: equipmentStatLabel(stat),
}]));
for (const [stat, effect, weight] of [['physicalDamage', 142, 20], ['dodgePa', 160, 6], ['dodgePm', 161, 6]]) {
  EQUIPMENT_STAT_RULES[stat] = { effect, weight, label: equipmentStatLabel(stat) };
}
for (const [index, element] of ['terre', 'eau', 'air', 'feu', 'neutre'].entries()) {
  for (const [prefix, start, weight] of [['pvpRes', 250, 4], ['pvpFixed', 260, 5]]) {
    const stat = `${prefix}_${element}`;
    EQUIPMENT_STAT_RULES[stat] = { effect: start + index, weight, label: equipmentStatLabel(stat) };
  }
}
const characteristics = ['force', 'intelligence', 'chance', 'agilite'];
const round = value => Math.round(value * 10) / 10;
export const quantile = (values, q) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b), position = (sorted.length - 1) * q;
  return sorted[Math.floor(position)] + (sorted[Math.ceil(position)] - sorted[Math.floor(position)]) * (position % 1);
};

// Best NATURAL rolls, including the smallest negative roll. Trained pets have
// one shared capacity: alternatives must never be added together.
export function equipmentStats(item) {
  let rows = item?.effects || [];
  if (item?.pet?.kind === 'trained') {
    rows = [...(item.pet.choices || [])].sort((a, b) => {
      const cost = row => (EQUIPMENT_STAT_RULES[effectDefinition(row[0]).stat]?.weight || 0) * row[1];
      return cost(b) - cost(a);
    }).slice(0, 1);
  }
  const stats = {};
  for (const [id, min, max] of rows) {
    const def = effectDefinition(id);
    if (!EQUIPMENT_STAT_RULES[def.stat]) continue;
    stats[def.stat] = (stats[def.stat] || 0) + (def.sign < 0 ? -min : Math.max(min, max || min));
  }
  return stats;
}

export function weaponPower(item, level = item?.level || 1) {
  if (!item?.weapon?.pa) return 0;
  const w = item.weapon;
  // Flat damage per hit matters even on a low base roll. Evaluate naked and
  // equipped, at 1/2 critical (reachable with gear), without credit for failures.
  const flatEquivalent = (10 + level * .15) / (1 + (100 + level * 2) / 100);
  let normal = 0, critical = 0;
  for (const [id, min, max] of item.effects || []) {
    if (!WEAPON_EFFECTS.has(id)) continue;
    const mean = (min + Math.max(min, max || min)) / 2;
    if ([84, 101].includes(id)) { normal += mean * 24; critical += mean * 24; continue; }
    const factor = id === 108 ? 1 : id <= 95 ? 1.5 : 1;
    normal += (mean + flatEquivalent) * factor;
    critical += (mean + flatEquivalent + (w.critRate ? w.critBonus : 0)) * factor;
  }
  const area = ['Tb', 'Xb'].includes(w.zone) ? 1.35 : 1;
  const range = 1 + Math.max(0, w.range[1] - 1) * .035;
  return Math.max(normal, (normal + critical) / 2) / w.pa * area * range * 16;
}

export function equipmentPower(item, level = item?.level || 1) {
  const stats = equipmentStats(item);
  const contributions = Object.entries(stats).filter(([, value]) => value > 0).map(([stat, value]) => ({
    stat, label: equipmentStatLabel(stat), value, points: value * EQUIPMENT_STAT_RULES[stat].weight,
  }));
  // A malus can be irrelevant to a build. No negative-stat credit, no credit for
  // equipment conditions, set membership, two-handed use or critical failures.
  const synergy = (stats.pa > 0 && stats.pm > 0 ? 40 : 0)
    + Math.max(0, (stats.pa || 0) - 1) * 100 + Math.max(0, (stats.pm || 0) - 1) * 90;
  const passive = contributions.reduce((sum, row) => sum + row.points, 0) + synergy;
  const attack = weaponPower(item, level);
  return { stats, contributions, synergy, passive, attack, total: passive + attack };
}

export function nativeEquipmentExclusion(item) {
  if (item.type === 23) return 'dofus';
  if (!equipmentFamily(item)) return 'outil-ou-arme-speciale';
  if (item.ethereal) return 'arme-etheree';
  if (item.level < 1 || item.level > 200) return 'niveau-hors-jeu';
  if (/BI=|PK>|PJ|PX|Ma[iî]tre Jarbo|Annobus|Ma[iî]tre des|Meneur de jeu/i.test(`${item.condition || ''} ${item.name}`)) return 'reserve-ou-inaccessible';
  if (item.effects.some(([id]) => ['unsupported', 'spell'].includes(effectDefinition(id).kind))) return 'effet-special';
  const stats = equipmentStats(item);
  // Client tables also contain administrator/testing equipment. Never treat
  // those outliers as allowances for a level-1 custom item.
  if ((stats.pa || 0) > 2 || (stats.pm || 0) > 2 || (stats.vitalite || 0) > 700
    || characteristics.some(stat => (stats[stat] || 0) > 120)
    || (stats.sagesse || 0) > 100 || (stats.damage || 0) > 30) return 'valeurs-exceptionnelles';
  if (!equipmentPower(item).total) return 'sans-bonus-combat';
  return null;
}

const census = Object.values(DATA.items).filter(item => item.type !== 23);
const eligible = census.filter(item => !nativeEquipmentExclusion(item));
// Converted weapons share one silhouette and passive package. Keep the
// strongest native variant, instead of counting four elemental copies again.
const unique = new Map();
for (const item of eligible) {
  const key = JSON.stringify([item.type, item.gfx, item.level, equipmentStats(item), item.weapon || null]);
  if (!unique.has(key) || equipmentPower(item).total > equipmentPower(unique.get(key)).total) unique.set(key, item);
}
export const EQUIPMENT_REFERENCES = [...unique.values()];
const utilityReferences = census.filter(item => nativeEquipmentExclusion(item) === 'sans-bonus-combat');
export const EQUIPMENT_CENSUS = {
  items: census.length, dofusExcluded: Object.values(DATA.items).length - census.length,
  eligible: eligible.length, references: EQUIPMENT_REFERENCES.length,
  exclusions: census.reduce((counts, item) => {
    const reason = nativeEquipmentExclusion(item);
    if (reason) counts[reason] = (counts[reason] || 0) + 1;
    return counts;
  }, {}),
};

const bands = new Map();
function limitsAt(family, level) {
  const cacheKey = `${family.id}:${level}`;
  if (bands.has(cacheKey)) return bands.get(cacheKey);
  const flat = ['pet', 'mount', 'shield'].includes(family.id);
  const pool = EQUIPMENT_REFERENCES.filter(item => family.types.includes(item.type) && (flat || item.level <= level));
  const recent = pool.filter(item => item.level >= level - 30);
  const sample = flat || recent.length < 12 ? pool : recent;
  const scores = sample.map(item => equipmentPower(item, flat ? item.level : level));
  const statRows = [...scores, ...utilityReferences.filter(item => family.types.includes(item.type) && (flat || item.level <= level))
    .map(item => equipmentPower(item))];
  const prior = level > 1 && !flat ? limitsAt(family, level - 1) : null;
  const maximum = key => Math.max(quantile(scores.map(row => row[key]).filter(value => value > 0), .9), prior?.[key] || 0, 1);
  const statLimits = {};
  for (const stat of Object.keys(EQUIPMENT_STAT_RULES)) {
    const positives = statRows.map(row => row.stats[stat] || 0).filter(value => value > 0);
    statLimits[stat] = Math.max(Math.ceil(quantile(positives, .95)), prior?.statLimits[stat] || 0);
  }
  // PA/PM exos may be invented on ordinary gear, but spend the full budget.
  if (!flat) { statLimits.pa = 1; statLimits.pm = 1; }
  const result = { total: maximum('total'), passive: maximum('passive'), attack: maximum('attack'),
    statLimits, sample: sample.length, references: sample };
  bands.set(cacheKey, result);
  return result;
}

export function equipmentBudget(item, atLevel = item?.level) {
  const family = equipmentFamily(item);
  if (!family || !Number.isInteger(atLevel) || atLevel < 1 || atLevel > 200) return null;
  return limitsAt(family, ['pet', 'mount', 'shield'].includes(family.id) ? 200 : atLevel);
}

export function equipmentBalance(item, atLevel = item?.level) {
  const limits = equipmentBudget(item, atLevel);
  const power = equipmentPower(item, atLevel);
  if (!limits) return { score: 0, valid: false, errors: ['Famille ou niveau hors du créateur.'], ...power };
  const totalScore = power.total / limits.total * 100;
  const passiveScore = power.passive / limits.passive * 100;
  const attackScore = item.weapon ? power.attack / limits.attack * 100 : 0;
  const statScores = Object.entries(power.stats).filter(([, value]) => value > 0).map(([stat, value]) => ({
    stat, value, max: limits.statLimits[stat], score: value / Math.max(1, limits.statLimits[stat]) * 100,
  }));
  // A legal +1 AP is a hard cap, not automatically a 100-point item. Keep
  // numeric line limits independent so the meter still reflects additions.
  const score = Math.max(totalScore, passiveScore, attackScore);
  const errors = [];
  if (score > 100 + 1e-8) errors.push(`Budget de l’objet dépassé : ${round(score)} / 100 points.`);
  for (const row of statScores) if (row.value > row.max) errors.push(`${equipmentStatLabel(row.stat)} : maximum ${row.max} pour cette famille et ce niveau.`);
  const comparisons = [...limits.references].sort((a, b) => Math.abs(a.level - item.level) - Math.abs(b.level - item.level)
    || Math.abs(equipmentPower(a).total - power.total) - Math.abs(equipmentPower(b).total - power.total)).slice(0, 3)
    .map(reference => ({ id: reference.id, name: reference.name, level: reference.level,
      score: round(equipmentPower(reference, atLevel).total / limits.total * 100) }));
  return { ...power, score: round(score), rawScore: score, valid: !errors.length, errors, limits,
    totalScore: round(totalScore), passiveScore: round(passiveScore), attackScore: round(attackScore), comparisons };
}

// Audit the full outfit, counting rings twice and set effects once. Dofus never
// enter either the score or the synergy calculation. Native gear stays playable.
export function equipmentKitBalance(items, level, setBonuses = []) {
  const gear = items.filter(item => item && item.type !== 23);
  const totals = {};
  let baseScore = 0;
  for (const item of gear) {
    const atLevel = Math.max(level, item.level);
    const power = equipmentPower(item, atLevel), limits = equipmentBudget(item, atLevel);
    if (limits) baseScore += Math.min(100, power.total / limits.total * 100);
    for (const [stat, value] of Object.entries(power.stats)) totals[stat] = (totals[stat] || 0) + value;
  }
  const sets = equipmentPower({ effects: setBonuses });
  for (const [stat, value] of Object.entries(sets.stats)) totals[stat] = (totals[stat] || 0) + value;
  const meanLimit = gear.map(item => equipmentBudget(item, Math.max(level, item.level))?.total).filter(Boolean);
  const setScore = sets.total / (meanLimit.reduce((sum, value) => sum + value, 0) / (meanLimit.length || 1) || 1) * 100;
  const synergy = Math.max(0, (totals.pa || 0) - 3) * 175 + Math.max(0, (totals.pm || 0) - 2) * 175
    + Math.max(0, (totals.range || 0) - 5) * 15;
  const score = round(baseScore + setScore + synergy);
  const custom = gear.some(item => item.customEquipment);
  return { score, max: MAX_EQUIPMENT_SCORE, baseScore: round(baseScore), setScore: round(setScore), synergy,
    enforced: custom, valid: !custom || score <= MAX_EQUIPMENT_SCORE,
    errors: custom && score > MAX_EQUIPMENT_SCORE ? [`Budget du stuff dépassé : ${score} / ${MAX_EQUIPMENT_SCORE} points (hors Dofus).`] : [] };
}
