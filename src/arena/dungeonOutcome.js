// A points victory at the turn limit does not mean the dungeon was cleared.
export function dungeonOutcome(result) {
  const player = result.finalState.fighters.A;
  const monsters = Object.values(result.finalState.fighters).filter(f => f.team === 'B' && !f.isSummon);
  const remaining = monsters.filter(f => f.hp > 0).length;
  const status = result.endReason === 'ko' && player.hp > 0 && remaining === 0 ? 'victory'
    : player.hp <= 0 ? 'defeat' : 'unfinished';
  return { status, label: status === 'victory' ? 'Victoire · Salle vaincue'
    : status === 'defeat' ? 'Défaite' : result.endReason === 'turn_limit' ? 'Limite de tours atteinte' : 'Combat non concluant',
  defeated: monsters.length - remaining, total: monsters.length, remaining,
  hp: player.hp, maxHp: player.maxHp, turns: result.turns };
}
