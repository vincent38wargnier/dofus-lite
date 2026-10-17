import { readContentZip, writeContentZip } from '../content/zip';
import statRules from './statRules.json';
import { COVER_PATH, inspectCover } from './libraryCover';
export const LIBRARY_LIMITS = { zipBytes: 512 * 1048576, expandedBytes: 640 * 1048576,
  jsonBytes: 16 * 1048576, pngBytes: 128 * 1048576, files: 24000 };
// Selecting a local archive never uploads it to the server. Explicit publication
// supports the same complete catalogue format, with one validation job at a time.
export const LOCAL_LIBRARY_LIMITS = { ...LIBRARY_LIMITS, zipBytes: 512 * 1048576,
  expandedBytes: 640 * 1048576, files: 24000 };
const check = (ok, message) => { if (!ok) throw new Error(message); };
export function safeLibraryJson(value, depth = 0) {
  check(depth <= 40, 'Structure trop imbriquée.');
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    check(!['__proto__','constructor','prototype'].includes(key), 'Propriété interdite.');
    safeLibraryJson(child, depth + 1);
  }
}
const json = (files, name) => {
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(files.get(name)));
  safeLibraryJson(value); return value;
};
export function libraryMetadata(value) {
  check(value?.format === 'arena-forge-library' && value.version === 1, 'Format de bibliothèque inconnu.');
  check(typeof value.name === 'string' && value.name.trim().length >= 2 && value.name.length <= 100, 'Nom : 2 à 100 caractères.');
  check(typeof value.description === 'string' && value.description.length <= 5000, 'Description : 5 000 caractères maximum.');
  check(typeof value.release === 'string' && /^\d+\.\d+\.\d+$/.test(value.release), 'Version attendue : 1.0.0.');
  check(['adventure','characters','equipment','mixed','catalogue'].includes(value.kind), 'Type de bibliothèque inconnu.');
  check(value.cover === undefined || value.cover === COVER_PATH, 'Couverture attendue : cover.png à la racine du ZIP.');
  return { format: value.format, version: 1, name: value.name.trim(), description: value.description,
    release: value.release, kind: value.kind, ...(value.cover ? {cover: COVER_PATH} : {}) };
}
export async function readLibrary(input, inflate, limits = LIBRARY_LIMITS) {
  const files = await readContentZip(input, inflate, { limits,
    allowName: name => ['library.json','atelier.zip','catalogue.json',COVER_PATH].includes(name) || (/^assets\/[a-zA-Z0-9_./-]+\.(png|webp|jpg|json|swf|mp3|ogg)$/.test(name) && !name.split('/').some(p => p === '.' || p === '..')) });
  check(files.has('library.json'), 'Le ZIP doit contenir library.json. Exportez une bibliothèque depuis votre espace local.');
  const metadata = libraryMetadata(json(files, 'library.json'));
  check(!!metadata.cover === files.has(COVER_PATH), 'La couverture doit être déclarée dans library.json et présente dans le ZIP.');
  if (metadata.cover) inspectCover(files.get(COVER_PATH));
  const catalogue = files.has('catalogue.json') ? json(files, 'catalogue.json') : null;
  for (const name of files.keys()) if (name.startsWith('assets/') && name.endsWith('.json')) json(files,name);
  check(files.has('atelier.zip') || catalogue, 'La bibliothèque ne contient aucune création.');
  if (catalogue) {
    const keys = ['spellLibrary','monsterData','equipmentData','dungeonData','dungeonMaps','outdoorMaps','classData'];
    check(Object.keys(catalogue).every(k => keys.includes(k) || k === 'forging'), 'Champ de catalogue inconnu.');
    check(keys.every(k => catalogue[k] && typeof catalogue[k] === 'object'), 'Catalogue incomplet.');
    check(Array.isArray(catalogue.dungeonMaps) && Array.isArray(catalogue.outdoorMaps), 'Cartes invalides.');
    check(catalogue.spellLibrary.spells && catalogue.spellLibrary.classes && catalogue.classData.names && catalogue.classData.builds
      && catalogue.monsterData.monsters && Array.isArray(catalogue.monsterData.bosses)
      && catalogue.equipmentData.items && catalogue.equipmentData.caps && catalogue.equipmentData.types
      && catalogue.equipmentData.sets && Array.isArray(catalogue.dungeonData.encounters), 'Collections de catalogue invalides.');
    check(Object.keys(catalogue.classData.builds).length <= 200 && Object.keys(catalogue.monsterData.monsters).length <= 20000,
      'Catalogue trop grand.');
    if (catalogue.forging) {
      const f = catalogue.forging, integer = (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max;
      check(Object.keys(f).every(k => ['runes','potions','nonMageableIds'].includes(k))
        && ['runes','potions','nonMageableIds'].every(k => Array.isArray(f[k]) && f[k].length <= 3000), 'Réactifs du catalogue invalides.');
      const reagent = r => r && integer(r.id,1,2147483647) && typeof r.name === 'string' && r.name.length <= 120 && integer(r.gfx,0,1000000);
      check(f.runes.every(r => reagent(r) && r.type === 78 && typeof r.supported === 'boolean'
        && (!r.supported || (Object.hasOwn(statRules.stats,r.stat) && integer(r.power,1,1000))))
        && f.potions.every(p => reagent(p) && p.type === 26 && {feu:99,air:98,eau:96,terre:97}[p.element] === p.effect
          && {1:50,25:65,50:85}[p.level] === p.ratio)
        && f.nonMageableIds.every(id => integer(id,1,2147483647)), 'Réactifs du catalogue invalides.');
      for (const kind of ['runes','potions']) check(new Set(f[kind].map(r => r.id)).size === f[kind].length, 'Réactif dupliqué.');
    }
  }
  return { metadata, catalogue, files, atelier: files.get('atelier.zip') || null };
}
export function wrapLibrary(atelier, metadata, catalogue, cover) {
  const files = new Map([['library.json', JSON.stringify(libraryMetadata({ format: 'arena-forge-library', version: 1,
    release: '1.0.0', kind: 'mixed', description: '', ...metadata, ...(cover ? {cover:COVER_PATH} : {}) }))]]);
  if (cover) { inspectCover(cover); files.set(COVER_PATH,cover); }
  if (atelier) files.set('atelier.zip', atelier);
  if (catalogue) files.set('catalogue.json', JSON.stringify(catalogue));
  return writeContentZip(files);
}

export async function withLibraryCover(input, cover, inflate) {
  if (cover) inspectCover(cover);
  const parsed = await readLibrary(input, inflate, LOCAL_LIBRARY_LIMITS);
  const metadata={...parsed.metadata};
  if(cover){parsed.files.set(COVER_PATH, cover);metadata.cover=COVER_PATH;}
  else {parsed.files.delete(COVER_PATH);delete metadata.cover;}
  parsed.files.set('library.json', JSON.stringify(metadata));
  const bytes = writeContentZip(parsed.files);
  check(bytes.length <= LOCAL_LIBRARY_LIMITS.zipBytes, 'Le ZIP avec couverture dépasse 512 Mio.');
  return bytes;
}
