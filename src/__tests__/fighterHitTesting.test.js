import React from 'react';
import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createGame } from '../engine/engine';
import BoardView from '../ui/BoardView';
import { fighterUnderPointer, imageMaskContains, registerSpriteHitTest } from '../ui/fighterHitTesting';

const rect = (left = 100, top = 100, width = 80, height = 100) => ({ left, top, width, height, right: left + width, bottom: top + height });
const point = { clientX: 120, clientY: 130 };
const originalPointer = window.PointerEvent;
beforeEach(() => { localStorage.clear(); window.PointerEvent = MouseEvent; });
afterEach(() => { cleanup(); jest.restoreAllMocks(); window.PointerEvent = originalPointer; });

function nativeCanvas(token, alpha, bounds = rect()) {
  token.dataset.mirror = 'false';
  const figure = token.querySelector('.figure'), player = document.createElement('ruffle-player');
  const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 200;
  player.attachShadow({ mode: 'open' }).appendChild(canvas); figure.appendChild(player);
  jest.spyOn(figure, 'getBoundingClientRect').mockReturnValue(bounds);
  jest.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(bounds);
  const read = jest.fn((x, y) => ({ data: [0, 0, 200, typeof alpha === 'function' ? alpha(x, y) : alpha] }));
  jest.spyOn(canvas, 'getContext').mockReturnValue({ getImageData: read });
  return { canvas, figure, read };
}

function fixture(highlights = { '5,6': 'target', '6,7': 'target' }) {
  const { state } = createGame({ fighters: [{ id: 'A', classId: 'IOP', name: 'Bleu' }, { id: 'B', classId: 'CRA', name: 'Devant' }] });
  state.fighters.A.pos = { x: 5, y: 6 }; state.fighters.B.pos = { x: 6, y: 7 };
  const cast = jest.fn(), hover = jest.fn();
  const view = render(<BoardView state={state} frameIdx={0} frameEvents={[]} viewerTeam="A"
    onCellClick={cast} onCellHover={hover} highlights={highlights} />);
  const board = view.container.querySelector('.board');
  const rear = view.container.querySelector('[data-fighter-id="A"]');
  const front = view.container.querySelector('[data-fighter-id="B"]');
  return { ...view, state, board, rear, front, cast, hover };
}

test('transparent foreground pixels do not mask the visible fighter behind them', () => {
  const { board, rear, front } = fixture();
  nativeCanvas(rear, 255); nativeCanvas(front, 0);
  expect(fighterUnderPointer(board, 120, 130).id).toBe('A');
  expect(fighterUnderPointer(board, 400, 400)).toBeNull();
});

test('opaque foreground pixels win, while faint shadows do not cover the rear body', () => {
  const { board, rear, front } = fixture();
  nativeCanvas(rear, 255); nativeCanvas(front, (x) => x < 60 ? 12 : 255);
  expect(fighterUnderPointer(board, 120, 130).id).toBe('A');
  expect(fighterUnderPointer(board, 150, 130).id).toBe('B');
});

test('the animated, mirrored canvas is sampled at its rendered scale, beyond the nominal hitbox', () => {
  const { board, rear, front } = fixture();
  const backArt = nativeCanvas(rear, (x) => x === 119 ? 255 : 0);
  nativeCanvas(front, 0);
  rear.dataset.mirror = 'true';
  backArt.figure.getBoundingClientRect.mockReturnValue(rect(160, 160, 5, 5));
  expect(fighterUnderPointer(board, 120, 130).id).toBe('A');
  expect(backArt.read).toHaveBeenCalledWith(119, 60, 1, 1);
  // A changed animation frame is read afresh, rather than a stale silhouette.
  backArt.read.mockReturnValue({ data: [0, 0, 0, 0] });
  expect(fighterUnderPointer(board, 120, 130)).toBeNull();
});

