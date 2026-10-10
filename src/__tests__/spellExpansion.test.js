import { createGame, applyAction, validateAction, spellsOf, getView, rollEffectValue } from '../engine/engine';
import { SPELL_LIBRARY, resolveSpellLoadout, availableSpellGrades, getSummon } from '../engine/classes';
import { emptyLoadout, resolveLoadout } from '../engine/equipment';
import { damageAmount } from '../engine/formulas';
import { spellZoneCells } from '../engine/geometry';

function fresh(classId = 'IOP', grade = {}, common = [], seed = 1) {
  const loadout = { ...emptyLoadout(classId), level: 200, base: {}, spells: { common, grades: grade } };
  const { state } = createGame({ seed, fighters: [{ id: 'A', classId, loadout }, { id: 'B', classId: 'IOP' }] });
  state.order = ['A', 'B']; state.currentIndex = 0;
  state.board = { width: 25, height: 25, obstacles: {} };
  state.fighters.A.pos = { x: 10, y: 10 }; state.fighters.B.pos = { x: 11, y: 10 };
  for (const f of Object.values(state.fighters)) { f.startPos = { ...f.pos }; f.pa = 100; }
  return state;
}
const byId = (state, id) => Object.values(spellsOf(state.fighters.A)).find(s => s.id === id);
function cast(state, id, target = state.fighters.B.pos) {
  // Eliminate critical failure, but preserve normal-vs-critical control in tests.
  const spell = byId(state, id);
  for (let seed = 1; seed < 100; seed++) {
    const input = { ...state, rngState: seed };
    const result = applyAction(input, { type: 'CAST', spell: spell.key, target });
    expect(result.ok).toBe(true);
    if (!result.events.some(e => e.t === 'spell_fail' || (e.t === 'cast' && e.crit))) return result;
  }
  throw new Error(`No normal cast of ${id}`);
}
const pass = state => applyAction(state, { type: 'PASS' }).state;
function ally(state, id = 'C', pos = { x: 11, y: 10 }) {
  state.fighters.B.pos = { x: 15, y: 10 };
  state.fighters[id] = { ...state.fighters.A, id, leader: false, pos, effects: [], loadout: null, hp: 700 };
  return state.fighters[id];
}

test('all 12 rosters have their temple spell and level-200 Dopeul, and all 18 commons can be equipped', () => {
  expect(Object.values(SPELL_LIBRARY.classes).every(ids => ids.length === 22)).toBe(true);
  for (const cid of Object.keys(SPELL_LIBRARY.classes)) {
    const resolved = resolveSpellLoadout(cid, { level: 200, spells: { common: SPELL_LIBRARY.common } });
    expect(resolved.valid).toBe(true); expect(Object.keys(resolved.spells)).toHaveLength(40);
    expect(Object.values(resolved.spells).some(s => s.id === SPELL_LIBRARY.special[cid])).toBe(true);
  }
  expect(availableSpellGrades(350, 100)).toContain(6);
  expect(availableSpellGrades(141, 100)).not.toContain(6);
  expect(resolveSpellLoadout('IOP', { spells: { common: [693] } }).valid).toBe(false);
  expect(resolveSpellLoadout('IOP', { level: 100, spells: { grades: { 141: 6 } } }).valid).toBe(false);
});

test('spell selection, grades, weapon position and order survive JSON storage and bot views', () => {
  let state = fresh('IOP', { 350: 3 }, [350, 368]);
  state.fighters.A.loadout.slots.weapon = 2416;
  state.fighters.A.loadout.spells.order = [350, 0, 368, 141];
  const resolved = resolveLoadout('IOP', state.fighters.A.loadout);
  state.fighters.A.weaponSpell = resolved.weaponSpell;
  state = JSON.parse(JSON.stringify(state));
  expect(Object.values(spellsOf(state.fighters.A)).slice(0, 4).map(s => s.id)).toEqual([350, 0, 368, 141]);
  expect(byId(state, 350).grade).toBe(3);
  expect(getView(state, 'A').you.spells.slice(0, 4).map(s => s.id)).toEqual([350, 0, 368, 141]);
});

test('Flamiche enforces per-target rather than per-turn limits', () => {
  let state = fresh('IOP', { 350: 5 }, [350]);
  state.fighters.B.hp = state.fighters.B.maxHp = 10000;
  for (let i = 0; i < 2; i++) state = cast(state, 350).state;
  const spell = byId(state, 350);
  expect(validateAction(state, { type: 'CAST', spell: spell.key, target: state.fighters.B.pos }).ok).toBe(false);
  expect(validateAction(state, { type: 'CAST', spell: spell.key, target: { x: 10, y: 12 } }).ok).toBe(true);
});

