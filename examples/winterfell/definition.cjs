// Reproducible authored content. All combat logic uses the existing engine.
require('../../scripts/ai_runtime.cjs');
const assert = require('node:assert/strict');
const { compilePackageSpell } = require('../../src/content/contentPackage');
const { authoredSpellErrors } = require('../../src/engine/authoredSpells');
const { spellBalance, spellbookBalance, spellbookBudgetErrors } = require('../../src/engine/spellBalance');
const { emptyLoadout, allocatedPoints, resolveLoadout } = require('../../src/engine/equipment');
const { validateCustomEquipment } = require('../../src/engine/customEquipment');
const { customDungeonErrors } = require('../../src/engine/customDungeons');
const { resolveCustomMonster } = require('../../src/engine/customMonsters');

const battlefield = require('./battlefield.cjs');
const { visual } = require('./visuals.cjs');
const VERSION = '2.0.0';
const TITLE = 'Winterfell — La Dernière Braise';
const MAP_ID = battlefield.id;
const ICONS = ['longclaw', 'guard', 'oath', 'sweep', 'charge', 'dragonglass', 'shadow', 'knife',
  'ember', 'warmth', 'firewave', 'ruby', 'icespear', 'bell', 'icearrow', 'frostbite'];
const INTRO = 'La cloche de Winterfell sonne, mais le clocher est vide. Un Marcheur blanc a volé son battant pour guider les morts jusqu’au dernier brasier. Jon tient le passage. Arya murmure : « Il suffit de faire taire le sonneur. » Melisandre serre une braise : « Alors protégez les vivants. »\n\nÉliminez le Sonneur ET ses cinq morts. Dispersez-vous face au glas. Le feu et l’air percent l’armure du boss. Défi : ramener les trois héros. Une histoire alternative de Game of Thrones.';

const e = (kind, min, max = min, options = {}) => ({ kind, min, max, duration: 0, zone: 'Pa', target: 'enemy', ...options });
const hit = (element, min, max, options) => e('damage', min, max, { element, ...options });
const self = (kind, value, duration, options) => e(kind, value, value, { target: 'self', duration, ...options });
const spell = (key, name, pa, range, effects, icon, options = {}) => ({
  key, name, description: options.description || name, counterplay: options.counterplay || 'Respectez la portée et les obstacles ; exploitez les tours de relance.',
  pa, rangeMin: range[0], rangeMax: range[1], targetMode: range[1] ? 'enemy' : 'self', needsLos: true,
  lineOnly: false, adjustableRange: false, maxPerTurn: 2, maxPerTarget: 2, cooldown: 0,
  critRate: 0, failRate: 0, endsTurnOnFailure: false, visualEffect: visual(key), effects, critEffects: [],
  icon: `icons/${icon}.png`, ...options,
});
const once = { maxPerTurn: 1, maxPerTarget: 1 };
const blink = (key, name, pa, range, icon, description) => spell(key, name, pa, [1, range], [self('teleport', 0, 0)], icon,
  { ...once, cooldown: 3, targetMode: 'freeCell', description, counterplay: 'La destination doit être libre ; la relance interdit les bonds successifs.' });

