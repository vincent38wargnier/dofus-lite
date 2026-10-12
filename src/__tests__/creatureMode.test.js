import React from 'react';
import '@testing-library/jest-dom';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createGame } from '../engine/engine';
import { creatureActorId } from '../ui/creatureMode';
import { CREATURE_MODE_STORAGE } from '../ui/useCreatureMode';
import BoardView from '../ui/BoardView';
import { fighterUnderPointer } from '../ui/useFighterInspection';
import { characterShapeId } from '../visuals/customShapes';

const mockAssets = {
  classes: { IOP: { male: '80', female: '81' }, CRA: { male: '90', female: '91' } },
  monsters: { 1188: '233' },
  actors: Object.fromEntries(['80', '81', '82', '90', '91', '92', '900', '901', '902', '903', '904', '905', '906', '233'].map(id => [id, {
    url: `actors/${id}.swf`, animations: ['staticR', 'staticL', 'anim1R', 'anim1L', 'anim5R', 'anim5L'], durations: { anim5R: 700 },
  }])),
  spells: { 160: { animation: 'anim5', playEffect: false } },
};
jest.mock('../ui/RetroAssets', () => ({ ...jest.requireActual('../ui/RetroAssets'),
  useRetroAssets: () => mockAssets,
  RetroMovie: ({ url, animation, restart, accessories, className, style }) => <div className={className} style={style}
    data-url={url} data-animation={animation} data-restart={restart} data-accessories={JSON.stringify(accessories)} />,
}));

beforeEach(() => { localStorage.clear(); jest.useFakeTimers(); });
afterEach(() => { cleanup(); jest.restoreAllMocks(); jest.useRealTimers(); localStorage.clear(); });
const fixture = () => createGame({ seed: 7, fighters: [{ id: 'A', classId: 'IOP' }, { id: 'B', classId: 'CRA' }] }).state;
const board = (state, extra = {}) => <BoardView state={state} frameIdx={0} frameEvents={[]} viewerTeam="A" {...extra} />;
const toggle = () => fireEvent.click(screen.getByRole('button', { name: 'Mode créatures' }));
const figure = (container, id) => container.querySelector(`.token[data-fighter-id="${id}"] .figure`);

test('the client creature graphics cover classes, bosses, summons, static summons and doubles', () => {
  const assets = require('../../public/dofus-local/manifest.json');
  for (const [classId, variants] of Object.entries(assets.classes)) {
    const id = creatureActorId({ classId }, assets);
    expect(id).toBe(`${variants.male.slice(0, -1)}2`);
    expect(assets.actors[id].animations).toContain('staticR');
  }
  const cases = [
    [{ isMonster: true, monsterId: 147, monsterGrade: 1 }, '901'],
    [{ isMonster: true, monsterId: 494, monsterGrade: 1 }, '900'],
    [{ isMonster: true, appearanceMonsterId: 147 }, '901'],
    [{ isSummon: true, team: 'A', monsterId: 36 }, '902'],
    [{ isMonster: true, isSummon: true, team: 'B', monsterId: 36 }, '903'],
    [{ isSummon: true, monsterId: 556, staticSummon: true }, '904'],
    [{ isSummon: true, monsterId: 282, staticSummon: true }, '905'],
    [{ isSummon: true, monsterId: 2750, staticSummon: true }, '905'],
    [{ isSummon: true, monsterId: 9999, staticSummon: true }, '906'],
    [{ isSummon: true, isDouble: true, classId: 'SRAM' }, '42'],
  ];
  for (const [fighter, id] of cases) {
    expect(creatureActorId(fighter, assets)).toBe(id);
    expect(assets.actors[id].animations).toContain('staticR');
  }
  expect(creatureActorId({ isSummon: true, team: 'B' }, assets, 'B')).toBe('902');
});

