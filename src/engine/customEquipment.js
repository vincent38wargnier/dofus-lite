import DATA from './equipmentData.json';
import { equipmentBalance, equipmentFamily, EQUIPMENT_STAT_RULES, WEAPON_TYPES } from './equipmentBalance';
import { defaultEquipmentAppearance, validEquipmentAppearance } from '../visuals/customShapes';
import { validSpellVisual } from '../visuals/spellVisuals';

export const CUSTOM_ITEM_MIN_ID = 1000000000;
const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
const clone = value => JSON.parse(JSON.stringify(value));
const fields = ['version', 'id', 'referenceId', 'name', 'level', 'stats', 'weapon', 'appearance'];
export const newEquipmentId = () => Date.now() * 1000 + Math.floor(Math.random() * 1000);
export const isCustomEquipmentId = id => Number.isSafeInteger(id) && id >= CUSTOM_ITEM_MIN_ID;

export function customEquipmentShape(value) {
  return record(value) && value.version === 1 && isCustomEquipmentId(value.id)
    && Object.keys(value).every(key => fields.includes(key)) && Number.isInteger(value.referenceId)
    && typeof value.name === 'string' && value.name.length <= 80 && Number.isInteger(value.level)
    && (value.appearance == null || validEquipmentAppearance(value.appearance))
    && record(value.stats) && Object.keys(value.stats).length <= 50
    && Object.entries(value.stats).every(([stat, n]) => own(EQUIPMENT_STAT_RULES, stat) && Number.isInteger(n) && Math.abs(n) <= 10000)
    && (value.weapon == null || (record(value.weapon) && Object.keys(value.weapon).every(key => ['pa', 'range', 'critRate', 'critBonus', 'lines', 'visualEffect'].includes(key))
      && (value.weapon.visualEffect == null || validSpellVisual(value.weapon.visualEffect))
      && ['pa', 'critRate', 'critBonus'].every(key => Number.isInteger(value.weapon[key]))
      && Array.isArray(value.weapon.range) && value.weapon.range.length === 2 && value.weapon.range.every(Number.isInteger)
      && Array.isArray(value.weapon.lines) && value.weapon.lines.length <= 4
      && value.weapon.lines.every(row => record(row) && Object.keys(row).every(key => ['id', 'min', 'max'].includes(key))
        && ['id', 'min', 'max'].every(key => Number.isInteger(row[key])))));
}

// Reconstruct rules from a native reference, independently of the chosen image.
// Missing appearance preserves legacy client visuals. A JSON cannot inject a set bonus,
// a pet capacity, conditions, arbitrary effects, type, GFX or a weapon zone.
export function customEquipmentItem(definition) {
  if (!customEquipmentShape(definition)) return null;
  const base = DATA.items[definition.referenceId];
  if (!base || base.type === 23 || !equipmentFamily(base)) return null;
  const effects = Object.entries(definition.stats).flatMap(([stat, value]) => {
    const rule = EQUIPMENT_STAT_RULES[stat], effect = value < 0 ? rule.negativeEffect : rule.effect;
    return value && effect ? [[effect, Math.abs(value), 0, `0d0+${Math.abs(value)}`]] : [];
  });
  const item = { id: definition.id, name: definition.name.trim(), type: base.type, gfx: base.gfx,
    level: definition.level, effects, customEquipment: clone(definition), missingIcon: base.missingIcon };
  if (base.type === 82 && base.condition) item.condition = base.condition;
  if (base.type === 97) item.mount = clone(base.mount || { level: 100 });
  if (WEAPON_TYPES.includes(base.type) && base.weapon && definition.weapon) {
    const w = definition.weapon;
    item.weapon = { ...base.weapon, pa: w.pa, range: [...w.range], critRate: w.critRate, critBonus: w.critBonus,
      ...(w.visualEffect ? { visualEffect: clone(w.visualEffect) } : {}) };
    item.effects.unshift(...w.lines.map(row => [row.id, row.min, row.max, `1d${row.max - row.min + 1}+${row.min - 1}`]));
  }
  return item;
}

