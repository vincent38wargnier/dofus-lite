import { dungeonMapId, dungeonRoster } from '../engine/dungeons';
import { customDungeonMemberPreview } from '../engine/customDungeons';
import { dungeonEncounter } from '../engine/encounters';
import { KANOJEDO_MAP_ID, POUTCH_ID } from '../engine/monsters';

// Editing a preset creates an independent fight. Keep every enemy and the
// exact terrain, without changing the installed dungeon or campaign progress.
export function combatPreset({ mode, customDungeon, bossId, bossGrade, monsterGrade, seed }) {
  if (mode !== 'boss') customDungeon = null;
  const entries = mode === 'kanojedo' ? [{ kind: 'monster', monsterId: POUTCH_ID, grade: monsterGrade }]
    : customDungeon ? customDungeon.members.flatMap(member => Array.from({ length: member.count }, () => customDungeonMemberPreview(member)))
      : dungeonRoster(bossId, bossGrade, Number(seed) || 1).map(f => ({ kind: 'monster', monsterId: f.monsterId, grade: f.monsterGrade }));
  return JSON.parse(JSON.stringify({
    opponents: entries.map((entry, index) => ({ ...entry, combatMemberId: `preset-${index}` })),
    mapId: mode === 'kanojedo' ? KANOJEDO_MAP_ID : customDungeon?.mapId || dungeonMapId(bossId),
    battlefield: customDungeon?.battlefield || null,
    encounter: customDungeon ? dungeonEncounter(customDungeon) || null : null,
  }));
}

export function updatedCommander(encounter, before, after) {
  if (!encounter?.commanderId) return encounter;
  const index = encounter.commanderId === 'B' ? 0 : Number(encounter.commanderId.slice(1)) - 1;
  const commander = before[index];
  const next = after.findIndex(entry => entry === commander || (commander?.combatMemberId && entry.combatMemberId === commander.combatMemberId));
  const { commanderId, ...rest } = encounter;
  return next < 0 ? rest : { ...rest, commanderId: next ? `B${next + 1}` : 'B' };
}
