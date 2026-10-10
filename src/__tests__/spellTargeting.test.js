import React from 'react';
import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { applyAction, createGame, getView } from '../engine/engine';
import { emptyLoadout } from '../engine/equipment';
import { createRng } from '../engine/rng';
import { key } from '../engine/geometry';
import { makeBotApi } from '../bots/api';
import { LiveMatch } from '../game/liveMatch';
import { LoadoutsProvider } from '../ui/LoadoutsContext';
import PlayScreen from '../ui/PlayScreen';
import { spellTargetPreview } from '../ui/spellTargeting';

jest.mock('../ui/MapPicker', () => () => null);

function fight(classId = 'IOP', grades = {}) {
  const { state } = createGame({ seed: 7, fighters: [
    { id: 'A', classId, loadout: { ...emptyLoadout(classId), level: 200, base: {}, slots: {},
      spells: { grades, common: [369] } } },
    { id: 'B', classId: 'CRA' },
  ] });
  state.board = { width: 25, height: 25, obstacles: {} };
  state.order = ['A', 'B']; state.currentIndex = 0;
  state.fighters.A.pos = { x: 10, y: 10 }; state.fighters.B.pos = { x: 20, y: 20 };
  for (const f of Object.values(state.fighters)) {
    f.hp = f.maxHp = f.baseMaxHp = 5000; f.pa = 100;
    f.resistances = {}; f.resistancesFixed = {};
  }
  state.rngState = 123456;
  return state;
}

function preview(state, id, target) {
  const view = getView(state, 'A');
  const spell = view.you.spells.find(s => s.id === id);
  return spellTargetPreview(spell, view, makeBotApi(view, createRng(1)), target);
}
const cellKeys = cells => cells.map(c => key(c.x, c.y)).sort();
const cross = [
  [0, 0], [1, 0], [2, 0], [3, 0], [-1, 0], [-2, 0], [-3, 0],
  [0, 1], [0, 2], [0, 3], [0, -1], [0, -2], [0, -3],
];
const crossAt = target => cross.map(([x, y]) => ({ x: target.x + x, y: target.y + y }));

test.each([
  ['FECA', 10, [5, 5, 5, 13, 25, 25]], // Glyphe Enflammé.
  ['OSAMODAS', 36, [13, 13, 13, 13, 13, 13]],
  ['ENUTROF', 48, [5, 5, 5, 9, 9, 13]],
  ['SRAM', 79, [13, 13, 13, 13, 13, 13]], // Piège de Masse.
  ['XELOR', 96, [13, 13, 13, 13, 13, 13]],
  ['ECAFLIP', 119, [145, 145, 145, 145, 145, 145]],
  ['ENIRIPSA', 130, [13, 13, 25, 25, 25, 25]], // Healing areas too.
  ['IOP', 160, [13, 13, 13, 13, 13, 13]],
  ['CRA', 179, [13, 13, 13, 13, 13, 25]],
  ['SADIDA', 191, [13, 25, 25, 25, 41, 41]],
  ['SACRIEUR', 447, [5, 5, 5, 5, 5, 5]],
  ['PANDAWA', 703, [3, 3, 3, 3, 3, 3]],
])('%s spell #%i previews the actual area at each of its six grades', (classId, id, sizes) => {
  for (let grade = 1; grade <= 6; grade++) {
    const state = fight(classId, { [id]: grade });
    // Revitalisant needs a fighter; Tout ou rien is cast on oneself.
    const target = [119, 130].includes(id) ? state.fighters.A.pos : { x: id === 48 ? 12 : 11, y: 10 };
    const area = preview(state, id, target);
    expect(area).not.toBeNull();
    expect(area.target).toEqual(target);
    expect(area.cells).toHaveLength(sizes[grade - 1]);
    expect(new Set(cellKeys(area.cells)).size).toBe(area.cells.length);
    // Hovering must not roll dice, spend points or advance the match.
    expect(state.fighters.A.pa).toBe(100);
    expect(state.rngState).toBe(123456);
  }
});

