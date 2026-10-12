import React from 'react';
import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import { applyAction, createGame, currentFighter, spellsOf } from '../engine/engine';
import { turnResources, statBuffTotal } from '../engine/formulas';
import FighterEffects from '../ui/FighterEffects';
import { combatResources } from '../ui/combatResources';

function battle(classId = 'ENUTROF') {
  const { state } = createGame({ seed: 7, fighters: [
    { id: 'A', classId: 'IOP', name: 'Vous' },
    { id: 'B', team: 'B', classId, name: 'Lanceur' },
    { id: 'B2', team: 'B', classId, name: 'Autre adversaire' },
  ] });
  state.board = { width: 25, height: 25, obstacles: {} };
  state.order = ['A', 'B', 'B2']; state.currentIndex = 1;
  for (const fighter of Object.values(state.fighters)) Object.assign(fighter, {
    hp: 5000, maxHp: 5000, baseMaxHp: 5000, basePa: 25, basePm: 10, pa: 25, pm: 10,
    stats: { sagesse: fighter.id === 'A' ? 0 : 1000 }, resistances: {}, resistancesFixed: {}, permanent: {},
  });
  state.fighters.A.pos = { x: 10, y: 10 };
  state.fighters.B.pos = { x: 13, y: 10 };
  state.fighters.B2.pos = { x: 20, y: 20 };
  return state;
}

function cast(state, key, target, accept = () => true) {
  for (let seed = 1; seed < 2000; seed++) {
    const result = applyAction({ ...state, rngState: seed }, { type: 'CAST', spell: key, target });
    if (!result.ok) throw new Error(`${currentFighter(state).name}, ${key}: ${result.reason}`);
    if (!result.events.some(e => e.t === 'spell_fail' || (e.t === 'cast' && e.crit)) && accept(result)) return result;
  }
  throw new Error(`No matching cast: ${key}`);
}

function playerTurn(state) {
  state.currentIndex = 0;
  Object.assign(state.fighters.A, turnResources(state.fighters.A));
  return state;
}

function killCaster(state, id = 'B') {
  state.fighters[id].hp = 1;
  return cast(state, 'tempete_de_puissance', state.fighters[id].pos);
}

test.each([
  ['ENUTROF', 'maladresse'], ['XELOR', 'ralentissement'],
  ['ENUTROF', 'force_de_lage'], ['XELOR', 'vol_du_temps'],
  ['ENUTROF', 'cle_reductrice'], ['CRA', 'oeil_de_taupe'],
  ['PANDAWA', 'vulnerabilite_aqueuse'], ['XELOR', 'demotivation'],
  ['SADIDA', 'poison_paralysant'], ['CRA', 'fleche_empoisonnee'],
])('%s: %s ends on the caster death, refunds only its PA/PM penalty and preserves other sources', (classId, key) => {
  let state = battle(classId);
  state = cast(state, key, state.fighters.A.pos, result => result.state.fighters.A.effects.length > 0).state;
  const debuffs = state.fighters.A.effects.filter(effect => effect.source === 'B');
  expect(debuffs.length).toBeGreaterThan(0);
  expect(debuffs.every(effect => effect.source === 'B')).toBe(true);
  const other = { kind: 'buff', stat: 'range', value: -1, turnsLeft: 3, source: 'B2', name: 'Autre malus' };
  state.fighters.A.effects.push(other);
  state = playerTurn(state);
  state = cast(state, 'compulsion', state.fighters.A.pos).state;
  const movement = applyAction(state, { type: 'MOVE', to: { x: 10, y: 11 } });
  expect(movement.ok).toBe(true); state = movement.state;
  const before = { ...state.fighters.A }, cost = spellsOf(before).tempete_de_puissance.pa;
  const hit = killCaster(state), player = hit.state.fighters.A;
  expect(hit.state.fighters.B.hp).toBe(0);
  expect(hit.state.over).toBe(false);
  expect(player.effects.some(effect => effect.source === 'B')).toBe(false);
  expect(player.effects).toContainEqual(other);
  expect(player.effects.some(effect => effect.source === 'A' && effect.name === 'Compulsion')).toBe(true);
  for (const stat of ['pa', 'pm']) {
    const penalty = debuffs.filter(e => e.kind === 'buff' && e.stat === stat).reduce((sum, e) => sum + e.value, 0);
    expect(player[stat]).toBe(before[stat] - (stat === 'pa' ? cost : 0) - penalty);
  }
  expect(hit.events.filter(e => e.t === 'effect_end' && e.source === 'B')).toHaveLength(debuffs.length);
  expect(hit.events.findIndex(e => e.t === 'effect_end')).toBeGreaterThan(hit.events.findIndex(e => e.t === 'death'));
});

test('identical spells from two enemies remain separate: only the dead caster is dispelled', () => {
  let state = battle();
  state.fighters.B2.pos = { x: 10, y: 13 };
  state = cast(state, 'cle_reductrice', state.fighters.A.pos).state;
  state.currentIndex = 2;
  state = cast(state, 'cle_reductrice', state.fighters.A.pos).state;
  const survivorEffect = state.fighters.A.effects.find(e => e.source === 'B2');
  state = killCaster(playerTurn(state)).state;
  expect(state.fighters.A.effects).toEqual([survivorEffect]);
  expect(statBuffTotal(state.fighters.A, 'range')).toBe(survivorEffect.value);
});

