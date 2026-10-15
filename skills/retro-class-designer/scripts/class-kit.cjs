// Standalone Node tooling: no dependencies, browser storage writes, or networking.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const schema = require('./schema.cjs');
const baseline = require('../references/baseline.json');
const artwork = require('../assets/artwork-spec.json');
const MiB = 1024 * 1024;
const limits = { zip: 20 * MiB, expanded: 16 * MiB, png: 2 * MiB, json: 128 * 1024, files: 24 };
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const check = (condition, message) => { if (!condition) throw new Error(message); };
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0); return c >>> 0;
});
function crc32(bytes) { let crc = -1; for (const b of bytes) crc = crcTable[(crc ^ b) & 255] ^ (crc >>> 8); return (crc ^ -1) >>> 0; }

// Implements only the JSON Schema keywords emitted by schema.cjs, not a general
// JSON Schema engine. The generated schema is also usable with a standard validator.
function schemaErrors(value, rule = schema, at = '$') {
  if (rule.$ref) return schemaErrors(value, schema.$defs[rule.$ref.split('/').at(-1)], at);
  if (rule.oneOf) {
    const branches = rule.oneOf.map(r => schemaErrors(value, r, at));
    if (branches.filter(e => e.length === 0).length === 1) return [];
    const matchingKind = rule.oneOf.find(r => r.properties?.kind?.const === value?.kind);
    return matchingKind ? schemaErrors(value, matchingKind, at) : [`${at}: no supported alternative (${value?.kind || JSON.stringify(value)}).`];
  }
  const errors = [];
  if ('const' in rule && value !== rule.const) errors.push(`${at}: must equal ${JSON.stringify(rule.const)}.`);
  if (rule.enum && !rule.enum.includes(value)) errors.push(`${at}: choose ${rule.enum.join(', ')}.`);
  const type = rule.type;
  const validType = !type || (type === 'integer' ? Number.isSafeInteger(value) : type === 'array' ? Array.isArray(value)
    : type === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value) : typeof value === type);
  if (!validType) return [...errors, `${at}: expected ${type}.`];
  if (type === 'object') {
    for (const key of rule.required || []) if (!Object.hasOwn(value, key)) errors.push(`${at}.${key}: required.`);
    for (const [key, child] of Object.entries(value)) {
      if (!Object.hasOwn(rule.properties || {}, key)) { if (rule.additionalProperties === false) errors.push(`${at}.${key}: unknown field.`); }
      else errors.push(...schemaErrors(child, rule.properties[key], `${at}.${key}`));
    }
  }
  if (type === 'array') {
    if (value.length < rule.minItems || value.length > rule.maxItems) errors.push(`${at}: expected ${rule.minItems}–${rule.maxItems} entries.`);
    if (rule.uniqueItems && new Set(value.map(v => JSON.stringify(v))).size !== value.length) errors.push(`${at}: duplicate entries.`);
    value.forEach((v, i) => errors.push(...schemaErrors(v, rule.items, `${at}[${i}]`)));
  }
  if (type === 'string') {
    if (!value.trim() || value.length < rule.minLength || value.length > rule.maxLength) errors.push(`${at}: invalid text length.`);
    if (rule.pattern && !new RegExp(rule.pattern).test(value)) errors.push(`${at}: invalid format.`);
  }
  if (type === 'integer' && (value < rule.minimum || value > rule.maximum)) errors.push(`${at}: expected ${rule.minimum}–${rule.maximum}.`);
  return errors;
}

