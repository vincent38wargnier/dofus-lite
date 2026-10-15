import React from 'react';
import '@testing-library/jest-dom';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { buildSpell, spellAtGrade } from '../engine/classes';
import { createGame, spellsOf } from '../engine/engine';
import { newAuthoredSpell } from '../engine/authoredSpells';
import { emptyLoadout } from '../engine/equipment';
import { getMonster } from '../engine/monsters';
import { LiveMatch } from '../game/liveMatch';
import { LoadoutsProvider } from '../ui/LoadoutsContext';
import CombatSpellbook from '../ui/CombatSpellbook';
import CombatSpellBar from '../ui/CombatSpellBar';
import SpellDetailCard from '../ui/SpellDetailCard';
import PlayScreen from '../ui/PlayScreen';
import AutoDungeonFight from '../ui/AutoDungeonFight';
import * as runner from '../arena/runner';
import { describeSpellEffect, inspectCombatSpell, spellCanHitAllies, spellZoneLabel } from '../ui/spellDetailModel';

jest.mock('../ui/MapPicker', () => ({ __esModule: true, default: () => null, MapPreview: () => null }));
beforeEach(() => { jest.useFakeTimers(); localStorage.clear(); });
afterEach(() => { cleanup(); jest.restoreAllMocks(); jest.useRealTimers(); });

function fixture() {
  const { state } = createGame({ seed: 5, fighters: [{ id: 'A', classId: 'IOP', loadout: { ...emptyLoadout('IOP'), level: 200, slots: { weapon: 2416 } } }, { id: 'B', classId: 'CRA' }] });
  const spell = { ...newAuthoredSpell(), name: 'Lance de givre', description: 'Le froid de la Longue Nuit.' };
  state.fighters.B = { ...state.fighters.B, name: 'Sonneur de la Nuit', isMonster: true,
    customMonster: { key: 'sonneur', name: 'Sonneur de la Nuit', reference: { monsterId: 147, grade: 5 },
      tuning: { hpPercent: 100, statsPercent: 100, paBonus: 0, pmBonus: 0 }, spells: [spell] } };
  state.fighters.S = { ...state.fighters.A, id: 'S', team: 'B', name: 'Tofu invoqué', isSummon: true, monsterId: 34, summonGrade: 5, loadout: null, weaponSpell: null };
  state.order.push('S');
  return { state, spell };
}

test('Furie distinguishes enemy damage from its immediate caster boost', () => {
  const furie = spellAtGrade(447, 5);
  const damage = describeSpellEffect(furie.effects.find(e => e.kind === 'damage'), furie);
  const boost = describeSpellEffect(furie.effects.find(e => e.kind === 'buffDamage'), furie);
  expect(damage.text).toMatch(/dégâts Eau/);
  expect(damage.zone).toBe('Croix · rayon 1');
  expect(boost).toMatchObject({ text: '+8 dommages', target: 'Lanceur', duration: '3 tours' });
  expect(describeSpellEffect({ kind: 'buffDamage', min: 5, max: 5, duration: 0, targetMask: 32 }, furie).duration).toBe('Ce tour');
});

test('life steal and resource removal have explicit recovery and dodge semantics', () => {
  const spell = spellAtGrade(442, 5);
  expect(describeSpellEffect(spell.effects[0], spell).note).toContain('moitié des PV réellement retirés');
  expect(describeSpellEffect({ kind: 'removePm', min: 2, max: 2 }, spell)).toMatchObject({ text: '−2 PM', note: expect.stringContaining('esquivable') });
  expect(describeSpellEffect({ kind: 'debuffPa', min: 1, max: 1 }, spell).note).toBe('Retrait non esquivable.');
});

