// A points victory at the turn limit does not mean the dungeon was cleared.
export function dungeonOutcome(result) {
  const player = result.finalState.fighters.A;
  const allies = Object.values(result.finalState.fighters).filter(f => f.team === player.team && !f.isSummon);
  const alive = allies.some(f => f.hp > 0);
  const monsters = Object.values(result.finalState.fighters).filter(f => f.team === 'B' && !f.isSummon);
  const remaining = monsters.filter(f => f.hp > 0).length;
  const status = result.endReason === 'ko' && alive && remaining === 0 ? 'victory'
    : !alive ? 'defeat' : 'unfinished';
  return { status, label: status === 'victory' ? 'Victoire · Salle vaincue'
    : status === 'defeat' ? 'Défaite' : result.endReason === 'turn_limit' ? 'Limite de tours atteinte' : 'Combat non concluant',
  defeated: monsters.length - remaining, total: monsters.length, remaining,
  hp: allies.reduce((sum, f) => sum + Math.max(0, f.hp), 0), maxHp: allies.reduce((sum, f) => sum + f.maxHp, 0), turns: result.turns };
}
