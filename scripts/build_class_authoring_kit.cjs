// Rebuild the legacy class.json example assets. Runtime game files are not modified.
// For current prompts, budgets and the complete ZIP use build_authoring_kit.cjs.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const root = path.resolve(__dirname, '..');
const skill = path.join(root, 'skills/retro-class-designer');
const assets = path.join(skill, 'assets');
fs.mkdirSync(assets, { recursive: true });
fs.copyFileSync(path.join(root, 'src/ui/characterArtworkSpec.json'), path.join(assets, 'artwork-spec.json'));
const schema = require(path.join(skill, 'scripts/schema.cjs'));
const { crc32, writeZip, readFolder, validateFiles, readZip, compile } = require(path.join(skill, 'scripts/class-kit.cjs'));
const baseline = require(path.join(skill, 'references/baseline.json'));
const damage = (min, max, target = 'enemy', zone = 'Pa') => ({ kind: 'damage', target, zone, element: 'feu', min, max, duration: 0 });
const values = (kind, min, max, duration, target = 'self') => ({ kind, target, zone: 'Pa', min, max, duration });
function spell(key, name, purpose, effects, refs, overrides = {}) {
  const native = refs.map(id => baseline.rows.find(r => r.id === id && r.grade === 6));
  return {
    key, name, description: purpose, role: 'damage', pa: 4, rangeMin: 1, rangeMax: 7,
    targetMode: 'enemy', lineOnly: false, needsLos: true, adjustableRange: false, emptyCellOnly: false,
    maxPerTurn: 2, maxPerTarget: 2, cooldown: 0, initialCooldown: 0,
    critRate: 0, failRate: 0, endsTurnOnFailure: false, effects, critEffects: [],
    presentation: { icon: `icons/${key}.png`, animationSpellId: refs[0] },
    design: { purpose, counterplay: 'Break line of sight or move outside the spell’s effective range.', synergies: [],
      references: native.map(r => ({ id: r.id, grade: 6, note: `${r.name}: compare full targeting, output, cost and limits; this is inspiration, not mechanical equivalence.` })) },
    ...overrides,
  };
}
const self = { targetMode: 'self', rangeMin: 0, rangeMax: 0, maxPerTurn: 1, maxPerTarget: 1 };
const manifest = {
  format: 'dofus-lite-class', schemaVersion: 1, id: 'ember-warden-example', version: '0.1.0',
  name: 'Ember Warden — example', author: 'dofus-lite authoring kit', profile: 'retro-200-v1', baseClass: 'IOP',
  description: 'An untested fire specialist illustrating ten authored spells. Medium-range pressure with limited escape and sustain. The mannequin and repeated placeholder icon are technical examples, not finished themed artwork.',
  credits: 'Character sheets: repository-generated technical mannequin from scripts/generate_character_templates.cjs. Icons: code-generated geometric placeholder. Existing client spell IDs are presentation references only; no client artwork is bundled.',
  design: {
    identity: 'Wins by choosing when to hold medium range and when to spend a short boost window; struggles against fire resistance and sustained long-range pressure.',
    theme: 'A watchful keeper of embers: warm brass, ash and small deliberate flames. Final themed art has not been produced.',
    primaryRole: 'damage', secondaryRole: 'placement', elements: ['feu'], intendedRange: 'medium', complexity: 'beginner',
    strengths: ['Reliable fire pressure without critical dependence.', 'A small group attack and a short push create positional choices.'],
    weaknesses: ['All attacks deal fire damage, so fire resistance is a hard constraint.', 'Escape, healing and protection have downtime; there is no AP denial, summon, or long-range immunity.'],
    turnLoop: ['Choose immediate attacks or invest 3 AP in Heat Focus.', 'Spend the boost window on attacks if the enemy remains reachable.', 'Recover position while the mobility, heal and burst cooldowns reset.'],
  },
  artwork: Object.fromEntries(require(path.join(assets, 'artwork-spec.json')).files.map(f => [f.name.replace('.png', ''), `artwork/${f.name}`])),
  spells: [
    spell('cinder_shard', 'Cinder Shard', 'Reliable 18–22 fire damage at medium range.', [damage(18, 22)], [21, 3], { maxPerTurn: 3 }),
    spell('hearth_strike', 'Hearth Strike', 'Commit to close range for 24–28 fire damage.', [damage(24, 28)], [76, 141], { rangeMax: 2 }),
    spell('crossfire', 'Crossfire', '12–16 fire damage in a radius-one cross, including allies.', [damage(12, 16, 'fighter', 'Xb')], [179, 160], { rangeMax: 5, targetMode: 'cell', maxPerTurn: 1, maxPerTarget: 1 }),
    spell('flare_lance', 'Flare Lance', '22–26 fire damage in a line, unable to hit closer than 3 cells.', [damage(22, 26)], [9, 156], { rangeMin: 3, rangeMax: 8, lineOnly: true, maxPerTarget: 1 }),
    spell('heat_focus', 'Heat Focus', '+60 power immediately for 2 turns. Four-turn cooldown.', [values('buffPower', 60, 60, 2)], [153, 166], { ...self, role: 'support', pa: 3, cooldown: 4 }),
    spell('ember_wake', 'Ember Wake', '6–8 fire damage, then push the enemy 2 cells away from the caster.', [damage(6, 8), { kind: 'push', target: 'enemy', zone: 'Pa', distance: 2 }], [143, 169], { role: 'placement', pa: 3, rangeMax: 3, lineOnly: true, cooldown: 1, maxPerTurn: 1, maxPerTarget: 1 }),
    spell('cauterize', 'Cauterize', 'Restore 10–14 base HP, scaled by intelligence, to an ally or self. Three-turn cooldown.', [values('heal', 10, 14, 0, 'ally')], [121, 124], { role: 'healing', rangeMin: 0, rangeMax: 3, targetMode: 'fighter', cooldown: 3, maxPerTurn: 1, maxPerTarget: 1 }),
    spell('ash_step', 'Ash Step', 'Teleport to an empty cell up to 3 cells away. Three-turn cooldown.', [{ kind: 'teleport', target: 'self', zone: 'Pa' }], [142, 11], { role: 'placement', rangeMax: 3, needsLos: false, targetMode: 'freeCell', emptyCellOnly: true, cooldown: 3, maxPerTurn: 1, maxPerTarget: 1 }),
    spell('ember_ward', 'Ember Ward', '+10 percentage points of fire resistance for 2 turns. Four-turn cooldown.', [{ ...values('resistBuff', 10, 10, 2), element: 'feu' }], [7, 686], { ...self, role: 'protection', pa: 3, cooldown: 4 }),
    spell('last_flare', 'Last Flare', '32–36 fire damage with a three-turn cooldown.', [damage(32, 36)], [156, 76], { pa: 5, rangeMax: 4, cooldown: 3, maxPerTurn: 1, maxPerTarget: 1 }),
  ],
};
const byKey = Object.fromEntries(manifest.spells.map(s => [s.key, s]));
byKey.heat_focus.design.synergies = ['cinder_shard', 'hearth_strike', 'crossfire', 'last_flare'];
byKey.heat_focus.design.counterplay = 'Disengage or break line of sight during the boost window; the setup consumes 3 AP.';
byKey.crossfire.design.synergies = ['heat_focus', 'ember_wake'];
byKey.crossfire.design.counterplay = 'Spread out, or stand near the caster’s allies to increase the friendly-fire cost.';
byKey.ember_wake.design.synergies = ['flare_lance'];
byKey.ember_wake.design.counterplay = 'Avoid lining up with a wall; stabilize or return to contact after the push where possible.';
byKey.ash_step.design.counterplay = 'Pressure the destination and punish the three-turn mobility cooldown.';
byKey.cauterize.design.counterplay = 'Sustain pressure: the modest heal costs 4 AP and has a three-turn cooldown.';
byKey.ember_ward.design.counterplay = 'Use another element or wait out the two-turn protection; it offers no physical escape.';
byKey.last_flare.design.counterplay = 'Deny short-range access during its availability; punish the three-turn cooldown.';

