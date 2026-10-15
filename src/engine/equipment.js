// Original client templates + pure, deterministic pre-match loadout rules.
// Permanent equipment bonuses are never stored as dispellable combat buffs.
import DATA from './equipmentData.json';
import { effectDefinition, WEAPON_EFFECTS } from './equipmentEffects';
import { equipmentItem, validateCustomEquipment } from './customEquipment';
import { equipmentKitBalance } from './equipmentBalance';
import { equipmentShapeImage } from '../visuals/customShapes';
import { createRng, hashSeed } from './rng';
import { initiative } from './formulas';
import { resolveSpellLoadout } from './classes';
import { PARCHMENT_STAT, baseActionPoints } from './characteristicDefaults';
import { matchingForge, validateForgedItem, forgedEffects, convertedWeaponRows, replaceEquipment } from './forgedItems';
export { STAT_LABELS, SPELL_MODIFIERS, effectDefinition } from './equipmentEffects';
export { equipmentItem } from './customEquipment';
export { PARCHMENT_STAT } from './characteristicDefaults';

export const EQUIPMENT = DATA;
export const ITEMS = DATA.items;
export const ITEM_SETS = DATA.sets;
export const EQUIPMENT_LEVEL = 100;
export const CHARACTERISTIC_POINTS = (EQUIPMENT_LEVEL - 1) * 5;
export const ELEMENTS = ['terre', 'feu', 'eau', 'air', 'neutre'];
export const CHARACTERISTICS = ['vitalite', 'force', 'intelligence', 'chance', 'agilite', 'sagesse'];
const weapons = [2, 3, 4, 5, 6, 7, 8, 19, 20, 21, 22, 83, 99, 114];
export const EQUIPMENT_SLOTS = [
  { id: 'hat', name: 'Coiffe', types: [16], icon: '♜' },
  { id: 'cape', name: 'Cape', types: [17, 81], icon: '◈' },
  { id: 'amulet', name: 'Amulette', types: [1], icon: '◇' },
  { id: 'weapon', name: 'Arme', types: weapons, icon: '⚔' },
  { id: 'ring1', name: 'Anneau 1', types: [9], icon: '○' },
  { id: 'ring2', name: 'Anneau 2', types: [9], icon: '○' },
  { id: 'belt', name: 'Ceinture', types: [10], icon: '═' },
  { id: 'boots', name: 'Bottes', types: [11], icon: '♟' },
  { id: 'shield', name: 'Bouclier', types: [82], icon: '⬡' },
  { id: 'pet', name: 'Familier / Monture', types: [18, 97], icon: '♞' },
  ...Array.from({ length: 6 }, (_, i) => ({ id: `dofus${i + 1}`, name: `Dofus ${i + 1}`, types: [23], icon: '◒' })),
];


export function itemIcon(item) {
  if (item?.customEquipment?.appearance) return equipmentShapeImage(item.type, item.customEquipment.appearance);
  return item && !item.missingIcon ? `/dofus-local/equipment/icons/${item.type}_${item.gfx}.png` : null;
}

export function rollEffect(row, mode = 'max', rng = createRng(1)) {
  const [id, min, maximum] = row;
  const max = Math.max(min, maximum || min);
  if (mode === 'average') return Math.floor((min + max) / 2);
  if (mode === 'random') return rng.int(min, max);
  // Best natural roll means the smallest penalty, not the biggest malus.
  return (effectDefinition(id).sign === -1 || id === 122) ? min : max;
}

export function rolledEffects(item, loadout, slot = '') {
  if (item.pet?.kind === 'trained') {
    const choice = petBonus(item, loadout);
    return [choice, ...item.effects.filter(([id]) => id === 940)].map(row => ({ row, value: row[1] }));
  }
  const forged = matchingForge(item, loadout, slot);
  if (forged && !validateForgedItem(item, forged)) return forgedEffects(item, forged);
  const origin = loadout.slots?.[slot] === item.id ? loadout.rollOrigins?.[slot] || slot : slot;
  const rng = createRng(hashSeed(`${loadout.rollSeed || 1}:${origin}:${item.id}`));
  return item.effects.map(row => ({ row, value: rollEffect(row, loadout.rollMode, rng) }));
}

