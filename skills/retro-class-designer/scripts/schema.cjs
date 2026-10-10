// The schema is generated from this small, closed authoring vocabulary.
const text = (maxLength = 500) => ({ type: 'string', minLength: 1, maxLength });
const integer = (minimum, maximum) => ({ type: 'integer', minimum, maximum });
const values = items => ({ enum: items });
const array = (items, minItems, maxItems) => ({ type: 'array', items, minItems, maxItems });
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const optional = (properties, required) => ({ type: 'object', properties, required, additionalProperties: false });
const key = { ...text(40), pattern: '^[a-z][a-z0-9_]*$' };
const roles = ['damage', 'control', 'protection', 'healing', 'summoning', 'placement', 'support'];
const elements = ['neutre', 'terre', 'feu', 'eau', 'air'];
const zones = ['Pa', 'Cb', 'Cc', 'Xb', 'Xc', 'Lb', 'Lc', 'Tb'];
const targets = ['self', 'ally', 'otherAlly', 'enemy', 'fighter'];
const effect = (kind, fields) => object({ kind: { const: kind }, target: values(targets), zone: values(zones), ...fields });
const bounds = (max = 300, duration = 0) => ({ min: integer(0, max), max: integer(0, max), duration: integer(0, duration) });
const effects = [
  ...['damage', 'lifeSteal'].map(kind => effect(kind, { element: values(elements), ...bounds() })),
  effect('heal', bounds(150)),
  ...['buffPa', 'buffPm', 'buffRange', 'removePa', 'removePm', 'debuffRange'].map(kind => effect(kind, bounds(6, 5))),
  ...['buffPower', 'buffDamage', 'buffCrit', 'buffVitality', 'armor'].map(kind => effect(kind, bounds(500, 5))),
  effect('buffStat', { stat: values(['force', 'intelligence', 'chance', 'agilite', 'sagesse']), ...bounds(500, 5) }),
  ...['resistBuff', 'resistDebuff'].map(kind => effect(kind, { element: values(elements), ...bounds(50, 5) })),
  ...['push', 'pull'].map(kind => effect(kind, { distance: integer(1, 6) })),
  effect('teleport', {}),
];
const spell = object({
  key, name: text(60), description: text(600), role: values(roles),
  pa: integer(1, 8), rangeMin: integer(0, 12), rangeMax: integer(0, 12),
  targetMode: values(['self', 'enemy', 'fighter', 'cell', 'freeCell']),
  lineOnly: { type: 'boolean' }, needsLos: { type: 'boolean' }, adjustableRange: { type: 'boolean' },
  emptyCellOnly: { type: 'boolean' }, maxPerTurn: integer(1, 3), maxPerTarget: integer(1, 3),
  cooldown: integer(0, 10), initialCooldown: { const: 0 },
  critRate: { oneOf: [{ const: 0 }, integer(2, 100)] },
  failRate: { oneOf: [{ const: 0 }, integer(2, 1000)] }, endsTurnOnFailure: { type: 'boolean' },
  effects: array({ $ref: '#/$defs/effect' }, 1, 4), critEffects: array({ $ref: '#/$defs/effect' }, 0, 4),
  presentation: object({ icon: { ...text(60), pattern: '^icons/[a-z][a-z0-9_]*\\.png$' }, animationSpellId: integer(1, 999999) }),
  design: object({ purpose: text(), counterplay: text(), synergies: { ...array(key, 0, 9), uniqueItems: true },
    references: array(object({ id: integer(1, 999999), grade: values([5, 6]), note: text() }), 2, 4) }),
});
const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'dofus-lite custom class authoring package v1 (proposed import contract)',
  description: 'Technical compatibility is not balance approval. Only level 200 and the closed v1 effect subset are supported.',
  ...object({ format: { const: 'dofus-lite-class' }, schemaVersion: { const: 1 },
    id: { ...text(60), pattern: '^[a-z][a-z0-9-]*$' },
    version: { ...text(30), pattern: '^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$' },
    name: text(60), description: text(1000), author: text(100), credits: text(1500),
    baseClass: values(['FECA', 'OSAMODAS', 'ENUTROF', 'SRAM', 'XELOR', 'ECAFLIP', 'ENIRIPSA', 'IOP', 'CRA', 'SADIDA', 'SACRIEUR', 'PANDAWA']),
    profile: { const: 'retro-200-v1' },
    design: object({ identity: text(), theme: text(), primaryRole: values(roles), secondaryRole: values(roles),
      elements: { ...array(values(elements), 1, 2), uniqueItems: true },
      strengths: array(text(), 2, 3), weaknesses: array(text(), 2, 4), turnLoop: array(text(), 3, 3),
      intendedRange: values(['melee', 'medium', 'long']), complexity: values(['beginner', 'intermediate', 'expert']) }),
    artwork: optional(Object.fromEntries(['portrait', 'idle-front', 'idle-back', 'walk-front', 'walk-back', 'cast-front', 'cast-back', 'hit-front', 'hit-back']
      .map(name => [name, { const: `artwork/${name}.png` }])), ['portrait', 'idle-front', 'idle-back']),
    spells: array({ $ref: '#/$defs/spell' }, 1, 10),
  }),
  $defs: { effect: { oneOf: effects }, spell },
};
module.exports = schema;
if (require.main === module) process.stdout.write(JSON.stringify(schema, null, 2) + '\n');
