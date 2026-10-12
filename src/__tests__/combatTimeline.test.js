import React from 'react';
import '@testing-library/jest-dom';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createGame } from '../engine/engine';
import { emptyLoadout } from '../engine/equipment';
import { LiveMatch } from '../game/liveMatch';
import { LoadoutsProvider } from '../ui/LoadoutsContext';
import PlayScreen from '../ui/PlayScreen';
import CombatTimeline from '../ui/CombatTimeline';
import { characterShapeId } from '../visuals/customShapes';

jest.mock('../ui/MapPicker', () => ({ __esModule: true, default: () => null, MapPreview: () => null }));
const card = (container, id) => container.querySelector(`[data-timeline-fighter="${id}"]`);
const spell = (container, id) => container.querySelector(`.spell-slot[data-spell-id="${id}"] .spell-btn`);
const ids = container => [...container.querySelectorAll('[data-timeline-fighter]')].map(element => element.dataset.timelineFighter);
const controller = () => ({ open: jest.fn(), dismiss: jest.fn(), closeSoon: jest.fn() });
beforeEach(() => { jest.useFakeTimers(); localStorage.clear(); });
afterEach(() => { cleanup(); jest.restoreAllMocks(); jest.useRealTimers(); localStorage.clear(); });

function fixture() {
  const { state } = createGame({ seed: 7, fighters: [{ id: 'A', classId: 'IOP' }, { id: 'B', classId: 'CRA' }] });
  state.fighters.S = { ...state.fighters.B, id: 'S', team: 'A', name: 'Invocation alliée', isSummon: true, ownerId: 'A', monsterId: 36 };
  state.fighters.D = { ...state.fighters.B, id: 'D', hp: 0 };
  state.order = ['B', 'D', 'A', 'S']; state.currentIndex = 0;
  return state;
}

test('portraits follow the engine turn order, retain summons, update health and remove dead fighters immediately', () => {
  const state = fixture(), inspection = controller();
  state.fighters.A.loadout = { artworkId: characterShapeId('mystic', '#c96696') };
  const view = render(<CombatTimeline state={state} controller={inspection} />);
  expect(ids(view.container)).toEqual(['B', 'A', 'S']);
  expect(card(view.container, 'B')).toHaveAttribute('aria-current', 'step');
  expect(card(view.container, 'S')).toHaveAccessibleName(/Invocation de/);
  expect(card(view.container, 'A').querySelector('img')).toHaveAttribute('src', expect.stringContaining('data:image/svg+xml'));
  state.fighters.B.hp = Math.round(state.fighters.B.maxHp / 2);
  state.currentIndex = 2;
  view.rerender(<CombatTimeline state={state} controller={inspection} />);
  expect(parseFloat(card(view.container, 'B').querySelector('.timeline-hp i').style.height)).toBeCloseTo(50, 0);
  expect(card(view.container, 'A')).toHaveAttribute('aria-current', 'step');
  state.fighters.B.hp = 0;
  view.rerender(<CombatTimeline state={state} controller={inspection} />);
  expect(ids(view.container)).toEqual(['A', 'S']);
  state.fighters.B.hp = 1;
  state.over = true;
  view.rerender(<CombatTimeline state={state} controller={inspection} />);
  expect(ids(view.container)).toEqual(['B', 'A', 'S']);
  expect(view.container.querySelector('[aria-current]')).toBeNull();
});

