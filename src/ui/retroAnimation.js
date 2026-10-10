// Port of the installed client's battlefield Sprite / Pathfinding rules.
// Direction 5 uses the unmirrored L artwork; direction 7 mirrors it.
export const RETRO_DIRECTIONS = [
  { suffix: 'S', mirror: false }, { suffix: 'R', mirror: false },
  { suffix: 'F', mirror: false }, { suffix: 'R', mirror: true },
  { suffix: 'S', mirror: true }, { suffix: 'L', mirror: false },
  { suffix: 'B', mirror: false }, { suffix: 'L', mirror: true },
];

export function facing(from, to, fallback = RETRO_DIRECTIONS[1]) {
  if (!from || !to || (from.x === to.x && from.y === to.y)) return fallback;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  // Casts use four screen quadrants, with the client's exact axis boundaries.
  // Ignore terrain elevation, just as map cell ground coordinates do there.
  const angle = Math.atan2((dx + dy) / 2, dx - dy);
  const direction = angle >= 0 ? (angle < Math.PI / 2 ? 1 : 3)
    : (angle < -Math.PI / 2 ? 5 : 7);
  return RETRO_DIRECTIONS[direction];
}

export function resolveAnimation(actor, requested, direction = 'R') {
  if (!actor) return null;
  // The original client falls back to static in the SAME direction. Choosing
  // the opposite cast clip makes a missing animation turn the actor around.
  return [`${requested}${direction}`, `static${direction}`, 'staticR', actor.animations[0]]
    .find(name => actor.animations.includes(name));
}

export function castAnimation(event, assets) {
  if (event.itemId || event.spellId === 0 || event.weaponAnimation != null) {
    return `anim${event.weaponAnimation ?? 0}`;
  }
  const spell = assets?.spells[event.visualSpellId ?? event.spellId];
  // GA300 -1 bypasses the entire visual action (not even a facing change).
  // -2 still dispatches the effect without a casting gesture.
  if (spell?.skipAnimation) return null;
  return spell && Object.prototype.hasOwnProperty.call(spell, 'animation') ? spell.animation || 'static' : 'anim0';
}
