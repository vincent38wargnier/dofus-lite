import React from 'react';
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { applyAction, createGame } from '../engine/engine';
import { ITEMS, weaponSpell } from '../engine/equipment';
import { healthChangeGroups, summarizedHealthEvents } from '../ui/healthChanges';
import BoardView from '../ui/BoardView';
import LogPanel, { combatRecord } from '../ui/LogPanel';
import { HEALTH_FLOAT_MS } from '../ui/HealthChangeFloats';

function fight(itemId = 8825) {
  const { state } = createGame({ seed: 7, fighters: [
    { id: 'A', name: 'Vous', classId: 'SACRIEUR' }, { id: 'B', monsterId: 494, monsterGrade: 5 },
  ] });
  state.board = { width: 15, height: 15, obstacles: {} };
  state.order = ['A', 'B']; state.currentIndex = 0;
  const a = state.fighters.A;
  Object.assign(a, { hp: 500, maxHp: 2000, baseMaxHp: 2000, pa: 100,
    stats: { force: 120, agilite: 80, intelligence: 60, chance: 40 }, permanent: { damage: 13, power: 25 },
    effects: [], weaponSpell: weaponSpell(ITEMS[itemId]), pos: { x: 5, y: 5 } });
  state.fighters.B.pos = { x: 7, y: 5 };
  return state;
}

function swing(state, critical = false) {
  for (let seed = 1; seed < 10000; seed++) {
    const result = applyAction({ ...state, rngState: seed }, { type: 'CAST', spell: 'weapon', target: { x: 6, y: 5 } });
    expect(result.ok).toBe(true);
    if (result.events.find(e => e.t === 'cast')?.crit === critical) return result;
  }
  throw new Error('No matching weapon roll');
}

test.each([6507, 7158, 8825, 8878])('three-line hammer %i: each element is resolved before summing actual HP loss', itemId => {
  for (const critical of [false, true]) {
    const state = fight(itemId), a = state.fighters.A;
    const b = state.fighters.B;
    b.resistances = { neutre: 20, terre: 10, air: 30, feu: 15, eau: 5 };
    b.resistancesFixed = { neutre: 3, terre: 4, air: 5, feu: 6, eau: 7 };
    state.fighters.C = { ...b, id: 'C', leader: false, pos: { x: 6, y: 6 }, effects: [] };
    const result = swing(state, critical);
    const elementStats = { neutre: 'force', terre: 'force', air: 'agilite', feu: 'intelligence', eau: 'chance' };
    for (const target of ['B', 'C']) {
      const rows = result.events.filter(e => e.t === 'damage' && e.target === target);
      expect(rows).toHaveLength(3);
      for (const [index, row] of rows.entries()) {
        const effect = (critical ? a.weaponSpell.critEffects : a.weaponSpell.effects)[index];
        expect(row.calculation.jet).toBeGreaterThanOrEqual(effect.min);
        expect(row.calculation.jet).toBeLessThanOrEqual(effect.max);
        const raw = Math.floor(row.calculation.jet * (100 + a.stats[elementStats[row.element]] + 25) / 100) + 13;
        const expected = Math.floor(Math.max(0, raw - b.resistancesFixed[row.element]) * (100 - b.resistances[row.element]) / 100);
        expect(row.calculation.raw).toBe(raw);
        expect(row.calculation.areaPercent).toBe(100);
        expect(row.amount).toBe(expected);
      }
      const total = rows.reduce((sum, row) => sum + row.amount, 0);
      expect(healthChangeGroups(result.events).find(g => g.t === 'damage' && g.target === target).amount).toBe(total);
      expect(result.state.fighters[target].hp).toBe(state.fighters[target].hp - total);
    }
    expect(result.state.fighters.A.pa).toBe(a.pa - ITEMS[itemId].weapon.pa);
    expect(new Set(result.events.map(e => e.actionId))).toEqual(new Set([1]));
  }
});

