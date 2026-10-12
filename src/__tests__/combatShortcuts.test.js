import React from 'react';
import '@testing-library/jest-dom';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LiveMatch } from '../game/liveMatch';
import { emptyLoadout } from '../engine/equipment';
import { statBuffTotal } from '../engine/formulas';
import { LoadoutsProvider } from '../ui/LoadoutsContext';
import PlayScreen from '../ui/PlayScreen';
import CombatSpellBar from '../ui/CombatSpellBar';
import { combatShortcut, combatShortcutIndex } from '../ui/combatShortcuts';
import { sortSpellsByType } from '../ui/spellPresentation';
import { spellsOf } from '../engine/engine';

jest.mock('../ui/MapPicker', () => ({ __esModule: true, default: () => null, MapPreview: () => null }));

const bot = { id: 'shortcut-test', name: 'Sparring', code: 'function decide(v,a) { return a.endTurn(); }' };
const player = () => ({ ...emptyLoadout('IOP'), level: 200, base: { force: 100 }, slots: { weapon: 2416 },
  spells: { order: [142, 0, 141], common: [350], grades: { 350: 3 } } });
const saved = () => JSON.parse(localStorage.getItem('dofus-lite-loadouts-v1'));
const app = active => <LoadoutsProvider><PlayScreen allBots={[bot]} active={active} /></LoadoutsProvider>;
const barIds = container => [...container.querySelectorAll('.spell-slot')].map(e => Number(e.dataset.spellId));
const button = (container, id) => container.querySelector(`.spell-slot[data-spell-id="${id}"] .spell-btn`);
const press = (code = 'Digit1', options = {}, target = window) => fireEvent.keyDown(target, { code, key: code.slice(-1), ...options });

function begin(result) {
  fireEvent.click(result.container.querySelector('.setup-play'));
  fireEvent.click(result.container.querySelector('.combat-choice-launch'));
  fireEvent.click(screen.getByRole('button', { name: 'Prêt' }));
  act(() => jest.advanceTimersByTime(700));
  expect(screen.getByRole('button', { name: /Fin de tour/ })).toBeEnabled();
}

function start() {
  const result = render(app(true)); begin(result); return result;
}

function chooseClass(classId) {
  const setup = JSON.parse(localStorage.getItem('dofus-lite-player-setup-v1'));
  localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ ...setup, playerClass: classId }));
  localStorage.setItem('dofus-lite-loadouts-v1', JSON.stringify({ ...saved(),
    [`A:${classId}`]: { ...emptyLoadout(classId), level: 200, base: { intelligence: 100 }, slots: {} },
  }));
}

function dragSpell(container, from, to) {
  const source = container.querySelector(`.spell-slot[data-spell-id="${from}"]`);
  const target = container.querySelector(`.spell-slot[data-spell-id="${to}"]`);
  const dataTransfer = { setData: jest.fn(), setDragImage: jest.fn() };
  fireEvent.dragStart(source, { dataTransfer });
  fireEvent.dragOver(target, { dataTransfer });
  expect(target).toHaveClass('drop-target');
  fireEvent.drop(target, { dataTransfer });
  fireEvent.dragEnd(source, { dataTransfer });
}

beforeEach(() => {
  jest.useFakeTimers(); localStorage.clear();
  localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ playerClass: 'IOP', botClass: 'CRA', botId: bot.id, mapId: 'arene' }));
  localStorage.setItem('dofus-lite-loadouts-v1', JSON.stringify({ 'A:IOP': player(),
    'B:CRA': { ...emptyLoadout('CRA'), level: 200, base: {}, slots: {} },
    'A:FECA': { ...emptyLoadout('FECA'), spells: { order: [3, 2] } },
  }));
  jest.spyOn(Math, 'random').mockReturnValue(.000007);
});

afterEach(() => { cleanup(); jest.restoreAllMocks(); jest.useRealTimers(); });

