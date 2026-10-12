import React from 'react';
import '@testing-library/jest-dom';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createGame } from '../engine/engine';
import { dungeonMapId, dungeonRoster } from '../engine/dungeons';
import { emptyLoadout } from '../engine/equipment';
import { BUILTIN_BOTS } from '../bots/builtins';
import * as runner from '../arena/runner';
import { LoadoutsProvider } from '../ui/LoadoutsContext';
import PlayScreen from '../ui/PlayScreen';
import ArenaScreen from '../ui/ArenaScreen';

const loadout = { ...emptyLoadout('IOP'), level: 200, base: { force: 100 }, slots: { weapon: 2416 } };
const app = <LoadoutsProvider><ArenaScreen allBots={BUILTIN_BOTS} /></LoadoutsProvider>;
beforeAll(() => {
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
});

function recording(config) {
  const init = createGame({ mapId: dungeonMapId(config.bossId), seed: config.seed,
    fighters: [{ id: 'A', classId: config.classes.A, loadout: config.loadouts.A }, ...dungeonRoster(config.bossId, config.bossGrade, config.seed)] });
  const finalState = JSON.parse(JSON.stringify(init.state));
  Object.values(finalState.fighters).filter(f => f.team === 'B').forEach(f => { f.hp = 0; });
  Object.assign(finalState, { over: true, winner: 'A', endReason: 'ko' });
  const end = [{ t: 'match_end', winner: 'A', reason: 'ko' }];
  return { finalState, endReason: 'ko', winner: 'A', turns: 1, events: [...init.events, ...end],
    frames: [init, { events: end, state: finalState }] };
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('dofus-lite-loadouts-v1', JSON.stringify({ 'A:IOP': loadout }));
  localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ mode: 'boss', bossId: 147, bossGrade: 1, mapId: 'canyon' }));
});
afterEach(() => { cleanup(); jest.restoreAllMocks(); localStorage.clear(); });

test('choose a player AI in Arena, launch with the saved stuff, inspect the result, then return to its options', async () => {
  const simulate = jest.spyOn(runner, 'runMatchAsync').mockImplementation(config => Promise.resolve(recording(config)));
  const { container } = render(app);
  fireEvent.click(screen.getByRole('button', { name: /Contre un donjon/ }));
  fireEvent.change(screen.getByRole('combobox', { name: 'IA A' }), { target: { value: 'cortex' } });
  fireEvent.click(screen.getByRole('button', { name: /Simuler le donjon/ }));
  await screen.findByRole('button', { name: 'Voir le résultat' });
  const cfg = simulate.mock.calls[0][0];
  expect(cfg).toMatchObject({ mode: 'boss', bossId: 147, bossGrade: 1, controllerName: 'Cortex', classes: { A: 'IOP' }, loadouts: { A: loadout } });
  expect(typeof cfg.bots.A.decide).toBe('function');
  expect(screen.queryByRole('button', { name: 'Prêt' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Fin de tour/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Voir le résultat' }));
  expect(container.querySelector('[data-outcome="victory"]')).toHaveTextContent('8 / 8 monstres vaincus');
  fireEvent.click(screen.getByRole('button', { name: 'Lire le combat' }));
  expect(container.querySelector('[data-auto-dungeon]')).toHaveAttribute('data-replay-frame', '0');
  fireEvent.click(screen.getByRole('button', { name: 'Retour à Combat' }));
  expect(JSON.parse(localStorage.getItem('dofus-lite-loadouts-v1'))['A:IOP']).toMatchObject(loadout);
  expect(JSON.parse(localStorage.getItem('dofus-lite-player-setup-v1'))).toMatchObject({ mode: 'boss', mapId: 'canyon' });
  expect(screen.getByRole('combobox', { name: 'IA A' })).toHaveValue('cortex');
});

test('cancelling a running simulation aborts it and ignores a late result', async () => {
  let resolve;
  const simulate = jest.spyOn(runner, 'runMatchAsync').mockImplementation(() => new Promise(done => { resolve = done; }));
  render(app);
  fireEvent.click(screen.getByRole('button', { name: /Contre un donjon/ }));
  fireEvent.click(screen.getByRole('button', { name: /Simuler le donjon/ }));
  await screen.findByRole('button', { name: 'Annuler' });
  const [config, options] = simulate.mock.calls[0];
  fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
  expect(options.signal.aborted).toBe(true);
  await act(async () => resolve(recording(config)));
  expect(screen.queryByRole('button', { name: 'Voir le résultat' })).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: /Simuler le donjon/ })).toBeEnabled());
});

test('an old automatic selection becomes manual without changing its boss, grade or PvP map', () => {
  localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ mode: 'boss-auto', bossId: 147, bossGrade: 1, mapId: 'canyon' }));
  const { container } = render(<LoadoutsProvider><PlayScreen allBots={BUILTIN_BOTS} /></LoadoutsProvider>);
  fireEvent.click(screen.getByRole('tab', { name: /Combat/ }));
  expect(screen.queryByText('Donjon automatique')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Donjon Défiez une salle entière' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(container.querySelector('.setup-play'));
  fireEvent.click(container.querySelector('.combat-choice-launch'));
  expect(screen.getByRole('button', { name: 'Prêt' })).toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem('dofus-lite-player-setup-v1'))).toMatchObject({ mode: 'boss', bossId: 147, bossGrade: 1, mapId: 'canyon' });
});