const damageKinds = ['damage', 'lifeSteal'];
const timedKinds = ['buffPa', 'buffPm', 'buffPower', 'buffDamage', 'buffCrit', 'buffVitality', 'buffRange', 'buffStat', 'armor', 'resistBuff', 'resistDebuff', 'debuffRange'];
const mean = e => (e.min + e.max) / 2;
function validateManifest(manifest) {
  const errors = schemaErrors(manifest), warnings = [];
  if (errors.length) return { errors, warnings };
  const keys = new Set(manifest.spells.map(s => s.key));
  if (keys.size !== manifest.spells.length) errors.push('Spell keys must be unique.');
  if (manifest.design.primaryRole === manifest.design.secondaryRole) errors.push('Choose a distinct secondary role.');
  for (const spell of manifest.spells) {
    const error = message => errors.push(`${spell.key}: ${message}`);
    const warn = message => warnings.push(`${spell.key}: ${message}`);
    if (spell.rangeMin > spell.rangeMax) error('rangeMin exceeds rangeMax.');
    if (spell.maxPerTarget > spell.maxPerTurn) error('maxPerTarget exceeds maxPerTurn.');
    if ((spell.critRate === 0) !== (spell.critEffects.length === 0)) error('critRate and the full critical alternative must agree.');
    if (spell.targetMode === 'self' && (spell.rangeMin !== 0 || spell.rangeMax !== 0)) error('self target requires range 0–0.');
    if ((spell.targetMode === 'freeCell') !== spell.emptyCellOnly) error('freeCell and emptyCellOnly must agree in v1.');
    if (spell.presentation.icon !== `icons/${spell.key}.png`) error('icon path must match the spell key.');
    if (!baseline.rows.some(r => r.id === spell.presentation.animationSpellId)) error('animationSpellId must reference a class spell in the frozen baseline.');
    if (new Set(spell.design.references.map(r => `${r.id}:${r.grade}`)).size !== spell.design.references.length) error('comparison references must be distinct.');
    for (const ref of spell.design.references) if (!baseline.rows.some(r => r.id === ref.id && r.grade === ref.grade)) error(`unknown comparison ${ref.id} grade ${ref.grade}.`);
    for (const key of spell.design.synergies) if (!keys.has(key) || key === spell.key) error(`invalid synergy ${key}.`);
    for (const [variant, effects] of [['normal', spell.effects], ['critical', spell.critEffects]]) {
      if (!effects.length) continue;
      const seen = new Set();
      for (const effect of effects) {
        if ('min' in effect && effect.min > effect.max) error(`${variant} ${effect.kind}: min exceeds max.`);
        if (effect.target === 'self' && effect.zone !== 'Pa') error(`${variant}: self effects require Pa; target mask 32 bypasses area.`);
        if (effect.kind === 'teleport' && (effects.length !== 1 || spell.targetMode !== 'freeCell' || effect.target !== 'self' || spell.adjustableRange)) error('teleport must be the sole effect, self + Pa, freeCell, non-adjustable range.');
        if (spell.targetMode === 'freeCell' && effect.kind !== 'teleport') error('v1 freeCell is reserved for teleport.');
        if (spell.targetMode === 'self' && !['self', 'ally', 'fighter'].includes(effect.target)) error('self targeting cannot select this effect target.');
        if (effect.kind === 'heal' && !['self', 'ally', 'otherAlly'].includes(effect.target)) error('v1 healing targets allies only.');
        if (damageKinds.includes(effect.kind) && !manifest.design.elements.includes(effect.element)) error(`${effect.element} missing from the declared class elements.`);
        if (timedKinds.includes(effect.kind)) {
          const token = `${effect.kind}:${effect.stat || effect.element || ''}:${effect.target}`;
          if (seen.has(token)) warn(`duplicate ${effect.kind} effects stack (${variant}).`);
          seen.add(token);
          if (effect.duration > 0 && spell.cooldown <= effect.duration) warn(`${effect.kind} may overlap; test end/start turns and critical duration (${variant}).`);
          const ceiling = { buffPa: 1, buffPm: 2, buffDamage: 10, buffPower: 80, buffCrit: 5, buffRange: 2, buffStat: 80, buffVitality: 200, armor: 5, resistBuff: 15, resistDebuff: 10, debuffRange: 2 }[effect.kind];
          if (effect.max > ceiling) warn(`${effect.kind} ${effect.max} exceeds conservative starting value ${ceiling} (${variant}).`);
        }
        if (effect.kind === 'buffPa') warn('AP generation needs whole-kit/team resource-loop testing.');
        if (['removePa', 'removePm'].includes(effect.kind)) warn('test dodge, turn boundaries, stacked denial and high-wisdom builds.');
        if (damageKinds.includes(effect.kind) && effect.zone !== 'Pa' && effect.target === 'enemy') warn('enemy-only area removes friendly-fire risk; price that advantage.');
        if (effect.kind === 'teleport' && (spell.pa < 3 || spell.rangeMax > 3 || spell.cooldown < 2)) warn('teleport exceeds the conservative mobility envelope.');
        if (effect.kind === 'heal' && mean(effect) / spell.pa > 5) warn('healing exceeds 5 base/AP; evaluate sustain and intelligence scaling.');
      }
      const hits = effects.filter(e => damageKinds.includes(e.kind));
      if (hits.length) {
        const area = hits.some(e => e.zone !== 'Pa');
        const ceiling = area ? 5 : spell.rangeMax <= 2 ? 8 : 6;
        const ratio = hits.reduce((n, e) => n + mean(e), 0) / spell.pa;
        if (variant === 'normal' && ratio > ceiling) warn(`raw damage/AP ${ratio.toFixed(2)} exceeds starting envelope ${ceiling}.`);
        if (hits.length > 1) warn(`multi-hit attack: flat damage is applied ${hits.length} times (${variant}).`);
        if (hits.some(e => e.kind === 'lifeSteal')) warn('life steal combines damage and sustain; compare both outputs.');
        if (!spell.needsLos || spell.adjustableRange || spell.rangeMax > 8) warn(`damage has increased targeting safety (${variant}).`);
      }
    }
    const normalDamage = spell.effects.filter(e => damageKinds.includes(e.kind)).reduce((n, e) => n + mean(e), 0);
    const criticalDamage = spell.critEffects.filter(e => damageKinds.includes(e.kind)).reduce((n, e) => n + mean(e), 0);
    if (criticalDamage > normalDamage * 1.3) warn('critical damage exceeds 130% of normal; test actual critical equipment.');
  }
  const book = manifest.spells.flatMap(s => s.effects);
  if (book.some(e => e.kind === 'buffDamage') && manifest.spells.some(s => s.effects.filter(e => damageKinds.includes(e.kind)).length > 1)) warnings.push('Class combo: flat damage boost plus multi-hit attacks.');
  const bonuses = manifest.spells.filter(s => s.effects.some(e => ['buffPower', 'buffDamage', 'buffStat'].includes(e.kind)));
  if (bonuses.length > 1) warnings.push('Class combo: multiple offensive boost spells can stack.');
  return { errors, warnings: [...new Set(warnings)] };
}