test('keyboard and pointer inspect living fighters; invisible enemies cannot reveal their position or receive a cast', () => {
  const state = fixture(), inspection = controller(), hover = jest.fn(), target = jest.fn();
  state.fighters.B.effects = [{ kind: 'invisibility', turnsLeft: 2 }];
  const view = render(<CombatTimeline state={state} controller={inspection} casting canTarget={() => true} onTarget={target} onTargetHover={hover} />);
  const hidden = card(view.container, 'B');
  fireEvent.mouseEnter(hidden); fireEvent.click(hidden);
  expect(inspection.open).not.toHaveBeenCalled();
  expect(hidden).toHaveAttribute('aria-disabled', 'true');
  expect(hidden.querySelector('.timeline-hp')).toBeNull();
  expect(target).not.toHaveBeenCalled();
  fireEvent.focus(card(view.container, 'A'));
  expect(inspection.open).toHaveBeenLastCalledWith('A', card(view.container, 'A'));
  fireEvent.keyDown(card(view.container, 'A'), { key: 'ArrowRight' });
  expect(card(view.container, 'S')).toHaveFocus();
  fireEvent.click(card(view.container, 'S'));
  expect(target).toHaveBeenLastCalledWith('S');
  fireEvent.mouseLeave(card(view.container, 'S'));
  expect(hover).toHaveBeenLastCalledWith(null);
  expect(inspection.closeSoon).toHaveBeenCalled();
  state.fighters.S.carriedBy = 'A';
  view.rerender(<CombatTimeline state={state} controller={inspection} casting canTarget={() => true} onTarget={target} />);
  fireEvent.click(card(view.container, 'S'));
  expect(target).toHaveBeenCalledTimes(1);
});

function begin({ classId = 'IOP', weapon = null, enemy = { x: 8, y: 5 }, alter } = {}) {
  const bot = { id: 'timeline-test', name: 'Adversaire', code: 'function decide(v,a) { return a.endTurn(); }' };
  localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ playerClass: classId, botClass: 'CRA', botId: bot.id, mapId: 'arene' }));
  localStorage.setItem('dofus-lite-loadouts-v1', JSON.stringify({
    [`A:${classId}`]: { ...emptyLoadout(classId), level: 200, slots: weapon ? { weapon } : {}, base: { force: 100 } },
    'B:CRA': { ...emptyLoadout('CRA'), level: 200 },
  }));
  const ready = LiveMatch.prototype.ready;
  const readySpy = jest.spyOn(LiveMatch.prototype, 'ready').mockImplementation(function () {
    const result = ready.call(this);
    this.state.order = ['A', 'B']; this.state.currentIndex = 0;
    this.state.fighters.A.pos = { x: 5, y: 5 }; this.state.fighters.A.pa = 20;
    this.state.fighters.B.pos = enemy; this.state.fighters.B.hp = this.state.fighters.B.maxHp = 2000;
    this.state.board.obstacles = {}; this.state.rngState = 123456;
    alter?.(this.state);
    return result;
  });
  const actions = jest.spyOn(LiveMatch.prototype, 'humanAct');
  const view = render(<LoadoutsProvider><PlayScreen allBots={[bot]} /></LoadoutsProvider>);
  fireEvent.click(view.container.querySelector('.setup-play'));
  fireEvent.click(view.container.querySelector('.combat-choice-launch'));
  fireEvent.click(screen.getByRole('button', { name: 'Prêt' }));
  return { ...view, actions, match: readySpy.mock.instances[0] };
}

test('hover and click on a portrait preview and cast the same area as the battlefield', () => {
  const { container, actions, match } = begin();
  const pa = match.state.fighters.A.pa, hp = match.state.fighters.B.hp;
  fireEvent.click(spell(container, 160)); // Épée de Iop.
  fireEvent.mouseEnter(card(container, 'B'));
  expect(container.querySelectorAll('.attack-preview-cell')).toHaveLength(13);
  expect(container.querySelector('.combat-stats')).toHaveAttribute('data-inspected-fighter', 'B');
  expect(container.querySelector('.token.side-B')).toHaveClass('is-inspected');
  expect(actions).not.toHaveBeenCalled();
  expect(card(container, 'B')).toHaveAttribute('data-targetable', 'true');
  fireEvent.click(card(container, 'B'));
  expect(actions.mock.results.at(-1).value.events).toContainEqual(expect.objectContaining({ t: 'cast', spellId: 160, target: { x: 8, y: 5 } }));
  expect(match.state.fighters.B.hp).toBeLessThan(hp);
  expect(match.state.fighters.A.pa).toBeLessThan(pa);
  expect(container.querySelector('.attack-preview-cell')).toBeNull();
  fireEvent.mouseLeave(card(container, 'B'));
  act(() => jest.advanceTimersByTime(250));
  expect(container.querySelector('.combat-stats')).toHaveAttribute('data-inspected-fighter', 'A');
});