test('zones and friendly fire use effect masks, and triggers expose their real payload', () => {
  const spell = spellAtGrade(157, 6); // Épée de Iop.
  expect(spellZoneLabel('Xd')).toBe('Croix · rayon 3');
  expect(spellZoneLabel('Lc')).toBe('Ligne · 3 cases');
  expect(spellZoneLabel('C_')).toBe('Toute la carte');
  expect(spellCanHitAllies({ effects: [{ kind: 'damage', zone: 'Cb', targetMask: 0 }] })).toBe(true);
  expect(spellCanHitAllies({ effects: [{ kind: 'damage', zone: 'Cb', targetMask: 1 }] })).toBe(false);
  const trap = describeSpellEffect({ kind: 'trap', zone: 'Cb', trigger: { effects: [{ kind: 'damage', min: 7, max: 10, element: 'terre', zone: 'Pa' }] } }, spell);
  expect(trap.children[0].text).toBe('7–10 dégâts Terre');
});

test('effective range, crits and cooldowns follow fighter bonuses without altering the spell', () => {
  const { state } = fixture(), fighter = state.fighters.A;
  const raw = spellAtGrade(161, 6), before = JSON.stringify(raw);
  fighter.effects = [{ kind: 'buff', stat: 'range', value: 2 }, { kind: 'buff', stat: 'crit', value: 100 }];
  fighter.cooldowns = { [raw.key]: 2 };
  const info = inspectCombatSpell(raw, fighter);
  expect(info.range[1]).toBe(raw.range[1] + 2);
  expect(info.effectiveCritRate).toBe(2);
  expect(info.cooldownLeft).toBe(2);
  expect(JSON.stringify(raw)).toBe(before);
  fighter.effects.push({ kind: 'minRolls', turnsLeft: 1 });
  expect(inspectCombatSpell(raw, fighter).effectiveCritRate).toBe(0);
});

test('critical tabs display actual critical lines rather than reusing normal damage', () => {
  const spell = buildSpell({ ...newAuthoredSpell(), critRate: 30,
    effects: [{ kind: 'damage', min: 12, max: 16, element: 'air', zone: 'Pa' }],
    critEffects: [{ kind: 'damage', min: 18, max: 22, element: 'air', zone: 'Pa' }] });
  render(<SpellDetailCard spell={spell} />);
  expect(screen.getByText('12–16 dégâts Air')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Critique/ }));
  expect(screen.getByText('18–22 dégâts Air')).toBeInTheDocument();
  expect(screen.queryByText('12–16 dégâts Air')).not.toBeInTheDocument();
});

test('the library reads custom and summoned spellbooks, native grades and equipped weapons without mutating combat', () => {
  const { state } = fixture(), before = JSON.stringify(state);
  const { container } = render(<CombatSpellbook state={state} onClose={() => {}} />);
  expect(screen.getByRole('dialog', { name: 'Sorts du combat' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Lance de givre' })).toBeInTheDocument();
  // The reference boss's Abolissement is not inherited by the authored monster.
  expect(screen.queryByRole('button', { name: /Abolissement/ })).not.toBeInTheDocument();
  fireEvent.click(container.querySelector('[data-spellbook-fighter="A"]'));
  const weapon = Object.values(spellsOf(state.fighters.A)).find(s => s.isWeapon);
  expect(within(screen.getByRole('region', { name: 'Détail de la capacité' })).getByText(weapon.name)).toBeInTheDocument();
  fireEvent.click(container.querySelector('[data-spellbook-fighter="S"]'));
  expect(container.querySelectorAll('[data-spellbook-spell]').length).toBe(Object.keys(spellsOf(state.fighters.S)).length);
  expect(JSON.stringify(state)).toBe(before);
});

test('search finds an enemy by spell or effect, keeps defeated fighters readable, and does not reveal positions', () => {
  const { state } = fixture(); state.fighters.B.hp = 0; state.fighters.B.effects = [{ kind: 'invisibility', turnsLeft: 2 }];
  render(<CombatSpellbook state={state} live onClose={() => {}} />);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'givre' } });
  expect(screen.getByRole('button', { name: /Sonneur/ })).toBeInTheDocument();
  expect(screen.getByText('Combattant vaincu')).toBeInTheDocument();
  expect(screen.getByText(/le combat continue/)).toBeInTheDocument();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'inexistant' } });
  expect(screen.getByText(/Aucun sort à afficher/)).toBeInTheDocument();
  expect(document.querySelector('[data-cell]')).toBeNull();
});

