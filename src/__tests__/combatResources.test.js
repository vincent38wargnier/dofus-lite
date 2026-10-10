import React from 'react';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { applyAction, createGame, currentFighter, spellsOf } from '../engine/engine';
import { emptyLoadout } from '../engine/equipment';
import { combatResources } from '../ui/combatResources';
import CombatStatsPanel from '../ui/CombatStatsPanel';
import CombatTurnControls from '../ui/CombatTurnControls';

jest.mock('../ui/RetroAssets', () => ({ RetroPortrait: () => null }));

function battle(classId = 'IOP') {
  const loadout = (cls, slots) => ({ ...emptyLoadout(cls), level: 200, base: {}, slots });
  const { state } = createGame({ seed: 7, fighters: [
    { id: 'A', name: 'Vous', classId, loadout: loadout(classId, { ring1: 2469 }) },
    { id: 'B', name: 'Adversaire', classId: 'ENUTROF', loadout: loadout('ENUTROF', { ring1: 2469, amulet: 323, dofus1: 7754 }) },
  ] });
  state.board = { width: 25, height: 25, obstacles: {} };
  state.order = ['A', 'B']; state.currentIndex = 0;
  state.fighters.A.pos = { x: 10, y: 10 }; state.fighters.B.pos = { x: 15, y: 10 };
  return state;
}
const pass = state => applyAction(state, { type: 'PASS' }).state;
const shown = (state, id = 'A') => combatResources(state.fighters[id], state);
function cast(state, id, target = currentFighter(state).pos, accept = () => true) {
  const spell = Object.values(spellsOf(currentFighter(state))).find(s => s.id === id);
  for (let seed = 1; seed <= 2000; seed++) {
    const result = applyAction({ ...state, rngState: seed }, { type: 'CAST', spell: spell.key, target });
    if (!result.ok) throw new Error(`${spell.name}: ${result.reason}`);
    if (!result.events.some(e => e.t === 'spell_fail') && accept(result)) return result.state;
  }
  throw new Error(`No matching cast: ${id}`);
}
const removal = stat => result => result.events.some(e => e.t === 'point_removal' && e.target === 'A' && e.stat === stat && e.removed > 0);
const spentTurn = () => {
  let state = battle();
  for (const id of [153, 144, 149]) state = cast(state, id);
  const result = applyAction(state, { type: 'MOVE', to: { x: 10, y: 13 } });
  expect(result.ok).toBe(true);
  expect(shown(result.state)).toEqual({ pa: 0, pm: 0, preview: false });
  return result.state;
};

test('ending a fully spent turn previews equipment resources, then subtracts real enemy PA/PM removals once', () => {
  let state = pass(spentTurn());
  expect(shown(state)).toEqual({ pa: 8, pm: 3, preview: true });
  // The display must not alter action budgets in the engine.
  expect(state.fighters.A).toMatchObject({ pa: 0, pm: 0 });
  state = cast(state, 50, state.fighters.A.pos, removal('PM'));
  state = cast(state, 54, state.fighters.B.pos, removal('PA'));
  const preview = shown(state);
  expect(preview.pa).toBeLessThan(8); expect(preview.pm).toBeLessThan(3);
  const untouched = JSON.stringify(state);
  expect(shown(state)).toEqual(preview);
  expect(JSON.stringify(state)).toBe(untouched);
  state = pass(state);
  expect(shown(state)).toEqual({ ...preview, preview: false });
  expect(state.fighters.A).toMatchObject({ pa: preview.pa, pm: preview.pm });
  state = pass(state);
  expect(shown(state)).toEqual({ pa: preview.pa, pm: 3, preview: true });
  // Maladresse de Masse lasts three turns; the single-turn PM penalty is gone.
  state = pass(pass(pass(pass(state))));
  expect(shown(state)).toEqual({ pa: 8, pm: 3, preview: true });
});