test('two life-steal rows heal half of each actual hit, with rounding per row and a separate total', () => {
  const state = fight(), result = swing(state);
  const hits = result.events.filter(e => e.t === 'damage');
  const heals = result.events.filter(e => e.t === 'heal');
  expect(heals).toHaveLength(2);
  const healed = Math.floor(hits[0].amount / 2) + Math.floor(hits[1].amount / 2);
  expect(heals.map(e => e.amount)).toEqual(hits.slice(0, 2).map(e => Math.floor(e.amount / 2)));
  expect(healthChangeGroups(result.events).find(g => g.t === 'heal').amount).toBe(healed);
  expect(result.state.fighters.A.hp).toBe(state.fighters.A.hp + healed);
  const capped = fight(); capped.fighters.A.hp = capped.fighters.A.maxHp - 1;
  const cappedResult = swing(capped);
  expect(healthChangeGroups(cappedResult.events).find(g => g.t === 'heal').amount).toBe(1);
  expect(cappedResult.state.fighters.A.hp).toBe(capped.fighters.A.maxHp);
});

test('a lethal hit displays only remaining HP, and life steal uses that capped damage', () => {
  const state = fight(); state.fighters.B.hp = 3;
  const result = swing(state);
  expect(result.state.fighters.B.hp).toBe(0);
  expect(result.events.find(e => e.t === 'damage').attempted).toBeGreaterThan(3);
  expect(healthChangeGroups(result.events).map(g => [g.t, g.amount])).toEqual([['damage', 3], ['heal', 1]]);
});

test('consecutive identical attacks stay separate in cumulative logs, including legacy records', () => {
  const first = swing(fight()), second = swing(first.state);
  const events = [...first.events, ...second.events];
  expect(new Set(second.events.map(e => e.actionId))).toEqual(new Set([2]));
  expect(healthChangeGroups(events)).toHaveLength(4);
  const legacy = events.map(({ actionId, ...event }) => event);
  expect(healthChangeGroups(legacy).map(g => [g.t, g.amount])).toEqual(healthChangeGroups(events).map(g => [g.t, g.amount]));
  const exported = combatRecord(events, { A: 'Vous', B: 'Poutch' }, second.state);
  expect(exported.events.filter(e => e.t === 'damage')).toHaveLength(6);
  expect(exported.events.filter(e => e.t === 'damage').every(e => e.calculation && e.actionId)).toBe(true);
});

test('damage and healing to the same target are not netted; zero damage and delayed turns remain visible', () => {
  const events = [
    { t: 'damage', target: 'A', amount: 20, actionId: 1 },
    { t: 'heal', target: 'A', amount: 15, actionId: 1 },
    { t: 'damage', target: 'A', amount: 30, actionId: 1 },
    { t: 'heal', target: 'A', amount: 10, actionId: 1 },
    { t: 'damage', target: 'B', amount: 0, actionId: 1 },
    { t: 'turn_end' }, { t: 'damage', target: 'A', amount: 4 },
    { t: 'turn_start' }, { t: 'heal', target: 'A', amount: 5 },
  ];
  expect(healthChangeGroups(events).map(g => [g.target, g.t, g.amount])).toEqual([
    ['A', 'damage', 50], ['A', 'heal', 25], ['B', 'damage', 0], ['A', 'damage', 4], ['A', 'heal', 5],
  ]);
});

test('the board shows one damage total per victim and one healing total for the caster', () => {
  const result = swing(fight());
  const { container } = render(<BoardView state={result.state} frameEvents={result.events} frameIdx={1} />);
  const totals = healthChangeGroups(result.events);
  expect(container.querySelectorAll('.health-change')).toHaveLength(2);
  expect(container.querySelector('.health-change.dmg')).toHaveTextContent(`−${totals.find(g => g.t === 'damage').amount}`);
  expect(container.querySelector('.health-change.heal')).toHaveTextContent(`+${totals.find(g => g.t === 'heal').amount}`);
});

