import React from 'react';
import '@testing-library/jest-dom';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { applyAction, createGame } from '../engine/engine';
import { emptyLoadout, ITEMS, weaponSpell } from '../engine/equipment';
import { LiveMatch } from '../game/liveMatch';
import BoardView from '../ui/BoardView';
import { HEALTH_FLOAT_MS } from '../ui/HealthChangeFloats';
import { LoadoutsProvider } from '../ui/LoadoutsContext';
import PlayScreen from '../ui/PlayScreen';
import { fighterUnderPointer } from '../ui/useFighterInspection';

beforeEach(() => { jest.useFakeTimers(); localStorage.clear(); });
afterEach(() => { cleanup(); jest.restoreAllMocks(); jest.useRealTimers(); localStorage.clear(); });

function fight() {
  const { state } = createGame({ seed: 7, fighters: [
    { id: 'A', name: 'Vous', classId: 'OSAMODAS', loadout: { ...emptyLoadout('OSAMODAS'), level: 200 } },
    { id: 'B', team: 'B', monsterId: 1184, monsterGrade: 5 },
    { id: 'B2', team: 'B', monsterId: 1188, monsterGrade: 5 },
  ] });
  state.board = { width: 12, height: 12, obstacles: {} };
  state.order = ['A', 'B', 'B2']; state.currentIndex = 0;
  Object.assign(state.fighters.A, { pos: { x: 4, y: 4 }, pa: 20, weaponSpell: weaponSpell(ITEMS[2416]) });
  Object.assign(state.fighters.B, { pos: { x: 5, y: 4 }, hp: 1 });
  state.fighters.B2.pos = { x: 9, y: 9 };
  state.rngState = 123456;
  return state;
}

const board = (state, frameIdx = 0, frameEvents = [], extra = {}) =>
  <BoardView state={state} frameIdx={frameIdx} frameEvents={frameEvents} viewerTeam="A" {...extra} />;