test('unavailable spells have a readable hover card that stays open, opens the library, and never casts', () => {
  const spell = spellAtGrade(153, 6), select = jest.fn(), inspect = jest.fn();
  const { container } = render(<CombatSpellBar spells={[spell]} spellInfo={{ [spell.key]: { ...spell, cooldownLeft: 2 } }} pa={0}
    active humanTurn onSelect={select} onInspect={inspect} />);
  const slot = container.querySelector('.spell-slot');
  const infoButton = screen.getByRole('button', { name: 'Informations sur Puissance' });
  expect(slot).not.toHaveAttribute('title');
  expect(slot.querySelector('.spell-btn')).not.toHaveAttribute('title');
  expect(infoButton).toBeEnabled();
  fireEvent.mouseEnter(infoButton); act(() => jest.advanceTimersByTime(1000));
  const card = screen.getByRole('region', { name: 'Fiche de Puissance' });
  expect(within(card).getByText('Disponible dans 2 tours')).toBeInTheDocument();
  fireEvent.mouseLeave(infoButton); fireEvent.mouseEnter(card); act(() => jest.advanceTimersByTime(400));
  expect(card).toBeInTheDocument();
  fireEvent.click(within(card).getByRole('button', { name: 'Ouvrir dans le grimoire' }));
  expect(inspect).toHaveBeenCalledWith(spell.key);
  expect(select).not.toHaveBeenCalled();
  expect(screen.queryByRole('region', { name: 'Fiche de Puissance' })).not.toBeInTheDocument();
});

test('only the information button opens details after one second, and Escape dismisses them without casting', () => {
  const spell = spellAtGrade(141, 6), select = jest.fn();
  const { container } = render(<CombatSpellBar spells={[spell]} spellInfo={{ [spell.key]: { ...spell, usesLeft: 1 } }} pa={10}
    active humanTurn onSelect={select} />);
  fireEvent.mouseEnter(container.querySelector('.spell-btn'));
  fireEvent.focus(container.querySelector('.spell-btn'));
  act(() => jest.advanceTimersByTime(1500));
  expect(screen.queryByRole('region', { name: 'Fiche de Pression' })).not.toBeInTheDocument();
  fireEvent.mouseEnter(screen.getByRole('button', { name: 'Informations sur Pression' }));
  act(() => jest.advanceTimersByTime(999));
  expect(screen.queryByRole('region', { name: 'Fiche de Pression' })).not.toBeInTheDocument();
  act(() => jest.advanceTimersByTime(1));
  expect(screen.getByRole('region', { name: 'Fiche de Pression' })).toBeInTheDocument();
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.queryByRole('region', { name: 'Fiche de Pression' })).not.toBeInTheDocument();
  expect(select).not.toHaveBeenCalled();
});

test('leaving an information icon cancels inspection and another icon starts a fresh delay', () => {
  const spells = [spellAtGrade(141, 6), spellAtGrade(153, 6)];
  render(<CombatSpellBar spells={spells} spellInfo={Object.fromEntries(spells.map(spell => [spell.key, spell]))}
    pa={10} active humanTurn onSelect={jest.fn()} />);
  const pression = screen.getByRole('button', { name: 'Informations sur Pression' });
  const puissance = screen.getByRole('button', { name: 'Informations sur Puissance' });
  fireEvent.mouseEnter(pression); act(() => jest.advanceTimersByTime(800));
  fireEvent.mouseLeave(pression); act(() => jest.advanceTimersByTime(1200));
  expect(screen.queryByRole('region', { name: /Fiche de/ })).not.toBeInTheDocument();
  fireEvent.mouseEnter(pression); act(() => jest.advanceTimersByTime(1000));
  expect(screen.getByRole('region', { name: 'Fiche de Pression' })).toBeInTheDocument();
  fireEvent.mouseLeave(pression); fireEvent.mouseEnter(puissance);
  act(() => jest.advanceTimersByTime(999));
  expect(screen.queryByRole('region', { name: /Fiche de/ })).not.toBeInTheDocument();
  act(() => jest.advanceTimersByTime(1));
  expect(screen.getByRole('region', { name: 'Fiche de Puissance' })).toBeInTheDocument();
});

