// A self-contained fan encounter, built and checked with the game's real rules.
const base = require('../winterfell/definition.cjs');
const assert = require('node:assert/strict');
const battlefield = require('./battlefield.cjs');
const { visual } = require('../winterfell/visuals.cjs');
const { compilePackageSpell } = require('../../src/content/contentPackage');
const { authoredSpellErrors } = require('../../src/engine/authoredSpells');
const { spellbookBalance, spellbookBudgetErrors } = require('../../src/engine/spellBalance');
const { resolveLoadout } = require('../../src/engine/equipment');
const { validateCustomEquipment } = require('../../src/engine/customEquipment');
const { customDungeonErrors } = require('../../src/engine/customDungeons');
const { resolveCustomMonster } = require('../../src/engine/customMonsters');
const clone = x => JSON.parse(JSON.stringify(x));
const TITLE = 'Winterfell — Le Dernier Rempart';
const INTRO = 'Les portes intérieures sont fermées. Derrière elles : les blessés, les enfants et la dernière chaleur de Winterfell. Devant : trente-deux silhouettes, et aucun souffle.\n\nJon plante Grand-Griffe dans la neige. Brienne et Jaime tiennent les deux brèches. Tormund rit une dernière fois : « Enfin, ils sont assez nombreux ! » Melisandre rallume les quatre brasiers. Arya regarde au-delà des morts : le Roi de la Nuit approche.\n\nOBJECTIF — Tuez le Roi de la Nuit : son armée entière s’effondre avec lui. Gardez un passage pour Arya ; utilisez les barricades pour limiter les fronts. Les archers ne peuvent pas tirer au contact. Le feu et l’air exploitent les faiblesses des Marcheurs.\n\nDéfi facultatif : ramener les six héros. Attention aux zones de Tormund et Melisandre : elles touchent aussi leurs alliés. Adaptation tactique libre de la bataille de Winterfell, dans l’univers de Game of Thrones.';
const effect = (kind, min, max = min, extra = {}) => ({ kind, min, max, duration: 0, zone: 'Pa', target: 'enemy', ...extra });
const hit = (element, min, max, extra) => effect('damage', min, max, { element, ...extra });
const self = (kind, value, duration) => effect(kind, value, value, { duration, target: 'self' });
const once = { maxPerTurn: 1, maxPerTarget: 1 };
const spell = (key, name, pa, range, effects, icon, animation, options = {}) => ({ key, name,
  description: options.description || name, counterplay: 'Jouez autour de la portée, de la ligne de vue et des tours de relance.',
  pa, rangeMin: range[0], rangeMax: range[1], targetMode: range[1] ? 'enemy' : 'self', needsLos: true,
  lineOnly: false, adjustableRange: false, maxPerTurn: 2, maxPerTarget: 2, cooldown: 0,
  critRate: 0, failRate: 0, endsTurnOnFailure: false, effects, critEffects: [],
  icon: `icons/${icon}.png`, visualEffect: visual(animation), ...options });
