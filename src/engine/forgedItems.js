// Item-instance storage shared by the equipment resolver and the FM engine.
// This module deliberately does not import equipment.js (no circular resolver).
import DATA from './forgemagieData.json';

export const FM_STATS = DATA.stats;
export const FORGE_MODEL = 'retro-reconstruction-v3';
const record = x => !!x && typeof x === 'object' && !Array.isArray(x);
const integer = x => Number.isSafeInteger(x) && x >= 0;
const blocked = new Set(DATA.nonMageableIds);
const types = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 16, 17, 81]);

export function forgeRestriction(item) {
  if (!item) return 'Choisissez un équipement.';
  if (item.customEquipment) return 'Équipement créé : jets fixes, à modifier dans Atelier → Mes équipements.';
  if (!types.has(item.type)) return 'Ce type d’objet ne peut pas être forgemagé (Dofus, familiers, boucliers, outils…).';
  if (blocked.has(item.id)) return 'Cet objet est déclaré non forgemageable par le client.';
  return '';
}

export function fmEffect(id) {
  const aliases = { 110: 125, 121: 112, 127: 169, 2100: 168 };
  const normalized = aliases[id] || id;
  const def = Object.entries(FM_STATS).map(([stat, d]) => ({ stat, ...d }))
    .find(d => d.effect === normalized || d.negativeEffect === normalized);
  return def ? { ...def, sign: normalized === def.negativeEffect ? -1 : 1 } : null;
}

export function naturalBounds(item) {
  const bounds = {};
  for (const [id, min, max] of item.effects) {
    const def = fmEffect(id);
    if (!def) continue;
    const negative = def.sign < 0;
    const low = negative ? -Math.max(min, max) : min;
    const high = negative ? -min : Math.max(min, max);
    const old = bounds[def.stat] || { min: 0, max: 0 };
    bounds[def.stat] = { min: old.min + low, max: old.max + high };
  }
  return bounds;
}

export function extraWeight(item, stats) {
  const bounds = naturalBounds(item);
  return Object.entries(FM_STATS).reduce((sum, [stat, def]) =>
    sum + Math.max(0, (stats[stat] || 0) - Math.max(0, bounds[stat]?.max || 0)) * def.weight, 0);
}

export function statLimit(item, stat, stats) {
  const max = Math.max(0, naturalBounds(item)[stat]?.max || 0);
  const weight = FM_STATS[stat].weight;
  const otherExtra = extraWeight(item, { ...stats, [stat]: 0 });
  // The full line has its own ceiling; only its excess over the natural maximum
  // spends the shared budget. Adding an exo must not invalidate another legal over.
  const lineLimit = Math.max(max, Math.floor((101 + 1e-8) / weight));
  const sharedLimit = max + Math.floor((101 - otherExtra + 1e-8) / weight);
  return Math.min(lineLimit, sharedLimit);
}

export function isForgeSnapshot(value) {
  return record(value) && value.version === 1 && integer(value.itemId)
    && record(value.stats) && Object.entries(value.stats).every(([s, n]) => FM_STATS[s] && Number.isSafeInteger(n) && Math.abs(n) <= 100000)
    && Array.isArray(value.baseEffects) && value.baseEffects.length <= 100
    && value.baseEffects.every(e => record(e) && Array.isArray(e.row) && e.row.length >= 3 && Number.isSafeInteger(e.value))
    && integer(value.puits) && value.puits <= 100000 && integer(value.attempts)
    && integer(value.rngState) && value.rngState <= 0xffffffff
    && record(value.consumption) && Object.values(value.consumption).every(integer)
    && Array.isArray(value.history) && value.history.length <= 100
    && value.history.every(e => record(e) && integer(e.attempt) && typeof e.reagent === 'string'
      && ['SC', 'SN', 'EC'].includes(e.outcome) && record(e.deltas)
      && Object.entries(e.deltas).every(([s, n]) => FM_STATS[s] && Number.isSafeInteger(n))
      && integer(e.puitsBefore) && integer(e.puitsAfter))
    && (value.weaponPotion == null || DATA.potions.some(p => p.id === value.weaponPotion));
}