test.each([[1, 0], [-1, 0], [0, 1], [0, -1]])('Pandatak previews the same victims it hits in direction (%i, %i)', (dx, dy) => {
  const state = fight('PANDAWA'), from = state.fighters.A.pos;
  const target = { x: from.x + dx, y: from.y + dy };
  const expected = [1, 2, 3].map(n => ({ x: from.x + dx * n, y: from.y + dy * n }));
  for (const [index, pos] of expected.entries()) {
    const id = `probe${index}`;
    state.fighters[id] = { ...state.fighters.B, id, pos };
    state.order.push(id);
  }
  const area = preview(state, 703, target);
  expect(cellKeys(area.cells)).toEqual(cellKeys(expected));
  const cast = applyAction(state, { type: 'CAST', spell: 'pandatak', target });
  expect(cast.ok).toBe(true);
  expect(cast.events.filter(e => e.t === 'damage').map(e => e.target).sort()).toEqual(['probe0', 'probe1', 'probe2']);
  expect(cast.state.fighters.B.hp).toBe(state.fighters.B.hp);
});

test('Épée de Iop previews its full cross, including cells beyond aiming range and the caster if exposed', () => {
  const state = fight(), target = { x: 11, y: 10 };
  const expected = crossAt(target);
  for (const [index, pos] of expected.entries()) {
    if (pos.x === 10 && pos.y === 10) continue;
    const id = `probe${index}`;
    state.fighters[id] = { ...state.fighters.B, id, pos };
    state.order.push(id);
  }
  const area = preview(state, 160, target);
  expect(cellKeys(area.cells)).toEqual(cellKeys(expected));
  const cast = applyAction(state, { type: 'CAST', spell: 'epee_de_iop', target });
  expect(cast.ok).toBe(true);
  const hitCells = cast.events.filter(e => e.t === 'damage').map(e => state.fighters[e.target].pos);
  expect(cellKeys(hitCells)).toEqual(cellKeys(area.cells));
  expect(cast.state.fighters.B.hp).toBe(state.fighters.B.hp);
});

test.each([['IOP', 145, 4], ['SACRIEUR', 439, 4], ['IOP', 369, 12]])(
  '%s self-centered spell #%i excludes the caster from its %i affected cells', (classId, id, size) => {
    const state = fight(classId), self = state.fighters.A.pos;
    const area = preview(state, id, self);
    expect(area.cells).toHaveLength(size);
    expect(area.cells).not.toContainEqual(self);
  },
);

test('edges and voids are clipped while an area still extends behind obstacles', () => {
  const state = fight(), target = { x: 1, y: 0 };
  state.fighters.A.pos = { x: 0, y: 0 };
  state.board.obstacles = {
    '2,0': { x: 2, y: 0, type: 'ROCK', blocksMove: true, blocksLos: true },
    '1,2': { x: 1, y: 2, type: 'VOID', blocksMove: true, blocksLos: true },
  };
  const area = preview(state, 160, target);
  expect(cellKeys(area.cells)).toEqual(['0,0', '1,0', '1,1', '1,3', '2,0', '3,0', '4,0']);
});

test('a line spanning the map is clipped to the board and uses the attack direction', () => {
  const state = fight();
  expect(cellKeys(preview(state, 146, { x: 11, y: 10 }).cells)).toEqual(
    cellKeys(Array.from({ length: 14 }, (_, i) => ({ x: 11 + i, y: 10 }))),
  );
});

test('invalid range, line of sight, cooldown and PA never produce a castable area', () => {
  const state = fight(), target = { x: 12, y: 10 };
  expect(preview(state, 160, { x: 18, y: 10 })).toBeNull();
  expect(preview(state, 160, { x: 11, y: 11 })).toBeNull(); // Line-only aiming.
  state.board.obstacles['11,10'] = { x: 11, y: 10, type: 'ROCK', blocksMove: true, blocksLos: true };
  expect(preview(state, 160, target)).toBeNull();
  state.board.obstacles = {};
  state.fighters.A.cooldowns.epee_de_iop = 1;
  expect(preview(state, 160, target)).toBeNull();
  state.fighters.A.cooldowns = {}; state.fighters.A.pa = 0;
  expect(preview(state, 160, target)).toBeNull();
});

beforeEach(() => { jest.useFakeTimers(); localStorage.clear(); });
afterEach(() => { cleanup(); jest.restoreAllMocks(); jest.useRealTimers(); localStorage.clear(); });

