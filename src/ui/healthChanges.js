// Sum resolved HP changes, never base jets or attempted (overkill) damage.
// Damage and healing stay separate, as do targets and consecutive actions.
const LEGACY_BOUNDARIES = new Set(['cast', 'spell_fail', 'turn_start', 'turn_end', 'move', 'hazard_trigger', 'match_start', 'match_end', 'invalid']);

export function healthChangeGroups(events = []) {
  const groups = new Map();
  let segment = 0, previousAction;
  events.forEach((event, index) => {
    if (event.actionId !== previousAction || (event.actionId == null && LEGACY_BOUNDARIES.has(event.t))) segment += 1;
    previousAction = event.actionId;
    if (!['damage', 'heal'].includes(event.t)) return;
    const id = JSON.stringify([segment, event.target, event.t]);
    let group = groups.get(id);
    if (!group) {
      group = { id, actionId: event.actionId, target: event.target, t: event.t, amount: 0, lines: [], index };
      groups.set(id, group);
    }
    group.amount += event.amount;
    group.lines.push(event);
    group.index = index;
  });
  return [...groups.values()];
}

// Keep the full elemental rows in the export and in "Détails des jets".
// In the compact journal the summary occupies the last row of each group.
export function summarizedHealthEvents(events) {
  const summaries = new Map(healthChangeGroups(events).map(group => {
    const last = group.lines[group.lines.length - 1];
    if (group.lines.length === 1) return [group.index, last];
    const elements = new Set(group.lines.map(e => e.element));
    return [group.index, { ...last, amount: group.amount, healthLines: group.lines.length,
      element: elements.size === 1 ? last.element : undefined,
      label: [...new Set(group.lines.map(e => e.label).filter(Boolean))].join(' + '),
      erosion: group.lines.reduce((sum, e) => sum + (e.erosion || 0), 0), calculation: undefined }];
  }));
  return events.flatMap((event, index) => {
    if (!['damage', 'heal'].includes(event.t)) return [event];
    return summaries.has(index) ? [summaries.get(index)] : [];
  });
}
