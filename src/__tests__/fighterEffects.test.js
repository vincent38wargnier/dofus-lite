import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, within } from '@testing-library/react';
import { createGame, applyAction } from '../engine/engine';
import { emptyLoadout } from '../engine/equipment';
import { effectiveStat } from '../engine/formulas';
import FighterPanel from '../ui/FighterPanel';
import LogPanel from '../ui/LogPanel';
import { groupCombatEffects, temporaryBonuses } from '../ui/combatEffects';

const loadout = (classId, slots = {}) => ({ ...emptyLoadout(classId), level: 200, base: {}, slots });
function battle() {
  const { state } = createGame({ seed: 7, fighters: [
    { id: 'A', name: 'Vous', classId: 'SACRIEUR', loadout: loadout('SACRIEUR') },
    { id: 'B', name: 'Adversaire', classId: 'ENUTROF', loadout: loadout('ENUTROF', { weapon: 8992 }) },
  ] });
  state.order = ['A', 'B']; state.currentIndex = 0;
  state.fighters.A.pos = { x: 5, y: 5 }; state.fighters.B.pos = { x: 6, y: 5 };
  return state;
}
function cast(state, spell, target, accept = result => !result.events.some(e => e.t === 'spell_fail')) {
  for (let seed = 1; seed <= 500; seed++) {
    const result = applyAction({ ...state, rngState: seed }, { type: 'CAST', spell, target });
    expect(result.ok).toBe(true);
    if (accept(result)) return result;
  }
  throw new Error(`No accepted result for ${spell}`);
}
const panel = state => <FighterPanel fighter={state.fighters.A} fighters={state.fighters} side="A" isActive={state.order[state.currentIndex] === 'A'} />;

test('real punishment gains are visible after multiple hits and survive the per-turn counter reset', () => {
  let state = battle();
  state = cast(state, 'chatiment_force', state.fighters.A.pos).state;
  state = applyAction(state, { type: 'PASS' }).state;
  const hit = cast(state, 'weapon', state.fighters.A.pos);
  state = hit.state;
  const gains = state.fighters.A.effects.filter(e => e.kind === 'buff' && e.stat === 'force');
  expect(gains.length).toBeGreaterThan(1);
  expect(gains.every(e => e.source === 'A' && e.spellId)).toBe(true);
  const total = gains.reduce((sum, e) => sum + e.value, 0);
  const punishment = state.fighters.A.effects.find(e => e.kind === 'punishment');
  const { rerender } = render(panel(state));
  expect(screen.getByLabelText('Cumul des bonus et malus temporaires')).toHaveTextContent(`+${total} Force`);
  expect(screen.getByTitle(/^Force :/)).toHaveTextContent(String(effectiveStat(state.fighters.A, 'force')));
  expect(screen.getByRole('progressbar')).toHaveAttribute('value', String(total));
  expect(groupCombatEffects(state.fighters.A)).toHaveLength(1);
  expect(screen.getByText(`${gains.length} gains cumulés`)).toBeInTheDocument();

  state = applyAction(state, { type: 'PASS' }).state;
  rerender(panel(state));
  expect(screen.getByRole('progressbar')).toHaveAttribute('value', '0');
  expect(screen.getByRole('progressbar')).toHaveAttribute('max', String(punishment.maxPerTurn));
  expect(screen.getByLabelText('Cumul des bonus et malus temporaires')).toHaveTextContent(`+${total} Force`);

  render(<LogPanel events={hit.events} namesById={{ A: 'Vous', B: 'Adversaire' }} state={state} />);
  expect(screen.getAllByText(new RegExp(`Vous : \\+${gains[0].value} Force — Châtiment Forcé`)).length).toBeGreaterThan(0);
});

test('a real dispel removes the punishment, its displayed bonuses and the boosted characteristic', () => {
  let state = battle();
  state = cast(state, 'chatiment_agile', state.fighters.A.pos).state;
  state = applyAction(state, { type: 'PASS' }).state;
  state = cast(state, 'weapon', state.fighters.A.pos).state;
  const { rerender } = render(panel(state));
  expect(temporaryBonuses(state.fighters.A).agilite).toBeGreaterThan(0);
  state = applyAction(state, { type: 'PASS' }).state;
  state = applyAction(state, { type: 'PASS' }).state;
  state = cast(state, 'pelle_fantomatique', state.fighters.A.pos, r => r.events.some(e => e.t === 'dispel')).state;
  rerender(panel(state));
  expect(screen.getByText('Aucun effet temporaire.')).toBeInTheDocument();
  expect(screen.queryByLabelText('Cumul des bonus et malus temporaires')).not.toBeInTheDocument();
  expect(within(screen.getByTitle(/^Agilité :/)).queryByLabelText(/temporaire/)).not.toBeInTheDocument();
});

test('different expirations and casters remain distinct, and negative effects stay visible beside bonuses', () => {
  let state = battle();
  state.fighters.A.effects = [
    { kind: 'buff', stat: 'force', value: 100, turnsLeft: 1, source: 'A', name: 'Puissance' },
    { kind: 'buff', stat: 'force', value: 200, turnsLeft: 3, source: 'A', name: 'Puissance' },
    { kind: 'buff', stat: 'force', value: 40, turnsLeft: 3, source: 'B', name: 'Puissance' },
    { kind: 'buff', stat: 'pa', value: 2, turnsLeft: 3, source: 'A', name: 'Dévouement' },
    { kind: 'buff', stat: 'pm', value: -1, turnsLeft: 2, source: 'B', name: 'Maladresse' },
    { kind: 'buff', stat: 'range', value: -3, turnsLeft: 2, source: 'B', name: 'Œil de Taupe' },
    { kind: 'buff', stat: 'res_feu', value: -15, turnsLeft: 2, source: 'B', name: 'Vulnérabilité' },
    { kind: 'buff', stat: 'erosion', value: 5, turnsLeft: 2, source: 'A', name: 'Châtiment' },
    { kind: 'armor', value: 12, turnsLeft: 3, source: 'A', name: 'Armure' },
    { kind: 'state', stateId: 7, turnsLeft: 1, source: 'B', name: 'Expiation' },
  ];
  const { rerender } = render(panel(state));
  const totals = within(screen.getByLabelText('Cumul des bonus et malus temporaires'));
  expect(totals.getByText('+340 Force')).toBeInTheDocument();
  expect(totals.getByText('+2 PA')).toBeInTheDocument();
  expect(totals.getByText('−1 PM')).toHaveClass('negative');
  expect(totals.getByText('−3 PO')).toHaveClass('negative');
  expect(totals.getByText('−15 % résistance feu')).toHaveClass('negative');
  expect(totals.getByText('+5 % érosion')).toHaveClass('negative');
  expect(screen.getByText('Réduction de base : 12')).toBeInTheDocument();
  expect(screen.getByText('Pesanteur')).toBeInTheDocument();
  expect(screen.getAllByRole('heading', { name: 'Puissance', level: 4 })).toHaveLength(2);
  expect(screen.getAllByText('Fin du tour')).toHaveLength(2);
  expect(screen.getAllByText('Par Adversaire')).toHaveLength(5);

  state = applyAction(state, { type: 'PASS' }).state;
  rerender(panel(state));
  expect(screen.getByLabelText('Cumul des bonus et malus temporaires')).toHaveTextContent('+240 Force');
  expect(screen.queryByText('Pesanteur')).not.toBeInTheDocument();
});
