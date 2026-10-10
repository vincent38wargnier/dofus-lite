import { CLASS_IDS, CLASSES } from '../engine/classes';
import { emptyLoadout, equipSet, resolveLoadout } from '../engine/equipment';
import { createGame, applyAction } from '../engine/engine';
import { loadoutAtLevel } from '../ui/playerSetupState';

const bare = (classId, level) => ({ ...emptyLoadout(classId), level, base: {}, slots: {} });

function nextTurn(state) {
  state.order = ['A', 'B']; state.currentIndex = 0;
  state.fighters.A.pa = 0;
  return applyAction(applyAction(state, { type: 'PASS' }).state, { type: 'PASS' }).state;
}

test.each([[1, 6], [99, 6], [100, 7], [101, 7], [200, 7]])(
  'all unequipped level %i classes have %i PA in preparation, combat and following turns', (level, pa) => {
    for (const classId of CLASS_IDS) {
      const loadout = bare(classId, level);
      const summary = resolveLoadout(classId, loadout);
      expect(summary.valid).toBe(true);
      expect(summary.items).toEqual([]);
      expect(summary.pa).toBe(pa);
      const { state } = createGame({ seed: 7, fighters: [
        { id: 'A', classId, loadout }, { id: 'B', classId, loadout },
      ] });
      expect(state.fighters.A).toMatchObject({ level, pa, basePa: pa });
      expect(state.fighters.B).toMatchObject({ level, pa, basePa: pa });
      expect(nextTurn(state).fighters.A.pa).toBe(pa);
    }
  },
);

test.each(CLASS_IDS)('the level-100 %s preset without a loadout uses the same 7 PA base', classId => {
  const { state } = createGame({ seed: 7, fighters: [{ id: 'A', classId }, { id: 'B', classId }] });
  expect(CLASSES[classId].basePa).toBe(7);
  expect(state.fighters.A).toMatchObject({ level: 100, pa: 7, basePa: 7 });
  expect(nextTurn(state).fighters.A.pa).toBe(7);
});

test.each([[99, 6], [100, 7], [200, 7]])('gear and set PA are added once to the level %i base', (level, basePa) => {
  const empty = bare('IOP', level);
  const gelano = { ...empty, slots: { ring2: 2469 } };
  const full = equipSet(gelano, 1); // Bouftou uses ring1 and leaves the Gelano in ring2.
  expect(resolveLoadout('IOP', gelano).pa).toBe(basePa + 1);
  expect(resolveLoadout('IOP', full)).toMatchObject({ valid: true, pa: basePa + 2 });
  const { state } = createGame({ seed: 7, fighters: [
    { id: 'A', classId: 'IOP', loadout: full }, { id: 'B', classId: 'IOP', loadout: empty },
  ] });
  expect(state.fighters.A.basePa).toBe(basePa + 2);
  expect(nextTurn(state).fighters.A.pa).toBe(basePa + 2);
});

test('crossing the level-100 threshold changes PA immediately without accumulating bonuses', () => {
  let loadout = bare('IOP', 99);
  for (const [level, pa] of [[100, 7], [200, 7], [99, 6], [100, 7]]) {
    loadout = loadoutAtLevel('IOP', loadout, level);
    expect(resolveLoadout('IOP', loadout).pa).toBe(pa);
  }
});
