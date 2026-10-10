import { effectAcceptsTarget } from '../engine/engine';
import { key, samePos, spellZoneCells } from '../engine/geometry';

// Preview the same effect geometry used by combat, at the selected grade.
// Caster-only side effects (Furie's damage bonus, for example) are not part
// of the area aimed at the hovered cell.
export function spellTargetPreview(spell, view, api, target) {
  if (!spell || spell.isWeapon || !view || !api || !target || !api.canCast(spell.key, target).ok) return null;
  const caster = view.you;
  const voids = new Set(view.board.obstacles.filter(o => o.type === 'VOID').map(o => key(o.x, o.y)));
  const area = new Map();
  const effects = [...spell.effects, ...(spell.critRate > 0 ? spell.critEffects || [] : [])];
  for (const effect of effects) {
    if ((effect.targetMask || 0) & 32) continue;
    const cells = spellZoneCells(effect.zone, target, caster.pos);
    if (cells.length <= 1) continue;
    for (const cell of cells) {
      const k = key(cell.x, cell.y);
      if (cell.x < 0 || cell.y < 0 || cell.x >= view.board.width || cell.y >= view.board.height || voids.has(k)) continue;
      if (samePos(cell, caster.pos) && !effectAcceptsTarget(effect, caster, caster)) continue;
      area.set(k, cell);
    }
  }
  return area.size ? { target, cells: [...area.values()] } : null;
}
