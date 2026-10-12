import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import PlayScreen from '../ui/PlayScreen';
import { LoadoutsProvider } from '../ui/LoadoutsContext';
import { ProfilesProvider } from '../ui/ProfilesContext';
import { CreationsProvider } from '../ui/CreationsContext';
import { BUILTIN_BOTS } from '../bots/builtins';
import { encode } from '../net/p2p';

const wrap = child => <React.StrictMode><LoadoutsProvider><CreationsProvider><ProfilesProvider>{child}</ProfilesProvider></CreationsProvider></LoadoutsProvider></React.StrictMode>;
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
beforeEach(() => { localStorage.clear(); window.history.replaceState(null, '', '/'); });

test('the shared combat menu opens friends and returns to Combat without starting a local match', () => {
  const { container } = render(wrap(<PlayScreen allBots={BUILTIN_BOTS} />));
  fireEvent.click(container.querySelector('.setup-play'));
  const main = within(screen.getByRole('dialog', { name: 'Choisir un combat' }));
  fireEvent.click(main.getByRole('button', { name: /Jouer avec des amis/ }));
  const friends = within(screen.getByRole('dialog', { name: 'Jouer avec des amis' }));
  expect(screen.queryByRole('dialog', { name: 'Choisir un combat' })).toBeNull();
  expect(friends.getByRole('button', { name: 'Créer le salon' })).toBeEnabled();
  expect(friends.getByText('Duel entre amis')).toBeInTheDocument();
  fireEvent.click(friends.getByRole('button', { name: 'Retour au combat' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(container.querySelector('[data-setup-section="match"]')).toBeInTheDocument();
  expect(container.querySelector('.fight-screen')).toBeNull();
});
test('an invitation URL survives StrictMode, opens Join, and strips the secret fragment', () => {
  const code = encode(['v=0', 'a=ice-ufrag:abcd', 'a=ice-pwd:abcdefghijklmnopqrstuvwx', `a=fingerprint:sha-256 ${Array(32).fill('AA').join(':')}`,
    'a=setup:actpass', 'a=candidate:1 1 udp 123 192.0.2.1 51234 typ srflx', ''].join('\r\n'));
  window.history.replaceState(null, '', `/#p2p=${code}`);
  const { container } = render(wrap(<PlayScreen allBots={BUILTIN_BOTS} />));
  const friends = within(screen.getByRole('dialog', { name: 'Jouer avec des amis' }));
  expect(friends.getByRole('textbox', { name: 'Invitation de votre ami' })).toHaveValue(code);
  expect(friends.getByRole('button', { name: 'Rejoindre un salon' })).toHaveAttribute('aria-pressed', 'true');
  expect(window.location.hash).toBe('');
  expect(container.querySelector('.fight-screen')).toBeNull();
  fireEvent.click(friends.getByRole('button', { name: 'Fermer le salon' }));
  expect(document.body.style.overflow).not.toBe('hidden');
});
