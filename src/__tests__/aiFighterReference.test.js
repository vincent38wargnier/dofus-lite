import { aiFighterReference, aiBehaviorExample } from '../bots/aiFighterReference';
import { aiFighterSnapshot, buildAiPrompt } from '../bots/aiAuthoring';
import { applyAction, createGame, getView, spellsOf, validateAction } from '../engine/engine';
import { CLASS_IDS } from '../engine/classes';
import { emptyLoadout } from '../engine/equipment';
import { critDivisor, effectiveStat, statBuffTotal } from '../engine/formulas';
import MONSTERS from '../engine/monsterData.json';

test.each([100, 200])('Osamodas level %i prompt summons match actual engine-created creatures', level => {
  const fighter = { classId: 'OSAMODAS', name: 'Mon invocateur', loadout: { ...emptyLoadout('OSAMODAS'), level } };
  const reference = aiFighterReference(aiFighterSnapshot(fighter));
  const ownSummons = reference.spells.filter(s => s.effects.some(e => e.kind === 'summon'));
  expect(ownSummons.length).toBeGreaterThanOrEqual(7);
  for (const spell of ownSummons) {
    const { state } = createGame({ seed: 7, fighters: [{ ...fighter, id: 'A' }, { id: 'B', classId: 'IOP' }] });
    state.board = { width: 10, height: 10, obstacles: {} };
    state.order = ['A', 'B']; state.currentIndex = 0;
    state.fighters.A.pos = { x: 2, y: 2 }; state.fighters.B.pos = { x: 8, y: 8 };
    state.fighters.A.pa = Math.max(state.fighters.A.pa, spell.pa);
    const action = { type: 'CAST', spell: spell.key, target: { x: 3, y: 2 } };
    expect(validateAction(state, action)).toMatchObject({ ok: true });
    let spawned;
    for (let seed = 1; seed < 100 && !spawned; seed++) {
      const result = applyAction({ ...state, rngState: seed }, action);
      if (result.events.some(e => e.t === 'cast' && e.crit)) continue;
      spawned = Object.values(result.state.fighters).find(f => f.ownerId === 'A');
    }
    expect(spawned).toBeDefined();
    const detail = reference.summons.find(s => s.sources.some(source => source.caster === 'fighter' && source.spellKey === spell.key && source.variant === 'effects'));
    expect(detail).toMatchObject({ name: spawned.name, hp: spawned.maxHp, pa: spawned.pa, pm: spawned.pm,
      stats: spawned.stats, resistances: spawned.resistances, resistancesFixed: spawned.resistancesFixed });
    expect(detail.spells.map(s => s.key)).toEqual(Object.keys(spellsOf(spawned)));
    for (const s of detail.spells) expect(s.effects).toEqual(spellsOf(spawned)[s.key].effects);
  }
});

test('Osamodas effects describe buffs for summons separately from non-summons and preserve criticals', () => {
  const r = aiFighterReference(aiFighterSnapshot({ classId: 'OSAMODAS', name: 'Osamodas' }));
  for (const key of ['cri_de_l_ours', 'crapaud', 'piqure_motivante']) {
    const spell = r.spells.find(s => s.key === key);
    expect(spell.readableEffects.some(e => e.target.includes('invocations uniquement'))).toBe(true);
    expect(spell.readableEffects.some(e => e.target.includes('hors invocations'))).toBe(true);
    expect(spell.readableCriticalEffects).toHaveLength(spell.critEffects.length);
  }
  expect(r.summons.find(s => s.name === 'Dragonnet Rouge').spells.some(s => s.effects.some(e => e.kind === 'dispel'))).toBe(true);
});

test('saved gear, common spells and current grades enter the dossier without counting range twice', () => {
  const fighter = { classId: 'OSAMODAS', name: 'Osa équipé', loadout: { ...emptyLoadout('OSAMODAS'), level: 200,
    slots: { weapon: 2416 }, spells: { grades: { 23: 3 }, common: [350] } } };
  const snapshot = aiFighterSnapshot(fighter);
  snapshot.permanent.range = 3; snapshot.permanent.crit = 10;
  // getView returns effective range, whereas spellsOf returns the base range.
  for (const s of snapshot.spells) if (s.adjustableRange) s.range[1] += 3;
  const r = aiFighterReference(snapshot);
  expect(r.spells.find(s => s.id === 23).grade).toBe(3);
  expect(r.spells.some(s => s.id === 350)).toBe(true);
  expect(r.spells.some(s => s.isWeapon)).toBe(true);
  for (const s of r.spells) {
    expect(s.range).toEqual(snapshot.spells.find(original => original.key === s.key).range);
    expect(s.effectiveCritRate).toBe(critDivisor(s.critRate, effectiveStat(snapshot, 'agilite'), statBuffTotal(snapshot, 'crit') + (s.critBonus || 0)));
  }
  expect(r.spells.find(s => s.isWeapon).effects).toEqual(snapshot.spells.find(s => s.isWeapon).effects);
});