// Persist only an allowed effect ID, never a user-provided amount. Every choice
// consumes the pet's shared capacity; fixed multi-bonus pets keep all their lines.
export function petBonus(item, loadout) {
  const choices = item.pet?.choices || [];
  return choices.find(([id]) => id === loadout?.petBonuses?.[item.id]) || choices[0];
}

export function availableItemEffects(item) {
  return item.pet?.choices || item.effects;
}

// `amount` is the purchased increase, not the free parchment baseline.
// Retro thresholds use the full unequipped stat, including parchments.
export function pointCost(classId, stat, amount, startingStat = PARCHMENT_STAT) {
  if (!Number.isInteger(amount) || amount < 0 || amount > 1990) return Infinity;
  const caps = DATA.caps[classId]?.[stat];
  if (!caps) return Infinity;
  let spent = 0;
  let current = 0;
  while (current < amount) {
    const value = startingStat + current;
    const [, cost, gain = 1] = [...caps].reverse().find(([threshold]) => value >= threshold);
    current += gain;
    spent += cost;
  }
  return current === amount ? spent : Infinity;
}

export function allocatedPoints(classId, base = {}) {
  return CHARACTERISTICS.reduce((total, stat) => total + pointCost(classId, stat, base[stat] || 0), 0);
}

export function focusCharacteristics(classId, stat, level = EQUIPMENT_LEVEL) {
  const base = Object.fromEntries(CHARACTERISTICS.map(s => [s, 0]));
  const caps = DATA.caps[classId]?.[stat];
  if (!caps) return base;
  let budget = (level - 1) * 5;
  while (budget > 0) {
    const [, cost, gain = 1] = [...caps].reverse().find(([threshold]) => PARCHMENT_STAT + base[stat] >= threshold);
    if (cost > budget) break;
    base[stat] += gain;
    budget -= cost;
  }
  // Remaining points go into vitality, which costs 1 point in every class.
  if (stat !== 'vitalite') base.vitalite = budget * (classId === 'SACRIEUR' ? 2 : 1);
  return base;
}

export function emptyLoadout(classId = 'IOP') {
  const focus = { ENUTROF: 'chance', SRAM: 'force', IOP: 'force', SADIDA: 'force', SACRIEUR: 'vitalite', ECAFLIP: 'force' }[classId] || 'intelligence';
  return { version: 1, slots: {}, base: focusCharacteristics(classId, focus), rollMode: 'max', rollSeed: 1,
    profile: { sex: 0, alignment: 0, rank: 0 } };
}

// Small condition grammar, deliberately without eval or dynamic JavaScript.
// Unknown predicates are rejected even if another OR branch would pass.
export function checkCondition(expression, values) {
  if (!expression) return { ok: true };
  const tokens = expression.match(/[A-Za-z]{2}|-?\d+|>=|<=|!=|==|[()&|=~!<>]/g) || [];
  if (tokens.join('') !== expression.replace(/\s/g, '')) return { ok: false, unsupported: true };
  let cursor = 0;
  const unknown = new Set();
  const readValue = () => {
    const token = tokens[cursor++];
    if (/^-?\d+$/.test(token || '')) return Number(token);
    if (Object.prototype.hasOwnProperty.call(values, token)) return values[token];
    unknown.add(token || '?'); return 0;
  };
  const atom = () => {
    if (tokens[cursor] === '(') {
      cursor += 1;
      const result = or();
      if (tokens[cursor++] !== ')') throw new Error('parenthesis');
      return result;
    }
    const left = readValue(); const op = tokens[cursor++]; const right = readValue();
    switch (op) {
      case '=': case '==': case '~': return left === right;
      case '!': case '!=': return left !== right;
      case '>': return left > right;
      case '<': return left < right;
      case '>=': return left >= right;
      case '<=': return left <= right;
      default: throw new Error('operator');
    }
  };
  const and = () => { let result = atom(); while (tokens[cursor] === '&') { cursor += 1; const rhs = atom(); result = result && rhs; } return result; };
  const or = () => { let result = and(); while (tokens[cursor] === '|') { cursor += 1; const rhs = and(); result = result || rhs; } return result; };
  try { const ok = or(); return { ok: ok && !unknown.size && cursor === tokens.length, unsupported: !!unknown.size || cursor !== tokens.length }; }
  catch (_) { return { ok: false, unsupported: true }; }
}

