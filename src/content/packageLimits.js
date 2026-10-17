// Keep ZIP infrastructure independent of gameplay modules. Local catalogues
// must hydrate before classes, items and spells are evaluated for the first time.
export const PACKAGE_LIMITS = { zipBytes: 32 * 1024 * 1024, expandedBytes: 48 * 1024 * 1024,
  jsonBytes: 512 * 1024, pngBytes: 2 * 1024 * 1024, files: 180, spells: 10, monsters: 8 };