test('rapid casts retain separate, spaced numbers through movement, then expire; replay rewinds clear them', () => {
  jest.useFakeTimers();
  try {
    const state = fight();
    const board = (frameIdx, frameEvents) => <BoardView state={state} frameEvents={frameEvents} frameIdx={frameIdx} viewerTeam="A" />;
    const events = [{ t: 'damage', target: 'A', amount: 50, actionId: 1 }, { t: 'heal', target: 'A', amount: 25, actionId: 1 }];
    const { container, rerender } = render(board(1, events));
    act(() => jest.advanceTimersByTime(150));
    rerender(board(2, [{ t: 'damage', target: 'A', amount: 80, actionId: 2 }]));
    rerender(board(3, []));
    let floats = [...container.querySelectorAll('.health-change')];
    expect(floats.map(e => e.textContent)).toEqual(['−50', '+25', '−80']);
    expect(new Set(floats.map(e => e.style.top)).size).toBe(3);
    expect(parseFloat(floats[0].style.top)).toBeLessThan(parseFloat(floats[2].style.top));
    rerender(board(3, []));
    expect(container.querySelectorAll('.health-change')).toHaveLength(3);
    act(() => jest.advanceTimersByTime(HEALTH_FLOAT_MS - 150));
    expect([...container.querySelectorAll('.health-change')].map(e => e.textContent)).toEqual(['−80']);
    act(() => jest.advanceTimersByTime(150));
    expect(container.querySelectorAll('.health-change')).toHaveLength(0);
    rerender(board(1, events));
    expect(container.querySelectorAll('.health-change')).toHaveLength(2);
    rerender(board(0, []));
    expect(container.querySelectorAll('.health-change')).toHaveLength(0);
  } finally { jest.useRealTimers(); }
});

test('a newly invisible enemy does not leave a retained number revealing its position', () => {
  const state = fight();
  const board = s => <BoardView state={s} frameEvents={[{ t: 'damage', target: 'B', amount: 40 }]} frameIdx={1} viewerTeam="A" />;
  const { container, rerender } = render(board(state));
  expect(container.querySelector('.health-change')).toBeInTheDocument();
  const hidden = JSON.parse(JSON.stringify(state));
  hidden.fighters.B.effects.push({ kind: 'invisibility', turnsLeft: 2 });
  rerender(board(hidden));
  expect(container.querySelector('.health-change')).not.toBeInTheDocument();
});

test('damage and healing over adjacent fighters reserve separate columns', () => {
  const state = fight(); state.fighters.B.pos = { x: 6, y: 5 };
  const events = [{ t: 'damage', target: 'B', amount: 128, actionId: 1 }, { t: 'heal', target: 'A', amount: 26, actionId: 1 }];
  const { container } = render(<BoardView state={state} frameEvents={events} frameIdx={1} />);
  const columns = [...container.querySelectorAll('.health-change')].map(e => ({
    left: parseFloat(e.style.left) - parseFloat(e.style.width) / 2,
    right: parseFloat(e.style.left) + parseFloat(e.style.width) / 2,
  })).sort((a, b) => a.left - b.left);
  expect(columns).toHaveLength(2);
  expect(columns[0].right + 10).toBeLessThanOrEqual(columns[1].left);
});

test('the compact journal sums the hammer, while details and exported events preserve each calculation', () => {
  const result = swing(fight());
  const original = JSON.stringify(result.events);
  const total = healthChangeGroups(result.events).find(g => g.t === 'damage').amount;
  const { container } = render(<LogPanel events={result.events} state={result.state} namesById={{ A: 'Vous', B: 'Poutch' }} />);
  expect(container.querySelectorAll('.entry.dmg')).toHaveLength(1);
  expect(container.querySelector('.entry.dmg')).toHaveTextContent(`Poutch : −${total} PV`);
  expect(container.querySelector('.log')).not.toHaveTextContent(/lance|subit|récupère|érosion|au total|PV max/);
  fireEvent.click(screen.getByLabelText('Détails des jets'));
  expect(container.querySelectorAll('.entry.dmg')).toHaveLength(3);
  expect(container.querySelectorAll('.entry.dmg .muted')).toHaveLength(3);
  expect(JSON.stringify(result.events)).toBe(original);
  expect(summarizedHealthEvents(result.events).filter(e => e.t === 'heal')).toHaveLength(1);
});