test.each([false, true])('a lethal hit removes the monster and its inspection hitbox, retaining only transient feedback (tactical=%s)', tactical => {
  localStorage.setItem('dofus-lite-tactical-mode-v1', String(tactical));
  const state = fight(), onCellClick = jest.fn();
  const { container, rerender } = render(board(state, 0, [], { onCellClick }));
  const trigger = screen.getByRole('button', { name: 'Inspecter Blop Coco Royal' });
  jest.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({ left: 100, top: 100, right: 140, bottom: 160, width: 40, height: 60 });
  expect(fighterUnderPointer(container.querySelector('.board'), 120, 130)?.id).toBe('B');
  fireEvent.focus(trigger);
  expect(screen.getByRole('dialog')).toHaveTextContent('Blop Coco Royal');

  const hit = applyAction(state, { type: 'CAST', spell: 'weapon', target: state.fighters.B.pos });
  expect(hit.ok).toBe(true);
  expect(hit.state.fighters.B.hp).toBe(0);
  expect(hit.state.over).toBe(false);
  rerender(board(hit.state, 1, hit.events, { onCellClick }));
  expect(container.querySelector('.token[data-fighter-id="B"]')).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(fighterUnderPointer(container.querySelector('.board'), 120, 130)).toBeNull();
  expect(container.querySelectorAll('.token')).toHaveLength(2);
  expect(container.querySelector('.health-change[data-target="B"]')).toHaveTextContent('−1');
  fireEvent.click(container.querySelector('.cell[data-cell="5,4"]'));
  expect(onCellClick).toHaveBeenCalledWith(5, 4);
  act(() => jest.advanceTimersByTime(HEALTH_FLOAT_MS));
  expect(container.querySelector('.health-change[data-target="B"]')).not.toBeInTheDocument();

  // Rewinding a replay must restore the living sprite without reopening its old sheet.
  rerender(board(state));
  expect(screen.getByRole('button', { name: 'Inspecter Blop Coco Royal' })).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('dependent summons disappear with their defeated owner, while other monsters remain', () => {
  const state = fight();
  state.fighters.Bs1 = { ...state.fighters.B, id: 'Bs1', leader: false, isSummon: true,
    ownerId: 'B', name: 'Invocation', pos: { x: 6, y: 7 }, hp: 30 };
  state.order.push('Bs1');
  const { container, rerender } = render(board(state));
  expect(container.querySelectorAll('.token')).toHaveLength(4);
  const hit = applyAction(state, { type: 'CAST', spell: 'weapon', target: state.fighters.B.pos });
  expect(hit.events.filter(e => e.t === 'death').map(e => e.fighter)).toEqual(['B', 'Bs1']);
  rerender(board(hit.state, 1, hit.events));
  expect([...container.querySelectorAll('.token')].map(e => e.dataset.fighterId)).toEqual(['A', 'B2']);
});

test('a resurrected ally returns on the new cell and can be inspected again', () => {
  const state = fight();
  state.fighters.ally = { ...state.fighters.B, id: 'ally', name: 'Allié', team: 'A', leader: true };
  state.fighters.B.pos = { x: 8, y: 8 };
  state.order.push('ally');
  const { container, rerender } = render(board(state));
  fireEvent.focus(screen.getByRole('button', { name: 'Inspecter Allié' }));
  const hit = applyAction(state, { type: 'CAST', spell: 'weapon', target: state.fighters.ally.pos });
  expect(hit.state.fighters.ally.hp).toBe(0);
  rerender(board(hit.state, 1, hit.events));
  expect(container.querySelector('.token[data-fighter-id="ally"]')).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  const revive = applyAction(hit.state, { type: 'CAST', spell: 'laisse_spirituelle', target: { x: 4, y: 5 } });
  expect(revive.ok).toBe(true);
  expect(revive.state.fighters.ally.hp).toBeGreaterThan(0);
  expect(revive.state.fighters.ally.pos).toEqual({ x: 4, y: 5 });
  rerender(board(revive.state, 2, revive.events));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.focus(screen.getByRole('button', { name: 'Inspecter Allié' }));
  expect(screen.getByRole('dialog')).toHaveTextContent(`${revive.state.fighters.ally.hp} /`);
});

test('killing two dungeon monsters clears the shared stats dock and lets the player walk onto their tile', () => {
  localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ playerClass: 'IOP', mode: 'boss', bossId: 1188, bossGrade: 5 }));
  localStorage.setItem('dofus-lite-loadouts-v1', JSON.stringify({
    'A:IOP': { ...emptyLoadout('IOP'), level: 200, slots: { weapon: 2416 } },
  }));
  let match;
  const ready = LiveMatch.prototype.ready;
  jest.spyOn(LiveMatch.prototype, 'ready').mockImplementation(function () {
    const result = ready.call(this); match = this;
    this.state.board.obstacles = {};
    this.state.order = Object.keys(this.state.fighters); this.state.currentIndex = 0;
    this.state.fighters.A.pos = { x: 4, y: 4 };
    for (const [i, f] of Object.values(this.state.fighters).filter(f => f.team === 'B').entries()) f.pos = { x: 10 + i, y: 10 };
    Object.assign(this.state.fighters.B, { pos: { x: 5, y: 4 }, hp: 1 });
    Object.assign(this.state.fighters.B2, { pos: { x: 6, y: 4 }, hp: 1 });
    this.state.rngState = 123456;
    return result;
  });
  const { container } = render(<LoadoutsProvider><PlayScreen allBots={[]} /></LoadoutsProvider>);
  fireEvent.click(container.querySelector('.setup-play'));
  fireEvent.click(screen.getByRole('button', { name: 'Prêt' }));
  expect(container.querySelectorAll('.token.side-B')).toHaveLength(8);
  const victim = container.querySelector('.token[data-fighter-id="B"] .figure');
  fireEvent.focus(victim);
  expect(screen.getByRole('complementary')).toHaveAttribute('data-inspected-fighter', 'B');
  fireEvent.click(screen.getByRole('button', { name: /Marteau du Bouftou/ }));
  fireEvent.click(victim);
  expect(match.state.fighters.B.hp).toBe(0);
  expect(match.state.fighters.B2.hp).toBe(0);
  expect(match.over).toBe(false);
  expect(container.querySelectorAll('.token.side-B')).toHaveLength(6);
  expect(screen.getByRole('complementary')).toHaveAttribute('data-inspected-fighter', 'A');
  fireEvent.keyDown(document, { key: 'Escape' });
  const destination = container.querySelector('.cell[data-cell="5,4"]');
  expect(destination).toHaveClass('hl-move');
  fireEvent.click(destination);
  expect(match.state.fighters.A.pos).toEqual({ x: 5, y: 4 });
  fireEvent.focus(container.querySelector('.token[data-fighter-id="B3"] .figure'));
  expect(screen.getByRole('complementary')).toHaveAttribute('data-inspected-fighter', 'B3');
});
