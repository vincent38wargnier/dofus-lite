export const STANDARD_ENEMIES = 8;
export const ARMY_ENEMIES = 32;
export const isArmy = encounter => encounter?.version === 1 && encounter.mode === 'army';
export const encounterCapacity = (encounter, team = 'B') => isArmy(encounter) && team === 'B' ? ARMY_ENEMIES : STANDARD_ENEMIES;
export const dungeonCapacity = dungeon => encounterCapacity(dungeon?.encounter);

// The archive references a member row. The engine uses a fighter ID, derived
// after quantities are expanded. A commander is always one distinct fighter.
export function validDungeonEncounter(dungeon) {
  const e = dungeon?.encounter;
  if (e == null) return true;
  return isArmy(e) && Object.keys(e).every(k => ['version', 'mode', 'commander'].includes(k))
    && (e.commander == null || (Number.isSafeInteger(e.commander) && e.commander >= 0
      && dungeon.members?.[e.commander]?.count === 1));
}
export function dungeonEncounter(dungeon) {
  if (!dungeon?.encounter) return undefined;
  if (!validDungeonEncounter(dungeon)) throw new Error('Commandant ou mode armée invalide.');
  const index = dungeon.encounter.commander == null ? null : dungeon.members.slice(0, dungeon.encounter.commander).reduce((n, m) => n + m.count, 0);
  return { version: 1, mode: 'army', ...(index == null ? {} : { commanderId: index ? `B${index + 1}` : 'B' }) };
}
export function validCombatEncounter(e) {
  return e == null || (isArmy(e) && Object.keys(e).every(k => ['version', 'mode', 'commanderId'].includes(k))
    && (e.commanderId == null || (typeof e.commanderId === 'string' && /^[A-Za-z0-9_-]{1,50}$/.test(e.commanderId))));
}
export function removeDungeonMember(dungeon, index) {
  const next = { ...dungeon, members: dungeon.members.filter((_, i) => i !== index) };
  if (dungeon.encounter?.commander != null) next.encounter = { ...dungeon.encounter,
    commander: dungeon.encounter.commander === index ? null : dungeon.encounter.commander - (dungeon.encounter.commander > index ? 1 : 0) };
  return next;
}