test('dragging in combat changes numeric shortcuts immediately and saves the existing spell configuration', () => {
  const actions = jest.spyOn(LiveMatch.prototype, 'humanAct');
  const { container } = start();
  expect(barIds(container).slice(0, 3)).toEqual([0, 142, 141]);
  const before = saved();
  dragSpell(container, 141, 142);
  expect(barIds(container).slice(0, 3)).toEqual([0, 141, 142]);
  expect(actions).not.toHaveBeenCalled();
  press('Digit2');
  expect(button(container, 141)).toHaveClass('selected');
  press('Digit3');
  expect(button(container, 142)).toHaveClass('selected');
  expect(button(container, 141)).not.toHaveClass('selected');
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(container.querySelector('.spell-btn.selected')).toBeNull();
  expect(saved()['A:IOP'].spells).toEqual({ ...before['A:IOP'].spells, order: barIds(container) });
  expect(saved()['B:CRA']).toEqual(before['B:CRA']);
  expect(saved()['A:FECA']).toEqual(before['A:FECA']);
});

test('saved combat order survives a remount and is used in the next match snapshot', () => {
  const first = start();
  dragSpell(first.container, 141, 142);
  const order = barIds(first.container);
  first.unmount();
  const next = start();
  expect(barIds(next.container)).toEqual(order);
  const actions = jest.spyOn(LiveMatch.prototype, 'humanAct');
  fireEvent.click(screen.getByRole('button', { name: /Fin de tour/ }));
  expect(actions.mock.instances[0].state.fighters.A.loadout.spells.order).toEqual(order);
});

test('a shortcut selects a target, casts on click, then respects cooldown and PA without waiting for animations', () => {
  const actions = jest.spyOn(LiveMatch.prototype, 'humanAct');
  const { container } = start();
  dragSpell(container, 153, 142); // Puissance directly after the pinned weapon.
  press('Digit2');
  expect(button(container, 153)).toHaveClass('selected');
  fireEvent.click(container.querySelector('.token.side-A.targetable .figure'));
  expect(actions.mock.results.at(-1).value.ok).toBe(true);
  expect(actions.mock.calls.at(-1)[0]).toMatchObject({ type: 'CAST', spell: 'puissance' });
  expect(button(container, 153)).toBeDisabled();
  press('Digit2');
  expect(container.querySelector('.spell-btn.selected')).toBeNull();
  expect(actions).toHaveBeenCalledTimes(1);
  // The weapon stays first and its shortcut respects the remaining PA.
  expect(button(container, 0)).toBeDisabled();
  expect(button(container, 0).closest('.spell-slot')).toHaveAttribute('draggable', 'false');
  press();
  expect(actions).toHaveBeenCalledTimes(1);
  expect(container.querySelector('.spell-btn.selected')).toBeNull();
  expect(actions.mock.instances[0].state.fighters.A.loadout.spells.order).toEqual(barIds(container));
});

test('self spells use the normal cast handler and held keys never spend extra PA', () => {
  const actions = jest.spyOn(LiveMatch.prototype, 'humanAct');
  const { container } = start();
  const guide = [...container.querySelectorAll('.spell-slot')].find(e => e.querySelector('.nm').textContent === 'Guide de Bravoure');
  dragSpell(container, Number(guide.dataset.spellId), 142);
  press('Digit2');
  expect(actions).toHaveBeenCalledTimes(1);
  expect(actions.mock.results[0].value.ok).toBe(true);
  press('Digit2', { repeat: true });
  expect(actions).toHaveBeenCalledTimes(1);
});