export function weaponSpell(item) {
  if (!item?.weapon || !item.weapon.pa) return null;
  const w = item.weapon;
  const effects = item.effects.filter(([id]) => WEAPON_EFFECTS.has(id)).map(([id, min, maximum]) => ({
    id, kind: id === 108 ? 'heal' : id === 101 ? 'removePa' : id === 84 ? 'stealPa' : id <= 95 ? 'lifeSteal' : 'damage',
    element: id >= 91 && id <= 100 ? ['eau', 'terre', 'air', 'feu', 'neutre'][(id - 91) % 5] : undefined,
    min, max: Math.max(min, maximum || min), zone: w.zone, duration: 0, chance: 0, targetMask: 2,
  }));
  if (!effects.length) return null;
  const critEffects = effects.map(e => ['damage', 'lifeSteal', 'heal'].includes(e.kind)
    ? { ...e, min: e.min + w.critBonus, max: e.max + w.critBonus } : { ...e });
  return { key: 'weapon', id: 0, itemId: item.id, weaponType: item.type, name: item.name, emoji: '⚔️', isWeapon: true, itemIcon: itemIcon(item),
    grade: 1, pa: w.pa, range: [...w.range], adjustableRange: false, lineOnly: false, needsLos: true,
    targetMode: 'cell', emptyCellOnly: false, critRate: w.critRate, failRate: w.failRate,
    endsTurnOnFailure: true, usesPerTurn: 0, usesPerTarget: 0, cooldown: 0,
    requiredStates: [], forbiddenStates: [], animation: w.animation,
    ...(w.visualEffect ? { visualEffect: JSON.parse(JSON.stringify(w.visualEffect)) } : {}),
    element: effects.find(e => e.element)?.element || null, effects, critEffects };
}