const heroes = [
  { key: 'jon', name: 'Jon Snow', classId: 'IOP', sex: 0, role: 'Rempart du Nord', stat: 'force', base: 150, color: '#79a6c6',
    description: 'Tenir le passage, repousser un mort et ouvrir une brèche. Fort au contact ; portée courte et aucune guérison.',
    spells: [
      spell('longclaw', 'Tranchant de Grand-Griffe', 4, [1, 2], [hit('terre', 26, 30)], 'longclaw',
        { critRate: 30, critEffects: [hit('terre', 29, 33)], description: 'Une frappe fiable, sans zone ni effet caché.' }),
      spell('gate', 'Tenir la porte', 3, [0, 0], [self('armor', 8, 2)], 'guard',
        { ...once, cooldown: 3, description: 'Réduit les prochaines frappes. Protéger maintenant coûte une attaque.' }),
      spell('oath', 'Serment de la Garde', 3, [0, 0], [self('buffPower', 75, 2)], 'oath',
        { ...once, cooldown: 4, description: 'Renforce immédiatement les attaques de Jon ; 2 tours, 4 tours de relance.' }),
      spell('icebreaker', 'Brise-glace', 3, [1, 1], [hit('terre', 15, 18), e('push', 1)], 'sweep',
        { lineOnly: true, description: 'Une frappe suivie d’une poussée d’une case. Libère le passage ou provoque une collision.' }),
      spell('breach', 'Ouvrir la brèche', 2, [1, 3], [e('resistDebuff', 12, 12, { element: 'terre', duration: 1 })], 'knife',
        { ...once, cooldown: 3, description: 'Retire 12 % de résistance terre pendant un tour. Utile contre le Sonneur, sans annuler son armure.' }),
      blink('charge', 'Par-delà le rempart', 4, 4, 'charge', 'Un bond court pour tenir un passage ou rejoindre une cible. Ne provoque aucun dégât.'),
    ],
  },
  { key: 'arya', name: 'Arya Stark', classId: 'SRAM', sex: 1, role: 'Lame des sans-visage', stat: 'agilite', base: 150, color: '#9b93e0',
    description: 'Atteindre les archers, ouvrir une faiblesse, frapper et repartir. Mobile, mais sans soin ni armure.',
    spells: [
      spell('needle', 'La pointe d’Aiguille', 3, [1, 3], [hit('air', 17, 21)], 'knife',
        { critRate: 30, critEffects: [hit('air', 20, 24)], description: 'Estoc rapide. Deux lancers par cible et par tour.' }),
      spell('dragonglass', 'Baiser de verredragon', 4, [1, 2], [hit('air', 28, 32)], 'dragonglass',
        { ...once, cooldown: 2, critRate: 30, critEffects: [hit('air', 31, 35)], description: 'Une frappe lourde à courte portée ; sa relance laisse une fenêtre à l’ennemi.' }),
      spell('throw', 'Couteau dans la neige', 3, [2, 6], [hit('air', 12, 16)], 'knife',
        { description: 'Attaque à distance moins puissante ; impossible au contact.' }),
      blink('not-today', 'Pas aujourd’hui', 3, 3, 'shadow', 'Rejoint une case libre à trois cases au plus. La téléportation ne rend pas invisible.'),
      spell('opening', 'Une faille dans la glace', 2, [1, 4], [e('resistDebuff', 10, 10, { element: 'air', duration: 1 })], 'dragonglass',
        { ...once, cooldown: 3, description: 'Retire 10 % de résistance air pendant un tour. À lancer avant Aiguille.' }),
      spell('wolfstep', 'Le pas de la louve', 2, [0, 0], [self('buffPm', 1, 1)], 'charge',
        { ...once, cooldown: 3, description: 'Gagne immédiatement 1 PM. Ne rembourse pas son coût en PA.' }),
    ],
  },
  { key: 'melisandre', name: 'Melisandre', classId: 'ENIRIPSA', sex: 1, role: 'Gardienne de la braise', stat: 'intelligence', base: 150, color: '#d75646',
    description: 'Choisir entre dégâts, soutien et soins. Le feu traverse la faiblesse du Sonneur ; les grandes flammes touchent aussi les alliés.',
    spells: [
      spell('ember', 'Une braise dans la nuit', 3, [1, 6], [hit('feu', 15, 19)], 'ember',
        { critRate: 30, critEffects: [hit('feu', 18, 22)], description: 'Trait de feu précis. Deux lancers par cible et par tour.' }),
      spell('firewave', 'La nuit est sombre', 4, [1, 4], [hit('feu', 12, 16, { zone: 'Cb', target: 'fighter' })], 'firewave',
        { ...once, targetMode: 'cell', description: 'Cercle de feu de rayon 1 : touche AUSSI les alliés. Visez une case vide pour prendre plusieurs morts.',
          counterplay: 'Écartez les héros ; la zone est montrée au survol avant le lancer.' }),
      spell('warmth', 'La dernière chaleur', 3, [0, 5], [e('heal', 17, 21, { target: 'ally' })], 'warmth',
        { ...once, targetMode: 'fighter', description: 'Soigne un allié ou Melisandre. Un seul soin par tour : impossible de tout réparer.' }),
      spell('ruby', 'Le rubis veille', 3, [0, 4], [e('armor', 5, 5, { target: 'ally', duration: 2 }), e('resistBuff', 10, 10, { target: 'ally', element: 'eau', duration: 2 })], 'ruby',
        { ...once, targetMode: 'fighter', cooldown: 3, description: 'Petite armure et +10 % de résistance eau pour un allié, durant deux tours.' }),
      spell('light', 'Rallumer les vivants', 3, [0, 4], [e('buffDamage', 8, 8, { target: 'ally', duration: 1 })], 'ruby',
        { ...once, targetMode: 'fighter', cooldown: 3, description: '+8 dommages immédiats pour un allié. Choisissez celui qui va attaquer.' }),
      spell('flamewake', 'Recule, ombre', 3, [1, 3], [hit('feu', 10, 14), e('push', 1)], 'firewave',
        { ...once, lineOnly: true, description: 'Une flamme repousse d’une case. Utile pour dégager Melisandre ; coûte un soin ou une attaque.' }),
    ],
  },
];