test('hover, inspection and a real pointer click resolve the same fighter even inside a neighbour DOM element', () => {
  const { board, rear, front, cast, hover } = fixture();
  nativeCanvas(rear, 255);
  const foreground = nativeCanvas(front, x => x < 60 ? 0 : 255);
  fireEvent.pointerMove(foreground.figure, point);
  expect(screen.getByRole('dialog', { name: 'Caractéristiques de Bleu' })).toBeInTheDocument();
  expect(hover).toHaveBeenLastCalledWith(5, 6);
  // Moving inside the SAME foreground element must update the target; no
  // mouseenter/mouseleave transition occurs between these two painted bodies.
  fireEvent.pointerMove(foreground.figure, { clientX: 150, clientY: 130 });
  expect(hover).toHaveBeenLastCalledWith(6, 7);
  fireEvent.pointerMove(foreground.figure, point);
  fireEvent.click(foreground.figure, { ...point, detail: 1 });
  expect(cast).toHaveBeenCalledTimes(1);
  expect(cast).toHaveBeenCalledWith(5, 6);
  expect(fighterUnderPointer(board, 120, 130).id).toBe('A');
});

test('an invalid or carried rear fighter never redirects the cast to a legal foreground fighter', () => {
  const view = fixture({ '6,7': 'target' });
  nativeCanvas(view.rear, 255); const foreground = nativeCanvas(view.front, 0);
  fireEvent.click(foreground.figure, { ...point, detail: 1 });
  expect(view.cast).not.toHaveBeenCalled();
  view.state.fighters.A.carriedBy = 'B';
  view.rerender(<BoardView state={view.state} frameIdx={0} frameEvents={[]} onCellClick={view.cast}
    highlights={{ '5,6': 'target', '6,7': 'target' }} />);
  fireEvent.click(foreground.figure, { ...point, detail: 1 });
  expect(view.cast).not.toHaveBeenCalled();
});

test('transparent parts still allow empty-cell aiming, and there is no misleading floor tooltip', () => {
  const { board, rear, front, cast, hover } = fixture();
  nativeCanvas(rear, 0); const foreground = nativeCanvas(front, 0);
  const cell = board.querySelector('[data-cell="5,5"]');
  const previous = document.elementsFromPoint;
  document.elementsFromPoint = jest.fn(() => [foreground.figure, cell, board]);
  try {
    fireEvent.pointerMove(foreground.figure, point);
    expect(hover).toHaveBeenLastCalledWith(5, 5);
    fireEvent.click(foreground.figure, { ...point, detail: 1 });
    expect(cast).toHaveBeenCalledWith(5, 5);
    expect(cell.querySelector('title')).toBeNull();
  } finally { document.elementsFromPoint = previous; }
});

test('custom PNG hit masks use the selected frame, mirroring and transparency', () => {
  const mask = { width: 4, height: 2, alpha: new Uint8Array([255, 0, 0, 255, 0, 0, 0, 0]) };
  const bounds = rect(100, 100, 20, 20);
  expect(imageMaskContains(mask, bounds, 102, 102, 2, 0, false)).toBe(true);
  expect(imageMaskContains(mask, bounds, 102, 102, 2, 1, false)).toBe(false);
  expect(imageMaskContains(mask, bounds, 102, 102, 2, 1, true)).toBe(true);
  expect(imageMaskContains(mask, bounds, 130, 130, 2, 0, false)).toBe(false);
  const { board, rear, front } = fixture();
  nativeCanvas(rear, 255);
  const art = document.createElement('span'); art.className = 'custom-character-sprite';
  front.querySelector('.figure').appendChild(art);
  jest.spyOn(front.querySelector('.figure'), 'getBoundingClientRect').mockReturnValue(rect());
  const unregister = registerSpriteHitTest(art, () => false);
  expect(fighterUnderPointer(board, 120, 130).id).toBe('A');
  unregister();
  expect(fighterUnderPointer(board, 120, 130).id).toBe('B');
});

test('unreadable/loading artwork keeps a usable fallback, and keyboard activation remains independent of coordinates', () => {
  const { rear, front, board, cast } = fixture();
  nativeCanvas(rear, 255); const foreground = nativeCanvas(front, 255);
  foreground.read.mockImplementation(() => { throw new Error('Not yet readable'); });
  expect(fighterUnderPointer(board, 120, 130).id).toBe('B');
  fireEvent.keyDown(rear.querySelector('.figure'), { key: 'Enter' });
  expect(cast).toHaveBeenCalledWith(5, 6);
});