export function validateForgedItem(item, state) {
  if (!isForgeSnapshot(state) || state.itemId !== item.id) return 'Jet forgemagé invalide.';
  const restriction = forgeRestriction(item);
  if (restriction) return restriction;
  if (state.baseEffects.length !== item.effects.length || state.baseEffects.some((e, i) =>
    JSON.stringify(e.row) !== JSON.stringify(item.effects[i]) || e.value < e.row[1] || e.value > Math.max(e.row[1], e.row[2]))) return 'Jet de départ forgemagé invalide.';
  const bounds = naturalBounds(item);
  if (Object.keys(bounds).some(stat => !Object.prototype.hasOwnProperty.call(state.stats, stat))) return 'Caractéristique de l’objet manquante.';
  if (extraWeight(item, state.stats) > 101 + 1e-8) return 'Le poids total des surjets et exotiques dépasse 101.';
  for (const [stat, value] of Object.entries(state.stats)) {
    if (value < Math.min(0, bounds[stat]?.min || 0) || value > statLimit(item, stat, state.stats)) return `Limite de forgemagie dépassée : ${stat}.`;
  }
  if (state.weaponPotion && (!item.weapon || !item.effects.some(([id]) => id === 100))) return 'Conversion élémentaire incompatible avec cette arme.';
  return '';
}

export function createForgedItem(item, effects, seed = 1) {
  if (forgeRestriction(item)) throw new Error(forgeRestriction(item));
  const stats = {};
  effects.forEach(({ row, value }) => {
    const def = fmEffect(row[0]);
    if (def) stats[def.stat] = (stats[def.stat] || 0) + value * def.sign;
  });
  return { version: 1, model: FORGE_MODEL, itemId: item.id, stats,
    baseEffects: effects.map(e => ({ row: [...e.row], value: e.value })), puits: 0,
    rngState: seed >>> 0, attempts: 0, consumption: {}, history: [] };
}

export function convertedWeaponRows(item, state) {
  const potion = DATA.potions.find(p => p.id === state?.weaponPotion);
  // Explicit emulator approximation: floor each bound at 50 / 65 / 85%.
  // Only neutral direct damage changes; neutral life steal and other lines stay.
  return item.effects.map(row => {
    if (!potion || row[0] !== 100) return [...row];
    const min = Math.max(1, Math.floor(row[1] * potion.ratio / 100));
    const max = Math.max(min, Math.floor(Math.max(row[1], row[2]) * potion.ratio / 100));
    return [potion.effect, min, max, `1d${max - min + 1}+${min - 1}`];
  });
}

export function forgedEffects(item, state) {
  const weaponRows = convertedWeaponRows(item, state);
  const effects = state.baseEffects.flatMap((e, i) => fmEffect(e.row[0]) ? [] : [{ ...e, row: weaponRows[i] }]);
  for (const [stat, value] of Object.entries(state.stats)) {
    const def = FM_STATS[stat];
    const effect = value < 0 ? def.negativeEffect : def.effect;
    if (value && effect) effects.push({ row: [effect, Math.abs(value), 0, `0d0+${Math.abs(value)}`], value: Math.abs(value) });
  }
  return effects;
}

export function matchingForge(item, loadout, slot) {
  const state = loadout?.forgedItems?.[slot];
  return state?.itemId === item?.id ? state : null;
}

export function replaceEquipment(loadout, slot, id) {
  const forgedItems = { ...loadout.forgedItems };
  const rollOrigins = { ...loadout.rollOrigins };
  if (id !== loadout.slots[slot]) { delete forgedItems[slot]; delete rollOrigins[slot]; }
  return { ...loadout, slots: { ...loadout.slots, [slot]: id },
    ...(loadout.forgedItems ? { forgedItems } : {}), ...(loadout.rollOrigins ? { rollOrigins } : {}) };
}

// Moving an equipped instance keeps both its FM history and its random jet.
export function swapEquipment(loadout, from, to) {
  if (from === to || !loadout.slots[from]) return loadout;
  const slots = { ...loadout.slots, [from]: loadout.slots[to] || null, [to]: loadout.slots[from] };
  const forgedItems = { ...loadout.forgedItems }, rollOrigins = { ...loadout.rollOrigins };
  for (const [source, target] of [[from, to], [to, from]]) {
    delete forgedItems[target]; delete rollOrigins[target];
    if (loadout.slots[source]) {
      if (loadout.forgedItems?.[source]) forgedItems[target] = loadout.forgedItems[source];
      rollOrigins[target] = loadout.rollOrigins?.[source] || source;
    }
  }
  return { ...loadout, slots, rollOrigins, ...(loadout.forgedItems ? { forgedItems } : {}) };
}
