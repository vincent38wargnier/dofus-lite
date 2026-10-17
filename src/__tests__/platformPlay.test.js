import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import WorldRating, { RatingSummary } from '../platform/WorldRating';
import { installedLibraryFor, libraryCreations, libraryPlayRoute, selectionForDungeon, recentLibraries } from '../platform/playNavigation';

test('playing a publication finds the exact installed version, not another world with the same name', () => {
  const installed = [{ id: 'old', name: 'Same title' }, { id: 'new', name: 'Same title' }];
  expect(installedLibraryFor({ sha256: 'new', name: 'Same title' }, installed)).toBe(installed[1]);
  expect(installedLibraryFor({ sha256: 'missing', name: 'Same title' }, installed)).toBeNull();
  expect(libraryPlayRoute(installed[1])).toBe('workspace/play/new');
});
test('a world opens only its own imported adventures with the normal combat launcher', () => {
  const a = { id: 'a', name: 'Chosen campaign' }, b = { id: 'b', name: 'Unrelated campaign' };
  expect(libraryCreations({ imported: { dungeons: ['a'], characters: ['hero'] } }, { dungeons: [a, b], characters: [{ id: 'other' }, { id: 'hero' }] })).toEqual({ dungeons: [a], characters: [{ id: 'hero' }] });
  expect(selectionForDungeon(a)).toMatchObject({ tab: 'dungeons', entry: a, returnTo: 'play', openDialog: true });
  expect(libraryCreations({}, { dungeons: [a], characters: [] }).dungeons).toEqual([]);
});
test('My Games keeps recently played worlds first without changing the stored array', () => {
  const list = [{ id: 'first', installedAt: '2026-10-01' }, { id: 'second', installedAt: '2026-09-01', lastOpenedAt: '2026-10-16' }];
  expect(recentLibraries(list).map(x => x.id)).toEqual(['second', 'first']);
  expect(list[0].id).toBe('first');
});
test('anonymous readers can see ratings but must sign in to submit', () => {
  const login = jest.fn(), save = jest.fn();
  render(<WorldRating library={{ id: 'world', rating: { count: 2, average: 4.5 } }} onLogin={login} onSave={save} />);
  expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Se connecter pour noter' }));
  expect(login).toHaveBeenCalledTimes(1); expect(save).not.toHaveBeenCalled();
});
test('rating selection requires explicit submission and changes reset when the account changes', () => {
  const save = jest.fn(), library = { id: 'world', owner: 'author', myRating: 2, rating: { count: 1, average: 2 } };
  const { rerender } = render(<WorldRating library={library} user={{ id: 'alice' }} onSave={save} />);
  fireEvent.click(screen.getByRole('radio', { name: '5 étoiles' })); expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Modifier ma note' })); expect(save).toHaveBeenLastCalledWith(5);
  rerender(<WorldRating library={{ ...library, myRating: null }} user={{ id: 'bob' }} onSave={save} />);
  expect(screen.getByRole('button', { name: 'Enregistrer ma note' })).toBeDisabled();
});
test('own-world ratings cannot be entered and empty averages are honest', () => {
  const { rerender } = render(<WorldRating library={{ owner: 'author' }} user={{ id: 'author' }} />);
  expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  rerender(<RatingSummary rating={{ count: 0, average: null }} />);
  expect(screen.getByText('Pas encore de note')).toBeInTheDocument();
});