test('switching replaces only artwork, preserves the selected cast, and saves independently of tactical mode', () => {
  const state = fixture(), before = JSON.stringify(state), target = jest.fn(), hover = jest.fn();
  state.fighters.B.pos = { x: 7, y: 5 };
  const snapshot = JSON.stringify(state);
  const { container, unmount } = render(board(state, { onCellClick: target, onCellHover: hover, highlights: { '7,5': 'target' } }));
  expect(container.querySelector('.token.side-A')).toHaveAttribute('data-actor', '80');
  const tactical = localStorage.getItem('dofus-lite-tactical-mode-v1');
  toggle();
  expect(screen.getByRole('button', { name: 'Mode créatures' })).toHaveAttribute('aria-pressed', 'true');
  expect(localStorage.getItem(CREATURE_MODE_STORAGE)).toBe('true');
  expect(localStorage.getItem('dofus-lite-tactical-mode-v1')).toBe(tactical);
  expect(JSON.stringify(state)).toBe(snapshot);
  expect(before).not.toBe(snapshot); // The fixture changes only its starting position.
  expect(container.querySelector('.token.side-A')).toHaveAttribute('data-actor', '82');
  expect(container.querySelector('.token.side-B')).toHaveAttribute('data-actor', '92');
  fireEvent.mouseEnter(figure(container, 'B')); fireEvent.click(figure(container, 'B'));
  expect(hover).toHaveBeenLastCalledWith(7, 5);
  expect(target).toHaveBeenLastCalledWith(7, 5);
  fireEvent.keyDown(figure(container, 'B'), { key: 'Enter' });
  expect(target).toHaveBeenCalledTimes(2);
  unmount();
  const restored = render(board(state));
  expect(restored.container.querySelector('.board-wrap')).toHaveClass('creature-mode');
  toggle();
  expect(restored.container.querySelector('.token.side-A')).toHaveAttribute('data-actor', '80');
  expect(localStorage.getItem(CREATURE_MODE_STORAGE)).toBe('false');
});

test('dead or invisible enemies stay absent and carried fighters cannot cast on their carrier by mistake', () => {
  const state = fixture(), target = jest.fn();
  state.fighters.B.pos = { x: 7, y: 5 };
  state.fighters.S = { ...state.fighters.B, id: 'S', name: 'Cawotte', isSummon: true, staticSummon: true, monsterId: 556, pos: { x: 6, y: 5 } };
  const { container, rerender } = render(board(state, { onCellClick: target, highlights: { '7,5': 'target' } }));
  toggle();
  expect(container.querySelector('[data-fighter-id="S"]')).toHaveAttribute('data-actor', '904');
  state.fighters.B.carriedBy = 'A';
  rerender(board(state, { onCellClick: target, highlights: { '7,5': 'target' } }));
  fireEvent.click(figure(container, 'B'));
  expect(target).not.toHaveBeenCalled();
  state.fighters.B.effects.push({ kind: 'invisibility', turnsLeft: 2 });
  state.fighters.S.hp = 0;
  rerender(board(state));
  expect(figure(container, 'B')).toBeNull(); expect(figure(container, 'S')).toBeNull();
  expect(container.querySelectorAll('.creature-token')).toHaveLength(1);
  state.fighters.A.effects.push({ kind: 'invisibility', turnsLeft: 2 });
  rerender(board(state));
  expect(container.querySelector('.creature-token')).toHaveStyle({ opacity: '.45' });
});

test('the compact mode restores custom artwork unchanged and never replays the last action on toggle', () => {
  const state = fixture(), events = [{ t: 'cast', fighter: 'A', spellId: 160, from: state.fighters.A.pos, target: state.fighters.B.pos, paCost: 4 }];
  const view = render(board(state));
  view.rerender(board(state, { frameEvents: events, frameIdx: 1 }));
  const restart = () => view.container.querySelector('.token.side-A .retro-actor').dataset.restart;
  const original = restart();
  toggle(); expect(restart()).toBe(original);
  act(() => jest.advanceTimersByTime(710));
  expect(view.container.querySelector('.token.side-A')).toHaveAttribute('data-animation', 'staticR');
  toggle(); expect(restart()).toBe(original);
  state.fighters.A.loadout = { ...state.fighters.A.loadout, artworkId: characterShapeId('mystic', '#c96696') };
  view.rerender(board(state, { frameIdx: 2 }));
  expect(view.container.querySelector('.custom-character-sprite')).toBeInTheDocument();
  toggle(); expect(view.container.querySelector('.custom-character-sprite')).toBeNull();
  toggle(); expect(view.container.querySelector('.custom-character-sprite')).toHaveAttribute('data-artwork-id', state.fighters.A.loadout.artworkId);
});

test('a front creature health bar cannot steal the rear creature body hover', () => {
  const state = fixture(), { container } = render(board(state));
  toggle();
  const front = container.querySelector('.token.side-B'), rear = container.querySelector('.token.side-A');
  const rect = { left: 100, top: 100, right: 120, bottom: 120, width: 20, height: 20 };
  front.style.zIndex = '99'; rear.style.zIndex = '1';
  jest.spyOn(front.querySelector('.mini-hp'), 'getBoundingClientRect').mockReturnValue(rect);
  jest.spyOn(rear.querySelector('.figure'), 'getBoundingClientRect').mockReturnValue(rect);
  expect(fighterUnderPointer(container.querySelector('.board'), 110, 110)?.id).toBe('A');
  jest.spyOn(front.querySelector('.figure'), 'getBoundingClientRect').mockReturnValue(rect);
  expect(fighterUnderPointer(container.querySelector('.board'), 110, 110)?.id).toBe('B');
});
