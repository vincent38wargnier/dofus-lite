import {
  ITEMS, ITEM_SETS, EQUIPMENT, EQUIPMENT_SLOTS, emptyLoadout, equipSet, resolveLoadout,
  focusCharacteristics, allocatedPoints, pointCost, rollEffect, rolledEffects,
  effectDefinition, checkCondition, applySpellModifiers,
} from '../engine/equipment';
import { createGame, applyAction, getView, spellsOf, validateAction } from '../engine/engine';
import { damageAmount, healAmount, applyResistances, effectiveStat, statBuffTotal } from '../engine/formulas';
import { spellZoneCells } from '../engine/geometry';
import { CLASSES } from '../engine/classes';
import { createRng } from '../engine/rng';
import { makeBotApi } from '../bots/api';
import { runMatch } from '../arena/runner';
import { LiveMatch } from '../game/liveMatch';
import { combatRecord } from '../ui/LogPanel';

function outfit(slots = {}, classId = 'IOP') { return { ...emptyLoadout(classId), slots }; }
function game(loadout, other = outfit(), classId = 'IOP') {
  const result = createGame({ seed: 7, fighters: [
    { id: 'A', classId, loadout }, { id: 'B', classId: 'IOP', loadout: other },
  ] });
  result.state.order = ['A', 'B']; result.state.currentIndex = 0;
  result.state.fighters.A.pos = { x: 5, y: 5 }; result.state.fighters.B.pos = { x: 6, y: 5 };
  return result;
}

test('imports official versions, known item ranges, and all seven Bouftou pieces', () => {
  expect(Object.keys(ITEMS)).toHaveLength(6419);
  expect(Object.keys(ITEM_SETS)).toHaveLength(145);
  expect(EQUIPMENT.sources.items.version).toBe(1393);
  expect(EQUIPMENT.sources.items.sha256).toHaveLength(64);
  expect(ITEMS[2469]).toMatchObject({ name: 'Gelano', level: 60, effects: [[111, 1, 0, '0d0+1']] });
  expect(ITEMS[2411].effects).toEqual([[118, 1, 40, '1d40+0'], [126, 1, 40, '1d40+0']]);
  const result = resolveLoadout('IOP', equipSet(outfit(), 1));
  expect(result.errors).toEqual([]);
  expect(result).toMatchObject({ hp: 796, pa: 8, pm: 3, stats: { force: 399, intelligence: 201, sagesse: 121 },
    permanent: { power: 15, damage: 5, summons: 1 } });
  expect(result.sets[0]).toMatchObject({ count: 7, total: 7 });
  expect(result.items).toHaveLength(7);
});

test('class caps spend the correct point budget, including Sacrieur double vitality', () => {
  expect(focusCharacteristics('IOP', 'force').force).toBe(198);
  expect(focusCharacteristics('SACRIEUR', 'vitalite').vitalite).toBe(990);
  expect(pointCost('IOP', 'force', 198)).toBe(495);
  expect(pointCost('IOP', 'force', -1)).toBe(Infinity);
  expect(pointCost('SACRIEUR', 'vitalite', 3)).toBe(Infinity);
  for (const classId of Object.keys(CLASSES)) {
    for (const stat of ['force', 'intelligence', 'chance', 'agilite', 'sagesse', 'vitalite']) {
      expect(allocatedPoints(classId, focusCharacteristics(classId, stat))).toBe(495);
    }
  }
});

test('equipment rolls respect ranges and penalties; random rolls are persistent and independent of match seed', () => {
  expect(rollEffect([118, 1, 40, '1d40+0'], 'max')).toBe(40);
  expect(rollEffect([157, 1, 40, '1d40+0'], 'max')).toBe(1);
  expect(rollEffect([118, 1, 40, '1d40+0'], 'average')).toBe(20);
  const loadout = { ...outfit({ hat: 2411 }), rollMode: 'random', rollSeed: 88 };
  const first = rolledEffects(ITEMS[2411], loadout, 'hat');
  expect(rolledEffects(ITEMS[2411], loadout, 'hat')).toEqual(first);
  expect(first.every(e => e.value >= 1 && e.value <= 40)).toBe(true);
  expect(rolledEffects(ITEMS[2411], { ...loadout, rollSeed: 89 }, 'hat')).not.toEqual(first);
});

