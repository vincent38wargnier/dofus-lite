export const libraryPlayRoute = library => `workspace/play/${encodeURIComponent(library.id)}`;
export const PLAY_ENTRY_STORAGE = 'arena-forge:last-play-entry';
// Clicking Play updates lastOpenedAt. A reload keeps the same stamp, so it
// resumes the player's edits instead of selecting the packaged encounter again.
export const libraryPlayStamp = library => JSON.stringify([library.id, library.lastOpenedAt || library.installedAt || '']);

// A publication version is the hash of its ZIP. Names are not identities:
// two authors may publish worlds with the same name.
export const installedLibraryFor = (library, installed) =>
  installed.find(entry => entry.id === library.sha256) || null;

export function libraryCreations(library, creations) {
  const owns = (kind, entry) => library.imported?.[kind]?.includes(entry.id);
  return {
    dungeons: creations.dungeons.filter(entry => owns('dungeons', entry)),
    characters: creations.characters.filter(entry => owns('characters', entry)),
  };
}

export function selectionForDungeon(dungeon) {
  return { id: `library-dungeon:${dungeon.id}`, tab: 'dungeons', entry: dungeon, returnTo: 'play', openDialog: true };
}

export function selectionForCatalogue(library) {
  const room = library.catalogue?.dungeonData?.encounters?.[0];
  return { id: `library-catalogue:${library.id}`, tab: 'combat', returnTo: 'play', openDialog: true,
    mode: room ? 'boss' : 'duel', customDungeonId: null, bossId: room?.bossIds?.[0],
    initialPanel: room ? 'dungeons' : 'overview' };
}

export const canPlayLibrary = library => library.kind === 'catalogue' || library.counts?.dungeons > 0
  || (!library.counts && ['adventure', 'mixed'].includes(library.kind));

export const recentLibraries = libraries => [...libraries].sort((a, b) =>
  String(b.lastOpenedAt || b.installedAt || '').localeCompare(String(a.lastOpenedAt || a.installedAt || '')));
