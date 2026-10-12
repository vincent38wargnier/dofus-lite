import React from 'react';
import '@testing-library/jest-dom';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { DUNGEON_BOSSES, dungeonForBoss } from '../engine/dungeons';
import { emptyLoadout } from '../engine/equipment';
import { LoadoutsProvider } from '../ui/LoadoutsContext';
import BossSetup from '../ui/BossSetup';
import PlayScreen from '../ui/PlayScreen';

afterEach(() => { cleanup(); localStorage.clear(); });

test('all rooms appear in one continuous list, with their dungeon names', () => {
  const onBossChange = jest.fn();
  const { container } = render(<BossSetup bossId={147} grade={5} seed={31} onBossChange={onBossChange} onGradeChange={() => {}} />);
  const seen = [];
  for (const card of within(container.querySelector('.boss-cards')).getAllByRole('button')) {
    const id = Number(card.dataset.bossId);
    seen.push(id);
    expect(card).toHaveTextContent(dungeonForBoss(id).name);
    expect(card).not.toHaveTextContent('indisponible');
    fireEvent.click(card);
    expect(onBossChange).toHaveBeenLastCalledWith(id);
  }
  expect(seen).toEqual(DUNGEON_BOSSES.map(boss => boss.id));
  expect(screen.queryByRole('button', { name: 'Boss suivants' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Boss précédents' })).not.toBeInTheDocument();
});

test('search distinguishes the Gladiatrool variant from playable Peki rooms', () => {
  const onBossChange = jest.fn();
  const { container } = render(<BossSetup bossId={147} grade={5} seed={31} onBossChange={onBossChange} onGradeChange={() => {}} />);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'peki' } });
  expect([...container.querySelectorAll('.boss-card')].map(card => Number(card.dataset.bossId))).toEqual([2997, 605]);
  expect(container.querySelector('.boss-unavailable')).toHaveAttribute('open');
  expect(container.querySelector('.boss-unavailable')).toHaveTextContent('Gladiatrool');
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'boufmouth' } });
  expect(container.querySelectorAll('.boss-card')).toHaveLength(0);
  expect(screen.getByRole('status')).toHaveTextContent('Aucun donjon');
  expect(onBossChange).not.toHaveBeenCalled();
});

test('a saved Gladiatrool selection can switch explicitly to the real Pandala boss and launch', () => {
  const loadout = { ...emptyLoadout('IOP'), level: 200, base: { force: 100 } };
  localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ mode: 'boss', bossId: 2891, bossGrade: 6, mapId: 'canyon' }));
  localStorage.setItem('dofus-lite-loadouts-v1', JSON.stringify({ 'A:IOP': loadout }));
  const { container, unmount } = render(<LoadoutsProvider><PlayScreen allBots={[]} /></LoadoutsProvider>);
  fireEvent.click(screen.getByRole('tab', { name: /Combat/ }));
  expect(container.querySelector('.combat-choice-launch')).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Choisir un donjon' }));
  expect(within(container.querySelector('.boss-setup')).getByRole('status')).toHaveTextContent('Gladiatrool');
  expect(screen.queryByRole('combobox', { name: 'Niveau du boss' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Choisir Fantôme de Péki Garou', exact: true }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Niveau du boss' })).toHaveValue('5');
  expect(container.querySelector('[data-dungeon-map]')).toHaveAttribute('data-dungeon-map', '12307');
  expect(JSON.parse(localStorage.getItem('dofus-lite-player-setup-v1'))).toMatchObject({ bossId: 2997, bossGrade: 5, mapId: 'canyon' });
  expect(JSON.parse(localStorage.getItem('dofus-lite-loadouts-v1'))['A:IOP']).toMatchObject({ level: 200, base: { force: 100 } });
  fireEvent.click(screen.getByRole('button', { name: 'C’est prêt' }));
  expect(container.querySelector('.combat-choice-launch')).toBeEnabled();
  fireEvent.click(container.querySelector('.combat-choice-launch'));
  expect(screen.getByRole('heading', { name: 'Sanctuaire de Pandala [29;-60]' })).toBeInTheDocument();
  expect(container.querySelector('.token[data-fighter-id="B"]')).toBeInTheDocument();
  unmount();
  render(<LoadoutsProvider><PlayScreen allBots={[]} /></LoadoutsProvider>);
  fireEvent.click(screen.getByRole('tab', { name: /Combat/ }));
  expect(screen.queryByText(/Ancienne sélection/)).not.toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Niveau du boss' })).toHaveValue('5');
});