test('removing a set piece recomputes the exact tier instead of stacking every tier', () => {
  const full = equipSet(outfit(), 1);
  const six = { ...full, slots: { ...full.slots, belt: null } };
  const a = resolveLoadout('IOP', full); const b = resolveLoadout('IOP', six);
  expect(a.pa).toBe(b.pa + 1);
  expect(a.bonuses.force - b.bonuses.force).toBe(10);
  expect(a.bonuses.damage - b.bonuses.damage).toBe(1);
  expect(b.sets[0].count).toBe(6);
  expect(resolveLoadout('IOP', { ...full, slots: { ...full.slots, ring2: 2419 } }).valid).toBe(false);
});

test('server-side loadout validation rejects wrong slots, high levels, duplicated Dofus and incompatible hands', () => {
  expect(resolveLoadout('IOP', outfit({ hat: 2469 })).valid).toBe(false);
  const high = Object.values(ITEMS).find(i => i.type === 16 && i.level > 100);
  expect(resolveLoadout('IOP', outfit({ hat: high.id })).errors.join(' ')).toMatch(/niveau/);
  expect(resolveLoadout('IOP', outfit({ dofus1: 7113, dofus2: 7113 })).valid).toBe(false);
  const shield = Object.values(ITEMS).find(i => i.type === 82 && i.level <= 100 && !i.condition);
  expect(resolveLoadout('IOP', outfit({ weapon: 2416, shield: shield.id })).errors.join(' ')).toMatch(/deux mains/);
  expect(() => game(outfit({ hat: 2469 }))).toThrow(/Coiffe/);
  expect(resolveLoadout('IOP', { ...outfit(), base: { force: 999 } }).valid).toBe(false);
});

test('condition grammar handles precedence and grouping, rejects unknown rules and code', () => {
  expect(checkCondition('CS>80&CV>40&CA>40', { CS: 81, CV: 41, CA: 41 })).toEqual({ ok: true, unsupported: false });
  expect(checkCondition('(CS>80|CI>50)&PL>59', { CS: 0, CI: 60, PL: 60 }).ok).toBe(true);
  expect(checkCondition('CS>80&CV>40&CA>40', { CS: 80, CV: 41, CA: 41 }).ok).toBe(false);
  expect(checkCondition('PL=100|PQ=123', { PL: 100 })).toMatchObject({ ok: false, unsupported: true });
  expect(checkCondition('alert(1)', {})).toMatchObject({ ok: false, unsupported: true });
  // Goultard's >80 strength, >40 vitality and >40 agility are now met by the parchments.
  const l = outfit({ weapon: 65 }); l.base = {};
  expect(resolveLoadout('IOP', l).errors).toEqual([]);
});

test('AP and MP enter the match and every subsequent turn, without double counting preset stats', () => {
  const boots = Object.values(ITEMS).find(i => i.type === 11 && i.level <= 100 && !i.condition && i.effects.some(([id]) => id === 128)
    && i.effects.every(([id]) => effectDefinition(id).kind !== 'unsupported'));
  const l = outfit({ ring1: 2469, boots: boots.id });
  let { state } = game(l);
  const total = resolveLoadout('IOP', l);
  expect(state.fighters.A.basePa).toBe(8);
  expect(state.fighters.A.pm).toBe(4);
  expect(state.fighters.A.stats.force).toBe(total.stats.force);
  state.fighters.A.effects = []; state.fighters.A.pa = 0; state.fighters.A.pm = 0;
  state = applyAction(state, { type: 'PASS' }).state;
  state = applyAction(state, { type: 'PASS' }).state;
  expect(state.fighters.A.pa).toBe(total.pa); expect(state.fighters.A.pm).toBe(total.pm);
});

