import { crc32, readContentZip } from '../content/zip';
import { compileContentManifest, expectedPackageFiles, validateContentManifest } from '../content/contentPackage';
import { PACKAGE_LIMITS } from '../content/packageSchema';
import { newCreationId } from './creationsStore';
import { CHARACTER_ARTWORK_SPEC as SPEC, validateArtworkFiles, validateArtworkPng, verifyArtworkPixels,
  writeArtworkRecords, removeArtworkRecords } from './characterArtwork';

function pngHeader(path, bytes) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 33 || !signature.every((byte, i) => bytes[i] === byte)
    || String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR' || bytes[24] !== 8 || bytes[25] !== 6
    || bytes[26] !== 0 || bytes[27] !== 0 || bytes[28] !== 0) throw new Error(`${path} : PNG RGBA 8 bits, non entrelacé requis.`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(8) !== 13) throw new Error(`${path} : en-tête PNG invalide.`);
  let offset = 8, ended = false;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset), end = offset + 12 + length;
    if (end > bytes.length) throw new Error(`${path} : PNG tronqué.`);
    const kind = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
    if (['acTL', 'fcTL', 'fdAT'].includes(kind)) throw new Error(`${path} : APNG non accepté, utilisez des bandes horizontales.`);
    if (crc32(bytes.subarray(offset + 4, offset + 8 + length)) !== view.getUint32(end - 4)) throw new Error(`${path} : PNG corrompu (CRC).`);
    offset = end;
    if (kind === 'IEND') { ended = true; break; }
  }
  if (!ended || offset !== bytes.length) throw new Error(`${path} : fin PNG invalide.`);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

export async function prepareContentFiles(files, { verifyPixels = verifyArtworkPixels, newId = newCreationId } = {}) {
  if (!files.has('content.json')) throw new Error('content.json est requis à la racine du ZIP. Les anciens fichiers class.json du kit de conception doivent être convertis au format du prompt de l’Atelier.');
  let manifest;
  try { manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(files.get('content.json'))); }
  catch (_) { throw new Error('content.json : JSON UTF-8 invalide.'); }
  const report = validateContentManifest(manifest);
  if (report.errors.length) throw new Error(report.errors.slice(0, 30).join('\n') + (report.errors.length > 30 ? '\n… Corrigez ces erreurs avant de continuer.' : ''));
  const expected = expectedPackageFiles(manifest);
  for (const path of expected.required) if (!files.has(path)) throw new Error(`Fichier requis absent : ${path}.`);
  for (const path of files.keys()) if (!expected.required.has(path) && !expected.optional.has(path)) throw new Error(`Fichier non déclaré : ${path}.`);
  const owners = manifest.type === 'class' ? [manifest.class] : manifest.dungeon.monsters;
  const folders = [...new Set(owners.map(owner => owner.artwork).filter(Boolean))];
  const records = [], artworkIds = {};
  for (const folder of folders) {
    const images = [...files].filter(([path]) => path.startsWith(`${folder}/`)).map(([path, bytes]) => {
      pngHeader(path, bytes);
      return new File([bytes], path.slice(folder.length + 1), { type: 'image/png' });
    });
    validateArtworkFiles(images);
    for (const image of images) await verifyPixels(image, validateArtworkPng(image.name, await image.arrayBuffer()));
    const id = newId(); artworkIds[folder] = id;
    records.push({ id, version: SPEC.version, name: `${manifest.name} / ${folder}`, images: Object.fromEntries(images.map(file => [file.name, file])) });
  }
  const icons = [...files].filter(([path]) => path.startsWith('icons/'));
  let iconArtworkId;
  if (icons.length) {
    const images = {};
    for (const [path, bytes] of icons) {
      const { width, height } = pngHeader(path, bytes);
      if (width !== 64 || height !== 64) throw new Error(`${path} : icône de 64 × 64 pixels requise.`);
      const file = new File([bytes], path, { type: 'image/png' });
      await verifyPixels(file, { frames: 1, frameSize: 64, pose: 'portrait' }); images[path] = file;
    }
    iconArtworkId = newId(); records.push({ id: iconArtworkId, version: 1, name: `${manifest.name} / icônes`, images });
  }
  return { ...compileContentManifest(manifest, { newId, artworkIds, iconArtworkId }), records, manifest };
}

export async function importContentFile(file, commit, dependencies = {}) {
  if (!file || file.size > PACKAGE_LIMITS.zipBytes) throw new Error('Choisissez un ZIP de 32 Mio maximum.');
  const files = await (dependencies.readZip || readContentZip)(await file.arrayBuffer());
  const prepared = await (dependencies.prepare || prepareContentFiles)(files);
  const write = dependencies.write || writeArtworkRecords, remove = dependencies.remove || removeArtworkRecords;
  await write(prepared.records);
  try {
    commit(previous => ({ ...previous, [prepared.tab]: [...previous[prepared.tab], prepared.entry] }));
  } catch (error) {
    await remove(prepared.records.map(record => record.id)).catch(() => {});
    throw new Error(`Import non enregistré. ${error.message}`);
  }
  return prepared;
}