function decodePng(buffer, name, width, height, frames, transparent, { maxBytes = limits.png } = {}) {
  check(buffer.length <= maxBytes && buffer.subarray(0, 8).equals(signature), `${name}: invalid or oversized PNG.`);
  let cursor = 8, header = null, ended = false;
  const chunks = [];
  while (cursor + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(cursor), type = buffer.toString('ascii', cursor + 4, cursor + 8), end = cursor + 12 + length;
    check(end <= buffer.length, `${name}: truncated PNG.`);
    const data = buffer.subarray(cursor + 8, cursor + 8 + length);
    check(crc32(buffer.subarray(cursor + 4, cursor + 8 + length)) === buffer.readUInt32BE(cursor + 8 + length), `${name}: PNG CRC mismatch.`);
    if (cursor === 8) check(type === 'IHDR', `${name}: IHDR must be first.`);
    if (type === 'IHDR') { check(!header && length === 13, `${name}: invalid IHDR.`); header = data; }
    else if (type === 'IDAT') chunks.push(data);
    else if (type === 'IEND') { check(length === 0 && end === buffer.length, `${name}: invalid PNG ending.`); ended = true; break; }
    else check(!['acTL', 'fcTL', 'fdAT'].includes(type) && (type === 'PLTE' || type[0] === type[0].toLowerCase()), `${name}: unsupported PNG chunk ${type}.`);
    cursor = end;
  }
  check(header && ended && chunks.length, `${name}: incomplete PNG.`);
  check(header.readUInt32BE(0) === width && header.readUInt32BE(4) === height, `${name}: expected ${width} × ${height}.`);
  check(header[8] === 8 && header[9] === 6 && header[10] === 0 && header[11] === 0 && header[12] === 0, `${name}: use non-interlaced, 8-bit RGBA PNG.`);
  const stride = width * 4, expected = (stride + 1) * height;
  const packed = zlib.inflateSync(Buffer.concat(chunks), { maxOutputLength: expected });
  check(packed.length === expected, `${name}: invalid pixel size.`);
  const pixels = Buffer.alloc(stride * height), visible = Array(frames).fill(false), clear = Array(frames).fill(false);
  for (let y = 0; y < height; y++) {
    const filter = packed[y * (stride + 1)]; check(filter <= 4, `${name}: invalid PNG filter.`);
    for (let x = 0; x < stride; x++) {
      const offset = y * stride + x, left = x >= 4 ? pixels[offset - 4] : 0, up = y ? pixels[offset - stride] : 0, corner = y && x >= 4 ? pixels[offset - stride - 4] : 0;
      const p = left + up - corner, a = Math.abs(p - left), b = Math.abs(p - up), c = Math.abs(p - corner);
      const paeth = a <= b && a <= c ? left : b <= c ? up : corner;
      const prediction = [0, left, up, Math.floor((left + up) / 2), paeth][filter];
      pixels[offset] = (packed[y * (stride + 1) + x + 1] + prediction) & 255;
      if (x % 4 === 3) { const f = Math.floor((x / 4) / (width / frames)); visible[f] ||= pixels[offset] > 0; clear[f] ||= pixels[offset] === 0; }
    }
  }
  check(visible.every(Boolean), `${name}: empty animation frame.`);
  check(!transparent || clear.every(Boolean), `${name}: each frame needs transparent pixels.`);
  return { width, height, frames };
}