export function validateCustomEquipment(definition) {
  if (!customEquipmentShape(definition)) return { valid: false, errors: ['Définition d’équipement invalide.'], item: null, balance: null };
  const errors = [], base = DATA.items[definition.referenceId];
  if (!definition.name.trim()) errors.push('Donnez un nom à cet équipement.');
  if (definition.level < 1 || definition.level > 200) errors.push('Niveau requis : de 1 à 200.');
  if (!base || !equipmentFamily(base) || base.type === 23) errors.push('Choisissez un modèle d’équipement hors Dofus.');
  if (base && /BI=|PK>|PJ|PX/.test(base.condition || '')) errors.push('Ce modèle est réservé ou inaccessible.');
  if (base?.type === 97 && definition.level < 60) errors.push('Une monture nécessite au moins le niveau 60.');
  const weapon = WEAPON_TYPES.includes(base?.type);
  if (weapon !== !!definition.weapon || (weapon && !base.weapon)) errors.push('Profil d’arme manquant ou incompatible.');
  for (const [stat, value] of Object.entries(definition.stats)) {
    if (value < 0 && !EQUIPMENT_STAT_RULES[stat].negativeEffect) errors.push(`Malus non pris en charge : ${EQUIPMENT_STAT_RULES[stat].label}.`);
  }
  if (definition.weapon) {
    const w = definition.weapon;
    if (w.pa < 2 || w.pa > 7) errors.push('L’arme doit coûter de 2 à 7 PA.');
    if (w.range[0] < 1 || w.range[1] < w.range[0] || w.range[1] > 10) errors.push('Portée d’arme : de 1 à 10, minimum ≤ maximum.');
    if (![2, 3].includes(base?.type) && (w.range[0] !== 1 || w.range[1] !== 1)) errors.push('Cette famille d’armes frappe à 1 PO.');
    if ((w.critRate !== 0 && (w.critRate < 20 || w.critRate > 100)) || w.critBonus < 0 || w.critBonus > 20) errors.push('Critique : désactivé ou de 1/20 à 1/100, bonus de 0 à 20 par ligne.');
    if (!w.lines.length) errors.push('Ajoutez au moins une ligne de frappe.');
    for (const row of w.lines) {
      if (![84, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 108].includes(row.id)
        || row.min < 1 || row.max < row.min || row.max > ([84, 101].includes(row.id) ? 2 : 80)) errors.push('Ligne d’arme invalide (1–80, ou 1–2 PA retirés).');
    }
  }
  const item = customEquipmentItem(definition);
  const balance = item && definition.level >= 1 && definition.level <= 200 ? equipmentBalance(item) : null;
  if (balance) {
    errors.push(...balance.errors);
    for (const [stat, value] of Object.entries(definition.stats)) if (value < -Math.max(1, balance.limits?.statLimits[stat] || 0)) {
      errors.push(`Malus ${EQUIPMENT_STAT_RULES[stat].label} hors des valeurs du catalogue.`);
    }
  }
  return { valid: !errors.length && !!balance?.valid, errors: [...new Set(errors)], item, balance };
}

export function newCustomEquipment(referenceId = 7143) {
  const base = DATA.items[referenceId];
  if (!equipmentFamily(base) || base.type === 23) throw new Error('Modèle non pris en charge.');
  return { version: 1, id: newEquipmentId(), referenceId, name: 'Mon équipement', appearance: defaultEquipmentAppearance(), level: Math.min(200, Math.max(base.level, base.type === 97 ? 60 : 1)), stats: {},
    ...(WEAPON_TYPES.includes(base.type) && base.weapon ? { weapon: { pa: base.weapon.pa, range: [...base.weapon.range],
      critRate: base.weapon.critRate, critBonus: base.weapon.critBonus,
      lines: base.effects.filter(([id]) => [84, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 108].includes(id))
        .slice(0, 4).map(([id, min, max]) => ({ id, min, max: Math.max(min, max) })) } } : {}) };
}

// Saves, opponents, AI matches and replays carry immutable definitions. Deleting
// or editing the library must never rewrite an equipped item in an older save.
export function equipmentItem(id, loadout) {
  if (own(DATA.items, id)) return DATA.items[id];
  if (!isCustomEquipmentId(id) || !own(loadout?.customEquipment, id)) return null;
  const definition = loadout.customEquipment[id];
  return definition?.id === id ? customEquipmentItem(definition) : null;
}

export function equipCustomItem(loadout, slot, definition) {
  const result = validateCustomEquipment(definition);
  if (!result.valid) throw new Error(result.errors.join(' '));
  return { ...loadout, customEquipment: { ...loadout.customEquipment, [definition.id]: clone(definition) } };
}

export function fitEquipmentBudget(definition) {
  let next = clone(definition);
  // Explicit proposal only. Never silently modify saved gear.
  for (let attempt = 0; attempt < 160; attempt += 1) {
    if (validateCustomEquipment(next).valid) return next;
    next.stats = Object.fromEntries(Object.entries(next.stats).map(([stat, n]) => [stat, Math.trunc(n * .94)]).filter(([, n]) => n));
    if (next.weapon) {
      next.weapon.critBonus = Math.max(0, Math.floor(next.weapon.critBonus * .94));
      next.weapon.lines = next.weapon.lines.map(row => ({ ...row, min: Math.max(1, Math.floor(row.min * .94)), max: Math.max(1, Math.floor(row.max * .94)) }));
    }
  }
  return next;
}
