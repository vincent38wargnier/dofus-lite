/* global globalThis */
import defaults from './legacyCatalogue';
// Loaded before the engine's lazy chunk. Catalogues never execute code.
const data = globalThis.__ARENA_CATALOGUE__ || defaults;
export const { spellLibrary, monsterData, equipmentData, dungeonData, dungeonMaps,
  outdoorMaps, forgemagieData, classData } = data;