const safePath = name => typeof name === 'string' && /^(class\.json|artwork\/[a-z][a-z-]*\.png|icons\/[a-z][a-z0-9_]*\.png)$/.test(name);
function readZip(buffer) {
  check(buffer.length <= limits.zip, 'Archive exceeds 20 MiB.');
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50 && i + 22 + buffer.readUInt16LE(i + 20) === buffer.length) { eocd = i; break; }
  }
  check(eocd >= 0, 'Not a supported ZIP archive.');
  const count = buffer.readUInt16LE(eocd + 10), size = buffer.readUInt32LE(eocd + 12), start = buffer.readUInt32LE(eocd + 16);
  check(buffer.readUInt16LE(eocd + 4) === 0 && buffer.readUInt16LE(eocd + 6) === 0 && buffer.readUInt16LE(eocd + 8) === count, 'Multi-disk ZIP is unsupported.');
  check(count > 0 && count <= limits.files && start + size === eocd, 'Invalid central directory / too many entries.');
  const files = new Map(), ranges = [];
  let cursor = start, total = 0;
  for (let i = 0; i < count; i++) {
    check(cursor + 46 <= eocd && buffer.readUInt32LE(cursor) === 0x02014b50, 'Invalid ZIP directory entry.');
    const flags = buffer.readUInt16LE(cursor + 8), method = buffer.readUInt16LE(cursor + 10), crc = buffer.readUInt32LE(cursor + 16);
    const packed = buffer.readUInt32LE(cursor + 20), expanded = buffer.readUInt32LE(cursor + 24), len = buffer.readUInt16LE(cursor + 28);
    const extra = buffer.readUInt16LE(cursor + 30), comment = buffer.readUInt16LE(cursor + 32), local = buffer.readUInt32LE(cursor + 42);
    const mode = buffer.readUInt32LE(cursor + 38) >>> 16;
    check(cursor + 46 + len + extra + comment <= eocd, 'Truncated ZIP entry.');
    const name = buffer.toString('utf8', cursor + 46, cursor + 46 + len);
    check(safePath(name) && !files.has(name), `Unexpected, unsafe or duplicate ZIP path: ${name}.`);
    check(!(flags & ~0x808) && [0, 8].includes(method) && (mode & 0xf000) !== 0xa000 && buffer.readUInt16LE(cursor + 34) === 0
      && buffer.readUInt16LE(cursor + 6) <= 20, `${name}: unsupported ZIP flags, method, symlink, or ZIP64.`);
    total += expanded;
    check(expanded > 0 && expanded <= (name === 'class.json' ? limits.json : limits.png) && total <= limits.expanded, `${name}: expanded size exceeds limits.`);
    check(local + 30 <= start && buffer.readUInt32LE(local) === 0x04034b50, `${name}: missing local header.`);
    const localLen = buffer.readUInt16LE(local + 26), localExtra = buffer.readUInt16LE(local + 28), dataStart = local + 30 + localLen + localExtra;
    check(dataStart + packed <= start && buffer.readUInt16LE(local + 4) <= 20 && buffer.toString('utf8', local + 30, local + 30 + localLen) === name
      && buffer.readUInt16LE(local + 6) === flags && buffer.readUInt16LE(local + 8) === method, `${name}: inconsistent local header.`);
    check(ranges.every(([a, b]) => dataStart + packed <= a || local >= b), `${name}: overlapping ZIP entries.`);
    ranges.push([local, dataStart + packed]);
    const compressed = buffer.subarray(dataStart, dataStart + packed);
    const data = method === 0 ? Buffer.from(compressed) : zlib.inflateRawSync(compressed, { maxOutputLength: expanded });
    check(data.length === expanded && crc32(data) === crc, `${name}: ZIP CRC or size mismatch.`);
    files.set(name, data); cursor += 46 + len + extra + comment;
  }
  check(cursor === eocd, 'Unrecognized ZIP directory data.');
  return files;
}

