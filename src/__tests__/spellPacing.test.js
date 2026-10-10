import React from 'react';
import '@testing-library/jest-dom';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { LiveMatch } from '../game/liveMatch';
import { emptyLoadout } from '../engine/equipment';
import { LoadoutsProvider } from '../ui/LoadoutsContext';
import PlayScreen from '../ui/PlayScreen';
import { combatAnimationMs, RetroSpellEffect } from '../ui/RetroAssets';

jest.mock('../ui/MapPicker', () => () => null);

const bot = { id: 'sparring', name: 'Sparring', code: 'function decide(v, a) { return a.endTurn(); }' };

beforeEach(() => {
  jest.useFakeTimers();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
  jest.useRealTimers();
  delete window.RufflePlayer;
  delete global.fetch;
});

function startFight() {
  localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ playerClass: 'IOP', botClass: 'CRA', botId: bot.id, mapId: 'arene' }));
  localStorage.setItem('dofus-lite-loadouts-v1', JSON.stringify({
    'A:IOP': { ...emptyLoadout('IOP'), level: 200, base: { force: 100 }, slots: {} },
    'B:CRA': { ...emptyLoadout('CRA'), level: 200, base: {}, slots: {} },
  }));
  jest.spyOn(Math, 'random').mockReturnValue(0.000007);
  const result = render(<LoadoutsProvider><PlayScreen allBots={[bot]} /></LoadoutsProvider>);
  fireEvent.click(result.container.querySelector('.setup-play'));
  fireEvent.click(screen.getByRole('button', { name: 'Prêt' }));
  act(() => jest.advanceTimersByTime(700));
  expect(screen.getByRole('button', { name: /Fin de tour/ })).toBeEnabled();
  return result;
}

test('consecutive targeted casts, movement and passing work without advancing animation timers', () => {
  const actions = jest.spyOn(LiveMatch.prototype, 'humanAct');
  const { container } = startFight();
  const spell = name => [...container.querySelectorAll('.spell-btn')].find(button => button.querySelector('.nm').textContent === name);
  const cast = name => {
    expect(spell(name)).toBeEnabled();
    fireEvent.click(spell(name));
    fireEvent.click(container.querySelector('.token.side-A.targetable .figure'));
    expect(actions.mock.results.at(-1).value.ok).toBe(true);
  };

  cast('Puissance');
  expect(spell('Puissance')).toBeDisabled(); // Cooldown still applies.
  cast('Vitalité');
  expect(spell('Pression')).toBeDisabled(); // Both casts spent all seven PA.
  expect(actions.mock.results.flatMap(r => r.value.events).filter(e => e.t === 'cast')).toHaveLength(2);

  fireEvent.click(container.querySelector('.cell.hl-move'));
  expect(actions.mock.results.at(-1).value.events.some(e => e.t === 'move')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: /Fin de tour/ }));
  expect(actions).toHaveBeenLastCalledWith({ type: 'PASS' });
  expect(screen.getByRole('button', { name: /Fin de tour/ })).toBeDisabled();
});

test('a self-targeted spell can follow a targeted spell immediately', () => {
  const actions = jest.spyOn(LiveMatch.prototype, 'humanAct');
  const { container } = startFight();
  const spellbar = within(container.querySelector('.spellbar'));
  fireEvent.click(spellbar.getByText('Puissance'));
  fireEvent.click(container.querySelector('.token.side-A.targetable .figure'));
  const guide = spellbar.getByRole('button', { name: /Guide de Bravoure/ });
  expect(guide).toBeEnabled();
  fireEvent.click(guide);
  expect(actions.mock.results.at(-1).value.events).toEqual(expect.arrayContaining([
    expect.objectContaining({ t: 'cast', spellName: 'Guide de Bravoure' }),
  ]));
});

test('a fourteen-second visual tail does not delay automatic actions', () => {
  const fighters = { A: { classId: 'IOP', team: 'A' } };
  const assets = {
    classes: { IOP: { male: '80' } }, actors: { 80: { animations: ['anim1R'], durations: { anim1R: 1450 } } },
    spells: { 153: { animation: 'anim1', duration: 14300 } },
  };
  expect(combatAnimationMs([{ t: 'cast', fighter: 'A', spellId: 153 }], fighters, assets)).toBeLessThanOrEqual(1100);
  // Walking still has enough time to traverse its whole path.
  expect(combatAnimationMs([{ t: 'move', cost: 12 }], fighters, assets)).toBeGreaterThanOrEqual(12 * 130);
});

test('combat effects play their full timeline faster and expire only after loading', async () => {
  let finishLoading;
  const load = jest.fn(() => new Promise(resolve => { finishLoading = resolve; }));
  const player = document.createElement('span');
  const ruffle = { load, readyState: 2 };
  player.ruffle = () => ruffle;
  player.animate = () => {};
  window.RufflePlayer = { newest: () => ({ createPlayer: () => player }) };
  const swf = Uint8Array.from([70, 87, 83, 8, 16, 0, 0, 0, 8, 0, 0, 60, 1, 0, 0, 0]);
  global.fetch = jest.fn(async () => ({ ok: true, arrayBuffer: async () => swf.buffer }));
  const onComplete = jest.fn();
  const { container } = render(<RetroSpellEffect url="effects/long.swf" duration={6000} fps={40} maxDuration={1500}
    from={{ x: 0, y: 0 }} to={{ x: 1, y: 1 }} scale={1} onComplete={onComplete} />);
  await act(async () => {});
  expect(load).toHaveBeenCalledWith(expect.objectContaining({ frameRate: 160 }));
  act(() => jest.advanceTimersByTime(10000));
  expect(onComplete).not.toHaveBeenCalled();
  await act(async () => finishLoading());
  act(() => jest.advanceTimersByTime(1749));
  expect(container.querySelector('.retro-spell-effect')).toBeInTheDocument();
  act(() => jest.advanceTimersByTime(1));
  expect(container.querySelector('.retro-spell-effect')).not.toBeInTheDocument();
  expect(onComplete).toHaveBeenCalledTimes(1);
});