test('Libération pushes adjacent fighters and Cawotte creates a static obstacle with a healing glyph', () => {
  let state = fresh('IOP', { 368: 6, 367: 5 }, [368, 367]);
  state = cast(state, 368).state;
  expect(state.fighters.B.pos).toEqual({ x: 15, y: 10 });
  const result = cast(state, 367, { x: 10, y: 11 });
  expect(result.state.fighters.As1.staticSummon).toBe(true);
  expect(result.state.order).not.toContain('As1');
  result.state.fighters.A.hp = 100;
  const next = pass(pass(result.state));
  expect(next.fighters.A.hp).toBeGreaterThan(100);
});

test('Boomerang perfide selects exactly one of its four elements', () => {
  const elements = new Set();
  for (let seed = 1; seed < 160; seed++) {
    const state = fresh('IOP', { 364: 5 }, [364], seed); state.fighters.B.pos = { x: 15, y: 10 };
    const result = applyAction(state, { type: 'CAST', spell: byId(state, 364).key, target: state.fighters.B.pos });
    expect(result.ok).toBe(true);
    if (result.events.some(e => e.t === 'spell_fail')) continue;
    const damage = result.events.filter(e => e.t === 'damage');
    expect(damage).toHaveLength(1); elements.add(damage[0].element);
  }
  expect([...elements].sort()).toEqual(['air', 'eau', 'feu', 'terre']);
});

test('mastery multiplies only a matching weapon, does not stack, and preserves the flat damage term', () => {
  const caster = { stats: { force: 100 }, permanent: { damage: 10 }, effects: [
    { kind: 'weaponMastery', weaponType: 4, value: 30 }, { kind: 'weaponMastery', weaponType: 4, value: 20 }] };
  expect(damageAmount(20, 'terre', caster, { weaponType: 4 })).toBe(62);
  expect(damageAmount(20, 'terre', caster, { weaponType: 7 })).toBe(50);
  expect(damageAmount(20, 'terre', caster)).toBe(50);
});

test('Arakne and critical summons have grade-specific stats and executable attacks', () => {
  expect(getSummon(246, 1).hp).toBe(20); expect(getSummon(246, 6).hp).toBe(80);
  for (const id of [246, 2630, 1108, 262, 2727]) for (let grade = 1; grade <= 6; grade++) {
    expect(Object.keys(getSummon(id, grade).spells).length).toBeGreaterThan(0);
  }
  const state = cast(fresh('IOP', { 370: 1 }, [370]), 370, { x: 10, y: 11 }).state;
  expect(state.fighters.As1.hp).toBe(60); // 20 × (1 + level 200 / 100)
  expect(state.fighters.As1.summonGrade).toBe(1);
});

test('Soin Animal applies one heal row to a summon and one different row to a character', () => {
  for (const summon of [false, true]) {
    const state = fresh('OSAMODAS', { 25: 5 }); const c = ally(state);
    c.isSummon = summon; c.hp = 100;
    const result = cast(state, 25, c.pos);
    const heals = result.events.filter(e => e.t === 'heal');
    expect(heals).toHaveLength(1);
    // The unequipped caster has 101 intelligence from parchments (×2.01).
    expect(heals[0].amount).toBeGreaterThanOrEqual(summon ? 54 : 44);
    expect(heals[0].amount).toBeLessThanOrEqual(summon ? 64 : 56);
  }
});

test('Folie sanguinaire is fixed damage and returns half the actual loss; enemies are invalid', () => {
  const state = fresh('SACRIEUR', { 450: 5 }); const c = ally(state); state.fighters.A.hp = 100;
  state.fighters.A.stats.force = 1000;
  const result = cast(state, 450, c.pos);
  expect(result.events.find(e => e.t === 'damage').amount).toBe(300);
  expect(result.events.find(e => e.t === 'heal').amount).toBe(150);
  expect(validateAction(state, { type: 'CAST', spell: byId(state, 450).key, target: state.fighters.B.pos }).ok).toBe(false);
});

test('erosion increases lost maximum HP, without multiplying the damage', () => {
  const state = fresh('IOP', { 141: 5 });
  const plain = cast(state, 141);
  state.fighters.B.effects.push({ kind: 'buff', stat: 'erosion', value: 40, turnsLeft: 3 });
  const eroded = cast(state, 141);
  const before = plain.events.find(e => e.t === 'damage'), after = eroded.events.find(e => e.t === 'damage');
  expect(after.amount).toBe(before.amount); expect(after.erosion).toBe(Math.floor(before.amount * .5));
});

