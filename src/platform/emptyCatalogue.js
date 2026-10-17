import forgemagieData from './statRules.json';
// A construction template, not an installed/playable class. No spells or gear.
const classData = { metadata: {}, names: { CREATOR: 'Personnage libre' }, builds: {
  CREATOR: ['◇', 'Créez son identité, ses sorts et son équipement.', 0,
    { force: 0, intelligence: 0, chance: 0, agilite: 0, sagesse: 0 }, 1],
} };
export default {
  spellLibrary: { version: 1, classes: { CREATOR: [] }, common: [], spells: {}, summons: {} },
  monsterData: { version: 1, monsters: {}, bosses: [], unavailableBosses: [] },
  equipmentData: { version: 1, items: {}, sets: {}, caps: { CREATOR: Object.fromEntries(['vitalite','force','intelligence','chance','agilite','sagesse'].map(s => [s, s === 'vitalite' ? [[0,1]] : s === 'sagesse' ? [[0,3]] : [[0,1],[100,2],[200,3],[300,4],[400,5]]])) }, types: { 1: 'Amulette', 2: 'Arc', 3: 'Baguette', 4: 'Bâton',
    5: 'Dagues', 6: 'Épée', 7: 'Marteau', 8: 'Pelle', 9: 'Anneau', 10: 'Ceinture', 11: 'Bottes',
    16: 'Coiffe', 17: 'Cape', 18: 'Compagnon', 19: 'Hache', 23: 'Artefact', 81: 'Sac', 82: 'Bouclier', 97: 'Monture' } },
  dungeonData: { version: 1, encounters: [], unavailable: [] }, dungeonMaps: [], outdoorMaps: [],
  forgemagieData, classData,
};