test('right-click casts targeted boosts on the player immediately, after reordering and during animations', () => {
  const actions = jest.spyOn(LiveMatch.prototype, 'humanAct');
  const { container } = start();
  dragSpell(container, 153, 142);
  fireEvent.pointerDown(button(container, 141));
  fireEvent.click(button(container, 141));
  expect(button(container, 141)).toHaveClass('selected');
  expect(fireEvent.contextMenu(button(container, 153).querySelector('.ic'))).toBe(false);
  expect(actions).toHaveBeenCalledTimes(1);
  const match = actions.mock.instances[0];
  expect(actions).toHaveBeenLastCalledWith({ type: 'CAST', spell: 'puissance', target: match.state.fighters.A.pos });
  expect(actions.mock.results[0].value.ok).toBe(true);
  expect(statBuffTotal(match.state.fighters.A, 'power')).toBe(100);
  expect(match.state.fighters.A.pa).toBe(3);
  expect(container.querySelector('.spell-btn.selected')).toBeNull();
  expect(fireEvent.contextMenu(button(container, 153))).toBe(false); // Cooldown.
  expect(actions).toHaveBeenCalledTimes(1);
  const hp = match.state.fighters.A.hp;
  fireEvent.contextMenu(button(container, 155)); // No animation timers advanced.
  expect(actions).toHaveBeenCalledTimes(2);
  expect(actions.mock.results[1].value.ok).toBe(true);
  expect(actions).toHaveBeenLastCalledWith({ type: 'CAST', spell: 'vitalite', target: match.state.fighters.A.pos });
  expect(match.state.fighters.A.hp).toBeGreaterThan(hp);
  expect(match.state.fighters.A.pa).toBe(0);
  fireEvent.contextMenu(button(container, 148)); // Not enough PA for Amplification.
  expect(actions).toHaveBeenCalledTimes(2);
});

test('right-click on attacks, weapons and empty-cell spells leaves PA and the current selection unchanged', () => {
  const actions = jest.spyOn(LiveMatch.prototype, 'humanAct');
  const ready = jest.spyOn(LiveMatch.prototype, 'ready');
  const { container } = start();
  const match = ready.mock.instances[0], before = match.state;
  fireEvent.click(button(container, 153));
  for (const id of [141, 350, 0, 142]) {
    expect(button(container, id)).toBeEnabled();
    expect(fireEvent.contextMenu(button(container, id))).toBe(false);
    expect(button(container, 153)).toHaveClass('selected');
  }
  expect(actions).not.toHaveBeenCalled();
  expect(match.state).toBe(before);
});

test('right-click respects a spell limit per target even while its button remains available', () => {
  const actions = jest.spyOn(LiveMatch.prototype, 'humanAct');
  const { container } = start();
  fireEvent.contextMenu(button(container, 148)); // Amplification: once per target, no per-turn limit.
  expect(actions).toHaveBeenCalledTimes(1);
  expect(actions.mock.results[0].value.ok).toBe(true);
  const match = actions.mock.instances[0], pa = match.state.fighters.A.pa;
  expect(button(container, 148)).toBeEnabled();
  fireEvent.contextMenu(button(container, 148));
  expect(actions).toHaveBeenCalledTimes(1);
  expect(match.state.fighters.A.pa).toBe(pa);
});

test('right-click heals the caster but cannot redirect a heal reserved for another target', () => {
  chooseClass('ENIRIPSA');
  const actions = jest.spyOn(LiveMatch.prototype, 'humanAct');
  const ready = jest.spyOn(LiveMatch.prototype, 'ready');
  const { container } = start();
  const match = ready.mock.instances[0];
  match.state.fighters.A.hp -= 100;
  const hp = match.state.fighters.A.hp;
  fireEvent.contextMenu(button(container, 124)); // Mot Soignant has minimum range 1.
  expect(actions).not.toHaveBeenCalled();
  fireEvent.contextMenu(button(container, 121)); // Mot Curatif targets the caster.
  expect(actions).toHaveBeenCalledTimes(1);
  expect(actions.mock.results[0].value.ok).toBe(true);
  expect(match.state.fighters.A.hp).toBeGreaterThan(hp);
  expect(match.state.fighters.A.pa).toBe(4);
  fireEvent.contextMenu(button(container, 121)); // Once per turn.
  expect(actions).toHaveBeenCalledTimes(1);
});