function placeholderPng() {
  const width = 64, height = 64, header = Buffer.alloc(13), pixels = Buffer.alloc((width * 4 + 1) * height);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const cross = Math.abs(x - 32) < 4 && y > 13 && y < 51 || Math.abs(y - 32) < 4 && x > 13 && x < 51;
    const diamond = Math.abs(x - 32) + Math.abs(y - 32) < 28;
    const i = y * (width * 4 + 1) + 1 + x * 4;
    pixels.set(cross ? [245, 242, 218, 255] : diamond ? [142, 91, 39, 255] : [0, 0, 0, 0], i);
  }
  const chunk = (type, data) => {
    const name = Buffer.from(type), len = Buffer.alloc(4), crc = Buffer.alloc(4); len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
    return Buffer.concat([len, name, data, crc]);
  };
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}
function main() {
  fs.writeFileSync(path.join(assets, 'class.schema.json'), JSON.stringify(schema, null, 2) + '\n');
  const example = path.join(assets, 'example');
  fs.mkdirSync(path.join(example, 'artwork'), { recursive: true }); fs.mkdirSync(path.join(example, 'icons'), { recursive: true });
  fs.writeFileSync(path.join(example, 'class.json'), JSON.stringify(manifest, null, 2) + '\n');
  for (const name of Object.values(manifest.artwork)) fs.copyFileSync(path.join(root, 'public/templates/character-artwork/example', path.basename(name)), path.join(example, name));
  for (const s of manifest.spells) fs.writeFileSync(path.join(example, s.presentation.icon), placeholderPng());
  const files = readFolder(example), packed = writeZip(files), result = validateFiles(readZip(packed));
  if (result.errors.length) throw new Error(result.errors.join('\n'));
  fs.writeFileSync(path.join(assets, 'example-class.zip'), packed);
  fs.writeFileSync(path.join(assets, 'example-compiled.json'), JSON.stringify(compile(manifest), null, 2) + '\n');
  console.log(JSON.stringify({ files: files.size, zipBytes: packed.length, imagesChecked: result.imagesChecked, warnings: result.warnings, balanceStatus: 'untested' }, null, 2));
}
module.exports = { manifest, placeholderPng };
if (require.main === module) main();