test('information buttons work with keyboard or tap, never self-cast, and leave normal casting available', () => {
  const spell = spellAtGrade(153, 6), select = jest.fn(), selfCast = jest.fn();
  const { container } = render(<CombatSpellBar spells={[spell]} spellInfo={{ [spell.key]: spell }}
    pa={10} active humanTurn onSelect={select} onSelfCast={selfCast} />);
  const infoButton = screen.getByRole('button', { name: 'Informations sur Puissance' });
  fireEvent.focus(infoButton); act(() => jest.advanceTimersByTime(1000));
  expect(infoButton).toHaveAttribute('aria-expanded', 'true');
  fireEvent.keyDown(window, { key: 'Escape' });
  fireEvent.blur(infoButton); act(() => jest.advanceTimersByTime(200));
  fireEvent.pointerDown(infoButton, { pointerType: 'touch' }); fireEvent.click(infoButton);
  expect(screen.queryByRole('region', { name: /Fiche de/ })).not.toBeInTheDocument();
  act(() => jest.advanceTimersByTime(1000));
  expect(screen.getByRole('region', { name: 'Fiche de Puissance' })).toBeInTheDocument();
  fireEvent.contextMenu(infoButton);
  expect(select).not.toHaveBeenCalled();
  expect(selfCast).not.toHaveBeenCalled();
  fireEvent.click(container.querySelector('.spell-btn'));
  expect(select).toHaveBeenCalledWith(spell);
  expect(screen.queryByRole('region', { name: /Fiche de/ })).not.toBeInTheDocument();
  fireEvent.contextMenu(container.querySelector('.spell-btn'));
  expect(selfCast).toHaveBeenCalledWith(spell);
});

function start() {
  const bot = { id: 'book-test', name: 'Test', code: 'function decide(v,a) { return a.endTurn(); }' };
  localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ playerClass: 'IOP', botClass: 'CRA', botId: bot.id, mapId: 'arene' }));
  const ready = LiveMatch.prototype.ready;
  const spy = jest.spyOn(LiveMatch.prototype, 'ready').mockImplementation(function () {
    const result = ready.call(this); this.state.order = ['A', 'B']; this.state.currentIndex = 0; return result;
  });
  const result = render(<LoadoutsProvider><PlayScreen allBots={[bot]} active /></LoadoutsProvider>);
  fireEvent.click(result.container.querySelector('.setup-play'));
  fireEvent.click(result.container.querySelector('.combat-choice-launch'));
  fireEvent.click(screen.getByRole('button', { name: 'Prêt' }));
  return { ...result, match: spy.mock.instances[0] };
}

test('reading pauses the local turn clock and suppresses casting keys, then resumes the same remaining time', () => {
  const { container, match } = start();
  act(() => jest.advanceTimersByTime(5000));
  const before = screen.getByRole('timer').getAttribute('aria-label'), snapshot = JSON.stringify(match.state);
  const trigger = screen.getByRole('button', { name: 'Sorts du combat' });
  trigger.focus(); fireEvent.click(trigger);
  act(() => jest.advanceTimersByTime(45000));
  fireEvent.keyDown(window, { key: '1', code: 'Digit1' });
  expect(container.querySelector('.spell-btn.selected')).toBeNull();
  expect(container.querySelector('[role="timer"]')).toHaveAttribute('aria-label', before);
  expect(JSON.stringify(match.state)).toBe(snapshot);
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  act(() => jest.advanceTimersByTime(1000));
  expect(screen.getByRole('timer')).toHaveAttribute('aria-label', 'Tour 1, 24 secondes restantes');
});