function writeZip(files, { compress = true } = {}) {
  const locals = [], directory = []; let offset = 0;
  for (const [name, data] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    const filename = Buffer.from(name), packed = compress ? zlib.deflateRawSync(data) : data, crc = crc32(data), method = compress ? 8 : 0;
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(method, 8); local.writeUInt16LE(33, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(filename.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(method, 10); central.writeUInt16LE(33, 14);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, filename, packed); directory.push(central, filename); offset += local.length + filename.length + packed.length;
  }
  const central = Buffer.concat(directory), tail = Buffer.alloc(22); tail.writeUInt32LE(0x06054b50); tail.writeUInt16LE(files.size, 8); tail.writeUInt16LE(files.size, 10); tail.writeUInt32LE(central.length, 12); tail.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, central, tail]);
}

function readFolder(folder) {
  const files = new Map();
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name), relative = path.relative(folder, file).split(path.sep).join('/');
      check(!entry.isSymbolicLink(), `${relative}: symlinks are not allowed.`);
      if (entry.isDirectory()) { check(['icons', 'artwork'].includes(relative), `Unexpected folder ${relative}.`); walk(file); }
      else { check(safePath(relative) && fs.statSync(file).size <= (relative === 'class.json' ? limits.json : limits.png), `Unexpected or oversized file ${relative}.`); files.set(relative, fs.readFileSync(file)); }
    }
  }
  walk(folder); return files;
}

function validateFiles(files) {
  check(files.has('class.json'), 'Missing root class.json.');
  check(files.size <= limits.files && [...files.values()].reduce((n, b) => n + b.length, 0) <= limits.expanded, 'Package exceeds file/expanded-size limits.');
  check(files.get('class.json').length <= limits.json, 'Manifest exceeds 128 KiB.');
  const manifest = JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(files.get('class.json')));
  const result = validateManifest(manifest);
  if (result.errors.length) return { manifest, ...result, imagesChecked: 0 };
  const expected = new Set(['class.json', ...Object.values(manifest.artwork), ...manifest.spells.map(s => s.presentation.icon)]);
  for (const name of files.keys()) if (!expected.has(name)) result.errors.push(`Unreferenced file: ${name}.`);
  for (const name of expected) if (!files.has(name)) result.errors.push(`Missing file: ${name}.`);
  let imagesChecked = 0;
  for (const [name, buffer] of files) {
    if (name === 'class.json' || !expected.has(name)) continue;
    try {
      const definition = artwork.files.find(f => `artwork/${f.name}` === name);
      decodePng(buffer, name, definition ? definition.frames * artwork.frameSize : 64,
        definition ? artwork.frameSize : 64, definition?.frames || 1, definition ? definition.pose !== 'portrait' : false);
      imagesChecked++;
    } catch (error) { result.errors.push(error.message); }
  }
  const totalArtwork = [...files].filter(([name]) => name.startsWith('artwork/')).reduce((n, [, data]) => n + data.length, 0);
  if (totalArtwork > 12 * MiB) result.errors.push('Character artwork exceeds the current renderer’s 12 MiB set limit.');
  return { manifest, ...result, imagesChecked };
}