const monsters = [
  { key: 'frost-commander', name: 'Le Sonneur de la Longue Nuit', count: 1, role: 'Commandant et contrôle de zone',
    description: 'Un lieutenant oublié des Marcheurs blancs. Sa cloche ne réveille personne : elle rappelle aux morts où marchent les vivants.',
    counterplay: 'Sa résistance terre est élevée ; le feu et l’air sont ses faiblesses. Dispersez-vous contre le glas. Sa mort ne fait pas disparaître son escorte.',
    reference: { monsterId: 173, grade: 5 }, tuning: { hpPercent: 80, statsPercent: 150, paBonus: -2, pmBonus: -1 },
    spells: [
      spell('ice-lance', 'La lance du silence', 5, [1, 6], [hit('eau', 38, 44)], 'icespear',
        { description: 'Une forte attaque eau sur une seule cible. Le Sonneur ne peut pas tout faire le même tour.' }),
      spell('toll', 'Le glas sous la neige', 4, [1, 5], [hit('eau', 12, 16, { zone: 'Cb' }), e('removePm', 1, 1, { zone: 'Cb' })], 'bell',
        { ...once, targetMode: 'cell', cooldown: 3, description: 'Dégâts eau et retrait esquivable de 1 PM en cercle de rayon 1.' }),
      spell('silence', 'Étouffer la braise', 3, [2, 7], [e('removePa', 1), e('debuffRange', 1, 1, { duration: 1 })], 'bell',
        { ...once, cooldown: 3, description: 'Retire 1 PA esquivable et 1 portée pendant un tour. Impossible au contact.' }),
      spell('muster', 'Marchez encore', 4, [0, 5], [e('buffDamage', 8, 8, { target: 'ally', duration: 2, zone: 'Cb' })], 'bell',
        { ...once, targetMode: 'fighter', cooldown: 4, description: 'Renforce les morts regroupés. Aucune invocation ni résurrection : le groupe est fixe.' }),
    ],
  },
  { key: 'wight', name: 'Garde enseveli', count: 2, role: 'Obstacle de mêlée',
    description: 'Il porte encore l’écusson d’une maison disparue. Il ne sait plus laquelle.', counterplay: 'Il avance lentement et ne frappe qu’au contact. Contournez son bouclier plutôt que de vous regrouper.',
    reference: { monsterId: 181, grade: 5 }, tuning: { hpPercent: 65, statsPercent: 150, paBonus: 1, pmBonus: -2 },
    spells: [
      spell('rust', 'Acier rouillé', 4, [1, 1], [hit('terre', 27, 33)], 'longclaw'),
      spell('shield', 'Le vieux bouclier', 3, [0, 0], [self('armor', 8, 2)], 'guard', { ...once, cooldown: 3 }),
    ],
  },
  { key: 'rime-archer', name: 'Archer du givre', count: 2, role: 'Tireur et ralentissement',
    description: 'Chaque flèche est taillée dans l’eau gelée des douves.', counterplay: 'Ses deux tirs ont une portée minimale de trois cases. Arya ou Jon peuvent le gêner en s’approchant.',
    reference: { monsterId: 228, grade: 5 }, tuning: { hpPercent: 150, statsPercent: 150, paBonus: 0, pmBonus: -1 },
    spells: [
      spell('rime-arrow', 'Flèche de givre', 3, [3, 8], [hit('eau', 18, 22)], 'icearrow'),
      spell('pin', 'Cloué par le froid', 4, [3, 7], [hit('eau', 12, 16), e('removePm', 1)], 'icearrow',
        { ...once, cooldown: 2, description: 'Un tir et un retrait esquivable de 1 PM ; pas de piège caché au sol.' }),
    ],
  },
  { key: 'frost-hound', name: 'Limier des neiges mortes', count: 1, role: 'Poursuivant mobile',
    description: 'Le dernier loup que l’on croyait avoir entendu hurler derrière le Mur.', counterplay: 'Repoussez-le ou bloquez son accès à Melisandre. Il est rapide, mais sans attaque à distance ni soin.',
    reference: { monsterId: 102, grade: 5 }, tuning: { hpPercent: 110, statsPercent: 150, paBonus: -2, pmBonus: 0 },
    spells: [
      spell('bite', 'Morsure de givre', 3, [1, 1], [hit('eau', 18, 23)], 'frostbite'),
      spell('scent', 'L’odeur des vivants', 2, [0, 0], [self('buffPm', 1, 1), self('buffPower', 60, 1)], 'frostbite',
        { ...once, cooldown: 3 }),
      spell('drag', 'À terre dans la neige', 3, [1, 1], [hit('eau', 10, 14), e('removePm', 1)], 'frostbite',
        { ...once, cooldown: 2 }),
    ],
  },
];