export function resolveLoadout(classId, loadout) {
  const errors = [];
  const level = loadout?.level ?? EQUIPMENT_LEVEL;
  if (!Number.isInteger(level) || level < 1 || level > 200) errors.push('Niveau : entier de 1 à 200 requis.');
  const characteristicPoints = (level - 1) * 5;
  errors.push(...resolveSpellLoadout(classId, loadout).errors);
  const bonuses = {};
  const spellModifiers = {};
  const resolvedItems = [];
  const setIds = {};
  const slots = loadout?.slots || {};
  const base = Object.fromEntries(CHARACTERISTICS.map(s => [s, loadout?.base?.[s] || 0]));
  const points = allocatedPoints(classId, base);
  if (points > characteristicPoints) errors.push(`Caractéristiques : ${characteristicPoints} points disponibles.`);
  if (!['max', 'average', 'random'].includes(loadout?.rollMode)) errors.push('Mode de jets invalide.');
  for (const slot of Object.keys(slots)) if (!EQUIPMENT_SLOTS.some(s => s.id === slot)) errors.push(`Emplacement inconnu : ${slot}.`);
  const add = (row, value, name) => {
    const definition = effectDefinition(row[0]);
    if (['stat', 'utility'].includes(definition.kind)) bonuses[definition.stat] = (bonuses[definition.stat] || 0) + value * definition.sign;
    if (definition.kind === 'spell') {
      const modifiers = spellModifiers[row[1]] || (spellModifiers[row[1]] = {});
      modifiers[definition.modifier] = (modifiers[definition.modifier] || 0) + (parseInt(row[3], 16) || 0);
    }
    if (definition.kind === 'unsupported') errors.push(`${name} : effet ${row[0]} non reproduit.`);
  };
  const usedIds = new Set();
  for (const slot of EQUIPMENT_SLOTS) {
    const id = slots[slot.id];
    if (!id) continue;
    const item = equipmentItem(id, loadout);
    if (!item) { errors.push(`${slot.name} : objet inconnu (${id}).`); continue; }
    if (item.customEquipment) errors.push(...validateCustomEquipment(item.customEquipment).errors.map(error => `${item.name} : ${error}`));
    if (!slot.types.includes(item.type)) errors.push(`${item.name} ne va pas dans ${slot.name}.`);
    if (item.level > level) errors.push(`${item.name} nécessite le niveau ${item.level}.`);
    // Identical set rings and identical Dofus are forbidden. Two identical
    // non-set rings are legal in Retro; a set piece is counted only once.
    if (usedIds.has(item.id) && (item.set || item.type === 23)) errors.push(`${item.name} ne peut pas être équipé deux fois.`);
    usedIds.add(item.id);
    const effects = rolledEffects(item, loadout, slot.id);
    const forged = matchingForge(item, loadout, slot.id);
    if (forged) {
      const error = validateForgedItem(item, forged);
      if (error) errors.push(`${item.name} : ${error}`);
    }
    const petChoice = loadout.petBonuses?.[item.id];
    if (item.pet?.kind === 'trained' && petChoice != null && !item.pet.choices.some(([id]) => id === petChoice)) {
      errors.push(`${item.name} : spécialisation de familier invalide.`);
    }
    effects.forEach(({ row, value }) => add(row, value, item.name));
    resolvedItems.push({ slot: slot.id, id: item.id, name: item.name, effects });
    if (item.set) (setIds[item.set] || (setIds[item.set] = new Set())).add(item.id);
  }
  const sets = Object.entries(setIds).map(([id, ids]) => {
    const set = ITEM_SETS[id];
    const count = ids.size;
    const rows = set?.bonuses[count] || [];
    rows.forEach(row => add(row, row[1], set.name));
    return { id: Number(id), name: set?.name || `Panoplie ${id}`, count, total: set?.items.length || count, effects: rows };
  });
  const weapon = equipmentItem(slots.weapon, loadout);
  if (weapon?.weapon?.twoHanded && slots.shield) errors.push('Une arme à deux mains ne permet pas de porter un bouclier.');
  const parchments = Object.fromEntries(CHARACTERISTICS.map(stat => [stat, PARCHMENT_STAT]));
  const baseStats = Object.fromEntries(CHARACTERISTICS.map(stat => [stat, parchments[stat] + base[stat]]));
  const stats = Object.fromEntries(CHARACTERISTICS.map(stat => [stat, baseStats[stat] + (bonuses[stat] || 0)]));
  const profile = { sex: 0, alignment: 0, rank: 0, ...loadout?.profile };
  if (![0, 1].includes(profile.sex) || ![0, 1, 2].includes(profile.alignment)
    || !Number.isInteger(profile.rank) || profile.rank < 0 || profile.rank > 10) errors.push('Profil JcJ invalide.');
  const classNumber = Object.keys(DATA.caps).indexOf(classId) + 1;
  const values = { PL: level, PG: classNumber, PS: profile.sex, Ps: profile.alignment, PP: profile.rank, PZ: 1,
    CI: stats.intelligence, CV: stats.vitalite, CA: stats.agilite, CW: stats.sagesse, CC: stats.chance, CS: stats.force,
    Ci: baseStats.intelligence, Cv: baseStats.vitalite, Ca: baseStats.agilite, Cw: baseStats.sagesse, Cc: baseStats.chance, Cs: baseStats.force };
  for (const equipped of resolvedItems) {
    const item = equipmentItem(equipped.id, loadout);
    const condition = checkCondition(item.condition, values);
    if (!condition.ok) errors.push(`${item.name} : ${condition.unsupported ? 'condition non simulée' : 'conditions non remplies'} (${item.condition}).`);
  }
  const hp = Math.max(1, 55 + 5 * (level - 1) + stats.vitalite);
  const pa = Math.max(0, baseActionPoints(level) + (bonuses.pa || 0));
  const pm = Math.max(0, 3 + (bonuses.pm || 0));
  const permanent = Object.fromEntries(Object.entries(bonuses).filter(([stat]) => !CHARACTERISTICS.includes(stat)
    && !['pa', 'pm'].includes(stat) && !stat.startsWith('res_') && !stat.startsWith('fixed_')));
  const resistances = Object.fromEntries(ELEMENTS.map(e => [e, bonuses[`res_${e}`] || 0]));
  const resistancesFixed = Object.fromEntries(ELEMENTS.map(e => [e, bonuses[`fixed_${e}`] || 0]));
  const equipmentBudget = equipmentKitBalance(resolvedItems.map(equipped => {
    const item = equipmentItem(equipped.id, loadout);
    return { ...item, pet: undefined, effects: equipped.effects.map(({ row, value }) => WEAPON_EFFECTS.has(row[0]) ? row : [row[0], value, 0, row[3]]) };
  }), level, sets.flatMap(set => set.effects));
  errors.push(...equipmentBudget.errors);
  return { equipmentBudget, valid: !errors.length, errors: [...new Set(errors)], level, characteristicPoints, points, base, baseStats, parchments, stats, bonuses, permanent,
    hp, pa, pm, resistances, resistancesFixed, sets, items: resolvedItems, spellModifiers,
    initiative: initiative(stats, hp, hp, bonuses.initiative || 0),
    weaponSpell: weaponSpell(weapon ? { ...weapon, effects: convertedWeaponRows(weapon, matchingForge(weapon, loadout, 'weapon')) } : null), snapshot: JSON.parse(JSON.stringify(loadout)) };
}