test('elemental bonuses affect their own damage elements and intelligence affects healing', () => {
  const { state } = game(outfit({ hat: 2411 }));
  const f = state.fighters.A;
  expect(effectiveStat(f, 'force')).toBe(339); // 101 + 198 purchased + 40 from the hat.
  expect(damageAmount(10, 'terre', f)).toBe(43);
  expect(damageAmount(10, 'neutre', f)).toBe(43);
  expect(damageAmount(10, 'feu', f)).toBe(24);
  expect(damageAmount(10, 'eau', f)).toBe(20);
  expect(damageAmount(10, 'air', f)).toBe(20);
  expect(healAmount(10, f)).toBe(24);
});

test('a real dispel removes temporary effects while preserving gear and its base AP/MP', () => {
  let result;
  for (let seed = 1; seed <= 300; seed++) {
    const { state } = game(outfit({}, 'ENUTROF'), equipSet(outfit({ ring2: 2469, dofus1: 6980 }), 1), 'ENUTROF');
    state.rngState = seed;
    state.fighters.B.effects.push({ kind: 'buff', stat: 'power', value: 50, turnsLeft: 5, name: 'Temporary' });
    result = applyAction(state, { type: 'CAST', spell: 'pelle_fantomatique', target: state.fighters.B.pos });
    if (result.events.some(e => e.t === 'dispel')) break;
  }
  expect(result.events.some(e => e.t === 'dispel')).toBe(true);
  expect(result.state.fighters.B.effects).toEqual([]);
  expect(result.state.fighters.B.basePa).toBe(9);
  expect(result.state.fighters.B.basePm).toBe(4);
  expect(statBuffTotal(result.state.fighters.B, 'power')).toBe(15);
  expect(statBuffTotal(result.state.fighters.B, 'damage')).toBe(5);
});

test('fixed resistance effect IDs follow the original client element order; PvP res excludes summons', () => {
  expect([240, 241, 242, 243, 244].map(id => effectDefinition(id).stat)).toEqual(['fixed_terre', 'fixed_eau', 'fixed_air', 'fixed_feu', 'fixed_neutre']);
  const target = { resistances: { feu: 40 }, resistancesFixed: { feu: 5 }, permanent: { pvpRes_feu: 20, pvpFixed_feu: 5 } };
  expect(applyResistances(100, 'feu', target, { leader: true })).toBe(45);
  expect(applyResistances(100, 'feu', target, { isSummon: true })).toBe(57);
});

test('permanent crit, healing and trap bonuses are distinct from temporary buffs', () => {
  const f = { stats: { force: 100, intelligence: 100 }, permanent: { power: 10, damage: 3, heal: 4, crit: 2, trapDamage: 5, trapPower: 20 }, effects: [] };
  expect(damageAmount(10, 'terre', f)).toBe(24);
  expect(damageAmount(10, 'terre', f, { trap: true })).toBe(31);
  expect(healAmount(10, f)).toBe(24);
  expect(statBuffTotal(f, 'crit')).toBe(2);
});

test('class hats modify the actual spells and bot validation agrees on AP and range', () => {
  const { state } = game(outfit({ hat: 8619 }));
  const base = Object.values(CLASSES.IOP.spells).find(s => s.id === 154);
  const modified = spellsOf(state.fighters.A)[base.key];
  expect(modified.pa).toBe(base.pa - 1);
  const ranged = Object.values(CLASSES.IOP.spells).find(s => s.id === 141);
  expect(spellsOf(state.fighters.A)[ranged.key].range[1]).toBe(ranged.range[1] + 1);
  const view = getView(state, 'A'); const api = makeBotApi(view, createRng(1));
  expect(view.you.spells.find(s => s.id === 154).pa).toBe(modified.pa);
  for (const spell of view.you.spells) {
    for (const target of [{ x: 6, y: 5 }, { x: 5, y: 7 }, { x: 5, y: 5 }]) {
      expect(api.canCast(spell.key, target).ok).toBe(validateAction(state, { type: 'CAST', spell: spell.key, target }).ok);
    }
  }
});

