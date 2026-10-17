/* global globalThis */
import { readLibrary, libraryMetadata, LOCAL_LIBRARY_LIMITS } from './libraryFormat';
import { writeContentZip } from '../content/zip';
import { listLocalLibraries } from './localLibraries';
import { COVER_PATH, inspectCover } from './libraryCover';
export async function exportLibrary(atelier, metadata, cover) {
  const files=new Map([['library.json',JSON.stringify(libraryMetadata({format:'arena-forge-library',version:1,
    release:'1.0.0',kind:'mixed',description:'',...metadata,...(cover?{cover:COVER_PATH}:{})}))],['atelier.zip',atelier]]);
  if (cover) { inspectCover(cover); files.set(COVER_PATH,cover); }
  const installed=await listLocalLibraries();
  if(installed.some(entry=>entry.catalogue)) {
    const catalogue=Object.fromEntries(Object.entries(globalThis.__ARENA_CATALOGUE__).filter(([k])=>k!=='forgemagieData'));
    const rules=globalThis.__ARENA_CATALOGUE__.forgemagieData;
    catalogue.forging={runes:rules.runes,potions:rules.potions,nonMageableIds:rules.nonMageableIds};
    files.set('catalogue.json',JSON.stringify(catalogue));
  }
  for(const entry of installed) {
    const parsed=await readLibrary(entry.bytes, undefined, LOCAL_LIBRARY_LIMITS);
    for(const [name,bytes] of parsed.files) if(name.startsWith('assets/'))files.set(name,bytes);
  }
  const bytes = writeContentZip(files);
  if(bytes.length>LOCAL_LIBRARY_LIMITS.zipBytes)throw new Error('Bibliothèque trop grande (512 Mio maximum en local). Exportez une sélection plus petite depuis l’Atelier.');
  return bytes;
}
