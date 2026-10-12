import React from 'react';
import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { applyAction, createGame, getView, validateAction } from '../engine/engine';
import { emptyLoadout, ITEMS, weaponSpell } from '../engine/equipment';
import { dist, key } from '../engine/geometry';
import { createRng } from '../engine/rng';
import { makeBotApi } from '../bots/api';
import { LiveMatch } from '../game/liveMatch';
import { LoadoutsProvider } from '../ui/LoadoutsContext';
import PlayScreen from '../ui/PlayScreen';
import { weaponTargetPlans } from '../ui/weaponTargeting';

jest.mock('../ui/MapPicker', () => ({ __esModule: true, default: () => null, MapPreview: () => null }));

function fight(itemId = 2416, target = { x: 7, y: 5 }) {
  const { state } = createGame({ seed: 7, fighters: [
    { id: 'A', name: 'Vous', classId: 'IOP' }, { id: 'B', name: 'Cible', classId: 'CRA' },
  ] });
  state.board.obstacles = {};
  state.order = ['A', 'B']; state.currentIndex = 0;
  state.fighters.A.pos = { x: 5, y: 5 }; state.fighters.B.pos = target;
  state.fighters.A.weaponSpell = weaponSpell(ITEMS[itemId]);
  state.fighters.A.pa = 20;
  state.rngState = 123456;
  return state;
}

function plansFor(state) {
  const view = getView(state, 'A');
  const api = makeBotApi(view, createRng(1));
  return weaponTargetPlans(view.you.spells.find(s => s.key === 'weapon'), view, api);
}