test('the death of an owner also clears penalties from its summons and nested summons', () => {
  let state = battle('SADIDA');
  state = cast(state, 'la_surpuissante', { x: 12, y: 10 }).state;
  const summon = Object.values(state.fighters).find(f => f.ownerId === 'B');
  state.currentIndex = state.order.indexOf(summon.id);
  const summonSpell = Object.values(spellsOf(summon)).find(spell => spell.effects.some(e => e.kind === 'summon'));
  state = cast(state, summonSpell.key, { x: 12, y: 11 }).state;
  const child = Object.values(state.fighters).find(f => f.ownerId === summon.id);
  state.currentIndex = state.order.indexOf(child.id);
  const removal = Object.values(spellsOf(child)).find(spell => spell.effects.some(e => e.kind === 'removePm'));
  state = cast(state, removal.key, state.fighters.A.pos, result => result.state.fighters.A.effects.some(e => e.source === child.id)).state;
  // Keep the owner's tile in range without crossing the summoned blocker.
  state.fighters.B.pos = { x: 10, y: 13 };
  const hit = killCaster(playerTurn(state));
  expect(hit.events.filter(e => e.t === 'death').map(e => e.fighter)).toEqual(['B', summon.id, child.id]);
  expect(hit.state.fighters.A.effects.some(e => [summon.id, child.id].includes(e.source))).toBe(false);
  expect(hit.state.fighters.A.pm).toBe(10);
});

test.each(['poison_paralysant', 'vent_empoisonne'])('a dead Sadida cannot deal later damage with %s', key => {
  let state = battle('SADIDA');
  state = cast(state, key, key === 'vent_empoisonne' ? state.fighters.B.pos : state.fighters.A.pos).state;
  state = killCaster(playerTurn(state)).state;
  const hp = state.fighters.A.hp;
  const end = applyAction(state, { type: 'PASS' });
  const next = applyAction(end.state, { type: 'PASS' });
  expect(currentFighter(next.state).id).toBe('A');
  expect(next.state.fighters.A.hp).toBe(hp);
  expect([...end.events, ...next.events].some(e => e.t === 'damage')).toBe(false);
});

test('death cancels glyphs, traps, states and delayed effects from that caster alone', () => {
  const state = playerTurn(battle());
  state.fighters.A.effects.push(
    { kind: 'state', stateId: 7, turnsLeft: 5, source: 'B', name: 'Pesanteur' },
    { kind: 'skipTurn', turnsLeft: 2, source: 'B', name: 'Tour passé' },
    { kind: 'delayedSpell', turnsLeft: 3, delay: 1, source: 'B', name: 'Effet différé', trigger: {} },
  );
  state.hazards = [
    { id: 'H1', owner: 'B', kind: 'glyph', name: 'Glyphe' },
    { id: 'H2', owner: 'B', kind: 'trap', name: 'Piège' },
    { id: 'H3', owner: 'B2', kind: 'trap', name: 'Autre piège' },
  ];
  const hit = killCaster(state);
  expect(hit.state.fighters.A.effects).toEqual([]);
  expect(hit.state.hazards.map(h => h.id)).toEqual(['H3']);
  expect(hit.events.filter(e => e.t === 'hazard_end').map(e => e.id)).toEqual(['H1', 'H2']);
});

test('an enemy killed by reflection cannot reapply a penalty through the rest of its spell', () => {
  const state = battle('CRA');
  state.fighters.B.hp = 1;
  state.fighters.A.effects = [{ kind: 'damageReflection', value: 100, source: 'A', turnsLeft: 3, name: 'Contre' }];
  const hit = cast(state, 'oeil_de_taupe', state.fighters.A.pos);
  expect(hit.state.fighters.B.hp).toBe(0);
  expect(hit.state.over).toBe(false);
  expect(hit.state.fighters.A.effects.some(e => e.source === 'B')).toBe(false);
});

test('the effect panel and waiting-turn resources refresh on the lethal action', () => {
  let state = battle();
  state = cast(state, 'maladresse', state.fighters.A.pos, result => result.state.fighters.A.effects.length > 0).state;
  const { container, rerender } = render(<FighterEffects fighter={state.fighters.A} fighters={state.fighters} />);
  expect(container.querySelector('[data-effect-name="Maladresse"]')).toBeInTheDocument();
  const previous = combatResources(state.fighters.A, state).pm;
  // The other enemy kills the source while the player is still waiting.
  state.fighters.B2.classId = 'IOP'; state.fighters.B2.pos = { x: 13, y: 13 };
  state.currentIndex = 2;
  state = killCaster(state).state;
  rerender(<FighterEffects fighter={state.fighters.A} fighters={state.fighters} />);
  expect(container.querySelector('[data-effect-name="Maladresse"]')).not.toBeInTheDocument();
  expect(container).toHaveTextContent('Aucun effet temporaire.');
  expect(combatResources(state.fighters.A, state)).toMatchObject({ pm: 10, preview: true });
  expect(previous).toBeLessThan(10);
});
