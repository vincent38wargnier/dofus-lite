import { readContentZip, writeContentZip } from '../content/zip';
import { PACKAGE_LIMITS } from '../content/packageSchema';
import { customEquipmentShape, customEquipmentItem, newEquipmentId, validateCustomEquipment } from '../engine/customEquipment';
import { resolveLoadout } from '../engine/equipment';
import { customDungeonErrors } from '../engine/customDungeons';
import { parseCharacterShape } from '../visuals/customShapes';
import { cloneCreation, newCreationId, validCreations } from './creationsStore';
import { CHARACTER_ARTWORK_SPEC as SPEC, readCharacterArtwork, writeArtworkRecords, removeArtworkRecords,
  validateArtworkFiles, validateArtworkPng, verifyArtworkPixels } from './characterArtwork';
import { pngHeader, prepareContentFiles } from './contentPackageImport';

export const ATELIER_LIMITS = { zipBytes: 128 * 1048576, expandedBytes: 160 * 1048576,
  jsonBytes: 8 * 1048576, pngBytes: 2 * 1048576, files: 4096, creations: 200 };
const check = (ok, message) => { if (!ok) throw new Error(message); };
const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
const idPattern = /^[a-zA-Z0-9_-]{1,100}$/;
const iconPattern = /^icons\/[a-z][a-z0-9_-]*\.png$/;
const assetPath = /^assets\/a\d+\/[a-z][a-z0-9_-]*\.png$/;
const archivePath = name => name === 'atelier.json' || name === 'content.json' || name === 'class.json'
  || /^assets\/(?:a\d+\/)?(?:[a-z][a-z0-9_-]*\.png)?$/.test(name)
  || /^icons\/(?:[a-z][a-z0-9_-]*\.png)?$/.test(name)
  || /^artwork\/(?:[a-z][a-z0-9_-]*\/)?(?:[a-z][a-z0-9_-]*\.png)?$/.test(name);
export const atelierCount = value => ['characters', 'dungeons', 'equipment'].reduce((n, key) => n + (value[key]?.length || 0), 0);
export const atelierCounts = value => [
  value.characters?.length && `${value.characters.length} classe${value.characters.length > 1 ? 's' : ''}`,
  value.dungeons?.length && `${value.dungeons.length} donjon${value.dungeons.length > 1 ? 's' : ''}`,
  value.equipment?.length && `${value.equipment.length} équipement${value.equipment.length > 1 ? 's' : ''}`,
].filter(Boolean).join(' · ');

// Both top-level classes and characters embedded in rooms own full loadouts.
const archiveCharacters = content => [...content.characters,
  ...content.dungeons.flatMap(dungeon => dungeon.members.flatMap(member => member.character ? [member.character] : []))];

// Visit only engine-owned image fields; never treat arbitrary metadata as a URL.
function artworkReferences(content, change = id => id) {
  const references = new Map();
  const use = (owner, field, icon) => {
    const id = owner?.[field];
    if (!id || (field === 'artworkId' && parseCharacterShape(id))) return;
    check(typeof id === 'string' && idPattern.test(id), 'Identifiant d’image invalide.');
    if (field === 'iconArtworkId') check(typeof icon === 'string' && iconPattern.test(icon), 'Chemin d’icône de sort invalide.');
    if (!references.has(id)) references.set(id, { character: false, icons: new Set() });
    const ref = references.get(id);
    if (field === 'artworkId') ref.character = true; else ref.icons.add(icon);
    owner[field] = change(id);
  };
  const spells = list => (list || []).forEach(spell => {
    check(!spell.iconFile || spell.iconArtworkId, `${spell.name} : images de l’icône absentes.`);
    use(spell, 'iconArtworkId', spell.iconFile);
  });
  archiveCharacters(content).forEach(character => { use(character.loadout, 'artworkId'); spells(character.loadout.spells?.custom); });
  content.dungeons.forEach(dungeon => dungeon.members.forEach(member => {
    if (member.customMonster) { use(member.customMonster, 'artworkId'); spells(member.customMonster.spells); }
  }));
  return references;
}

function safeJson(value, depth = 0) {
  check(depth <= 32, 'Archive : structure trop imbriquée.');
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    check(!['__proto__', 'constructor', 'prototype'].includes(key), 'Archive : propriété interdite.');
    safeJson(child, depth + 1);
  }
}