// Two native comparisons per role, retained in the source/report for auditing.
const comparisons = {
  jon: [141, 158, 153, 7, 142, 143], arya: [68, 76, 142, 64],
  melisandre: [350, 165, 121, 124, 7, 128],
  'frost-commander': [163, 84, 153], wight: [141, 158, 7], 'rime-archer': [163, 84, 161], 'frost-hound': [141, 158, 153],
};
const clone = value => JSON.parse(JSON.stringify(value));

function build({ artwork = true } = {}) {
  let spellId = 1800000010000000, itemId = 1800000200;
  const report = { version: VERSION, title: TITLE, mapId: MAP_ID, heroes: [], monsters: [], equipment: [] };
  const compile = owner => {
    const spells = owner.spells.map(spec => {
      const raw = compilePackageSpell(spec);
      raw.id = ++spellId; raw.key = `custom_${raw.id}`;
      if (artwork) { raw.iconArtworkId = 'winterfell-icons-v1'; raw.iconFile = spec.icon; }
      else { delete raw.iconFile; delete raw.iconArtworkId; }
      assert.deepEqual(authoredSpellErrors(raw), [], `${owner.name} / ${spec.name}`);
      return raw;
    });
    assert.deepEqual(spellbookBudgetErrors(spells), [], owner.name);
    return spells;
  };
  const equipment = [];
  const reference = { hat: 7143, cape: 8280, amulet: 7221, ring1: 8270, ring2: 8270, belt: 8283, boots: 7217 };
  const names = {
    jon: { hat: 'Capuche de la Garde', cape: 'Manteau du Lord Commandant', amulet: 'Serment du Nord', ring1: 'Anneau du Rempart', ring2: 'Anneau du Loup', belt: 'Baudrier de la Garde', boots: 'Bottes du Mur', weapon: 'Grand-Griffe' },
    arya: { hat: 'Capuche de Braavos', cape: 'Manteau de personne', amulet: 'Souvenir de Winterfell', ring1: 'Anneau du passage', ring2: 'Anneau sans nom', belt: 'Ceinture aux couteaux', boots: 'Pas de la louve', weapon: 'Aiguille' },
    melisandre: { hat: 'Voile de la prêtresse', cape: 'Manteau de la braise', amulet: 'Rubis d’Asshaï', ring1: 'Anneau des flammes', ring2: 'Sceau du brasier', belt: 'Écharpe pourpre', boots: 'Sandales de cendre', weapon: 'Tison d’Asshaï' },
  };
  const characters = heroes.map(hero => {
    const loadout = { ...emptyLoadout(hero.classId), level: 200, profile: { sex: hero.sex, alignment: 0, rank: 0 },
      base: { [hero.stat]: hero.base }, slots: {}, customEquipment: {} };
    loadout.base.vitalite = 995 - allocatedPoints(hero.classId, loadout.base);
    if (artwork) loadout.artworkId = `winterfell-${hero.key}-v1`;
    const spells = compile(hero);
    loadout.spells = { custom: spells, order: [0, ...spells.map(s => s.id)] };
    for (const slot of ['hat', 'cape', 'amulet', 'ring1', 'ring2', 'belt', 'boots', 'weapon']) {
      const stats = { vitalite: slot === 'weapon' ? 80 : 120, [hero.stat]: 25, sagesse: 10 };
      if (slot === 'amulet' || slot === 'ring1') stats.pa = 1;
      if (slot === 'boots') stats.pm = 1;
      if (slot === 'ring2') stats.damage = 3;
      if (slot === 'belt') stats.res_eau = 5;
      if (slot === 'cape') stats.res_terre = 5;
      const item = { version: 1, id: ++itemId, name: names[hero.key][slot], level: 200,
        referenceId: slot === 'weapon' ? hero.key === 'melisandre' ? 7103 : 7195 : reference[slot],
        stats, appearance: { shape: slot === 'amulet' ? 'crystal' : 'equipment', color: hero.color } };
      if (slot === 'weapon') item.weapon = { pa: hero.key === 'arya' ? 3 : 4, range: hero.key === 'melisandre' ? [2, 4] : [1, 1],
        visualEffect: visual({ jon: 'longclaw', arya: 'needle', melisandre: 'ember' }[hero.key]),
        critRate: 30, critBonus: 3, lines: [{ id: { force: 97, agilite: 98, intelligence: 99 }[hero.stat], min: hero.key === 'arya' ? 17 : 23, max: hero.key === 'arya' ? 21 : 28 }] };
      const checked = validateCustomEquipment(item);
      assert(checked.valid, `${item.name}: ${checked.errors.join('; ')}`);
      equipment.push(item); loadout.customEquipment[item.id] = clone(item); loadout.slots[slot] = item.id;
      report.equipment.push({ name: item.name, slot, score: checked.balance.score, limit: 100 });
    }
    const resolved = resolveLoadout(hero.classId, loadout);
    assert(resolved.valid, `${hero.name}: ${resolved.errors.join('; ')}`);
    report.heroes.push({ name: hero.name, role: hero.role, hp: resolved.hp, pa: resolved.pa, pm: resolved.pm,
      stats: resolved.stats, outfitScore: resolved.equipmentBudget.score, spellbook: spellbookBalance(spells), comparisons: comparisons[hero.key] });
    return { id: `winterfell-${hero.key}`, name: hero.name, description: hero.description, className: hero.role, classId: hero.classId, loadout };
  });
  const members = monsters.map(monster => {
    const customMonster = { key: monster.key, name: monster.name, description: monster.description, role: monster.role,
      counterplay: monster.counterplay, reference: clone(monster.reference), tuning: clone(monster.tuning), spells: compile(monster),
      ...(artwork ? { artworkId: `winterfell-${monster.key}-v1` } : {}) };
    const resolved = resolveCustomMonster(customMonster);
    report.monsters.push({ name: monster.name, count: monster.count, hp: resolved.baseHp, pa: resolved.basePa, pm: resolved.basePm,
      resistances: resolved.resistances, reference: customMonster.reference, tuning: customMonster.tuning,
      spellbook: spellbookBalance(customMonster.spells), comparisons: comparisons[monster.key] });
    return { customMonster, count: monster.count };
  });
  const dungeon = { id: 'winterfell-last-ember-v2', name: TITLE,
    description: 'Game of Thrones · aventure alternative · 3 héros équipés contre le Sonneur et 5 morts. Une salle finale complète ; victoire en éliminant tout le camp adverse.',
    mapId: MAP_ID, battlefield: clone(battlefield), members,
    adventure: { version: 1, mode: 'fixed', partySize: 3, allowAI: true, description: INTRO,
      heroes: characters.map(character => ({ id: character.id, character: { name: character.name, classId: character.classId, className: character.className, loadout: clone(character.loadout) } })) } };
  assert.deepEqual(customDungeonErrors(dungeon), []);
  return { dungeon, characters, equipment, report };
}

module.exports = { build, heroes, monsters, ICONS, INTRO, TITLE, MAP_ID, VERSION, comparisons };
if (require.main === module) {
  const { report } = build({ artwork: false });
  console.log(JSON.stringify(report, null, 2));
}
