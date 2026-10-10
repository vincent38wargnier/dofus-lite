import { effectAcceptsTarget } from '../engine/engine';
import { key, samePos, spellZoneCells } from '../engine/geometry';

// A clicked victim can be reached by a weapon's area even when its own cell
// is outside the weapon's aiming range. Every proposed aim is engine-validated.
export function weaponTargetPlans(weapon, view, api) {
  const result = new Map();
  if (!weapon?.isWeapon || !view || !api) return result;
  const caster = view.you;
  const fighters = [caster, ...(view.allies || []), ...(view.enemies || [])].filter(f => f.hp > 0 && !f.hidden);
  const voids = new Set(view.board.obstacles.filter(o => o.type === 'VOID').map(o => key(o.x, o.y)));
  const plans = api.castTargets(weapon.key).map(target => {
    const area = new Map();
    for (const effect of weapon.effects) {
      for (const cell of spellZoneCells(effect.zone, target, caster.pos)) {
        if (cell.x < 0 || cell.y < 0 || cell.x >= view.board.width || cell.y >= view.board.height || voids.has(key(cell.x, cell.y))) continue;
        if (samePos(cell, caster.pos) && !effectAcceptsTarget(effect, caster, caster)) continue;
        area.set(key(cell.x, cell.y), cell);
      }
    }
    const hits = fighters.filter(f => area.has(key(f.pos.x, f.pos.y)));
    return { target, cells: [...area.values()],
      allies: hits.filter(f => f.team === caster.team).length,
      enemies: hits.filter(f => f.team !== caster.team).length };
  });
  // Where two swings reach the same cell, prefer avoiding allies. The hover
  // preview shows the exact chosen swing before the player commits to it.
  plans.sort((a, b) => a.allies - b.allies || b.enemies - a.enemies);
  for (const plan of plans) {
    for (const cell of plan.cells) {
      const k = key(cell.x, cell.y);
      if (!result.has(k)) result.set(k, plan);
    }
  }
  // Clicking a legal aiming cell always preserves that explicit choice.
  for (const plan of plans) result.set(key(plan.target.x, plan.target.y), plan);
  return result;
}

export function weaponZoneLabel(weapon) {
  const zone = weapon.effects[0]?.zone;
  return zone === 'Xb' ? 'Zone marteau · 4 cases' : zone === 'Tb' ? 'Zone bâton · 3 cases' : 'Cible unique';
}