const newHeroes = [
  { key: 'brienne', name: 'Brienne de Torth', role: 'Le serment tient', template: 0, weapon: 'Féale', color: '#7094be',
    description: 'Protégez le héros exposé, repoussez un mort et conservez une brèche. Sa protection demande un choix de cible.',
    spells: [
      spell('oathkeeper', 'Féale ne plie pas', 4, [1, 2], [hit('terre', 28, 32)], 'longclaw', 'longclaw', { critRate: 30, critEffects: [hit('terre', 31, 35)] }),
      spell('protect', 'Sous ma garde', 3, [0, 3], [effect('armor', 9, 9, { target: 'ally', duration: 2 })], 'guard', 'gate', { ...once, targetMode: 'fighter', cooldown: 3, description: 'Une armure sur un allié ou Brienne durant deux tours. Réduction calculée avec les caractéristiques du lanceur.' }),
      spell('hold', 'Un pas en arrière', 3, [1, 2], [hit('terre', 14, 18), effect('push', 1)], 'sweep', 'icebreaker', { lineOnly: true, description: 'Frappe terre puis pousse d’une case. Les collisions peuvent infliger des dégâts.' }),
      spell('promise', 'Un serment est un serment', 2, [0, 0], [self('buffPower', 50, 1)], 'oath', 'oath', { ...once, cooldown: 3, description: '+50 puissance immédiatement, pendant un tour.' }),
    ] },
  { key: 'jaime', name: 'Jaime Lannister', role: 'Pour les vivants', template: 1, weapon: 'Pleurs-de-Veuve', color: '#ac8950',
    description: 'Une lame précise pour exploiter les faiblesses ouvertes par Arya. Sa garde est brève, sa main gauche doit trouver le bon angle.',
    spells: [
      spell('left-hand', 'La main qui reste', 3, [1, 1], [hit('air', 19, 23)], 'knife', 'needle', { critRate: 30, critEffects: [hit('air', 22, 26)] }),
      spell('parry', 'Parade du Régicide', 3, [0, 0], [self('armor', 6, 2), self('buffDamage', 5, 2)], 'guard', 'gate', { ...once, cooldown: 4, description: 'Armure et +5 dommages immédiats pendant deux tours.' }),
      spell('feint', 'Le défaut de l’armure', 2, [1, 3], [effect('resistDebuff', 10, 10, { element: 'air', duration: 1 })], 'dragonglass', 'opening', { ...once, cooldown: 3, description: 'Retire 10 % de résistance air pendant un tour.' }),
      spell('living', 'Je combats pour les vivants', 4, [1, 3], [self('teleport', 0, 0)], 'charge', 'charge', { ...once, targetMode: 'freeCell', cooldown: 3, description: 'Rejoint une case libre à trois cases au plus.' }),
    ] },
  { key: 'tormund', name: 'Tormund Fléau-d’Ogres', role: 'Briseur de rangs', template: 0, weapon: 'Hache du Peuple libre', color: '#b87041',
    description: 'Son balayage ouvre les rangs des morts, mais frappe aussi les vivants. Laissez-lui de la place.',
    spells: [
      spell('axe', 'Faites de la place !', 4, [1, 2], [hit('terre', 19, 23, { zone: 'Xb', target: 'fighter' })], 'sweep', 'longclaw', { ...once, targetMode: 'cell', description: 'Frappe en croix de rayon 1. Touche AUSSI les alliés : vérifiez la zone avant de cliquer.' }),
      spell('ogre', 'Plus dure sera la chute', 3, [1, 1], [hit('terre', 26, 32), effect('push', 1)], 'longclaw', 'icebreaker', { ...once, lineOnly: true, cooldown: 2, description: 'Un coup puissant puis une poussée d’une case ; deux tours de relance.' }),
      spell('roar', 'Le dernier rire', 3, [0, 0], [self('buffPower', 70, 2)], 'oath', 'oath', { ...once, cooldown: 4, description: '+70 puissance immédiatement, pendant deux tours.' }),
      spell('rush', 'Par-dessus leurs os', 3, [0, 0], [self('buffPm', 2, 1)], 'charge', 'wolfstep', { ...once, cooldown: 4, description: '+2 PM pendant un tour. Ne permet pas de traverser un ennemi.' }),
    ] },
];
const king = { key: 'night-king', name: 'Le Roi de la Nuit', role: 'Lien de l’armée',
  description: 'Le froid avance avec lui. Chacun des morts obéit au même silence.',
  counterplay: 'Sa mort fait tomber toute l’armée. Le feu et l’air exploitent ses faiblesses ; dispersez-vous face à sa zone de glace.',
  reference: { monsterId: 173, grade: 5 }, tuning: { hpPercent: 90, statsPercent: 130, paBonus: -2, pmBonus: -1 },
  spells: [
    spell('king-spear', 'La lance qui éteint les étoiles', 4, [1, 7], [hit('eau', 24, 30)], 'icespear', 'ice-lance'),
    spell('winter', 'L’hiver ne finit jamais', 5, [1, 5], [hit('eau', 13, 17, { zone: 'Cc' }), effect('removePm', 1, 1, { zone: 'Cc' })], 'frostbite', 'toll', { ...once, cooldown: 3, targetMode: 'cell', description: 'Cercle de rayon 2 : dégâts eau et retrait esquivable de 1 PM.' }),
    spell('cold', 'Le froid dans les veines', 3, [1, 6], [effect('removePm', 2), effect('debuffRange', 1, 1, { duration: 1 })], 'icearrow', 'silence', { ...once, cooldown: 3, description: 'Retrait esquivable de 2 PM et −1 portée pendant un tour.' }),
    spell('dead-rise', 'La volonté des morts', 4, [0, 5], [effect('buffDamage', 6, 6, { target: 'ally', duration: 2, zone: 'Cb' })], 'bell', 'muster', { ...once, cooldown: 4, targetMode: 'fighter', description: '+6 dommages aux morts regroupés, pendant deux tours. Ne ressuscite personne.' }),
  ] };

