import { EFFECT_TYPES, EFFECT_ZONES, ELEMENTS, EFFECT_STATS, SPELL_TARGETS } from '../engine/authoredSpells';
import { ORIGINAL_EFFECTS } from '../visuals/spellVisuals';

export { PACKAGE_LIMITS } from './packageLimits';
const integer = (minimum, maximum) => ({ type: 'integer', minimum, maximum });
const text = (maxLength = 800) => ({ type: 'string', minLength: 1, maxLength });
const choice = values => ({ enum: values });
const array = (items, minItems, maxItems) => ({ type: 'array', items, minItems, maxItems });
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const key = { ...text(48), pattern: '^[a-z][a-z0-9_-]*$' };
const ref = name => ({ $ref: `#/$defs/${name}` });
const boolean = { type: 'boolean' };
const effect = object({ kind: choice(Object.keys(EFFECT_TYPES)), min: integer(0, 500), max: integer(0, 500),
  duration: integer(0, 5), zone: choice(Object.keys(EFFECT_ZONES)), target: choice(['self', 'ally', 'otherAlly', 'enemy', 'fighter']),
  element: choice(Object.keys(ELEMENTS)), stat: choice(Object.keys(EFFECT_STATS)) }, ['kind', 'min', 'max', 'duration', 'zone', 'target']);
const spell = object({ key, name: text(80), description: text(), counterplay: text(),
  pa: integer(1, 8), rangeMin: integer(0, 12), rangeMax: integer(0, 12), targetMode: choice(Object.keys(SPELL_TARGETS)),
  needsLos: boolean, lineOnly: boolean, adjustableRange: boolean,
  maxPerTurn: integer(1, 3), maxPerTarget: integer(1, 3), cooldown: integer(0, 10),
  critRate: integer(0, 100), failRate: integer(0, 1000), endsTurnOnFailure: boolean,
  visualSpellId: integer(1, 1000000),
  visualEffect: object({ version: { const: 1 }, kind: choice(ORIGINAL_EFFECTS),
    color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' }, accent: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' }, durationMs: integer(250, 1500) }),
  icon: { ...text(100), pattern: '^icons/[a-z][a-z0-9_-]*\\.png$' },
  effects: array(effect, 1, 4), critEffects: array(effect, 0, 4),
}, ['key', 'name', 'description', 'counterplay', 'pa', 'rangeMin', 'rangeMax', 'targetMode', 'needsLos', 'lineOnly',
  'adjustableRange', 'maxPerTurn', 'maxPerTarget', 'cooldown', 'critRate', 'failRate', 'endsTurnOnFailure', 'effects', 'critEffects']);
const design = object({ role: text(100), strengths: array(text(200), 1, 3), weaknesses: array(text(200), 2, 4), turnLoop: text(), counterplay: text() });
const artwork = { ...text(100), pattern: '^artwork/[a-z][a-z0-9_-]*$' };
const creature = object({ key, name: text(80), description: text(), role: text(100), counterplay: text(),
  reference: object({ monsterId: integer(1, 100000), grade: integer(1, 20) }),
  tuning: object({ hpPercent: integer(25, 150), statsPercent: integer(25, 150), paBonus: integer(-2, 2), pmBonus: integer(-2, 2) }),
  artwork, spells: array(ref('spell'), 1, 10),
}, ['key', 'name', 'description', 'role', 'counterplay', 'reference', 'tuning', 'spells']);

export const PACKAGE_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#', title: 'Dofus Lite — themed class or dungeon',
  ...object({ format: { const: 'dofus-lite-content' }, schemaVersion: { const: 1 },
    type: choice(['class', 'dungeon']), id: key, version: { ...text(30), pattern: '^\\d+\\.\\d+\\.\\d+$' },
    name: text(80), description: text(), author: text(100), design,
    class: object({ baseClass: choice(['FECA', 'OSAMODAS', 'ENUTROF', 'SRAM', 'XELOR', 'ECAFLIP', 'ENIRIPSA', 'IOP', 'CRA', 'SADIDA', 'SACRIEUR', 'PANDAWA']),
      sex: choice([0, 1]), artwork, spells: array(ref('spell'), 1, 10) }, ['baseClass', 'sex', 'spells']),
    dungeon: object({ mapId: text(80), monsters: array(creature, 1, 8),
      members: array(object({ monster: key, count: integer(1, 8) }), 1, 8) }),
  }, ['format', 'schemaVersion', 'type', 'id', 'version', 'name', 'description', 'author', 'design']),
  $defs: { spell },
};

// This deliberately small validator implements every keyword in the exported
// schema. Semantic checks (references, budgets, target compatibility) follow it.
export function schemaErrors(value, rule = PACKAGE_SCHEMA, at = '$', root = PACKAGE_SCHEMA) {
  if (rule.$ref) return schemaErrors(value, root.$defs[rule.$ref.split('/').pop()], at, root);
  const errors = [];
  const fail = message => errors.push(`${at} : ${message}`);
  if ('const' in rule && value !== rule.const) fail(`valeur requise ${JSON.stringify(rule.const)}.`);
  if (rule.enum && !rule.enum.includes(value)) fail(`valeur attendue parmi ${rule.enum.join(', ')}.`);
  if (rule.type) {
    const valid = rule.type === 'integer' ? Number.isSafeInteger(value) : rule.type === 'array' ? Array.isArray(value)
      : rule.type === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value) : typeof value === rule.type;
    if (!valid) { fail(`type ${rule.type} requis.`); return errors; }
  }
  if (rule.type === 'object') {
    for (const field of rule.required || []) if (!Object.prototype.hasOwnProperty.call(value, field)) fail(`champ ${field} obligatoire.`);
    for (const field of Object.keys(value)) {
      if (!Object.prototype.hasOwnProperty.call(rule.properties, field)) { if (rule.additionalProperties === false) fail(`champ inconnu ${field}.`); }
      else errors.push(...schemaErrors(value[field], rule.properties[field], `${at}.${field}`, root));
    }
  }
  if (rule.type === 'array') {
    if (value.length < rule.minItems || value.length > rule.maxItems) fail(`${rule.minItems} à ${rule.maxItems} entrées requises.`);
    value.forEach((entry, i) => errors.push(...schemaErrors(entry, rule.items, `${at}[${i}]`, root)));
  }
  if (typeof value === 'string') {
    if (value.trim().length < rule.minLength || value.length > rule.maxLength) fail(`texte non vide, maximum ${rule.maxLength} caractères.`);
    if (rule.pattern && !new RegExp(rule.pattern).test(value)) fail(`format requis ${rule.pattern}.`);
  }
  if (typeof value === 'number' && (value < rule.minimum || value > rule.maximum)) fail(`valeur entre ${rule.minimum} et ${rule.maximum}.`);
  return errors;
}
