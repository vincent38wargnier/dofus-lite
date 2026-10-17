// Original construction primitives. These are not catalogued equipment/monsters.
const types = { 1: 'Amulette', 2: 'Arc', 3: 'Baguette', 4: 'Bâton', 5: 'Dagues', 6: 'Épée',
  7: 'Marteau', 8: 'Pelle', 9: 'Anneau', 10: 'Ceinture', 11: 'Bottes', 16: 'Coiffe', 17: 'Cape',
  18: 'Compagnon', 19: 'Hache', 82: 'Bouclier', 97: 'Monture' };
export const EQUIPMENT_TEMPLATES = Object.fromEntries(Object.entries(types).map(([t, name]) => {
  const type = Number(t), id = -100000 - type;
  return [id, { id, type, name, level: type === 97 ? 60 : 200, gfx: 0, creatorTemplate: true, effects: [],
    ...([2,3,4,5,6,7,8,19].includes(type) ? { weapon: { pa: 4, range: type === 2 ? [2,6] : type === 3 ? [1,4] : [1,1],
      critRate: 0, critBonus: 0, failRate: 0, zone: type === 7 ? 'Xb' : type === 4 ? 'Tb' : 'Pa', twoHands: false } } : {}) }];
}));
export function creatureBase(role = 'guard') {
  const stats = { force: 100, intelligence: 100, chance: 100, agilite: 100, sagesse: 50, vitalite: 0 };
  return { name: 'Gabarit libre', level: 200, baseHp: role === 'boss' ? 1600 : role === 'guard' ? 300 : 200,
    basePa: 6, basePm: 3, maxSummons: 3, stats, resistances: { neutre: 0, terre: 0, feu: 0, eau: 0, air: 0 },
    resistancesFixed: { neutre: 0, terre: 0, feu: 0, eau: 0, air: 0 }, spells: {} };
}
export function validCreatureBase(base) {
  const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
  return base && !Array.isArray(base) && Object.keys(base).every(k => ['name','level','baseHp','basePa','basePm','maxSummons','stats','resistances','resistancesFixed','spells'].includes(k))
    && typeof base.name === 'string' && base.name.length <= 100
    && base.spells && !Array.isArray(base.spells) && !Object.keys(base.spells).length
    && integer(base.level, 1, 200) && integer(base.baseHp, 1, 10000) && integer(base.basePa, 0, 16)
    && integer(base.basePm, 0, 8) && integer(base.maxSummons, 0, 8)
    && ['force','intelligence','chance','agilite','sagesse','vitalite'].every(s => integer(base.stats?.[s], 0, 1000))
    && ['neutre','terre','feu','eau','air'].every(s => integer(base.resistances?.[s], -100, 50) && integer(base.resistancesFixed?.[s], 0, 100));
}