test('right-click respects required and forbidden states using the current combat state', () => {
  chooseClass('PANDAWA');
  const actions = jest.spyOn(LiveMatch.prototype, 'humanAct');
  const { container } = start();
  fireEvent.contextMenu(button(container, 704)); // Pandanlku requires the drunk state.
  expect(actions).not.toHaveBeenCalled();
  fireEvent.contextMenu(button(container, 686)); // Picole.
  expect(actions).toHaveBeenCalledTimes(1);
  expect(actions.mock.results[0].value.ok).toBe(true);
  fireEvent.contextMenu(button(container, 686)); // Cannot drink again while drunk.
  expect(actions).toHaveBeenCalledTimes(1);
  const match = actions.mock.instances[0], pm = match.state.fighters.A.pm;
  fireEvent.contextMenu(button(container, 704));
  expect(actions).toHaveBeenCalledTimes(2);
  expect(actions.mock.results[1].value.ok).toBe(true);
  expect(match.state.fighters.A.pm).toBe(pm + 3);
});

test('right-click stays inactive in placement, another screen, the opponent turn and during a drag', () => {
  const actions = jest.spyOn(LiveMatch.prototype, 'humanAct');
  const result = render(app(true));
  fireEvent.click(result.container.querySelector('.setup-play'));
  fireEvent.click(result.container.querySelector('.combat-choice-launch'));
  fireEvent.contextMenu(button(result.container, 153));
  expect(actions).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Prêt' }));
  act(() => jest.advanceTimersByTime(700));
  result.rerender(app(false));
  fireEvent.contextMenu(button(result.container, 153));
  expect(actions).not.toHaveBeenCalled();
  result.rerender(app(true));
  const slot = button(result.container, 153).closest('.spell-slot');
  const dataTransfer = { setData: jest.fn(), setDragImage: jest.fn() };
  fireEvent.dragStart(slot, { dataTransfer });
  fireEvent.contextMenu(button(result.container, 153));
  expect(actions).not.toHaveBeenCalled();
  fireEvent.dragEnd(slot, { dataTransfer });
  fireEvent.click(screen.getByRole('button', { name: /Fin de tour/ }));
  fireEvent.contextMenu(button(result.container, 153));
  expect(actions).toHaveBeenCalledTimes(1);
  expect(actions).toHaveBeenLastCalledWith({ type: 'PASS' });
});

test('shortcuts stay inactive in preparation, placement, another screen and the opponent turn', () => {
  const actions = jest.spyOn(LiveMatch.prototype, 'humanAct');
  const result = render(app(true));
  press(); expect(actions).not.toHaveBeenCalled();
  fireEvent.click(result.container.querySelector('.setup-play'));
  fireEvent.click(result.container.querySelector('.combat-choice-launch'));
  press(); expect(actions).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Prêt' }));
  act(() => jest.advanceTimersByTime(700));
  result.rerender(app(false));
  press(); expect(result.container.querySelector('.spell-btn.selected')).toBeNull();
  result.rerender(app(true));
  press('Digit2'); expect(button(result.container, 142)).toHaveClass('selected');
  fireEvent.click(screen.getByRole('button', { name: /Fin de tour/ }));
  press(); expect(result.container.querySelector('.spell-btn.selected')).toBeNull();
  dragSpell(result.container, 141, 142);
  expect(barIds(result.container).slice(0, 2)).toEqual([0, 141]);
  expect(actions).toHaveBeenCalledTimes(1); // PASS only, no cast during drag.
});

test('keyboard reordering works on a focused spell without casting it', () => {
  const { container } = start();
  button(container, 142).focus();
  fireEvent.keyDown(button(container, 142), { key: 'ArrowRight', code: 'ArrowRight', altKey: true });
  expect(barIds(container).slice(0, 3)).toEqual([0, 141, 142]);
  expect(button(container, 142)).toHaveFocus();
  expect(container.querySelector('.spell-btn.selected')).toBeNull();
});