test('Karcham, movement with a carried ally and Chamrak preserve exclusive board occupancy', () => {
  let state = fresh('PANDAWA', { 693: 5, 696: 5 }); const c = ally(state);
  state = cast(state, 693, c.pos).state;
  expect(state.fighters.C.carriedBy).toBe('A'); expect(state.fighters.A.carrying).toBe('C');
  state = applyAction(state, { type: 'MOVE', to: { x: 9, y: 10 } }).state;
  expect(state.fighters.C.pos).toEqual(state.fighters.A.pos);
  state = cast(state, 696, { x: 9, y: 12 }).state;
  expect(state.fighters.C.pos).toEqual({ x: 9, y: 12 }); expect(state.fighters.C.carriedBy).toBeNull();
  expect(state.fighters.A.carrying).toBeNull();
});

test('enemy view retains only last known invisible position; attacking reveals the caster', () => {
  let state = fresh('SRAM', { 72: 5, 61: 5 });
  state = cast(state, 72, state.fighters.A.pos).state;
  state = applyAction(state, { type: 'MOVE', to: { x: 10, y: 9 } }).state;
  const hidden = getView(state, 'B').enemy;
  expect(hidden.hidden).toBe(true); expect(hidden.pos).toEqual({ x: 10, y: 10 });
  state = cast(state, 61).state;
  expect(getView(state, 'B').enemy.hidden).toBe(false);
});

test('Poisse minimizes the caster, Brokle maximizes the target, and dice keep their distribution', () => {
  const e = { min: 2, max: 4, raw: '97;2;4;-1;0;0;2d2+0' };
  const calls = []; const rng = { int: (a, b) => { calls.push([a, b]); return a; } };
  expect(rollEffectValue(rng, e, { effects: [] }, { effects: [] })).toBe(2);
  expect(calls).toEqual([[1, 2], [1, 2]]);
  expect(rollEffectValue(rng, e, { effects: [] }, { effects: [{ kind: 'maxRolls' }] })).toBe(4);
  expect(rollEffectValue(rng, e, { effects: [{ kind: 'minRolls' }] }, { effects: [] })).toBe(2);
});

test('Mot Lotof triggers next turn in a ring, with a single separate self-damage line', () => {
  let state = fresh('ENIRIPSA', { 427: 5 }); state.fighters.A.hp = 900;
  state = cast(state, 427, state.fighters.A.pos).state;
  expect(state.fighters.A.hp).toBe(900);
  const result = applyAction(pass(state), { type: 'PASS' });
  const damage = result.events.filter(e => e.t === 'damage');
  expect(damage.map(e => e.target).sort()).toEqual(['A', 'B']);
  expect(damage.every(e => e.amount === 297)).toBe(true);
  expect(spellZoneCells('Ob', { x: 10, y: 10 }, { x: 10, y: 10 })).toHaveLength(4);
});

test('Corruption heals once and makes its target skip exactly one turn', () => {
  const state = fresh('ENUTROF', { 59: 5 }); state.fighters.B.pos = { x: 15, y: 10 }; state.fighters.B.hp = 100;
  const r = cast(state, 59);
  expect(r.events.filter(e => e.t === 'heal')).toHaveLength(1);
  const next = applyAction(r.state, { type: 'PASS' });
  expect(next.events.filter(e => e.t === 'turn_skipped')).toHaveLength(1);
  expect(next.state.order[next.state.currentIndex]).toBe('A');
});

test('Mise en garde keeps its weapon ban for the same turns as its resistance', () => {
  let state = fresh('FECA', { 422: 5 }); state = cast(state, 422, state.fighters.A.pos).state;
  state = pass(state);
  expect(state.fighters.A.effects.some(e => e.stat === 'res_terre')).toBe(true);
  expect(state.fighters.A.effects.some(e => e.stateId === 42)).toBe(true);
  state = pass(pass(state));
  expect(state.fighters.A.effects.some(e => e.stat === 'res_terre')).toBe(false);
  expect(state.fighters.A.effects.some(e => e.stateId === 42)).toBe(false);
});

test('Retraite anticipée blocks movement spells as well as walking', () => {
  const r = cast(fresh('ENUTROF', { 425: 5 }), 425);
  const state = pass(r.state);
  expect(state.fighters.B.pm).toBe(0);
  expect(validateAction(state, { type: 'CAST', spell: 'bond', target: { x: 12, y: 11 } }).ok).toBe(false);
});