function compile(manifest) {
  const { errors } = validateManifest(manifest); check(!errors.length, errors.join('\n'));
  const masks = { self: 32, ally: 4, otherAlly: 6, enemy: 1, fighter: 0 };
  const ids = new Set();
  const spells = manifest.spells.map(spell => {
    const id = 10000000 + Number.parseInt(hash(`${manifest.id}:${spell.key}`).slice(0, 8), 16) % 1000000000;
    check(!ids.has(id), 'Generated spell ID collision; change the key. The importer must also check all installed content.'); ids.add(id);
    const convert = effect => ({ kind: effect.kind, id: 0, zone: effect.zone, targetMask: masks[effect.target],
      min: effect.min || 0, max: effect.max || 0, duration: effect.duration || 0, chance: 0,
      p1: effect.distance || effect.min || (effect.kind === 'teleport' ? spell.rangeMax : 0), p2: effect.max || 0, p3: 0,
      ...(effect.element ? { element: effect.element } : {}), ...(effect.stat ? { stat: effect.stat } : {}) });
    const { presentation, design, role, ...rules } = spell;
    return { ...rules, id, key: `custom_${manifest.id.replaceAll('-', '_')}_${spell.key}`, grade: 6, requiredLevel: 200,
      emoji: '✦', requiredStates: [], forbiddenStates: [1, 3, 18, 19, 41],
      effects: spell.effects.map(convert), critEffects: spell.critEffects.map(convert) };
  });
  return { format: 'dofus-lite-compiled-spellbook', version: 1, classId: manifest.id,
    baseClass: manifest.baseClass, level: 200, sourceHash: hash(JSON.stringify(manifest)), spells,
    presentationBindings: manifest.spells.map((s, i) => ({ spellId: spells[i].id, ...s.presentation })),
    notice: 'Raw engine data only. The game ZIP importer and custom icon/FX bindings are not implemented by this compiler.' };
}

function main() {
  const [command, input, output] = process.argv.slice(2);
  check(['validate', 'pack', 'compile'].includes(command) && input, 'Usage: node class-kit.cjs validate <class.json|class.zip|folder> | pack <folder> <out.zip> | compile <class.json> <out.json>');
  let result, bytes;
  const stat = fs.statSync(input);
  if (stat.isDirectory()) result = validateFiles(readFolder(input));
  else if (input.endsWith('.zip')) { check(stat.size <= limits.zip, 'ZIP exceeds 20 MiB.'); bytes = fs.readFileSync(input); result = validateFiles(readZip(bytes)); }
  else { check(stat.size <= limits.json, 'Manifest exceeds 128 KiB.'); const manifest = JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(fs.readFileSync(input))); result = { manifest, ...validateManifest(manifest), imagesChecked: 0 }; }
  const report = { format: 'dofus-lite-class-validation', version: 1,
    scope: stat.isDirectory() || input.endsWith('.zip') ? 'complete-package' : 'manifest-only',
    technicalStatus: result.errors.length ? 'invalid' : 'valid',
    balanceStatus: 'untested', guardrails: result.warnings.length ? 'review-required' : 'within-conservative-starting-envelope',
    className: result.manifest?.name, spellCount: result.manifest?.spells?.length, imagesChecked: result.imagesChecked,
    baselineSha256: baseline.sourceSha256, manifestSha256: hash(JSON.stringify(result.manifest)),
    errors: result.errors, warnings: result.warnings,
    ...(bytes ? { archiveSha256: hash(bytes) } : {}),
  };
  if (!result.errors.length && command !== 'validate') {
    check(output, 'Output path required.');
    check(path.resolve(output) !== path.resolve(input), 'Output must not overwrite the input.');
    if (command === 'pack') {
      check(stat.isDirectory(), 'pack requires a complete folder.');
      const packed = writeZip(readFolder(input)); check(packed.length <= limits.zip, 'ZIP exceeds 20 MiB.');
      const recheck = validateFiles(readZip(packed)); check(!recheck.errors.length, recheck.errors.join('\n'));
      fs.writeFileSync(output, packed); report.archiveSha256 = hash(packed);
    } else fs.writeFileSync(output, JSON.stringify(compile(result.manifest), null, 2) + '\n');
    report.output = path.resolve(output);
  }
  console.log(JSON.stringify(report, null, 2));
  if (result.errors.length) process.exitCode = 2;
}
module.exports = { schemaErrors, validateManifest, validateFiles, compile, crc32, decodePng, readZip, writeZip, readFolder, limits };
if (require.main === module) { try { main(); } catch (error) { console.error(JSON.stringify({ technicalStatus: 'invalid', balanceStatus: 'untested', errors: [error.message] }, null, 2)); process.exitCode = 2; } }