test('spell-specific flat damage is not multiplied by elemental characteristics', () => {
  const spell = Object.values(CLASSES.IOP.spells).find(s => s.id === 141);
  const modified = applySpellModifiers(spell, { 141: { damage: 15, heal: 3 } });
  const f = game(outfit()).state.fighters.A;
  expect(damageAmount(10, 'terre', f, { flatDamage: modified.flatDamage })).toBe(damageAmount(10, 'terre', f) + 15);
});

test('original weapon attacks consume AP and preserve independent elemental damage lines', () => {
  let result;
  for (let seed = 1; seed < 50; seed++) {
    const { state } = game(outfit({ weapon: 2416 })); state.rngState = seed;
    result = applyAction(state, { type: 'CAST', spell: 'weapon', target: { x: 6, y: 5 } });
    expect(result.ok).toBe(true);
    if (result.events.some(e => e.t === 'damage')) break;
  }
  const event = result.events.find(e => e.t === 'cast');
  expect(event).toMatchObject({ itemId: 2416, paCost: 5, weaponAnimation: 15 });
  expect(result.state.fighters.A.pa).toBe(2);
  expect(result.events.filter(e => e.t === 'damage').map(e => e.element)).toEqual(['feu', 'terre']);
  expect(result.events.filter(e => e.t === 'damage').every(e => e.target === 'B')).toBe(true);
  expect(spellZoneCells('Tb', { x: 6, y: 5 }, { x: 5, y: 5 })).toEqual([
    { x: 6, y: 5 }, { x: 6, y: 6 }, { x: 6, y: 4 },
  ]);
});

test('loadouts are snapshotted for human fights, arena replay config and exported logs', () => {
  const loadouts = { A: outfit({ ring1: 2469 }), B: outfit() };
  const live = new LiveMatch({ playerClass: 'IOP', botClass: 'IOP', mapId: 'arene', seed: 8, botName: 'Test', botDecide: () => ({ type: 'PASS' }), loadouts });
  const bots = { A: { name: 'A', decide: () => ({ type: 'PASS' }) }, B: { name: 'B', decide: () => ({ type: 'PASS' }) } };
  const match = runMatch({ bots, classes: { A: 'IOP', B: 'IOP' }, loadouts, seed: 8 });
  loadouts.A.slots.ring1 = null;
  expect(live.state.fighters.A.loadout.slots.ring1).toBe(2469);
  expect(match.config.loadouts.A.slots.ring1).toBe(2469);
  expect(match.frames[0].state.fighters.A.basePa).toBe(8);
  const record = combatRecord(match.events, { A: 'A', B: 'B' }, match.finalState);
  expect(record.events[0].loadouts.A.slots.ring1).toBe(2469);
  const again = runMatch({ bots, ...match.config });
  expect(again.events).toEqual(match.events);
});

test('every imported stat is either classified or explicitly unsupported, and slots cover the catalogue', () => {
  for (const item of Object.values(ITEMS)) {
    expect(EQUIPMENT_SLOTS.some(slot => slot.types.includes(item.type))).toBe(true);
    for (const [id, min, max] of item.effects) {
      expect(Number.isFinite(min) && Number.isFinite(max)).toBe(true);
      expect(effectDefinition(id).kind).toMatch(/^(stat|utility|spell|metadata|weapon|unsupported)$/);
    }
  }
  expect(resolveLoadout('IOP', outfit({ dofus1: 7112 })).errors.join(' ')).toMatch(/non reproduit/);
});
