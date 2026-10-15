// One portable, closed DESIGN contract shared by the prompt, CLI and preview.
// It deliberately does not change either combat-package importer.
/* global globalThis */
(function (root, create) {
  const value = create();
  if (typeof module === 'object' && module.exports) module.exports = value;
  else root.SpellFx = value;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  const integer = (minimum, maximum) => ({ type: 'integer', minimum, maximum });
  const text = maxLength => ({ type: 'string', minLength: 1, maxLength });
  const choice = values => ({ enum: values });
  const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
  const roles = ['cast', 'projectile', 'trail', 'impact', 'aura', 'beam'];
  const layer = object({ role: choice(roles), file: { ...text(60), pattern: '^[a-z][a-z0-9-]*\\.png$' },
    frames: integer(1, 16), fps: integer(8, 60), frameSize: { const: 256 },
    anchor: object({ x: integer(0, 255), y: integer(0, 255) }),
    startMs: integer(0, 2000), endMs: integer(1, 2000), loop: { type: 'boolean' },
    attachment: choice(['caster', 'target', 'projectile', 'path']), depth: choice(['behind', 'front']),
    rotation: choice(['none', 'path']), scalePercent: integer(25, 200), blend: choice(['normal', 'add']) });
  const schema = { $schema: 'https://json-schema.org/draft/2020-12/schema', title: 'Spell FX design v1 — NOT a game import format',
    ...object({ format: { const: 'dofus-lite-spell-fx-design' }, version: { const: 1 }, runtimeImportable: { const: false },
      id: { ...text(60), pattern: '^[a-z][a-z0-9-]*$' }, name: text(80), durationMs: integer(100, 2000),
      travel: object({ kind: choice(['none', 'line', 'arc']), startMs: integer(0, 2000), endMs: integer(0, 2000), arcHeightPercent: integer(0, 60) }),
      layers: { type: 'array', minItems: 1, maxItems: 6, items: layer } }) };
  function schemaErrors(value, rule = schema, at = '$') {
    const errors = [];
    if ('const' in rule && value !== rule.const) errors.push(`${at}: expected ${JSON.stringify(rule.const)}.`);
    if (rule.enum && !rule.enum.includes(value)) errors.push(`${at}: expected ${rule.enum.join(', ')}.`);
    if (rule.type) {
      const valid = rule.type === 'integer' ? Number.isSafeInteger(value) : rule.type === 'array' ? Array.isArray(value)
        : rule.type === 'object' ? value && typeof value === 'object' && !Array.isArray(value) : typeof value === rule.type;
      if (!valid) return [...errors, `${at}: expected ${rule.type}.`];
    }
    if (rule.type === 'object') {
      for (const key of rule.required) if (!Object.prototype.hasOwnProperty.call(value, key)) errors.push(`${at}.${key}: required.`);
      for (const [key, child] of Object.entries(value)) {
        if (!Object.prototype.hasOwnProperty.call(rule.properties, key)) errors.push(`${at}.${key}: unknown field.`);
        else errors.push(...schemaErrors(child, rule.properties[key], `${at}.${key}`));
      }
    }
    if (rule.type === 'array') {
      if (value.length < rule.minItems || value.length > rule.maxItems) errors.push(`${at}: ${rule.minItems}–${rule.maxItems} entries.`);
      // Bound traversal as well as reporting oversized user input.
      value.slice(0, rule.maxItems).forEach((entry, i) => errors.push(...schemaErrors(entry, rule.items, `${at}[${i}]`)));
    }
    if (rule.type === 'integer' && (value < rule.minimum || value > rule.maximum)) errors.push(`${at}: ${rule.minimum}–${rule.maximum} required.`);
    if (rule.type === 'string' && (!value.trim() || value.length > rule.maxLength || (rule.pattern && !new RegExp(rule.pattern).test(value)))) errors.push(`${at}: invalid text or filename.`);
    return errors;
  }
  function validate(value) {
    const errors = schemaErrors(value);
    if (errors.length) return { valid: false, runtimeImportable: false, errors };
    const { travel, layers, durationMs } = value;
    if (new Set(layers.map(l => l.role)).size !== layers.length) errors.push('Each role may occur only once.');
    if (new Set(layers.map(l => l.file)).size !== layers.length) errors.push('Each layer needs its own filename.');
    if (travel.kind === 'none') {
      if (travel.startMs || travel.endMs || travel.arcHeightPercent) errors.push('No travel: all travel numbers must be zero.');
      if (layers.some(l => ['projectile', 'trail'].includes(l.role))) errors.push('Projectile/trail requires line or arc travel.');
    } else {
      if (travel.endMs <= travel.startMs || travel.endMs > durationMs) errors.push('Travel must have positive duration and finish within durationMs.');
      if (!layers.some(l => l.role === 'projectile')) errors.push('Line/arc travel requires a projectile layer.');
      if (travel.kind === 'line' && travel.arcHeightPercent) errors.push('Line travel requires arcHeightPercent = 0.');
    }
    const attachments = { cast: ['caster'], projectile: ['projectile'], trail: ['path'], impact: ['target'], aura: ['caster', 'target'], beam: ['path'] };
    for (const row of layers) {
      const error = message => errors.push(`${row.role}: ${message}`);
      if (!attachments[row.role].includes(row.attachment)) error('attachment does not match role.');
      if (row.endMs <= row.startMs || row.endMs > durationMs) error('invalid layer time window.');
      if (!row.loop && row.endMs - row.startMs + .001 < row.frames / row.fps * 1000) error('time window cuts off the animation.');
      if (['cast', 'impact', 'trail'].includes(row.role) && row.loop) error('cast/impact/trail particles must play once.');
      if (row.role === 'projectile' && (row.startMs !== travel.startMs || row.endMs !== travel.endMs)) error('must cover the exact travel window.');
      if (row.role === 'trail' && (row.startMs !== travel.startMs || row.endMs < travel.endMs + row.frames / row.fps * 1000)) error('must start with travel and leave a full particle lifetime after arrival.');
      if (row.role === 'impact' && travel.kind !== 'none' && row.startMs < travel.endMs) error('impact cannot start before arrival.');
      if (row.role === 'beam' && (travel.kind !== 'none' || row.rotation !== 'path' || row.anchor.x !== 0 || row.anchor.y !== 128)) error('use no travel, path rotation and anchor (0,128).');
      if (!['projectile', 'beam'].includes(row.role) && row.rotation !== 'none') error('only projectile/beam rotates with the path.');
    }
    return { valid: !errors.length, runtimeImportable: false, errors };
  }
  const templates = roles.map(role => ({ role, file: `${role}.png`, frames: 8, frameSize: 256, fps: 24,
    anchor: { x: role === 'beam' ? 0 : 128, y: 128 } }));
  const makeLayer = (role, startMs, endMs, fields = {}) => ({ ...templates.find(t => t.role === role), startMs, endMs,
    loop: ['projectile', 'aura', 'beam'].includes(role),
    attachment: { cast: 'caster', projectile: 'projectile', trail: 'path', impact: 'target', aura: 'target', beam: 'path' }[role],
    depth: role === 'aura' ? 'behind' : 'front', rotation: ['projectile', 'beam'].includes(role) ? 'path' : 'none',
    scalePercent: role === 'projectile' ? 45 : role === 'trail' ? 25 : 100, blend: 'normal', ...fields });
  function example(kind = 'projectile') {
    const projectile = kind === 'projectile';
    return { format: 'dofus-lite-spell-fx-design', version: 1, runtimeImportable: false,
      id: `example-${kind}`, name: { projectile: 'Orbe des braises', impact: 'Onde de choc', aura: 'Aura de protection', beam: 'Rayon astral' }[kind],
      durationMs: 1500,
      travel: projectile ? { kind: 'arc', startMs: 350, endMs: 950, arcHeightPercent: 20 }
        : { kind: 'none', startMs: 0, endMs: 0, arcHeightPercent: 0 },
      layers: projectile ? [makeLayer('cast', 0, 350), makeLayer('projectile', 350, 950), makeLayer('trail', 350, 1300), makeLayer('impact', 950, 1400)]
        : kind === 'impact' ? [makeLayer('impact', 0, 450)]
          : kind === 'aura' ? [makeLayer('aura', 0, 1500)]
            : [makeLayer('cast', 0, 350), makeLayer('beam', 350, 1000), makeLayer('impact', 1000, 1450)] };
  }
  // The offline viewer and timing checks use the same geometry, in screen pixels.
  function position(travel, from, to, timeMs) {
    const progress = travel.kind === 'none' ? 1 : Math.max(0, Math.min(1, (timeMs - travel.startMs) / Math.max(1, travel.endMs - travel.startMs)));
    const dx = to.x - from.x, dy = to.y - from.y;
    const height = travel.kind === 'arc' ? Math.hypot(dx, dy) * travel.arcHeightPercent / 100 : 0;
    return { x: from.x + dx * progress, y: from.y + dy * progress - 4 * height * progress * (1 - progress),
      angle: Math.atan2(dy - 4 * height * (1 - 2 * progress), dx), progress };
  }
  return { schema, validate, templates, example, position, limits: { pngBytes: 2097152, totalBytes: 12582912, jsonBytes: 65536 } };
});
