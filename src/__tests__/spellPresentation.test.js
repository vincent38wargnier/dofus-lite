import { SPELL_LIBRARY, resolveSpellLoadout, spellAtGrade } from '../engine/classes';
import { SPELL_CATEGORIES, sortSpellsByType, spellPresentation } from '../ui/spellPresentation';
import { moveCombatSpell } from '../ui/combatShortcuts';

test.each([
  [141, 'terre'], [156, 'feu'], [447, 'eau'], [145, 'air'], [143, 'neutre'],
  [152, 'multi'], [114, 'multi'], [65, 'terre'], [17, 'feu'], [200, 'feu'],
  [446, 'neutre'], [350, 'feu'], [153, 'boost'], [149, 'boost'], [6, 'boost'],
  [121, 'heal'], [131, 'heal'], [34, 'summon'], [367, 'summon'], [142, 'placement'],
  [69, 'debuff'], [50, 'debuff'], [413, 'utility'],
])('spell %i is grouped as %s including critical and delayed effects', (id, category) => {
  for (const raw of SPELL_LIBRARY.spells[id].grades) {
    expect(spellPresentation(spellAtGrade(id, raw.grade)).category).toBe(category);
  }
});

test.each(Object.keys(SPELL_LIBRARY.classes))('%s retains every unlocked class/common spell and pins its weapon during sorting', classId => {
  const spells = Object.values(resolveSpellLoadout(classId, { level: 200, spells: { common: SPELL_LIBRARY.common } }).spells);
  const weapon = { id: 0, isWeapon: true, effects: [{ kind: 'damage', element: 'feu' }] };
  const shuffled = [...spells.slice(10), weapon, ...spells.slice(0, 10)];
  const before = JSON.stringify(shuffled);
  const order = sortSpellsByType(shuffled);
  expect(order[0]).toBe(0);
  expect(new Set(order)).toEqual(new Set([0, ...SPELL_LIBRARY.classes[classId], ...SPELL_LIBRARY.common]));
  const sorted = order.map(id => shuffled.find(spell => spell.id === id));
  const groups = sorted.map(spell => SPELL_CATEGORIES.indexOf(spellPresentation(spell).category));
  expect(groups).toEqual([...groups].sort((a, b) => a - b));
  expect(sortSpellsByType(sorted)).toEqual(order);
  expect(JSON.stringify(shuffled)).toBe(before);
});

test('manual reordering preserves the weapon slot and still works without a weapon', () => {
  expect(moveCombatSpell([0, 141, 153, 142], 142, 0)).toEqual([0, 142, 141, 153]);
  expect(moveCombatSpell([0, 141, 153], 0, 153)).toEqual([0, 141, 153]);
  expect(moveCombatSpell([141, 153, 142], 142, 141)).toEqual([142, 141, 153]);
});
