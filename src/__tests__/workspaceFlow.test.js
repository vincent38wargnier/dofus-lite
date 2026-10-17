import React from 'react';
import { render, waitFor } from '@testing-library/react';
import Workspace from '../platform/Workspace';
import App from '../App';
import { listLocalLibraries } from '../platform/localLibraries';
import { CREATIONS_STORAGE, emptyCreations } from '../ui/creationsStore';
import { SETUP_STORAGE } from '../ui/playerSetupState';

jest.mock('../App', () => ({ __esModule: true, default: jest.fn(() => null) }));
jest.mock('../ui/RetroAssets', () => ({ RetroAssetsProvider: ({ children }) => children }));
jest.mock('../platform/browserSandbox', () => ({ initializeSandbox: jest.fn(async () => {}) }));
jest.mock('../platform/localLibraries', () => ({ listLocalLibraries: jest.fn(), saveLocalLibrary: jest.fn() }));

const room = { id: 'potter-room', name: 'Serre', mapId: 'arene', members: [{ monsterId: 494, grade: 1, count: 1 }] };
const library = { id: 'potter', kind: 'adventure', name: 'Harry Potter', lastOpenedAt: '2026-10-16T18:00:00.000Z', imported: { dungeons: [room.id], characters: [], equipment: [] } };
const props = () => App.mock.calls.at(-1)[0];
beforeEach(() => {
  localStorage.clear(); App.mockClear(); listLocalLibraries.mockResolvedValue([library]);
  localStorage.setItem(CREATIONS_STORAGE, JSON.stringify({ ...emptyCreations(), dungeons: [room] }));
});

test('world Play selects its encounter, reload resumes edits, and a later explicit Play reselects the world', async () => {
  let view = render(<Workspace initialTab="play" libraryId="potter" />);
  await waitFor(() => expect(App).toHaveBeenCalled());
  expect(props().initialSelection).toMatchObject({ tab: 'dungeons', entry: room, openDialog: true });
  expect(props().initialWorldId).toBe('potter');
  // The combat editor saves an independent fight on a different world's map.
  const edited = { mode: 'duel', customDungeonId: null, mapId: 'canyon', playerClass: 'CRA', controller: 'ai' };
  localStorage.setItem(SETUP_STORAGE, JSON.stringify(edited));
  view.unmount(); App.mockClear(); view = render(<Workspace initialTab="play" libraryId="potter" />);
  await waitFor(() => expect(App).toHaveBeenCalled());
  expect(props().initialSelection).toMatchObject({ tab: 'combat', openDialog: true });
  expect(props().initialSelection.mode).toBeUndefined(); expect(props().initialSelection.entry).toBeUndefined();
  expect(props().initialWorldId).toBeUndefined();
  expect(JSON.parse(localStorage.getItem(SETUP_STORAGE))).toEqual(edited);
  view.unmount(); App.mockClear();
  listLocalLibraries.mockResolvedValue([{ ...library, lastOpenedAt: '2026-10-16T18:01:00.000Z' }]);
  render(<Workspace initialTab="play" libraryId="potter" />);
  await waitFor(() => expect(App).toHaveBeenCalled());
  expect(props().initialSelection).toMatchObject({ tab: 'dungeons', entry: room });
  expect(props().initialWorldId).toBe('potter');
});

test('the generic Combat shortcut resumes the current configuration without choosing a world or an opponent', async () => {
  localStorage.setItem(SETUP_STORAGE, JSON.stringify({ mode: 'boss', customDungeonId: room.id }));
  render(<Workspace initialTab="play" />);
  await waitFor(() => expect(App).toHaveBeenCalled());
  expect(props().initialSelection).toEqual({ id: 'platform-combat', tab: 'combat', returnTo: 'play' });
});
