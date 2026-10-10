import React from 'react';
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { applyAction, createGame, spellsOf } from '../engine/engine';
import { emptyLoadout } from '../engine/equipment';
import BoardView from '../ui/BoardView';

function summoned(spellId = 35) {
  const { state } = createGame({ seed: 7, fighters: [
    { id: 'A', name: 'Vous', classId: 'OSAMODAS', loadout: { ...emptyLoadout('OSAMODAS'), level: 200, base: {}, slots: {}, spells: { common: [367] } } },
    { id: 'B', name: 'Adversaire', classId: 'SRAM' },
  ] });
  state.order = ['A', 'B']; state.currentIndex = 0;
  state.fighters.A.pos = { x: 5, y: 5 }; state.fighters.B.pos = { x: 9, y: 5 };
  const spell = Object.values(spellsOf(state.fighters.A)).find(s => s.id === spellId);
  for (let seed = 1; seed < 100; seed++) {
    const r = applyAction({ ...state, rngState: seed }, { type: 'CAST', spell: spell.key, target: { x: 5, y: 6 } });
    if (r.events.some(e => e.t === 'summon_add')) return r.state;
  }
  throw new Error('Summon failed');
}
const board = (state, extra = {}) => <BoardView state={state} frameEvents={[]} frameIdx={state.turn}
  viewerTeam="A" {...extra} />;

test('the real summon sheet shows its own life, characteristics, owner and current effects, updating live', () => {
  const state = summoned(); const f = state.fighters.As1;
  const { rerender } = render(board(state));
  fireEvent.focus(screen.getByRole('button', { name: `Inspecter ${f.name}` }));
  const sheet = screen.getByRole('dialog', { name: `Caractéristiques de ${f.name}` });
  expect(within(sheet).getByText('Invoquée par Vous')).toBeInTheDocument();
  expect(within(sheet).getByText(`Invocation · niv. ${f.level}`)).toBeInTheDocument();
  expect(within(sheet).getByText(`${f.hp} / ${f.maxHp} PV`)).toBeInTheDocument();
  expect(within(sheet).getByTitle(/^Force :/)).toHaveTextContent(String(f.stats.force));
  expect(within(sheet).getByRole('table', { name: 'Résistances actuelles' })).toBeInTheDocument();
  expect(within(sheet).queryByText(/Osamodas ·/)).not.toBeInTheDocument();

  const updated = JSON.parse(JSON.stringify(state));
  updated.fighters.As1.hp -= 37;
  updated.fighters.As1.effects.push({ kind: 'buff', stat: 'force', value: 80, turnsLeft: 2, name: 'Crocs du Mulou', source: 'A' });
  rerender(board(updated));
  expect(within(sheet).getByText(`${f.hp - 37} / ${f.maxHp} PV`)).toBeInTheDocument();
  expect(within(sheet).getByLabelText('Cumul des bonus et malus temporaires')).toHaveTextContent('+80 Force');
  expect(within(sheet).getByTitle(/^Force :/)).toHaveTextContent(String(f.stats.force + 80));
  expect(within(sheet).getByText('2 tours')).toBeInTheDocument();

  delete updated.fighters.As1;
  rerender(board(updated));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('static summons can be inspected even though they never enter the turn order', () => {
  const state = summoned(367); const f = state.fighters.As1;
  expect(f.staticSummon).toBe(true); expect(state.order).not.toContain(f.id);
  render(board(state));
  const trigger = screen.getByRole('button', { name: `Inspecter ${f.name}` });
  fireEvent.keyDown(trigger, { key: 'Enter' });
  expect(screen.getByRole('dialog')).toHaveTextContent('Invocation statique');
  expect(screen.getByRole('button', { name: 'Fermer la fiche du combattant' })).toHaveFocus();
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

test('invisibility removes an open enemy sheet and its inspection target immediately', () => {
  const state = summoned(); const { rerender } = render(board(state));
  fireEvent.focus(screen.getByRole('button', { name: 'Inspecter Adversaire' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('Adversaire');
  const hidden = JSON.parse(JSON.stringify(state));
  hidden.fighters.B.effects.push({ kind: 'invisibility', turnsLeft: 3, name: 'Invisibilité' });
  rerender(board(hidden));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Inspecter Adversaire' })).not.toBeInTheDocument();
});

test('mouse hover, moving into the sheet and casting on the summon coexist', () => {
  jest.useFakeTimers();
  const originalPointer = window.PointerEvent;
  window.PointerEvent = MouseEvent;
  try {
    const state = summoned(); const f = state.fighters.As1; const onCellClick = jest.fn();
    const { unmount } = render(board(state, { onCellClick, highlights: { '5,6': 'target' } }));
    const trigger = screen.getByRole('button', { name: `Inspecter ${f.name}` });
    jest.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({ left: 100, top: 100, right: 130, bottom: 150, width: 30, height: 50 });
    fireEvent.pointerMove(trigger, { clientX: 110, clientY: 120 });
    const sheet = screen.getByRole('dialog');
    fireEvent.pointerMove(trigger, { clientX: 500, clientY: 500 });
    fireEvent.pointerEnter(sheet);
    act(() => jest.advanceTimersByTime(300));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(onCellClick).toHaveBeenCalledWith(5, 6);
    fireEvent.pointerLeave(sheet);
    act(() => jest.advanceTimersByTime(300));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.pointerMove(trigger, { clientX: 110, clientY: 120 });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.pointerMove(document.body, { clientX: 2, clientY: 2 });
    fireEvent.pointerMove(trigger, { clientX: 110, clientY: 120 });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    unmount();
  } finally { window.PointerEvent = originalPointer; jest.useRealTimers(); }
});