test.each([[2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [-1, -1]])(
  'hammer reaches a victim at offset (%i, %i) using a legal adjacent aim', (dx, dy) => {
    const target = { x: 5 + dx, y: 5 + dy };
    const state = fight(2416, target);
    const plan = plansFor(state).get(key(target.x, target.y));
    expect(plan.cells).toHaveLength(4);
    expect(plan.cells).toContainEqual(target);
    expect(plan.cells).not.toContainEqual(state.fighters.A.pos);
    expect(dist(state.fighters.A.pos, plan.target)).toBe(1);
    const result = applyAction(state, { type: 'CAST', spell: 'weapon', target: plan.target });
    expect(result.ok).toBe(true);
    expect(result.state.fighters.B.hp).toBeLessThan(state.fighters.B.hp);
    expect(result.state.fighters.A.hp).toBe(state.fighters.A.hp);
    expect(result.state.fighters.A.pa).toBe(15);
  },
);

test.each([
  [88, 2, 6], [132, 2, 3], [138, 1, 1], [97, 1, 1], [40, 1, 1], [144, 1, 1], [150, 1, 1], [454, 1, 1], [8575, 1, 2],
])('weapon #%i retains its own %i–%i aiming range despite range buffs', (id, min, max) => {
  const state = fight(id, { x: 1, y: 1 });
  state.fighters.A.permanent = { range: 8 };
  const plans = plansFor(state);
  expect(plans.get(key(5 + min, 5)).target).toEqual({ x: 5 + min, y: 5 });
  expect(plans.get(key(5 + max, 5)).target).toEqual({ x: 5 + max, y: 5 });
  if (min > 1) expect(plans.has('6,5')).toBe(false);
  for (const plan of plans.values()) {
    expect(dist(state.fighters.A.pos, plan.target)).toBeGreaterThanOrEqual(min);
    expect(dist(state.fighters.A.pos, plan.target)).toBeLessThanOrEqual(max);
    expect(validateAction(state, { type: 'CAST', spell: 'weapon', target: plan.target }).ok).toBe(true);
  }
  if (ITEMS[id].weapon.zone === 'Pa') expect(plans.has(key(5 + max + 1, 5))).toBe(false);
});

test('staff has three transverse cells and cannot hit two cells straight ahead', () => {
  const plans = plansFor(fight(138));
  expect(plans.get('6,6').cells).toHaveLength(3);
  expect(plans.has('7,5')).toBe(false);
});

test('an indirect swing avoids an ally where possible, while explicit aiming stays exact', () => {
  const state = fight(2416, { x: 6, y: 6 });
  state.fighters.C = { ...state.fighters.B, id: 'C', team: 'A', pos: { x: 7, y: 5 } };
  state.order.push('C');
  const plans = plansFor(state);
  expect(plans.get('6,6').target).toEqual({ x: 5, y: 6 });
  expect(plans.get('6,5').target).toEqual({ x: 6, y: 5 });
});

test('targeting cannot bypass blocked aiming cells, line of sight, PA or weapon states', () => {
  const state = fight();
  state.board.obstacles['6,5'] = { x: 6, y: 5, type: 'ROCK', blocksMove: true, blocksLos: true };
  expect(plansFor(state).has('7,5')).toBe(false);
  state.fighters.A.weaponSpell = weaponSpell(ITEMS[88]);
  expect(plansFor(state).has('8,5')).toBe(false);
  state.fighters.A.pa = 0;
  expect(plansFor(state).size).toBe(0);
  state.fighters.A.pa = 20;
  state.fighters.A.effects.push({ kind: 'state', stateId: 42, turnsLeft: 1 });
  expect(plansFor(state).size).toBe(0);
});

afterEach(() => { cleanup(); jest.restoreAllMocks(); localStorage.clear(); });

test.each([[1, 0, null], [2, 0, null], [1, 1, null], [2, 0, '6,5'], [2, 0, '4,5']])(
  'hammer clicks at enemy offset (%i, %i), explicit aim %s, reach the engine', (dx, dy, aim) => {
  const bot = { id: 'weapon-test', name: 'Cible', code: 'function decide(v,a) { return a.endTurn(); }' };
  localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ playerClass: 'IOP', botClass: 'CRA', botId: bot.id, mapId: 'arene' }));
  localStorage.setItem('dofus-lite-loadouts-v1', JSON.stringify({
    'A:IOP': { ...emptyLoadout('IOP'), level: 200, base: { force: 100 }, slots: { weapon: 2416 } },
    'B:CRA': { ...emptyLoadout('CRA'), level: 200, base: {}, slots: {} },
  }));
  // Put both fighters on free cells to exercise the real UI and engine without
  // spending several turns approaching the opponent in each interaction test.
  const ready = LiveMatch.prototype.ready;
  jest.spyOn(LiveMatch.prototype, 'ready').mockImplementation(function () {
    const result = ready.call(this);
    this.state.fighters.A.pos = { x: 5, y: 5 };
    this.state.fighters.B.pos = { x: 5 + dx, y: 5 + dy };
    this.state.board.obstacles = {};
    this.state.rngState = 123456;
    return result;
  });
  const actions = jest.spyOn(LiveMatch.prototype, 'humanAct');
  const { container } = render(<LoadoutsProvider><PlayScreen allBots={[bot]} /></LoadoutsProvider>);
  fireEvent.click(container.querySelector('.setup-play'));
  fireEvent.click(container.querySelector('.combat-choice-launch'));
  fireEvent.click(screen.getByRole('button', { name: 'Prêt' }));
  fireEvent.click(within(container.querySelector('.spellbar')).getByText('Marteau du Bouftou'));
  expect(screen.getByRole('status')).toHaveTextContent('Visée 1 PO · Zone marteau · 4 cases');
  const target = container.querySelector(aim ? `.cell[data-cell="${aim}"]` : '.token.side-B.targetable .figure');
  expect(target).toBeInTheDocument();
  fireEvent.mouseEnter(target);
  expect(container.querySelectorAll('.attack-preview-cell')).toHaveLength(4);
  fireEvent.click(target);
  const result = actions.mock.results.at(-1).value;
  expect(result.ok).toBe(true);
  expect(result.events).toEqual(expect.arrayContaining([
    expect.objectContaining({ t: 'cast', itemId: 2416, paCost: 5 }),
  ]));
  if (aim) expect(result.events.find(e => e.t === 'cast').target).toEqual({ x: Number(aim.split(',')[0]), y: 5 });
  const hits = result.events.filter(e => e.t === 'damage');
  if (aim === '4,5') expect(hits).toHaveLength(0);
  else expect(hits).toContainEqual(expect.objectContaining({ target: 'B' }));
  expect(container.querySelector('.attack-preview-cell')).not.toBeInTheDocument();
});