test('automatic sorting preserves the live fight, updates shortcuts and persists the same order for preparation', () => {
  const ready = jest.spyOn(LiveMatch.prototype, 'ready');
  const actions = jest.spyOn(LiveMatch.prototype, 'humanAct');
  const first = start();
  fireEvent.contextMenu(button(first.container, 153));
  const match = ready.mock.instances[0];
  const before = JSON.stringify(match.state.fighters.A);
  const order = sortSpellsByType(Object.values(spellsOf(match.state.fighters.A)));
  fireEvent.click(first.container.querySelector('.spellbar-sort'));
  expect(barIds(first.container)).toEqual(order);
  expect(order[0]).toBe(0);
  expect(saved()['A:IOP'].spells.order).toEqual(order);
  expect(match.state.fighters.A).toEqual({ ...JSON.parse(before), loadout: {
    ...JSON.parse(before).loadout, spells: { ...JSON.parse(before).loadout.spells, order },
  } });
  expect(actions).toHaveBeenCalledTimes(1);
  expect(button(first.container, 153)).toBeDisabled();
  press('Digit2');
  expect(button(first.container, order[1])).toHaveClass('selected');
  // Dragging onto the weapon inserts after it; the weapon itself cannot move.
  dragSpell(first.container, 141, 0);
  expect(barIds(first.container).slice(0, 2)).toEqual([0, 141]);
  fireEvent.click(first.container.querySelector('.spellbar-sort'));
  const persisted = barIds(first.container);
  first.unmount();
  const next = render(app(true));
  fireEvent.click(screen.getByRole('tab', { name: /Équipement/ }));
  fireEvent.click(screen.getByRole('tab', { name: 'Sorts' }));
  expect([...next.container.querySelectorAll('.spell-loadout-order li')].map(e => Number(e.dataset.spellId))).toEqual(persisted);
  fireEvent.click(screen.getByRole('tab', { name: /Combat/ }));
  begin(next);
  expect(barIds(next.container)).toEqual(persisted);
});

test.each([
  ['Digit1', '1', {}, 0], ['Digit0', '0', {}, 9], ['Digit1', '&', {}, 0], ['Digit2', 'é', {}, 1],
  ['Numpad3', '3', {}, 2], ['', '4', {}, 3], ['Digit1', '!', { shiftKey: true }, 10],
  ['Digit0', ')', { shiftKey: true }, 19], ['Digit1', '¡', { altKey: true }, 20],
  ['Digit1', '⁄', { altKey: true, shiftKey: true }, 30],
  ['Digit1', '1', { ctrlKey: true }, -1], ['Digit1', '1', { metaKey: true }, -1],
  ['Digit1', '1', { repeat: true }, -1], ['Digit1', '1', { isComposing: true }, -1],
])('%s (%s) maps to the visible slot with modifiers %j', (code, key, flags, expected) => {
  expect(combatShortcutIndex({ code, key, ...flags })).toBe(expected);
});

test('the second and third shortcut groups select their displayed slots, without intercepting typing', () => {
  const spells = Array.from({ length: 23 }, (_, index) => ({ id: index, key: `s${index}`, name: `Sort ${index}`,
    pa: 1, range: [1, 2], usesLeft: 1, cooldownLeft: 0 }));
  const onSelect = jest.fn();
  const { container } = render(<><input aria-label="Texte" /><textarea /><select><option>1</option></select>
    <div contentEditable suppressContentEditableWarning><span>Texte éditable</span></div>
    <CombatSpellBar spells={spells} spellInfo={Object.fromEntries(spells.map(s => [s.key, s]))}
      pa={6} humanTurn active onSelect={onSelect} onReorder={jest.fn()} onCancel={jest.fn()} /></>);
  press('Digit1', { shiftKey: true }); expect(onSelect).toHaveBeenLastCalledWith(spells[10]);
  press('Digit1', { altKey: true }); expect(onSelect).toHaveBeenLastCalledWith(spells[20]);
  expect(container.querySelectorAll('.spell-slot-tools kbd')[10]).toHaveTextContent(combatShortcut(10).label);
  for (const element of container.querySelectorAll('input, textarea, select, [contenteditable] span')) press('Digit1', {}, element);
  press('Digit1', { ctrlKey: true }); press('Digit1', { metaKey: true });
  expect(onSelect).toHaveBeenCalledTimes(2);
});
