import React from 'react';
import '@testing-library/jest-dom';
import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { emptyLoadout } from '../engine/equipment';
import { LoadoutsProvider } from '../ui/LoadoutsContext';
import PlayScreen from '../ui/PlayScreen';
import { makeLayout } from '../ui/BoardView';
import useMapFrame, { playableMapFrame, tacticalMapFrame } from '../ui/useMapFrame';
import { MAPS } from '../engine/maps';

const retroMap = { width: 856, height: 578, hw: 26.75, top: 100, elevations: {} };
// Projection from the Nowel client export; no local image files are needed.
const nowelMap = { width: 859, height: 912, hw: 26.75, top: -61.25, originX: 15.934579439252337, elevations: {} };

test('maps without imported artwork stay renderable after the assets finish loading', () => {
  const board = { width: 10, height: 10, obstacles: {} };
  const { result, rerender } = renderHook(({ map }) => useMapFrame(map, board, true), { initialProps: { map: null } });
  expect(result.current).toBeNull();
  rerender({ map: undefined });
  expect(result.current).toBeNull();
});

test('combat fills the limiting axis without cropping at desktop, portrait and landscape sizes', () => {
  for (const map of [null, retroMap]) for (const [width, height] of [[1904, 820], [1008, 508], [836, 183], [382, 490]]) {
    const layout = makeLayout(16, 16, width, map, height);
    expect(layout.w).toBeLessThanOrEqual(width - 2 + .001);
    expect(layout.h).toBeLessThanOrEqual(height - 2 + .001);
    expect(Math.min(width - layout.w, height - layout.h)).toBeCloseTo(2);
    const cell = layout.ground({ x: 5, y: 8 });
    const neighbour = layout.ground({ x: 6, y: 8 });
    expect(neighbour.x - cell.x).toBeCloseTo(layout.hw);
    expect(neighbour.y - cell.y).toBeCloseTo(layout.hh);
  }
  expect(makeLayout(16, 16, 1904, retroMap, 820).w).toBeGreaterThan(760);
  expect(makeLayout(16, 16, 1904, retroMap).w).toBeLessThanOrEqual(760);
});

test('framing transparent margins preserves scenery, walkable cells, characters and elevation', () => {
  const map = { ...retroMap, elevations: { '4,5': 20 } };
  const board = { width: 16, height: 16, obstacles: {} };
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (x !== 4 || y !== 5) board.obstacles[`${x},${y}`] = { blocksMove: true };
  }
  const art = { left: 150, top: 180, right: 700, bottom: 450 };
  const frame = playableMapFrame(map, board, art);
  expect(frame.left).toBeLessThan(art.left);
  expect(frame.top).toBeLessThan(art.top);
  const L = makeLayout(16, 16, 1200, map, 600, frame);
  const cell = L.ground({ x: 4, y: 5 });
  expect(cell.x - L.hw).toBeGreaterThanOrEqual(0);
  expect(cell.x + L.hw).toBeLessThanOrEqual(L.w);
  expect(cell.y - L.hw * 3).toBeGreaterThanOrEqual(0);
  expect(cell.y + L.hh).toBeLessThanOrEqual(L.h);
  expect(L.mapLayerStyle.left).toBeLessThan(0);
  expect(L.mapLayerStyle.width).toBeGreaterThan(L.w);
});

test('Nowel tactical zoom ignores the tall scenery canvas and fits the visible terrain', () => {
  const board = MAPS.dungeon_11961, map = nowelMap;
  const frame = tacticalMapFrame(map, board);
  const oldLayout = makeLayout(board.width, board.height, 1282, map, 601);
  const layout = makeLayout(board.width, board.height, 1282, map, 601 - 28, frame);
  expect(layout.hw).toBeGreaterThan(oldLayout.hw * 1.6);
  expect(frame.height).toBeLessThan(map.height * .6);
  expect(tacticalMapFrame({ ...map, width: 5000, height: 5000 }, board)).toEqual(frame);
});

