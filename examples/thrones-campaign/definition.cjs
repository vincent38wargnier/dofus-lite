const assert = require('node:assert/strict');
const source = require('../winterfell-last-stand/definition.cjs');
const { chapters, TITLE, INTRO } = require('./story.cjs');
const maps = require('./battlefields.cjs');
const { visual } = require('../winterfell/visuals.cjs');
const { compilePackageSpell } = require('../../src/content/contentPackage');
const { authoredSpellErrors } = require('../../src/engine/authoredSpells');
const { spellbookBalance, spellbookBudgetErrors } = require('../../src/engine/spellBalance');
const { customDungeonErrors } = require('../../src/engine/customDungeons');
const { resolveCustomMonster } = require('../../src/engine/customMonsters');
const { withDungeonRooms } = require('../../src/engine/dungeonCampaign');
const clone = v => JSON.parse(JSON.stringify(v));
const owners = [{ key: 'lannister', name: 'Garde du Lion' }, { key: 'frey', name: 'Arbalétrier des Jumeaux' }, { key: 'bolton', name: 'Piquier Bolton' }];
function build() {
  const base = source.build(); let spellId = 1800000030000000;
  const effect = (kind, value, extra = {}) => ({ kind, min: value, max: value, duration: 0, zone: 'Pa', target: 'enemy', ...extra });
  const hit = (element, min, max, extra = {}) => effect('damage', min, { max, element, ...extra });
  const spell = (key, name, pa, range, effects, icon, animation, options = {}) => {
    const spec = { key, name, description: options.description || name, counterplay: 'Utilisez les obstacles, les portées minimales et les relances pour choisir votre approche.',
      pa, rangeMin: range[0], rangeMax: range[1], targetMode: range[1] ? 'enemy' : 'self', needsLos: true, lineOnly: false, adjustableRange: false,
      maxPerTurn: 2, maxPerTarget: 2, cooldown: 0, critRate: 0, failRate: 0, endsTurnOnFailure: false, effects, critEffects: [],
      icon: `icons/${icon}.png`, visualEffect: visual(animation), ...options };
    const raw = compilePackageSpell(spec); raw.id = ++spellId; raw.key = `custom_${raw.id}`; raw.iconArtworkId = 'winterfell-icons-v1'; raw.iconFile = spec.icon;
    assert.deepEqual(authoredSpellErrors(raw), [], name); return raw;
  };
  const once = { maxPerTurn: 1, maxPerTarget: 1 };
  const human = (key, name, hp, spells, role) => ({ key, name, role, description: `${name} — ${role}. Un combattant du souvenir, avec des capacités entièrement définies dans ce package.`,
    counterplay: 'Consultez son grimoire. Les tirs ont une portée minimale ; les protections expirent et les coups rapprochés exigent un chemin libre.',
    reference: { monsterId: 181, grade: 5 }, tuning: { hpPercent: hp, statsPercent: 100, paBonus: 1, pmBonus: -1 },
    artworkId: `thrones-${key}-v1`, spells });
  const guard = human('lannister', 'Garde du Lion', 55, [
    spell('lion-steel', 'L’acier du Lion', 4, [1, 1], [hit('terre', 26, 32)], 'longclaw', 'longclaw'),
    spell('lion-guard', 'Le prix d’un bouclier', 3, [0, 0], [effect('armor', 7, { target: 'self', duration: 2 })], 'guard', 'gate', { ...once, cooldown: 3, description: 'Une protection durant deux tours. Attendez son expiration ou concentrez vos dégâts.' }),
  ], 'Bouclier et contact');
  const crossbow = human('frey', 'Arbalétrier des Jumeaux', 38, [
    spell('crossbow', 'Carreau de la trahison', 3, [3, 8], [hit('air', 17, 21)], 'knife', 'throw'),
    spell('hamstring', 'Aucun invité ne sort', 4, [2, 6], [hit('air', 11, 15), effect('removePm', 1)], 'dragonglass', 'throw', { ...once, cooldown: 2, description: 'Dégâts air puis tentative de retrait de 1 PM. Impossible à utiliser au contact.' }),
  ], 'Tirs croisés');
  const pike = human('bolton', 'Piquier Bolton', 50, [
    spell('pike', 'Lance du Dreadfort', 4, [1, 2], [hit('terre', 23, 29)], 'longclaw', 'breach', { lineOnly: true }),
    spell('push', 'Refermez les rangs', 3, [1, 1], [hit('terre', 11, 15), effect('push', 1)], 'sweep', 'icebreaker', { ...once, cooldown: 2, description: 'Dégâts terre puis poussée d’une case ; les collisions peuvent blesser.' }),
  ], 'Formation et poussée');
  const alchemist = { ...clone(crossbow), key: 'wildfire', name: 'Porte-feu de la Néra', role: 'Feu de zone', spells: [
    spell('wildfire', 'Feu grégeois', 5, [2, 6], [hit('feu', 18, 24, { zone: 'Cb', target: 'fighter' })], 'firewave', 'firewave', {
      ...once, cooldown: 2, targetMode: 'cell', description: 'Feu dans un cercle de rayon 1, alliés compris. Deux tours de relance.',
      visualEffect: { version: 1, kind: 'fireball', color: '#55d87d', accent: '#d3ff80', durationMs: 1100 } }),
    spell('spark', 'Tison vert', 3, [2, 6], [hit('feu', 14, 18)], 'ember', 'ember', { visualEffect: { version: 1, kind: 'fireball', color: '#4acb6d', accent: '#c4ff78', durationMs: 900 } }),
  ] };
  // Tormund's newly painted figure also represents anonymous living raiders.
  const raider = { ...clone(pike), key: 'freefolk', name: 'Éclaireur du Peuple libre', role: 'Assaut mobile', artworkId: 'laststand-tormund-v1', spells: [
    spell('raider', 'La hache du froid', 4, [1, 1], [hit('terre', 26, 32), effect('push', 1)], 'sweep', 'longclaw'),
    spell('run', 'Pour ceux derrière nous', 2, [0, 0], [effect('buffPm', 1, { target: 'self', duration: 1 })], 'charge', 'wolfstep', { ...once, cooldown: 3 }),
  ] };
  const [nightKing, lieutenant, archer, wight, hound] = base.dungeon.members.map(m => clone(m.customMonster));
  lieutenant.tuning.hpPercent = 42; lieutenant.tuning.statsPercent = 90;
  lieutenant.counterplay = 'Le feu et l’air exploitent ses faiblesses. Sa mort ne détruit pas les autres morts de cette salle.';
  archer.tuning.hpPercent = 90; archer.tuning.statsPercent = 85;
  wight.tuning.hpPercent = 40; wight.tuning.statsPercent = 75;
  hound.tuning.hpPercent = 70; hound.tuning.statsPercent = 80;
  // A last archer should remain catchable. Shorter reach and three PM avoid
  // spending several extra rounds chasing one low-health survivor.
  archer.tuning.pmBonus = -2;
  archer.spells.forEach(s => { s.rangeMax = Math.min(6, s.rangeMax); s.maxPerTurn = 2; s.maxPerTarget = 2; });
  lieutenant.spells.forEach(s => { s.rangeMax = Math.min(5, s.rangeMax); });
  const captain = { ...clone(pike), key: 'bolton-captain', name: 'Capitaine des rangs Bolton', tuning: { ...pike.tuning, hpPercent: 85 },
    spells: [...pike.spells, spell('bolton-order', 'Tenez la ligne', 3, [0, 3], [effect('buffDamage', 5, { target: 'ally', duration: 2 })], 'oath', 'oath', { ...once, cooldown: 3, targetMode: 'fighter' })] };
  const m = (monster, count) => ({ customMonster: clone(monster), count });
  const ranged = (key, name) => ({ ...clone(crossbow), key, name, description: `${name} : il protège l’arrière de sa ligne.`,
    spells: crossbow.spells.map((s, i) => ({ ...clone(s), name: i ? 'Cloué sur place' : 'Trait de couverture' })) });
  const lionArcher = ranged('lion-crossbow', 'Arbalétrier du Lion'), freeArcher = ranged('freefolk-archer', 'Tireur du Peuple libre'), boltonArcher = ranged('bolton-archer', 'Arbalétrier Bolton');
  // Difficulty grows through more complementary threats, not long walks and
  // health sponges. Keep all six equipped heroes unchanged between chapters.
  const tuned = (monster, hpPercent, statsPercent, paBonus = monster.tuning.paBonus) => ({ ...clone(monster),
    tuning: { ...monster.tuning, hpPercent, statsPercent, paBonus } });
  const finale = clone(base.dungeon.members);
  finale[0].customMonster.tuning = { ...nightKing.tuning, hpPercent: 90, statsPercent: 150 };
  // The king fights at the breach. His short reach makes the decisive target
  // approachable instead of dragging six melee heroes around the whole map.
  finale[0].customMonster.spells.forEach(s => { s.rangeMax = Math.min(4, s.rangeMax); });
  finale.slice(1).forEach(member => { member.customMonster.tuning.statsPercent = 150; });
  finale[3].customMonster.reference.grade = 1;
  const groups = [
    [m(tuned(guard, 25, 80, 0), 3), m(tuned(lionArcher, 25, 80, 0), 1)],
    [m(tuned(guard, 30, 100), 2), m(tuned(alchemist, 30, 100), 2), m(tuned(lionArcher, 25, 100), 1)],
    [m(tuned(crossbow, 30, 120), 3), m(tuned(guard, 35, 120), 2), m(tuned(pike, 30, 120), 1)],
    [m(tuned(raider, 30, 135), 6), m(tuned(freeArcher, 30, 135), 2)],
    [m(tuned(lieutenant, 25, 150), 1), m(tuned(wight, 25, 150), 4), m(tuned(archer, 65, 150), 3), m(tuned(hound, 40, 150), 2)],
    [m(tuned(captain, 65, 150), 1), m(tuned(pike, 30, 150), 7), m(tuned(boltonArcher, 30, 150), 4)],
    [m(tuned(lieutenant, 25, 150), 2), m(tuned(wight, 30, 150), 6), m(tuned(archer, 65, 150), 4), m(tuned(hound, 40, 150), 4)],
    finale,
  ];
  const rooms = chapters.map((chapter, i) => ({ id: chapter.key, name: chapter.name, mapId: maps[i].id, battlefield: clone(maps[i]),
    members: groups[i], intro: chapter.intro, outro: chapter.outro,
    ...(i ? { encounter: { version: 1, mode: 'army', ...(i === 7 ? { commander: 0 } : {}) } } : {}) }));
  const dungeon = withDungeonRooms({ id: 'thrones-eight-memories-v1', name: TITLE,
    description: 'Huit saisons, huit salles à débloquer. Six héros équipés, des batailles originales et la mémoire de Westeros.',
    adventure: { ...clone(base.dungeon.adventure), description: INTRO } }, rooms);
  assert.deepEqual(customDungeonErrors(dungeon), []);
  const report = { title: TITLE, heroes: base.report.heroes, equipment: base.report.equipment, rooms: rooms.map((room, i) => ({
    name: room.name, terrain: `${maps[i].width} × ${maps[i].height}`, enemies: room.members.reduce((n, m) => n + m.count, 0),
    monsters: room.members.map(({ customMonster: monster, count }) => {
      assert.deepEqual(spellbookBudgetErrors(monster.spells), [], monster.name);
      const r = resolveCustomMonster(monster);
      return { name: monster.name, count, hp: r.baseHp, pa: r.basePa, pm: r.basePm, spellbook: spellbookBalance(monster.spells) };
    }) })) };
  return { dungeon, characters: base.characters, equipment: base.equipment, report };
}
module.exports = { build, owners };