test.each(CLASS_IDS)('%s dossier resolves reachable summons only and does not mutate the fighter', classId => {
  const snapshot = aiFighterSnapshot({ classId, name: classId }), before = JSON.stringify(snapshot);
  const r = aiFighterReference(snapshot);
  expect(JSON.stringify(snapshot)).toBe(before);
  expect(new Set(r.summons.map(s => s.ref)).size).toBe(r.summons.length);
  expect(r.summons.every(s => s.sources.length)).toBe(true);
  expect(r.spells.map(s => s.key)).toEqual(snapshot.spells.map(s => s.key));
  expect(JSON.stringify(r)).not.toMatch(/"unavailable"/);
});

test('static summons, doubles and summons of summons retain their actual special cases', () => {
  const sadida = aiFighterReference(aiFighterSnapshot({ classId: 'SADIDA', name: 'Sadida' }));
  expect(sadida.summons.some(s => s.sources.some(from => from.caster !== 'fighter'))).toBe(true);
  const tree = sadida.summons.find(s => s.static);
  expect(tree).toBeDefined(); expect(tree.countsTowardSummonLimit).toBe(false);
  const snapshot = aiFighterSnapshot({ classId: 'SRAM', name: 'Sram' });
  const double = aiFighterReference(snapshot).summons.find(s => s.name === 'Double');
  expect(double).toMatchObject({ hp: snapshot.maxHp, stats: snapshot.stats, pa: 0, pm: snapshot.basePm, spells: [] });
});

test('monster-catalogue spells on custom classes keep monster summoning rules', () => {
  const raw = MONSTERS.monsters[53].grades[5].spells.find(s => s.effects.some(e => e.kind === 'summon'));
  const fighter = { classId: 'IOP', name: 'Invocateur personnalisé', loadout: { ...emptyLoadout('IOP'), level: 200,
    spells: { custom: [{ ...raw, monsterSummons: true }] } } };
  const snapshot = aiFighterSnapshot(fighter), r = aiFighterReference(snapshot);
  expect(r.spells[0].monsterSummons).toBe(true);
  expect(r.summons.length).toBeGreaterThan(0);
  expect(r.summons.every(s => s.statAndHpMultiplier === 1)).toBe(true);
  const { state } = createGame({ fighters: [{ ...fighter, id: 'A' }, { id: 'B', classId: 'CRA' }] });
  state.fighters.A.isMonster = true; state.fighters.A.monsterId = 53; state.fighters.A.monsterGrade = 5;
  expect(aiFighterReference(getView(state, 'A').you).summons.map(s => s.hp)).toEqual(r.summons.map(s => s.hp));
});

test('prompt explains scope, generated code, exact restrictions and autonomous summons', () => {
  const fighter = { classId: 'OSAMODAS', name: 'Osamodas' }, snapshot = aiFighterSnapshot(fighter);
  const prompt = buildAiPrompt({ fighter, snapshot, goal: 'Invoquer, puis soutenir sans bloquer mes alliés.' });
  const dossier = JSON.parse(prompt.split('COMBATTANT RÉEL\n')[1].split('\nLes clés de sorts')[0]);
  expect(dossier.summons).toHaveLength(7);
  expect(prompt).toContain('MON COMPORTEMENT SOUHAITÉ');
  expect(prompt).toContain('Il ne contient pas les douze classes ni tous les grades');
  expect(prompt).toContain('compile ce graphe en code exécutable');
  expect(prompt).toContain('ce graphe commande mon personnage seulement');
  expect(prompt).toContain('Le graphe n’a pas de mémoire personnalisée');
  expect(prompt).toContain('Invoquer, puis soutenir sans bloquer mes alliés.');
  expect(aiBehaviorExample(snapshot)).toContain('Invocation de Tofu');
  expect(aiBehaviorExample(aiFighterSnapshot({ classId: 'IOP', name: 'Iop' }))).not.toContain('Invocation de Tofu');
});