test('all 1692 player grades accept an appropriate target and resolve without invalid state', () => {
  const failures = []; let checked = 0;
  for (const raw of Object.values(SPELL_LIBRARY.spells)) {
    const classId = Object.keys(SPELL_LIBRARY.classes).find(c => SPELL_LIBRARY.classes[c].includes(raw.id)) || 'IOP';
    for (const grade of raw.grades) {
      const state = fresh(classId, { [raw.id]: grade.grade }, SPELL_LIBRARY.common.includes(raw.id) ? [raw.id] : []);
      const f = state.fighters.A, spell = byId(state, raw.id);
      f.maxSummons = 100; f.hp = f.maxHp = f.baseMaxHp = 10000; f.pm = 50;
      state.fighters.B.hp = state.fighters.B.maxHp = 10000;
      for (const id of spell.requiredStates) f.effects.push({ kind: 'state', stateId: id, turnsLeft: 10 });
      let target = { x: f.pos.x + Math.max(1, spell.range[0]), y: f.pos.y };
      if (spell.range[1] === 0) target = { ...f.pos };
      state.fighters.B.pos = { x: 20, y: 20 };
      if (spell.targetMode === 'fighter' || [438, 445, 450, 693].includes(raw.id)) {
        const c = ally(state, 'C', target);
        if (raw.id === 445) c.team = 'B';
      }
      if (raw.id === 696) {
        const c = ally(state, 'C', { ...f.pos });
        c.carriedBy = 'A'; f.carrying = 'C';
        f.effects.push({ kind: 'state', stateId: 3, turnsLeft: 10 });
        c.effects.push({ kind: 'state', stateId: 8, turnsLeft: 10 });
      }
      const action = { type: 'CAST', spell: spell.key, target };
      const check = validateAction(state, action);
      if (!check.ok) { failures.push(`${raw.id}/${grade.grade}: ${check.reason}`); continue; }
      const result = applyAction(state, action);
      for (const fighter of Object.values(result.state.fighters)) {
        if (![fighter.hp, fighter.maxHp, fighter.pa, fighter.pm, fighter.pos.x, fighter.pos.y].every(Number.isFinite)) failures.push(`${raw.id}/${grade.grade}: non-finite stats`);
      }
      checked++;
    }
  }
  expect(failures).toEqual([]);
  expect(checked).toBe(1692);
}, 30000);

test('Dérobade avoids an adjacent hit only if the retreat cell is free', () => {
  const state = fresh('IOP', { 141: 5 });
  state.fighters.B.effects.push({ kind: 'dodgeMelee', turnsLeft: 2 });
  const result = cast(state, 141);
  expect(result.events.some(e => e.t === 'damage')).toBe(false);
  expect(result.state.fighters.B.pos).toEqual({ x: 12, y: 10 });
  state.board.obstacles['12,10'] = { x: 12, y: 10, blocksMove: true };
  expect(cast(state, 141).events.some(e => e.t === 'damage')).toBe(true);
});

test('Sacrifice redirects the hit and swaps the protected fighter with its living protector', () => {
  const state = fresh('IOP', { 141: 5 });
  const protector = { ...state.fighters.B, id: 'D', pos: { x: 15, y: 10 }, effects: [], leader: false };
  state.fighters.D = protector;
  state.fighters.B.effects.push({ kind: 'sacrifice', source: 'D', turnsLeft: 2 });
  const result = cast(state, 141);
  expect(result.events.find(e => e.t === 'damage').target).toBe('D');
  expect(result.state.fighters.B.pos).toEqual({ x: 15, y: 10 });
  expect(result.state.fighters.D.pos).toEqual({ x: 11, y: 10 });
});

test('Renvoi de Sort reflects an eligible spell back to its caster, without reflecting a weapon', () => {
  const state = fresh('IOP', { 141: 5 });
  state.fighters.B.effects.push({ kind: 'spellReflection', value: 5, chance: 100, turnsLeft: 3 });
  const result = cast(state, 141);
  expect(result.events.find(e => e.t === 'damage').target).toBe('A');
  state.fighters.A.weaponSpell = { ...byId(state, 141), id: 0, key: 'weapon', isWeapon: true };
  expect(cast(state, 0).events.find(e => e.t === 'damage').target).toBe('B');
});

test('Raulebaque moves fighters simultaneously, respecting occupied starts of stationary fighters', () => {
  const state = fresh('XELOR', { 424: 5 });
  state.fighters.A.pos = { ...state.fighters.B.startPos };
  state.fighters.B.pos = { ...state.fighters.A.startPos };
  const r = cast(state, 424);
  expect(r.state.fighters.A.pos).toEqual(state.fighters.A.startPos);
  expect(r.state.fighters.B.pos).toEqual(state.fighters.B.startPos);
  state.fighters.B.effects.push({ kind: 'state', stateId: 6, turnsLeft: 5 });
  const blocked = cast(state, 424);
  expect(blocked.state.fighters.A.pos).toEqual(state.fighters.A.pos);
  expect(blocked.state.fighters.B.pos).toEqual(state.fighters.B.pos);
});