function build() {
  const old = base.build(), characters = clone(old.characters), equipment = clone(old.equipment);
  let spellId = 1800000020000000, itemId = 1800000800;
  const compile = specs => specs.map(spec => {
    const raw = compilePackageSpell(spec); raw.id = ++spellId; raw.key = `custom_${raw.id}`;
    raw.iconArtworkId = 'winterfell-icons-v1'; raw.iconFile = spec.icon;
    assert.deepEqual(authoredSpellErrors(raw), [], spec.name); return raw;
  });
  for (const hero of newHeroes) {
    const source = clone(old.characters[hero.template]);
    source.id = `laststand-${hero.key}`; source.name = hero.name; source.description = hero.description; source.className = hero.role;
    source.loadout.artworkId = `laststand-${hero.key}-v1`;
    source.loadout.profile.sex = hero.key === 'brienne' ? 1 : 0;
    const spells = compile(hero.spells); source.loadout.spells = { custom: spells, order: [0, ...spells.map(s => s.id)] };
    const inventory = source.loadout.customEquipment; source.loadout.customEquipment = {};
    for (const [slot, oldId] of Object.entries(source.loadout.slots)) {
      const item = clone(inventory[oldId]); item.id = ++itemId;
      item.name = slot === 'weapon' ? hero.weapon : `${{hat:'Capuche',cape:'Manteau',amulet:'Sceau',ring1:'Anneau',ring2:'Chevalière',belt:'Baudrier',boots:'Bottes'}[slot]} — ${hero.name.split(' ')[0]}`;
      item.appearance.color = hero.color;
      assert(validateCustomEquipment(item).valid, item.name);
      source.loadout.slots[slot] = item.id; source.loadout.customEquipment[item.id] = item; equipment.push(clone(item));
    }
    characters.push(source);
  }
  // Existing heroes retain their authored equipment and spells, not references
  // to a player's library. Adjust only stale story text from the first episode.
  characters.forEach(c => {
    c.id = `laststand-${c.name.toLowerCase().replace(/[^a-z]/g, '-')}`;
    c.loadout.spells.custom.forEach(s => { if (s.description) s.description = s.description.replace(/Sonneur/g, 'Roi de la Nuit'); });
  });
  const lieutenant = clone(old.dungeon.members[0].customMonster);
  lieutenant.key = 'white-walker'; lieutenant.name = 'Marcheur blanc'; lieutenant.role = 'Garde du Roi';
  lieutenant.description = 'Un lieutenant glacé qui protège les rangs arrière.';
  lieutenant.counterplay = 'Son feu croisé ralentit les héros. Tuez le Roi de la Nuit pour le faire tomber.';
  lieutenant.tuning = { hpPercent: 25, statsPercent: 65, paBonus: -2, pmBonus: -1 };
  lieutenant.spells = lieutenant.spells.slice(0, 2);
  const wight = clone(old.dungeon.members[1].customMonster);
  wight.tuning = { hpPercent: 25, statsPercent: 35, paBonus: -2, pmBonus: -1 };
  wight.spells = compile([spell('dead-steel', 'Acier des morts', 4, [1, 1], [hit('terre', 16, 20)], 'longclaw', 'rust')]);
  const archer = clone(old.dungeon.members[2].customMonster);
  archer.tuning = { hpPercent: 60, statsPercent: 50, paBonus: -2, pmBonus: -1 };
  archer.spells = compile([spell('dead-arrow', 'Trait sans souffle', 3, [3, 8], [hit('eau', 12, 16)], 'icearrow', 'rime-arrow', { maxPerTurn: 1, maxPerTarget: 1 })]);
  const hound = clone(old.dungeon.members[3].customMonster);
  hound.tuning = { hpPercent: 40, statsPercent: 50, paBonus: -2, pmBonus: 0 };
  hound.spells = compile([spell('dead-fangs', 'Mâchoire gelée', 4, [1, 1], [hit('air', 17, 21)], 'frostbite', 'bite')]);
  const members = [{ customMonster: { ...clone(king), spells: compile(king.spells), artworkId: 'laststand-night-king-v1' }, count: 1 },
    { customMonster: lieutenant, count: 3 }, { customMonster: archer, count: 8 }, { customMonster: wight, count: 16 }, { customMonster: hound, count: 4 }];
  const dungeon = { id: 'winterfell-last-stand-v1', name: TITLE,
    description: 'La bataille de Winterfell · 6 héros équipés face au Roi de la Nuit et 31 morts. Sa chute brise l’armée.',
    mapId: battlefield.id, battlefield: clone(battlefield), members,
    encounter: { version: 1, mode: 'army', commander: 0 },
    adventure: { version: 1, mode: 'fixed', partySize: 6, allowAI: true, description: INTRO,
      heroes: characters.map(c => ({ id: c.id, character: { name: c.name, classId: c.classId, className: c.className, loadout: clone(c.loadout) } })) } };
  const report = { title: TITLE, heroes: characters.map(c => {
    const r = resolveLoadout(c.classId, c.loadout); assert(r.valid, `${c.name}: ${r.errors}`);
    assert.deepEqual(spellbookBudgetErrors(c.loadout.spells.custom), [], c.name);
    return { name: c.name, hp: r.hp, pa: r.pa, pm: r.pm, outfit: r.equipmentBudget.score, spells: spellbookBalance(c.loadout.spells.custom) };
  }), monsters: members.map(({ customMonster: m, count }) => {
    const r = resolveCustomMonster(m); assert.deepEqual(spellbookBudgetErrors(m.spells), [], m.name);
    return { name: m.name, count, hp: r.baseHp, pa: r.basePa, pm: r.basePm, spells: spellbookBalance(m.spells) };
  }), equipment: equipment.map(e => ({ name: e.name, score: validateCustomEquipment(e).balance.score })) };
  assert.deepEqual(customDungeonErrors(dungeon), []);
  return { dungeon, characters, equipment, report };
}
module.exports = { build, TITLE, INTRO, newHeroes, king };
if (require.main === module) console.log(JSON.stringify(build().report, null, 2));
