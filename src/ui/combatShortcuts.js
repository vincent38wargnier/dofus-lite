// Use physical number-row positions so unshifted AZERTY keys work too.
// Numeric keypad keys and digit-only events use the same slot mapping.
export function combatShortcutIndex(event) {
  if (event.ctrlKey || event.metaKey || event.repeat || event.isComposing
    || event.getModifierState?.('AltGraph')) return -1;
  const digit = /^(?:Digit|Numpad)(\d)$/.exec(event.code || '')?.[1]
    ?? (/^\d$/.test(event.key || '') ? event.key : null);
  if (digit === null) return -1;
  const bank = (event.shiftKey ? 1 : 0) + (event.altKey ? 2 : 0);
  return bank * 10 + (Number(digit) + 9) % 10;
}

export function combatShortcut(index) {
  if (index < 0 || index >= 40) return null;
  const bank = Math.floor(index / 10), digit = String((index + 1) % 10);
  return {
    label: `${bank & 2 ? 'Alt+' : ''}${bank & 1 ? 'Maj+' : ''}${digit}`,
    aria: `${bank & 2 ? 'Alt+' : ''}${bank & 1 ? 'Shift+' : ''}${digit}`,
  };
}

export function isTypingTarget(target) {
  return !!target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]');
}

export function moveCombatSpell(ids, from, to) {
  const start = ids.indexOf(from), target = ids.indexOf(to);
  if (from === 0 || start < 0 || target < 0) return ids;
  const end = Math.max(ids[0] === 0 ? 1 : 0, target);
  if (start === end) return ids;
  const next = [...ids];
  next.splice(start, 1);
  next.splice(end, 0, from);
  return next;
}