test.each(Object.values(MAPS).map(board => [board.id, board]))(
  '%s fits every tactical cell, raised obstacle and fighter, with and without artwork', (_id, board) => {
    for (const map of [null, { ...nowelMap, elevations: { '4,5': 20 } }]) {
      const frame = tacticalMapFrame(map, board);
      for (const [width, height] of [[1282, 577], [382, 450], [836, 157]]) {
        const L = makeLayout(board.width, board.height, width, map, height, frame);
        let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
        for (let y = 0; y < board.height; y++) for (let x = 0; x < board.width; x++) {
          const obstacle = board.obstacles[`${x},${y}`];
          if (obstacle?.type === 'VOID') continue;
          const cell = L.ground({ x, y });
          left = Math.min(left, cell.x - L.hw); right = Math.max(right, cell.x + L.hw);
          top = Math.min(top, cell.y - (obstacle?.blocksLos ? L.hh * 1.8 : L.hh));
          if (!obstacle?.blocksMove) top = Math.min(top, cell.y - L.hw * 3);
          bottom = Math.max(bottom, cell.y + L.hh);
        }
        expect(left).toBeGreaterThanOrEqual(0); expect(top).toBeGreaterThanOrEqual(0);
        expect(right).toBeLessThanOrEqual(L.w); expect(bottom).toBeLessThanOrEqual(L.h);
        expect(L.w).toBeLessThanOrEqual(width - 2 + .001);
        expect(L.h).toBeLessThanOrEqual(height - 2 + .001);
        expect(Math.min(width - L.w, height - L.h)).toBeCloseTo(2);
        // Only the small deliberate safety margin may surround the content.
        expect(L.w - (right - left)).toBeCloseTo(L.hw * .5);
        expect(L.h - (bottom - top)).toBeCloseTo(L.hw * .5);
      }
    }
  },
);

test('tactical framing is synchronous and stable across combat snapshots and mode changes', () => {
  const board = MAPS.dungeon_11961, map = nowelMap;
  const { result, rerender } = renderHook(props => useMapFrame(props.map, props.board, true, props.tactical),
    { initialProps: { map: null, board, tactical: true } });
  expect(result.current).toEqual(tacticalMapFrame(null, board));
  rerender({ map, board, tactical: true });
  expect(result.current).toEqual(tacticalMapFrame(map, board));
  const frame = result.current;
  rerender({ map, board: JSON.parse(JSON.stringify(board)), tactical: true });
  expect(result.current).toBe(frame);
  rerender({ map: null, board, tactical: false });
  expect(result.current).toBeNull();
  rerender({ map, board, tactical: true });
  expect(result.current).toEqual(frame);
});

beforeEach(() => {
  jest.useFakeTimers(); localStorage.clear();
  localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ playerClass: 'IOP', mode: 'kanojedo', monsterGrade: 5 }));
  localStorage.setItem('dofus-lite-loadouts-v1', JSON.stringify({ 'A:IOP': { ...emptyLoadout('IOP'), level: 200 } }));
});
afterEach(() => { cleanup(); jest.useRealTimers(); });

test('the fight dock shows the hovered monster, its spells, and restores the player without a dialog', () => {
  const onFightChange = jest.fn();
  const { container } = render(<LoadoutsProvider><PlayScreen allBots={[]} onFightChange={onFightChange} /></LoadoutsProvider>);
  fireEvent.click(container.querySelector('.setup-play'));
  expect(onFightChange).toHaveBeenLastCalledWith(true);
  expect(screen.getByRole('button', { name: 'Journal', exact: true })).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('button', { name: 'Exporter le journal' })).toBeInTheDocument();
  const playerResources = container.querySelector('.player-resources').textContent;
  expect(screen.getByRole('complementary')).toHaveAttribute('data-inspected-fighter', 'A');
  fireEvent.focus(screen.getByRole('button', { name: /Inspecter Poutch/ }));
  const dock = screen.getByRole('complementary');
  expect(dock).toHaveAttribute('data-inspected-fighter', 'B');
  expect(dock).toHaveTextContent('10000 / 10000 PV');
  expect(dock).toHaveTextContent('0 PA');
  expect(container.querySelector('.player-resources')).toHaveTextContent(playerResources);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(within(dock).getByRole('tab', { name: 'Sorts' }));
  expect(dock).toHaveTextContent('Tuerie');
  fireEvent.pointerLeave(container.querySelector('.board'));
  act(() => jest.advanceTimersByTime(300));
  expect(screen.getByRole('complementary')).toHaveAttribute('data-inspected-fighter', 'A');
  expect(within(dock).getByRole('tab', { name: 'Effets' })).toHaveAttribute('aria-selected', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Journal', exact: true }));
  expect(screen.queryByRole('button', { name: 'Exporter le journal' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Journal', exact: true }));
  expect(screen.getByRole('button', { name: 'Exporter le journal' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Fermer le journal' }));
  expect(screen.queryByRole('button', { name: 'Exporter le journal' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Préparation', exact: true }));
  expect(onFightChange).toHaveBeenLastCalledWith(false);
});