export function applySpellModifiers(spell, modifiers = {}) {
  const m = modifiers[spell.id];
  if (!m) return spell;
  return { ...spell, pa: Math.max(1, spell.pa - (m.pa || 0)), range: [spell.range[0], Math.max(spell.range[0], spell.range[1] + (m.range || 0))],
    adjustableRange: spell.adjustableRange || !!m.adjustableRange, lineOnly: m.lineOnly ? false : spell.lineOnly,
    needsLos: m.needsLos ? false : spell.needsLos, critBonus: (spell.critBonus || 0) + (m.crit || 0),
    cooldown: Math.max(0, spell.cooldown - (m.cooldown || 0)),
    usesPerTurn: spell.usesPerTurn ? spell.usesPerTurn + (m.usesPerTurn || 0) : 0,
    usesPerTarget: spell.usesPerTarget ? spell.usesPerTarget + (m.usesPerTarget || 0) : 0,
    flatDamage: m.damage || 0, flatHeal: m.heal || 0 };
}

export function equipSet(loadout, setId) {
  const slots = { ...loadout.slots };
  const occupied = new Set();
  for (const id of ITEM_SETS[setId]?.items || []) {
    const item = ITEMS[id];
    if (!item) continue;
    const slot = EQUIPMENT_SLOTS.find(s => s.types.includes(item.type) && !occupied.has(s.id));
    if (slot) { slots[slot.id] = id; occupied.add(slot.id); }
  }
  let result = loadout;
  for (const [slot, id] of Object.entries(slots)) result = replaceEquipment(result, slot, id);
  return result;
}
