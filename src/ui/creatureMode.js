import { getMonster } from '../engine/monsters';

// Installed Retro client: Character.creatureGfxFile uses Guild + "2.swf";
// Creature uses 900/901 for monsters, 902/903 for summons, 904/905 for
// Cawotte/Arbre and 906 for other static summons. No combat data changes.
export function creatureActorId(fighter, assets, viewerTeam = 'A') {
  if (fighter.isSummon && !fighter.isDouble) {
    if (fighter.monsterId === 556) return '904';
    if ([282, 2750].includes(fighter.monsterId)) return '905';
    if (fighter.staticSummon) return '906';
    return fighter.team === (viewerTeam || 'A') ? '902' : '903';
  }
  if (fighter.isMonster) {
    const monster = getMonster(fighter.appearanceMonsterId ?? fighter.monsterId, fighter.monsterGrade || 5);
    return monster?.boss ? '901' : '900';
  }
  const normal = assets?.classes[fighter.classId]?.male;
  return normal ? `${normal.slice(0, -1)}2` : null;
}
