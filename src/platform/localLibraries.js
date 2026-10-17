/* global globalThis */
import empty from './emptyCatalogue';
import { inspectCover } from './libraryCover';
import { readLibrary, LOCAL_LIBRARY_LIMITS } from './libraryFormat';
const DB = 'arena-forge-libraries';
function database() { return new Promise((resolve, reject) => {
  const request = indexedDB.open(DB, 1);
  request.onupgradeneeded = () => request.result.createObjectStore('libraries', { keyPath: 'id' });
  request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
}); }
async function transaction(mode, fn) {
  const db = await database();
  return new Promise((resolve, reject) => { const tx = db.transaction('libraries', mode), request = fn(tx.objectStore('libraries'));
    tx.oncomplete = () => { db.close(); resolve(request?.result); };
    tx.onerror = () => { db.close(); reject(tx.error); }; tx.onabort = tx.onerror;
  });
}
export const listLocalLibraries = () => transaction('readonly', store => store.getAll());
export const saveLocalLibrary = entry => transaction('readwrite', store => store.put(entry));
export const deleteLocalLibrary = id => transaction('readwrite', store => store.delete(id));
async function cacheMedia(library, onProgress) {
  const assets = [...library.files].filter(([name]) => name.startsWith('assets/'));
  if (!assets.length) return async () => {};
  if (!('serviceWorker' in navigator)) throw new Error('Ce navigateur ne peut pas installer les médias de cette bibliothèque.');
  await navigator.serviceWorker.register('/library-assets-sw.js');
  await navigator.serviceWorker.ready;
  const cache = await caches.open('arena-forge-user-media-v1');
  for (const [name, bytes] of assets) {
    const pathname = '/dofus-local/' + name.slice(7);
    const previous = await cache.match(pathname);
    if (previous) {
      const a = new Uint8Array(await previous.arrayBuffer());
      if (a.length !== bytes.length || a.some((n,i) => n !== bytes[i])) throw new Error(`Média en conflit : ${name}. Import annulé.`);
    }
  }
  const added=[];
  try {
    let completed = 0;
    for (const [name, bytes] of assets) {
      const pathname = '/dofus-local/' + name.slice(7);
      if (await cache.match(pathname)) { completed++; continue; }
      const mime = {png:'image/png',webp:'image/webp',jpg:'image/jpeg',json:'application/json',swf:'application/x-shockwave-flash',mp3:'audio/mpeg',ogg:'audio/ogg'}[name.split('.').pop()];
      await cache.put(pathname,new Response(bytes,{headers:{'Content-Type':mime,'X-Content-Type-Options':'nosniff'}}));added.push(pathname);
      completed++;
      if (completed % 100 === 0 || completed === assets.length) onProgress?.(`Installation des médias : ${completed.toLocaleString('fr-FR')} / ${assets.length.toLocaleString('fr-FR')}`);
    }
  } catch(error) { await Promise.all(added.map(name=>cache.delete(name))); throw error; }
  return () => Promise.all(added.map(name=>cache.delete(name)));
}
export function mergeCatalogues(entries) {
  const result = JSON.parse(JSON.stringify(empty));
  const canonical = value => JSON.stringify(value, function(key, v) { return v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k,v[k]])) : v; });
  const tables = new Set(['.spellLibrary.spells','.spellLibrary.classes','.spellLibrary.summons','.monsterData.monsters',
    '.equipmentData.items','.equipmentData.sets','.equipmentData.caps','.classData.names','.classData.builds','.classData.metadata']);
  const merge = (target, source, path = '') => {
    for (const [key, value] of Object.entries(source)) {
      if (key === 'version' || key === 'clientSources' || key === 'source' || key === 'forging') continue;
      if (tables.has(path)) {
        if (target[key] !== undefined && canonical(target[key]) !== canonical(value)) throw new Error(`Identifiant en conflit : ${path}.${key}. Import annulé.`);
        target[key] = value;
      } else if (Array.isArray(value)) {
        if (['outdoorMaps','dungeonMaps','encounters'].includes(key)) {
          const ids = new Map((target[key] || []).map(x => [x.id,x]));
          if (value.some(x => ids.has(x.id) && canonical(ids.get(x.id)) !== canonical(x))) throw new Error(`Deux bibliothèques définissent la même carte ou salle (${key}).`);
          target[key] = [...ids.values(), ...value.filter(x => !ids.has(x.id))];
        }
        else target[key] = [...new Set([...(target[key] || []), ...value])];
      } else if (value && typeof value === 'object' && target[key] && typeof target[key] === 'object') merge(target[key], value, `${path}.${key}`);
      else if (path === '.equipmentData.types') target[key] = value;
      else if (target[key] !== undefined && JSON.stringify(target[key]) !== JSON.stringify(value) && !['CREATOR'].includes(key)) {
        throw new Error(`Identifiant en conflit : ${path}.${key}. Import annulé.`);
      } else target[key] = value;
    }
  };
  for (const entry of entries) if (entry.catalogue) {
    merge(result, entry.catalogue);
    if (entry.catalogue.forging) {
      for (const kind of ['runes','potions']) {
        const refs = new Map(result.forgemagieData[kind].map(r => [r.id,r]));
        for (const r of entry.catalogue.forging[kind]) {
          if(refs.has(r.id) && canonical(refs.get(r.id)) !== canonical(r))throw new Error('Réactif en conflit. Import annulé.');
          refs.set(r.id,r);
        }
        // Catalogue reagents take display priority over generic construction
        // reagents with the same stat/power; retain generic IDs for old FM logs.
        const importedIds = new Set(entry.catalogue.forging[kind].map(r => r.id));
        result.forgemagieData[kind] = [...entry.catalogue.forging[kind], ...[...refs.values()].filter(r => !importedIds.has(r.id))];
      }
      result.forgemagieData.nonMageableIds = [...new Set([...result.forgemagieData.nonMageableIds,...entry.catalogue.forging.nonMageableIds])];
    }
  }
  return result;
}
export async function stageLibrary(file, onProgress, cover) {
  if (cover) inspectCover(cover);
  if (file.size > LOCAL_LIBRARY_LIMITS.zipBytes) throw new Error('Import local : 512 Mio maximum.');
  // Ask the browser to protect installed worlds from automatic storage eviction.
  // A refusal leaves normal IndexedDB/Cache Storage saving available.
  if (navigator.storage?.persist) {
    try { await navigator.storage.persist(); } catch (_) { /* Best effort. */ }
  }
  onProgress?.('Lecture de la bibliothèque…');
  const bytes = new Uint8Array(await file.arrayBuffer()), parsed = await readLibrary(bytes, undefined, LOCAL_LIBRARY_LIMITS), entries = await listLocalLibraries();
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2,'0')).join('');
  if (entries.some(e => e.id === hash)) throw new Error('Cette version est déjà installée.');
  const entry = { id: hash, ...parsed.metadata, coverBytes: cover || (parsed.metadata.cover ? parsed.files.get(parsed.metadata.cover) : null), catalogue: parsed.catalogue, bytes, pending: !!parsed.atelier, hasMedia: [...parsed.files.keys()].some(n=>n.startsWith('assets/')), installedAt: new Date().toISOString() };
  mergeCatalogues([...entries, entry]);
  onProgress?.('Vérification des données de jeu…');
  await new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./validation.worker.js', import.meta.url));
    const stop = (error) => { clearTimeout(timer); worker.terminate(); error ? reject(error) : resolve(); };
    const timer = setTimeout(() => stop(new Error('Validation trop longue. Import annulé.')), 120000);
    worker.onmessage = event => stop(event.data.error ? new Error(event.data.error) : null);
    worker.onerror = () => stop(new Error('Le validateur de bibliothèque a échoué.'));
    worker.postMessage({ bytes, existing: entries.map(e => ({ catalogue: e.catalogue })) });
  });
  onProgress?.('Préparation des images et animations…');
  const rollback = await cacheMedia(parsed, onProgress);
  onProgress?.('Enregistrement dans ce navigateur…');
  try { await saveLocalLibrary(entry); } catch(error) { await rollback(); throw error; }
  return entry;
}
export async function initializeLibraries() {
  const entries = await listLocalLibraries();
  globalThis.__ARENA_CATALOGUE__ = mergeCatalogues(entries);
  globalThis.__ARENA_NATIVE_ASSETS__ = entries.some(entry => entry.hasMedia);
  // Older catalogues include actors that have no exported static portrait.
  // Read the installed files instead of requesting those missing images.
  if (globalThis.__ARENA_NATIVE_ASSETS__ && typeof caches !== 'undefined') {
    try {
      const cache = await caches.open('arena-forge-user-media-v1');
      globalThis.__ARENA_NATIVE_PORTRAITS__ = new Set((await cache.keys()).flatMap(request => {
        const match = new URL(request.url).pathname.match(/^\/dofus-local\/portraits\/(\d+)\.png$/);
        return match ? [match[1]] : [];
      }));
    } catch (_) { /* A transient cache failure keeps the usual image fallback. */ }
  }
  return entries;
}