test('a hammer portrait finds its legal nearby aiming cell and preserves all four preview cells', () => {
  const { container, actions, match } = begin({ weapon: 2416, enemy: { x: 7, y: 5 } });
  fireEvent.click(spell(container, 0));
  fireEvent.mouseEnter(card(container, 'B'));
  expect(container.querySelectorAll('.attack-preview-cell')).toHaveLength(4);
  expect(container.querySelector('.attack-preview-cell.aim')).toHaveAttribute('data-attack-cell', '6,5');
  fireEvent.click(card(container, 'B'));
  expect(actions.mock.results.at(-1).value.events).toContainEqual(expect.objectContaining({ t: 'cast', itemId: 2416, target: { x: 6, y: 5 } }));
  expect(match.state.fighters.B.hp).toBeLessThan(2000);
});

test.each(['range', 'los', 'invisible'])('portraits cannot bypass %s or spend PA on an invalid target', reason => {
  const { container, actions, match } = begin({
    enemy: reason === 'range' ? { x: 12, y: 5 } : { x: 8, y: 5 },
    alter: state => {
      if (reason === 'los') state.board.obstacles['6,5'] = { x: 6, y: 5, type: 'ROCK', blocksMove: true, blocksLos: true };
      if (reason === 'invisible') state.fighters.B.effects.push({ kind: 'invisibility', turnsLeft: 2 });
    },
  });
  const before = match.state.fighters.A.pa;
  fireEvent.click(spell(container, 160));
  fireEvent.mouseEnter(card(container, 'B')); fireEvent.click(card(container, 'B'));
  expect(actions).not.toHaveBeenCalled();
  expect(match.state.fighters.A.pa).toBe(before);
  expect(spell(container, 160)).toHaveClass('selected');
  expect(card(container, 'B')).toHaveAttribute('aria-disabled', 'true');
  expect(container.querySelector('.attack-preview-cell')).toBeNull();
  if (reason === 'invisible') expect(container.querySelector('.combat-stats')).toHaveAttribute('data-inspected-fighter', 'A');
});

test('clicking without a selected spell only inspects; killing a fighter removes its card and inspection', () => {
  const { container, actions, match } = begin({ alter: state => { state.fighters.B.hp = 1; } });
  fireEvent.click(card(container, 'B'));
  expect(actions).not.toHaveBeenCalled();
  expect(container.querySelector('.combat-stats')).toHaveAttribute('data-inspected-fighter', 'B');
  fireEvent.click(spell(container, 160)); fireEvent.click(card(container, 'B'));
  expect(match.state.fighters.B.hp).toBe(0);
  expect(card(container, 'B')).toBeNull();
  expect(container.querySelector('.combat-stats')).toHaveAttribute('data-inspected-fighter', 'A');
});

test('friendly portraits can receive a buff immediately and respect its per-target cast limit', () => {
  const { container, actions, match } = begin({ classId: 'OSAMODAS', enemy: { x: 10, y: 10 }, alter: state => {
    state.fighters.C = { ...JSON.parse(JSON.stringify(state.fighters.B)), id: 'C', team: 'A', name: 'Allié', pos: { x: 6, y: 5 } };
    state.order.push('C');
  } });
  fireEvent.click(spell(container, 28)); // Crapaud.
  expect(card(container, 'C')).toHaveAttribute('data-targetable', 'true');
  fireEvent.click(card(container, 'C'));
  expect(actions.mock.results.at(-1).value.ok).toBe(true);
  expect(match.state.fighters.C.effects.some(effect => effect.source === 'A')).toBe(true);
  const calls = actions.mock.calls.length, pa = match.state.fighters.A.pa;
  fireEvent.click(spell(container, 28)); fireEvent.click(card(container, 'C'));
  expect(actions).toHaveBeenCalledTimes(calls);
  expect(match.state.fighters.A.pa).toBe(pa);
});
