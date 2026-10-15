import { buildAtelierArchive, prepareAtelierFiles } from '../ui/atelierArchive';
import { readContentZip } from '../content/zip';
import { installSessionArtwork } from '../ui/characterArtwork';
import { customDungeonErrors } from '../engine/customDungeons';
import { MAP_ART_MAX_BYTES } from '../engine/customMaps';
import { base64, unbase64, check } from './p2p';

export const PEER_PACKAGE_LIMITS = { zipBytes: 32 * 1048576, expandedBytes: 36 * 1048576,
  jsonBytes: 2 * 1048576, pngBytes: MAP_ART_MAX_BYTES, files: 240 };
export const MAX_ROOM_ARCHIVE_CHARS = Math.ceil(PEER_PACKAGE_LIMITS.zipBytes * 4 / 3);
const safePath = path => path === 'atelier.json' || /^assets\/a\d+\/[a-z][a-z0-9_-]*\.png$/.test(path);

export function peerMember(entry) {
  if (entry.character || entry.customMonster) return { ...entry, count: 1 };
  if (entry.kind === 'character' || entry.classId) return { character: { name: entry.name, classId: entry.classId, className: entry.className, loadout: entry.loadout }, count: 1 };
  return { monsterId: entry.monsterId, grade: entry.grade || entry.monsterGrade, count: 1 };
}
export async function packPeerUnit(entry, battlefield) {
  const dungeon = { id: 'unit', name: 'Combattant partagé', mapId: battlefield?.id || 'arene',
    ...(battlefield ? { battlefield } : {}), members: [peerMember(entry)] };
  const errors = customDungeonErrors(dungeon); check(!errors.length, errors.join(' '));
  const { bytes } = await buildAtelierArchive({ dungeons: [dungeon] });
  check(bytes.length <= PEER_PACKAGE_LIMITS.zipBytes, 'Les images partagées dépassent 32 Mio. Réduisez leur poids.');
  return base64(bytes);
}
export async function unpackPeerUnit(encoded, unitId, dependencies = {}) {
  check(typeof encoded === 'string' && encoded.length <= MAX_ROOM_ARCHIVE_CHARS, 'Combattant partagé trop volumineux.');
  check(/^u\d{1,5}$/.test(unitId), 'Identifiant du combattant invalide.');
  const files = await readContentZip(unbase64(encoded), undefined, { limits: PEER_PACKAGE_LIMITS, allowName: safePath });
  // Host assigns namespaces; no saved profile or persistent library is changed.
  let id = 0, item = 8000000000 + Number(unitId.slice(1)) * 1000;
  const content = await prepareAtelierFiles(files, { ...dependencies, newId: () => `p2p-${unitId}-${++id}`, equipmentId: () => ++item });
  check(content.characters.length === 0 && content.equipment.length === 0 && content.dungeons.length === 1
    && content.dungeons[0].members.length === 1 && content.dungeons[0].members[0].count === 1, 'Le partage doit contenir exactement un combattant.');
  const errors = customDungeonErrors(content.dungeons[0]); check(!errors.length, errors.join(' '));
  return { member: content.dungeons[0].members[0], records: content.records,
    ...(content.dungeons[0].battlefield ? { battlefield: content.dungeons[0].battlefield } : {}) };
}
export const stagePeerContent = content => installSessionArtwork(content.records);