test('reading during a local enemy turn stops AI steps until the library closes', () => {
  const { match } = start();
  fireEvent.click(screen.getByRole('button', { name: 'Fin de tour' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sorts du combat' }));
  const before = JSON.stringify(match.state);
  act(() => jest.advanceTimersByTime(5000));
  expect(JSON.stringify(match.state)).toBe(before);
  fireEvent.click(screen.getByRole('button', { name: 'Revenir au combat' }));
  act(() => jest.advanceTimersByTime(700));
  expect(JSON.stringify(match.state)).not.toBe(before);
});

test('Poutch shows Tuerie even though it cannot afford the spell', () => {
  const monster = getMonster(494, 5), spell = Object.values(monster.spells)[0];
  render(<SpellDetailCard spell={spell} ownerName="Poutch" />);
  expect(screen.getByText('Tue la cible')).toBeInTheDocument();
  expect(screen.getByText('3 PA')).toBeInTheDocument();
});

test('opening the library freezes a replay and closing it preserves its prior play/pause state', async () => {
  const init = createGame({ seed: 5, fighters: [{ id: 'A', classId: 'IOP' }, { id: 'B', classId: 'CRA' }] });
  const finalState = JSON.parse(JSON.stringify(init.state));
  finalState.fighters.B.hp = 0; finalState.over = true; finalState.winner = 'A'; finalState.endReason = 'ko';
  jest.spyOn(runner, 'runMatchAsync').mockResolvedValue({ finalState, winner: 'A', turns: 1, events: init.events,
    frames: [init, { state: finalState, events: [] }] });
  const { container } = render(<AutoDungeonFight config={{ opponents: [], controllerName: 'Test' }} active onExit={() => {}} onRematch={() => {}} />);
  await act(async () => {});
  fireEvent.click(screen.getByRole('button', { name: 'Sorts du combat' }));
  act(() => jest.advanceTimersByTime(5000));
  expect(container.querySelector('[data-replay-frame]')).toHaveAttribute('data-replay-frame', '0');
  fireEvent.click(screen.getByRole('button', { name: 'Revenir au combat' }));
  act(() => jest.advanceTimersByTime(5000));
  expect(container.querySelector('[data-replay-frame]')).toHaveAttribute('data-replay-frame', '1');
  fireEvent.click(screen.getByRole('button', { name: 'Revenir au début' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sorts du combat' }));
  fireEvent.click(screen.getByRole('button', { name: 'Revenir au combat' }));
  act(() => jest.advanceTimersByTime(5000));
  expect(container.querySelector('[data-replay-frame]')).toHaveAttribute('data-replay-frame', '0');
});

test('spell slots stay on one row while readable, wrap at narrow widths and expand again', () => {
  const previous = global.ResizeObserver; let resize;
  global.ResizeObserver = class { constructor(callback) { resize = callback; } observe() {} disconnect() {} };
  try {
    const { state } = fixture(), spells = Object.values(spellsOf(state.fighters.A)).slice(0, 7);
    const props = { spells, spellInfo: {}, fighter: state.fighters.A, active: true, humanTurn: false, pa: 0 };
    const { container } = render(<CombatSpellBar {...props} />);
    const bar = container.querySelector('.combat-spellbar');
    act(() => resize([{ contentRect: { width: 1200 } }]));
    expect(bar.style.getPropertyValue('--spell-rows')).toBe('1');
    act(() => resize([{ contentRect: { width: 250 } }]));
    expect(bar.style.getPropertyValue('--spell-rows')).toBe('2');
    expect(screen.getAllByRole('button', { name: /Informations sur/ })).toHaveLength(7);
    act(() => resize([{ contentRect: { width: 1200 } }]));
    expect(bar.style.getPropertyValue('--spell-rows')).toBe('1');
  } finally { global.ResizeObserver = previous; }
});
