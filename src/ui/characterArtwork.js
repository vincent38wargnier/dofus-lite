import { useEffect, useState } from 'react';
import SPEC from './characterArtworkSpec.json';

export const CHARACTER_ARTWORK_SPEC = SPEC;
export const ARTWORK_TEMPLATE_BASE = `${process.env.PUBLIC_URL || ''}/templates/character-artwork`;
export const MAX_ARTWORK_FILE_BYTES = 2 * 1024 * 1024;
const MAX_PACK_BYTES = 12 * 1024 * 1024;
const signature = [137, 80, 78, 71, 13, 10, 26, 10];
let database;

export function validateArtworkFiles(files) {
  const names = files.map(file => file.name);
  if (new Set(names).size !== names.length) throw new Error('Chaque nom de fichier doit être unique.');
  for (const file of files) {
    if (!SPEC.files.some(entry => entry.name === file.name)) throw new Error(`Fichier inconnu : ${file.name}. Utilisez les noms du gabarit.`);
    if (!file.size || file.size > MAX_ARTWORK_FILE_BYTES) throw new Error(`${file.name} : maximum 2 Mio par PNG.`);
  }
  const missing = SPEC.files.filter(file => file.required && !names.includes(file.name));
  if (missing.length) throw new Error(`Images obligatoires manquantes : ${missing.map(file => file.name).join(', ')}.`);
  if (files.reduce((sum, file) => sum + file.size, 0) > MAX_PACK_BYTES) throw new Error('Maximum 12 Mio pour l’ensemble des images.');
}

export function validateArtworkPng(name, buffer) {
  const file = SPEC.files.find(entry => entry.name === name);
  const bytes = new Uint8Array(buffer);
  if (!file || bytes.length < 24 || !signature.every((byte, index) => bytes[index] === byte)
    || String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR') throw new Error(`${name} : PNG invalide.`);
  const view = new DataView(buffer);
  const width = view.getUint32(16), height = view.getUint32(20);
  if (width !== file.frames * SPEC.frameSize || height !== SPEC.frameSize) {
    throw new Error(`${name} : ${file.frames * SPEC.frameSize} × ${SPEC.frameSize} pixels requis (${width} × ${height} reçus).`);
  }
  return file;
}

export async function verifyArtworkPixels(file, definition) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const context = canvas.getContext('2d'); context.drawImage(img, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const frameSize = definition.frameSize || SPEC.frameSize;
    for (let frame = 0; frame < definition.frames; frame++) {
      let visible = false, transparent = false;
      for (let y = 0; y < frameSize; y++) for (let x = 0; x < frameSize; x++) {
        const alpha = pixels[(y * canvas.width + frame * frameSize + x) * 4 + 3];
        if (alpha) visible = true;
        if (!alpha) transparent = true;
      }
      if (!visible) throw new Error(`${file.name} : l’image ${frame + 1} est vide. Dessinez votre personnage avant d’importer le gabarit.`);
      if (definition.pose !== 'portrait' && !transparent) throw new Error(`${file.name} : exportez avec un fond transparent.`);
    }
  } finally { URL.revokeObjectURL(url); }
}

function openDatabase() {
  if (!database) database = new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error('Stockage des images indisponible dans ce navigateur.')); return; }
    const request = window.indexedDB.open('dofus-lite-character-artwork', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('artwork', { keyPath: 'id' });
    request.onerror = () => reject(new Error('Impossible d’ouvrir le stockage des images.'));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); database = null; };
      resolve(db);
    };
  }).catch(error => { database = null; throw error; });
  return database;
}

export async function importCharacterArtwork(inputFiles, name) {
  const files = Array.from(inputFiles);
  validateArtworkFiles(files);
  for (const file of files) await verifyArtworkPixels(file, validateArtworkPng(file.name, await file.arrayBuffer()));
  // An immutable key keeps previous combat/replay snapshots and duplicated
  // classes on their original artwork when another class imports new images.
  const id = window.crypto?.randomUUID?.() || `art-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const record = { id, version: SPEC.version, name, images: Object.fromEntries(files.map(file => [file.name, file])) };
  const db = await openDatabase();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('artwork', 'readwrite'); tx.objectStore('artwork').put(record);
    tx.oncomplete = resolve;
    tx.onabort = tx.onerror = () => reject(new Error('Sauvegarde des images impossible. Votre apparence précédente est conservée.'));
  });
  return id;
}

export async function readCharacterArtwork(id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction('artwork', 'readonly').objectStore('artwork').get(id);
    request.onerror = () => reject(new Error('Impossible de lire les images.'));
    request.onsuccess = () => request.result ? resolve(request.result) : reject(new Error('Images introuvables dans ce navigateur. Réimportez vos PNG.'));
  });
}

// A package is prepared entirely in memory first. One IndexedDB transaction
// writes its immutable assets; a failed creation save can remove this batch.
export async function writeArtworkRecords(records) {
  if (!records.length) return;
  const db = await openDatabase();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('artwork', 'readwrite');
    records.forEach(record => tx.objectStore('artwork').add(record));
    tx.oncomplete = resolve;
    tx.onabort = tx.onerror = () => reject(new Error('Impossible de sauvegarder les images du ZIP.'));
  });
}

export async function removeArtworkRecords(ids) {
  if (!ids.length) return;
  const db = await openDatabase();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('artwork', 'readwrite'); ids.forEach(id => tx.objectStore('artwork').delete(id));
    tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(new Error('Nettoyage des images impossible.'));
  });
}

export function useCharacterArtwork(id) {
  const [state, setState] = useState({ artwork: null, error: '' });
  useEffect(() => {
    let cancelled = false;
    const urls = [];
    setState(previous => !previous.artwork && !previous.error ? previous : { artwork: null, error: '' });
    if (id) readCharacterArtwork(id).then(record => {
      if (cancelled) return;
      const images = Object.fromEntries(Object.entries(record.images).map(([name, blob]) => {
        const url = URL.createObjectURL(blob); urls.push(url); return [name, url];
      }));
      setState({ artwork: { ...record, images }, error: '' });
    }).catch(error => { if (!cancelled) setState({ artwork: null, error: error.message }); });
    return () => { cancelled = true; urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [id]);
  return state.artwork?.id === id || !state.artwork ? state : { artwork: null, error: '' };
}

export function characterArtworkFrame(artwork, pose, suffix) {
  const action = pose === 'walk' || pose === 'run' ? 'walk' : pose === 'hit' ? 'hit' : pose?.startsWith('anim') || pose === 'cast' ? 'cast' : 'static';
  const direction = suffix === 'L' || suffix === 'B' ? 'L' : 'R';
  return SPEC.files.find(file => file.pose === action && file.direction === direction && artwork?.images[file.name])
    || SPEC.files.find(file => file.pose === 'static' && file.direction === direction);
}

export const CUSTOM_ARTWORK_ACTOR = {
  animations: ['static', 'walk', 'run', 'hit', ...Array.from({ length: 21 }, (_, i) => `anim${i}`)].flatMap(pose => ['R', 'L'].map(suffix => pose + suffix)),
  durations: Object.fromEntries(['hit', ...Array.from({ length: 21 }, (_, i) => `anim${i}`)]
    .flatMap(pose => ['R', 'L'].map(suffix => [pose + suffix, pose === 'hit' ? 350 : 600]))),
};