function validateContent(content) {
  safeJson(content);
  check(record(content) && ['characters', 'dungeons', 'equipment'].every(key => Array.isArray(content[key])), 'Archive Atelier : collections invalides.');
  check(atelierCount(content) > 0 && atelierCount(content) <= ATELIER_LIMITS.creations, 'Sélectionnez de 1 à 200 créations par ZIP.');
  check(validCreations({ version: 1, characters: content.characters, dungeons: content.dungeons }), 'Une classe ou un donjon est illisible, ou référence un monstre / terrain inconnu.');
  const definitions = [...content.equipment, ...archiveCharacters(content).flatMap(c => Object.values(c.loadout.customEquipment || {}))];
  check(definitions.every(item => customEquipmentShape(item) && customEquipmentItem(item)), 'Définition ou référence d’équipement inconnue.');
  check(new Set(content.equipment.map(item => item.id)).size === content.equipment.length, 'Équipement présent plusieurs fois.');
  check([...content.characters, ...content.dungeons].every(entry => entry.name.length <= 200), 'Nom de création trop long.');
  artworkReferences(content);
}

function draftWarnings(content) {
  const warnings = [];
  for (const character of archiveCharacters(content)) {
    const errors = resolveLoadout(character.classId, character.loadout).errors;
    if (!character.name.trim() || errors.length) warnings.push(`${character.name || 'Classe sans nom'} : brouillon à ajuster avant de jouer${errors.length ? ` (${errors.slice(0, 2).join(' ')})` : '.'}`);
  }
  for (const dungeon of content.dungeons) if (customDungeonErrors(dungeon).length) warnings.push(`${dungeon.name || 'Donjon sans nom'} : brouillon à compléter avant de jouer.`);
  for (const item of content.equipment) if (!validateCustomEquipment(item).valid) warnings.push(`${item.name || 'Équipement sans nom'} : brouillon à ajuster avant de l’équiper.`);
  return warnings;
}

// This is a lossless Atelier backup, distinct from the restricted AI authoring
// contract. Unfinished drafts remain editable; existing combat guards still apply.
export async function buildAtelierArchive(selection, { readArtwork = readCharacterArtwork } = {}) {
  const content = cloneCreation({ characters: selection.characters || [], dungeons: selection.dungeons || [], equipment: selection.equipment || [] });
  validateContent(content);
  const references = artworkReferences(content), files = new Map(), artwork = [];
  for (const [id, ref] of references) {
    const saved = await readArtwork(id);
    const images = {};
    const names = [...new Set([...ref.icons, ...(ref.character ? SPEC.files.filter(file => saved.images[file.name]).map(file => file.name) : [])])];
    if (ref.character) check(SPEC.files.filter(file => file.required).every(file => saved.images[file.name]), 'Apparence incomplète : réimportez ses PNG avant l’export.');
    for (const name of names) {
      check(saved.images[name], `Image manquante : ${name}. Réimportez-la avant l’export.`);
      const path = `assets/a${artwork.length}/${name.replace('icons/', 'icon-')}`;
      const bytes = new Uint8Array(await saved.images[name].arrayBuffer());
      check(bytes.length <= ATELIER_LIMITS.pngBytes, `${name} : maximum 2 Mio par image.`);
      files.set(path, bytes); images[name] = path;
    }
    artwork.push({ id, name: saved.name || 'Images', images });
  }
  const manifest = { format: 'dofus-lite-atelier', version: 1, ...content, artwork };
  const json = JSON.stringify(manifest, null, 2);
  check(new TextEncoder().encode(json).length <= ATELIER_LIMITS.jsonBytes, 'Trop de données pour un seul ZIP. Réduisez la sélection.');
  files.set('atelier.json', json);
  check(files.size <= ATELIER_LIMITS.files, 'Trop d’images pour un seul ZIP. Réduisez la sélection.');
  const bytes = writeContentZip(files);
  check(bytes.length <= ATELIER_LIMITS.zipBytes, 'Le ZIP dépasse 128 Mio. Exportez moins de créations à la fois.');
  return { bytes, manifest, warnings: draftWarnings(content) };
}