test.each([['ENIRIPSA', 126, 'pa', 2], ['ENUTROF', 55, 'pm', 3]])(
  '%s resource boosts appear in the next allocation and disappear when their real duration ends', (classId, id, stat, gain) => {
    let state = battle(classId);
    state = cast(state, id, state.fighters.A.pos, result => !result.events.some(e => e.t === 'cast' && e.crit));
    const base = { pa: state.fighters.A.basePa, pm: state.fighters.A.basePm };
    const afterCast = { pa: state.fighters.A.pa, pm: state.fighters.A.pm };
    expect(shown(state)).toEqual({ ...afterCast, preview: false });
    state = pass(state);
    expect(shown(state)).toEqual({ ...base, [stat]: base[stat] + gain, preview: true });
    for (let n = 0; n < 8 && state.fighters.A.effects.some(e => e.kind === 'buff' && e.stat === stat); n++) {
      const expected = shown(state);
      state = pass(state);
      expect(shown(state)).toEqual({ ...expected, preview: false });
      state = pass(state);
    }
    expect(shown(state)).toEqual({ ...base, preview: true });
  },
);

test('a real dispel immediately updates the waiting fighter resource preview', () => {
  let state = battle('ENUTROF');
  state = pass(cast(state, 55));
  expect(shown(state).pm).toBeGreaterThan(3);
  state = cast(state, 49, state.fighters.A.pos, result => result.events.some(e => e.t === 'dispel' && e.target === 'A'));
  expect(shown(state)).toEqual({ pa: 8, pm: 3, preview: true });
  state = pass(state);
  expect(shown(state)).toEqual({ pa: 8, pm: 3, preview: false });
});

test('preview floors heavy maluses at zero and respects placement, the result screen and death', () => {
  const state = pass(spentTurn()), player = state.fighters.A;
  player.effects.push({ kind: 'buff', stat: 'pm', value: -100, turnsLeft: 1 });
  expect(shown(state)).toEqual({ pa: 8, pm: 0, preview: true });
  expect(combatResources(player, { ...state, phase: 'placement' })).toEqual({ pa: 0, pm: 0, preview: false });
  expect(combatResources(player, { ...state, over: true })).toEqual({ pa: 0, pm: 0, preview: false });
  expect(combatResources({ ...player, hp: 0 }, state)).toEqual({ pa: 0, pm: 0, preview: false });
});

test('the player counter and inspected sheet agree through the turn transition without enabling actions', () => {
  const controller = { dialogRef: { current: null } };
  const panel = (state, inspected = 'A') => <CombatStatsPanel id="test-stats" fighter={state.fighters[inspected]}
    fighters={state.fighters} resources={shown(state, inspected)} isActive={currentFighter(state).id === inspected}
    controller={controller} inspecting={inspected !== 'A'} controls={<CombatTurnControls player={state.fighters.A}
      resources={shown(state)} turn={state.turn} humanTurn={currentFighter(state).id === 'A'} timeLeft={30} />} />;
  let state = spentTurn();
  const { container, rerender } = render(panel(state));
  expect(container.querySelector('.player-resources .pa')).toHaveTextContent('0PA');
  expect(container.querySelector('.dock-points')).toHaveTextContent('0 PA0 PM');
  state = pass(state); rerender(panel(state));
  expect(container.querySelector('.player-resources')).toHaveAttribute('data-points-mode', 'next-turn');
  expect(container.querySelector('.player-resources .pa')).toHaveTextContent('8PA');
  expect(container.querySelector('.player-resources .pm')).toHaveTextContent('3PM');
  expect(container.querySelector('.dock-points')).toHaveTextContent('8 PA3 PM');
  expect(screen.getByRole('button', { name: 'Fin de tour' })).toBeDisabled();
  state = cast(state, 50, state.fighters.A.pos, removal('PM')); rerender(panel(state));
  expect(container.querySelector('.player-resources .pm')).toHaveTextContent(`${shown(state).pm}PM`);
  expect(container.querySelector('.dock-points .pm')).toHaveTextContent(`${shown(state).pm} PM`);
  rerender(panel(state, 'B'));
  expect(container.querySelector('.dock-points')).toHaveAttribute('data-points-mode', 'current');
  expect(container.querySelector('.player-resources')).toHaveAttribute('data-points-mode', 'next-turn');
  expect(container.querySelector('.dock-points .pa')).toHaveTextContent(`${state.fighters.B.pa} PA`);
});
