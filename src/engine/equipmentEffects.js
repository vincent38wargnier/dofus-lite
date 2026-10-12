// Shared client effect definitions, without resolver or UI dependencies.
export const STAT_LABELS = {
  vitalite: 'Vitalité', force: 'Force', intelligence: 'Intelligence', chance: 'Chance', agilite: 'Agilité', sagesse: 'Sagesse',
  pa: 'PA', pm: 'PM', range: 'Portée', damage: 'Dommages', power: '% dommages', crit: 'Coups critiques',
  heal: 'Soins', initiative: 'Initiative', summons: 'Invocations', dodgePa: 'Esquive PA', dodgePm: 'Esquive PM',
  physicalDamage: 'Dommages physiques', trapDamage: 'Dommages pièges', trapPower: '% dommages pièges',
  reflect: 'Renvoi de dommages', fail: 'Échecs critiques', pods: 'Pods', prospecting: 'Prospection',
};

const POSITIVE = { 110: 'vitalite', 111: 'pa', 112: 'damage', 115: 'crit', 117: 'range', 118: 'force', 119: 'agilite',
  121: 'damage', 122: 'fail', 123: 'chance', 124: 'sagesse', 125: 'vitalite', 126: 'intelligence', 128: 'pm',
  138: 'power', 142: 'physicalDamage', 158: 'pods', 160: 'dodgePa', 161: 'dodgePm', 174: 'initiative',
  176: 'prospecting', 178: 'heal', 182: 'summons', 220: 'reflect', 225: 'trapDamage', 226: 'trapPower' };
const NEGATIVE = { 116: 'range', 127: 'pm', 145: 'damage', 152: 'chance', 153: 'vitalite', 154: 'agilite',
  155: 'intelligence', 156: 'sagesse', 157: 'force', 159: 'pods', 162: 'dodgePa', 163: 'dodgePm',
  168: 'pa', 169: 'pm', 171: 'crit', 175: 'initiative', 177: 'prospecting', 179: 'heal', 2100: 'pa' };
const orderedElements = ['terre', 'eau', 'air', 'feu', 'neutre'];
for (const [start, prefix, negative] of [[210, 'res_', false], [215, 'res_', true],
  [240, 'fixed_', false], [245, 'fixed_', true], [250, 'pvpRes_', false], [255, 'pvpRes_', true], [260, 'pvpFixed_', false]]) {
  orderedElements.forEach((element, i) => { (negative ? NEGATIVE : POSITIVE)[start + i] = prefix + element; });
}
export const SPELL_MODIFIERS = { 281: 'range', 282: 'adjustableRange', 283: 'damage', 284: 'heal', 285: 'pa',
  286: 'cooldown', 287: 'crit', 288: 'lineOnly', 289: 'needsLos', 290: 'usesPerTurn', 291: 'usesPerTarget' };
// Display these separately; they have no effect in a single offline fight.
const METADATA = new Set([10, 130, 146, 148, 149, 239, 601, 705, 706, 723, 724, 740, 795, 800, 806, 807, 808, 811, 812,
  940, 983, 2146, 2149, 2151, 2179, 2184]);
export const WEAPON_EFFECTS = new Set([84, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 108]);
export function effectDefinition(id) {
  const stat = POSITIVE[id] || NEGATIVE[id];
  if (stat) return { kind: ['pods', 'prospecting'].includes(stat) ? 'utility' : 'stat', stat, sign: NEGATIVE[id] ? -1 : 1 };
  if (SPELL_MODIFIERS[id]) return { kind: 'spell', modifier: SPELL_MODIFIERS[id] };
  if (WEAPON_EFFECTS.has(id)) return { kind: 'weapon' };
  return { kind: METADATA.has(id) ? 'metadata' : 'unsupported' };
}