export async function prepareAtelierFiles(files, { newId = newCreationId, equipmentId = newEquipmentId, verifyPixels = verifyArtworkPixels } = {}) {
  let manifest;
  try { manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(files.get('atelier.json'))); }
  catch (_) { throw new Error('atelier.json : JSON UTF-8 invalide.'); }
  check(manifest?.format === 'dofus-lite-atelier' && manifest.version === 1, 'Version d’archive Atelier non prise en charge.');
  check(Object.keys(manifest).every(key => ['format', 'version', 'characters', 'dungeons', 'equipment', 'artwork'].includes(key)), 'Archive Atelier : champ inconnu.');
  validateContent(manifest);
  check(Array.isArray(manifest.artwork), 'Archive : liste d’images absente.');
  const references = artworkReferences(manifest), records = [], remappedArt = new Map(), declared = new Set(['atelier.json']);
  check(manifest.artwork.length === references.size, 'Images non déclarées ou manquantes.');
  for (const asset of manifest.artwork) {
    check(record(asset) && references.has(asset.id) && !remappedArt.has(asset.id) && record(asset.images), 'Lot d’images invalide ou dupliqué.');
    const ref = references.get(asset.id), images = {};
    const required = new Set([...ref.icons, ...(ref.character ? SPEC.files.filter(file => file.required).map(file => file.name) : [])]);
    for (const name of required) check(asset.images[name], `Image requise absente : ${name}.`);
    for (const [name, path] of Object.entries(asset.images)) {
      const spec = ref.character && SPEC.files.find(file => file.name === name);
      check(spec || ref.icons.has(name), `Image non utilisée : ${name}.`);
      check(typeof path === 'string' && assetPath.test(path) && !declared.has(path) && files.has(path), `Image absente ou chemin invalide : ${path}.`);
      declared.add(path);
      const bytes = files.get(path), size = pngHeader(path, bytes, { strict: false });
      const file = new File([bytes], name, { type: 'image/png' });
      if (spec) await verifyPixels(file, validateArtworkPng(name, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)));
      else {
        check(size.width === 64 && size.height === 64, `${name} : icône 64 × 64 requise.`);
        await verifyPixels(file, { frames: 1, frameSize: 64, pose: 'portrait' });
      }
      images[name] = file;
    }
    if (ref.character) validateArtworkFiles(Object.entries(images).filter(([name]) => !iconPattern.test(name)).map(([, image]) => image));
    const id = newId(); remappedArt.set(asset.id, id);
    records.push({ id, name: String(asset.name || 'Images').slice(0, 200), version: SPEC.version, images });
  }
  for (const path of files.keys()) check(declared.has(path), `Fichier non déclaré : ${path}.`);
  const content = { characters: manifest.characters, dungeons: manifest.dungeons, equipment: manifest.equipment };
  artworkReferences(content, id => remappedArt.get(id));
  content.characters.forEach(entry => { entry.id = newId(); });
  content.dungeons.forEach(entry => { entry.id = newId(); });
  // Preserve immutable equipped versions even when a newer library item differs.
  const equipmentIds = new Map(), used = new Set();
  const canonical = value => !record(value) ? value : Object.fromEntries(Object.keys(value).sort().map(key => [key,
    Array.isArray(value[key]) ? value[key].map(canonical) : canonical(value[key])]));
  const remapItem = item => {
    const key = JSON.stringify(canonical(item));
    if (!equipmentIds.has(key)) { let id = equipmentId(); while (used.has(id)) id++; used.add(id); equipmentIds.set(key, id); }
    return { ...item, id: equipmentIds.get(key) };
  };
  content.equipment = content.equipment.map(remapItem);
  for (const { loadout } of archiveCharacters(content)) if (loadout.customEquipment) {
    const defs = {}, ids = new Map();
    Object.values(loadout.customEquipment).forEach(item => { const next = remapItem(item); defs[next.id] = next; ids.set(item.id, next.id); });
    loadout.customEquipment = defs;
    loadout.slots = Object.fromEntries(Object.entries(loadout.slots).map(([slot, id]) => [slot, ids.get(id) || id]));
  }
  validateContent(content);
  return { ...content, records, warnings: draftWarnings(content) };
}

export async function prepareWorkshopFile(file, dependencies = {}) {
  check(file && file.size <= ATELIER_LIMITS.zipBytes, 'Choisissez un ZIP de 128 Mio maximum.');
  const bytes = await file.arrayBuffer();
  const files = await readContentZip(bytes, undefined, { limits: ATELIER_LIMITS, allowName: archivePath });
  if (files.has('atelier.json')) return prepareAtelierFiles(files, dependencies);
  // Preserve the stricter limits and validation of AI-authored content packages.
  check(file.size <= PACKAGE_LIMITS.zipBytes, 'Les ZIP de création IA sont limités à 32 Mio.');
  const legacy = await prepareContentFiles(await readContentZip(bytes), dependencies);
  return { characters: [], dungeons: [], equipment: [], ...{ [legacy.tab]: [legacy.entry] }, records: legacy.records, warnings: legacy.warnings };
}

export async function importWorkshopFile(file, { commitCreations, importEquipment }, dependencies = {}) {
  const prepared = await (dependencies.prepare || prepareWorkshopFile)(file);
  const write = dependencies.write || writeArtworkRecords, remove = dependencies.remove || removeArtworkRecords;
  await write(prepared.records);
  try {
    const saveItems = () => { if (prepared.equipment.length) importEquipment(prepared.equipment); };
    if (prepared.characters.length || prepared.dungeons.length) commitCreations(previous => ({ ...previous,
      characters: [...previous.characters, ...prepared.characters], dungeons: [...previous.dungeons, ...prepared.dungeons] }), saveItems);
    else saveItems();
  } catch (error) {
    await remove(prepared.records.map(record => record.id)).catch(() => {});
    throw new Error(`Import non enregistré. ${error.message}`);
  }
  return prepared;
}

export function downloadAtelierArchive(bytes, name) {
  const filename = String(name || 'mes-creations').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '').slice(0, 90) || 'mes-creations';
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' })), link = document.createElement('a');
  link.href = url; link.download = `${filename}.zip`; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