function start(tactical = true) {
  const bot = { id: 'area-test', name: 'Cible', code: 'function decide(v,a) { return a.endTurn(); }' };
  localStorage.setItem('dofus-lite-tactical-mode-v1', String(tactical));
  localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ playerClass: 'IOP', botClass: 'CRA', botId: bot.id, mapId: 'arene' }));
  localStorage.setItem('dofus-lite-loadouts-v1', JSON.stringify({
    'A:IOP': { ...emptyLoadout('IOP'), level: 200, base: { force: 100 }, slots: {} },
    'B:CRA': { ...emptyLoadout('CRA'), level: 200, base: {}, slots: {} },
  }));
  const ready = LiveMatch.prototype.ready;
  const readySpy = jest.spyOn(LiveMatch.prototype, 'ready').mockImplementation(function () {
    const result = ready.call(this);
    this.state.fighters.A.pos = { x: 10, y: 10 }; this.state.fighters.B.pos = { x: 14, y: 10 };
    this.state.board = { width: 25, height: 25, obstacles: {} };
    this.state.rngState = 123456;
    return result;
  });
  const actions = jest.spyOn(LiveMatch.prototype, 'humanAct');
  const result = render(<LoadoutsProvider><PlayScreen allBots={[bot]} /></LoadoutsProvider>);
  fireEvent.click(result.container.querySelector('.setup-play'));
  fireEvent.click(screen.getByRole('button', { name: 'Prêt' }));
  return { ...result, actions, match: readySpy.mock.instances[0] };
}
const button = (container, id) => container.querySelector(`.spell-slot[data-spell-id="${id}"] .spell-btn`);
const drawn = container => [...container.querySelectorAll('.attack-preview-cell')].map(e => e.dataset.attackCell).sort();

test.each([[true, 'cell'], [true, 'fighter'], [false, 'cell'], [false, 'fighter']])(
  'hovering a %s board %s shows Épée de Iop before clicking and does not consume PA', (tactical, targetKind) => {
    const { container, actions, match } = start(tactical);
    const pa = match.state.fighters.A.pa;
    fireEvent.click(button(container, 160));
    const target = container.querySelector(targetKind === 'fighter' ? '.token.side-B.targetable .figure' : '.cell[data-cell="14,10"]');
    fireEvent.mouseEnter(target);
    expect(drawn(container)).toEqual(cellKeys(crossAt({ x: 14, y: 10 })));
    expect(container.querySelector('.attack-preview-cell.aim')).toHaveAttribute('data-attack-cell', '14,10');
    expect(actions).not.toHaveBeenCalled();
    expect(match.state.fighters.A.pa).toBe(pa);
    fireEvent.click(target);
    expect(actions.mock.results.at(-1).value.ok).toBe(true);
    expect(actions.mock.results.at(-1).value.events).toContainEqual(expect.objectContaining({ t: 'cast', spellId: 160, target: { x: 14, y: 10 } }));
    expect(drawn(container)).toEqual([]);
  },
);

test('the area follows the mouse and clears on invalid cells, board exit and Escape', () => {
  const { container, actions } = start();
  fireEvent.click(button(container, 160));
  fireEvent.mouseEnter(container.querySelector('.cell[data-cell="14,10"]'));
  fireEvent.mouseEnter(container.querySelector('.cell[data-cell="10,14"]'));
  expect(drawn(container)).toEqual(cellKeys(crossAt({ x: 10, y: 14 })));
  fireEvent.mouseEnter(container.querySelector('.cell[data-cell="11,11"]'));
  expect(drawn(container)).toEqual([]);
  fireEvent.mouseEnter(container.querySelector('.cell[data-cell="10,14"]'));
  fireEvent.mouseLeave(container.querySelector('.board'));
  expect(drawn(container)).toEqual([]);
  fireEvent.mouseEnter(container.querySelector('.cell[data-cell="10,14"]'));
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(drawn(container)).toEqual([]);
  expect(actions).not.toHaveBeenCalled();
});

test('self-centered spells show their area when the spell icon is hovered, before its automatic cast', () => {
  const { container, actions } = start();
  fireEvent.mouseEnter(button(container, 145));
  expect(drawn(container)).toEqual(['10,11', '10,9', '11,10', '9,10']);
  expect(actions).not.toHaveBeenCalled();
  fireEvent.mouseLeave(button(container, 145).closest('.spell-slot'));
  expect(drawn(container)).toEqual([]);
  fireEvent.mouseEnter(button(container, 145));
  fireEvent.click(button(container, 145));
  expect(actions.mock.results.at(-1).value.events).toContainEqual(expect.objectContaining({ t: 'cast', spellId: 145 }));
});
