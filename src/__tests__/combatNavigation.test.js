import React from 'react';
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import App from '../App';
import ArenaScreen from '../ui/ArenaScreen';
import { LoadoutsProvider } from '../ui/LoadoutsContext';
import { createGame } from '../engine/engine';
import { dungeonMapId, dungeonRoster } from '../engine/dungeons';
import { emptyLoadout } from '../engine/equipment';
import { BUILTIN_BOTS } from '../bots/builtins';
import * as runner from '../arena/runner';

function recording(config) {
  const init = createGame({ mapId: config.bossId ? dungeonMapId(config.bossId) : config.mapId, seed: config.seed,
    fighters: [{ id: 'A', classId: config.classes.A, loadout: config.loadouts?.A },
      ...(config.bossId ? dungeonRoster(config.bossId, config.bossGrade, config.seed)
        : [{ id: 'B', classId: config.classes.B, loadout: config.loadouts?.B }])] });
  const finalState = JSON.parse(JSON.stringify(init.state));
  Object.values(finalState.fighters).filter(f => f.team === 'B').forEach(f => { f.hp = 0; });
  Object.assign(finalState, { over: true, winner: 'A', endReason: 'ko' });
  const end = [{ t: 'match_end', winner: 'A', reason: 'ko' }];
  return { config: { botNames: { A: config.bots.A.name, B: config.bots.B?.name || 'Monstres' } },
    stats: { A: { damageDealt: 0, errors: 0 }, B: { damageDealt: 0, errors: 0 } },
    finalState, endReason: 'ko', winner: 'A', turns: 1, events: [...init.events, ...end],
    frames: [init, { events: end, state: finalState }] };
}
const navigate = name => fireEvent.click(within(screen.getByRole('navigation', { name: 'Navigation principale' })).getByRole('button', { name, exact: true }));
const launch = () => {
  fireEvent.click(screen.getByRole('tab', { name: 'Combat' }));
  fireEvent.click(screen.getByRole('button', { name: 'Tout en IA' }));
  fireEvent.click(screen.getByRole('button', { name: 'Lancer le combat' }));
};
beforeEach(() => {
  localStorage.clear();
  jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
  localStorage.setItem('dofus-lite-loadouts-v1', JSON.stringify({ 'A:IOP': { ...emptyLoadout('IOP'), level: 200, base: {}, slots: { weapon: 2416 } } }));
  localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ mode: 'boss', bossId: 147, bossGrade: 1, mapId: 'canyon' }));
});
afterEach(() => jest.restoreAllMocks());

test('Combat is the single entry point: watch a result, resume it after another tab, and return to the same setup', async () => {
  const simulate = jest.spyOn(runner, 'runMatchAsync').mockImplementation(config => Promise.resolve(recording(config)));
  const { container } = render(<App />);
  const nav = within(screen.getByRole('navigation', { name: 'Navigation principale' }));
  expect(nav.queryByRole('button', { name: 'IA contre IA' })).toBeNull();
  launch();
  fireEvent.click(await screen.findByRole('button', { name: 'Voir le résultat' }));
  expect(container.querySelector('[data-outcome="victory"]')).toBeVisible();
  expect(nav.getByRole('button', { name: 'Jouer' })).toHaveAttribute('aria-current', 'page');
  expect(screen.queryByRole('region', { name: 'Préparer un duel IA contre IA' })).toBeNull();
  const frame = container.querySelector('[data-auto-dungeon]').dataset.replayFrame;
  fireEvent.click(screen.getByRole('button', { name: 'Retour à Combat' }));
  navigate('Atelier'); navigate('Jouer');
  expect(screen.getByRole('tab', { name: 'Combat' })).toHaveAttribute('aria-selected', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Reprendre le combat' }));
  expect(container.querySelector('[data-auto-dungeon]')).toHaveAttribute('data-replay-frame', frame);
  expect(simulate).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Retour à Combat' }));
  expect(screen.getByRole('region', { name: 'Choisir un combat' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Tout en IA' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Reprendre le combat' })).toBeVisible();
  expect(JSON.parse(localStorage.getItem('dofus-lite-player-setup-v1'))).toMatchObject({ mode: 'boss', bossId: 147, bossGrade: 1, controller: 'ai', mapId: 'canyon' });
});

test('cancelling from the shared playback returns to Combat and discards a late result', async () => {
  let resolve;
  const simulate = jest.spyOn(runner, 'runMatchAsync').mockImplementation(() => new Promise(done => { resolve = done; }));
  const { container } = render(<App />); launch();
  fireEvent.click(await screen.findByRole('button', { name: 'Annuler' }));
  const [config, options] = simulate.mock.calls[0];
  expect(options.signal.aborted).toBe(true);
  await act(async () => resolve(recording(config)));
  expect(container.querySelector('[data-auto-dungeon]')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Reprendre le combat' })).toBeNull();
  expect(screen.getByRole('tab', { name: 'Combat' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('button', { name: 'Lancer le combat' })).toBeEnabled();
});

test('a tournament replay keeps playback controls without exposing the old configuration screen', async () => {
  jest.spyOn(runner, 'runMatchAsync').mockImplementation(config => Promise.resolve(recording(config)));
  const exit = jest.fn(), available = jest.fn();
  const replay = { botA: 'pantin', botB: 'pantin', classA: 'IOP', classB: 'CRA', mapId: 'canyon', seed: 7 };
  render(<LoadoutsProvider><ArenaScreen allBots={BUILTIN_BOTS} replay={replay} onReplayConsumed={jest.fn()}
    onExit={exit} exitLabel="Retour au tournoi" onSessionChange={available} /></LoadoutsProvider>);
  expect(await screen.findByRole('slider', { name: 'Progression du combat' })).toBeVisible();
  expect(screen.queryByRole('combobox', { name: 'IA A' })).toBeNull();
  expect(available).toHaveBeenLastCalledWith(true);
  fireEvent.click(screen.getByRole('button', { name: 'Retour au tournoi' }));
  expect(exit).toHaveBeenCalledTimes(1);
  expect(available).toHaveBeenLastCalledWith(true);
});
