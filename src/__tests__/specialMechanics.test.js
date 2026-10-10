import { applyAction, createGame, currentFighter, spellsOf, validateAction } from '../engine/engine';
import { SPELL_LIBRARY, availableSpellGrades, resolveSpellLoadout, spellAtGrade } from '../engine/classes';
import { emptyLoadout, ITEMS, weaponSpell } from '../engine/equipment';
import { statBuffTotal } from '../engine/formulas';
import { areaDamagePercent } from '../engine/geometry';

function fight(a = 'IOP', b = 'IOP', level = 200) {
  const loadout = classId => ({ ...emptyLoadout(classId), level, base: {}, spells: {
    common: [], grades: Object.fromEntries(SPELL_LIBRARY.classes[classId].map(id => [id, 5])),
  } });
  const { state } = createGame({ seed: 7, fighters: [
    { id: 'A', classId: a, loadout: loadout(a) }, { id: 'B', classId: b, loadout: loadout(b) },
  ] });
  state.board = { width: 25, height: 25, obstacles: {} };
  state.order = ['A', 'B']; state.currentIndex = 0;
  state.fighters.A.pos = { x: 10, y: 10 }; state.fighters.B.pos = { x: 11, y: 10 };
  for (const f of Object.values(state.fighters)) {
    f.hp = f.maxHp = f.baseMaxHp = 5000; f.pa = 100;
    f.stats = {}; f.permanent = {}; f.resistances = {}; f.resistancesFixed = {};
  }
  return state;
}

const byId = (state, id) => Object.values(spellsOf(currentFighter(state))).find(s => s.id === id);
function cast(state, id, target = state.fighters.B.pos) {
  const spell = byId(state, id);
  expect(validateAction(state, { type: 'CAST', spell: spell.key, target })).toMatchObject({ ok: true });
  for (let seed = 1; seed < 500; seed++) {
    const result = applyAction({ ...state, rngState: seed }, { type: 'CAST', spell: spell.key, target });
    expect(result.ok).toBe(true);
    if (!result.events.some(e => e.t === 'spell_fail' || (e.t === 'cast' && e.crit))) return result;
  }
  throw new Error(`No normal cast of ${id}`);
}
const pass = state => applyAction(state, { type: 'PASS' }).state;
const round = state => pass(pass(state));
const damage = (result, id = 'B') => result.events.filter(e => e.t === 'damage' && e.target === id);

test.each([1, 99, 100, 101, 150, 200])('all common spells use their real maximum grade at level %i, including old saves', level => {
  const config = { level, spells: { common: SPELL_LIBRARY.common, grades: Object.fromEntries(SPELL_LIBRARY.common.map(id => [id, 1])) } };
  const result = resolveSpellLoadout('IOP', JSON.parse(JSON.stringify(config)));
  expect(result.valid).toBe(true);
  for (const id of SPELL_LIBRARY.common) {
    const maximum = availableSpellGrades(id, level).at(-1);
    const spell = Object.values(result.spells).find(s => s.id === id);
    expect(spell).toEqual(spellAtGrade(id, maximum));
  }
  expect(Object.values(result.spells).find(s => s.id === 367).grade).toBe(level >= 100 ? 6 : 5);
});

test('Cawotte uses grade-6 AP, range, summon and healing glyph at level 100', () => {
  const state = fight('IOP', 'IOP', 100);
  state.fighters.A.loadout.spells = { common: [367], grades: { 367: 1 } };
  const spell = byId(state, 367);
  expect(spell).toMatchObject({ grade: 6, pa: 4, range: [1, 6] });
  const result = cast(state, 367, { x: 10, y: 11 });
  expect(result.state.fighters.As1.summonGrade).toBe(6);
  expect(result.state.fighters.A.pa).toBe(96);
  const heal = spell.effects.find(e => e.kind === 'glyph').trigger.effects.find(e => e.kind === 'heal');
  result.state.fighters.A.hp = 100;
  expect(round(result.state).fighters.A.hp).toBeGreaterThanOrEqual(100 + heal.min);
});

test.each(['free', 'wall', 'fighter'])('Dérobade cast on self protects during the opponent turn with a %s retreat', retreat => {
  let state = fight('SACRIEUR');
  if (retreat === 'wall') state.board.obstacles['9,10'] = { type: 'ROCK', blocksMove: true };
  if (retreat === 'fighter') state.fighters.C = { ...state.fighters.B, id: 'C', leader: false, pos: { x: 9, y: 10 }, effects: [] };
  state = cast(state, 444, state.fighters.A.pos).state;
  state = pass(state);
  const hit = cast(state, 141, state.fighters.A.pos);
  expect(hit.events).toContainEqual(expect.objectContaining({ t: 'damage_dodged', fighter: 'A' }));
  expect(damage(hit, 'A').filter(e => !e.label.includes('poussée'))).toHaveLength(0);
  if (retreat === 'free') {
    expect(hit.state.fighters.A.hp).toBe(5000);
    expect(hit.state.fighters.A.pos).toEqual({ x: 9, y: 10 });
  } else {
    expect(damage(hit, 'A')).toHaveLength(1);
    expect(damage(hit, 'A')[0].label).toContain('Dérobade (poussée)');
  }
  state = pass(pass(hit.state));
  expect(state.fighters.A.effects.some(e => e.kind === 'dodgeMelee')).toBe(false);
  state.fighters.A.pos = { x: 10, y: 10 };
  expect(damage(cast(state, 141, state.fighters.A.pos), 'A')[0].amount).toBeGreaterThan(0);
});

test('Dérobade also handles Punition and all lines of a melee weapon, but not ranged hits', () => {
  for (const attack of ['punition', 'weapon', 'ranged']) {
    let state = fight('SACRIEUR', attack === 'ranged' ? 'CRA' : 'SACRIEUR');
    state = pass(cast(state, 444, state.fighters.A.pos).state);
    state.fighters.B.hp = 2500;
    state.fighters.B.cooldowns = {};
    if (attack === 'weapon') {
      state.board.obstacles['9,10'] = { type: 'ROCK', blocksMove: true };
      state.fighters.B.weaponSpell = weaponSpell(ITEMS[2416]);
      state.fighters.B.weaponSpell.effects.push({ ...state.fighters.B.weaponSpell.effects[0], element: 'feu' });
    }
    if (attack === 'ranged') state.fighters.B.pos = { x: 13, y: 10 };
    const hit = cast(state, attack === 'punition' ? 446 : attack === 'weapon' ? 0 : 161, state.fighters.A.pos);
    if (attack === 'ranged') expect(damage(hit, 'A')[0].amount).toBeGreaterThan(0);
    else {
      expect(hit.events.filter(e => e.t === 'damage_dodged')).toHaveLength(1);
      expect(damage(hit, 'A').filter(e => !e.label.includes('poussée'))).toHaveLength(0);
    }
  }
});

test('Furie stacks +8 immediately for every following damage line, including weapons, and lasts three turns', () => {
  let state = fight('SACRIEUR');
  state.fighters.A.weaponSpell = weaponSpell(ITEMS[2416]);
  const initial = cast(state, 436);
  state = cast(state, 447).state;
  state = cast(state, 447).state;
  expect(statBuffTotal(state.fighters.A, 'damage')).toBe(16);
  expect(damage(cast(state, 436))[0].amount - damage(initial)[0].amount).toBe(16);
  const unbuffed = JSON.parse(JSON.stringify(state)); unbuffed.fighters.A.effects = [];
  expect(damage(cast(state, 0))[0].amount - damage(cast(unbuffed, 0))[0].amount).toBe(16);
  for (let turn = 0; turn < 3; turn++) {
    state = round(state);
    expect(statBuffTotal(state.fighters.A, 'damage')).toBe(16);
  }
  expect(statBuffTotal(round(state).fighters.A, 'damage')).toBe(0);
});

test('Furie loses life only on received hits, stacks its drawback, respects neutral resistance and does not poison the next turn', () => {
  let state = fight('SACRIEUR');
  state.fighters.B.pos = { x: 12, y: 10 };
  state = cast(cast(state, 447).state, 447).state;
  expect(state.fighters.A.hp).toBe(5000);
  expect(round(state).fighters.A.hp).toBe(5000);
  state.fighters.A.resistances.neutre = 50;
  state.fighters.B.pos = { x: 11, y: 10 };
  state = pass(state);
  const hit = cast(state, 141, state.fighters.A.pos);
  const reactive = damage(hit, 'A').filter(e => e.label.includes('coup reçu'));
  expect(reactive).toHaveLength(2);
  expect(reactive.map(e => e.amount)).toEqual([25, 25]); // 1% of 5000, then 50% neutral resistance
  const next = pass(pass(hit.state));
  expect(next.fighters.A.effects.some(e => e.kind === 'damageOnHit')).toBe(false);
  expect(damage(cast(next, 141, next.fighters.A.pos), 'A')).toHaveLength(1);
});

test('Iop Mutilation stacks within the current turn and disappears before the next one', () => {
  let state = fight();
  state = cast(cast(state, 149, state.fighters.A.pos).state, 149, state.fighters.A.pos).state;
  expect(statBuffTotal(state.fighters.A, 'physicalDamage')).toBe(80);
  expect(statBuffTotal(state.fighters.A, 'power')).toBe(80);
  state = pass(state);
  expect(statBuffTotal(state.fighters.A, 'physicalDamage')).toBe(0);
  expect(statBuffTotal(state.fighters.A, 'power')).toBe(0);
});

test('Sacrieur gains late in a Châtiment keep their own five-turn duration', () => {
  let state = fight('SACRIEUR');
  state = cast(state, 431, state.fighters.A.pos).state;
  for (let i = 0; i < 4; i++) state = round(state);
  state = pass(state);
  const hit = cast(state, 141, state.fighters.A.pos);
  const gain = hit.state.fighters.A.effects.find(e => e.kind === 'buff' && e.stat === 'force');
  expect(gain.turnsLeft).toBe(5);
  state = pass(pass(hit.state));
  expect(state.fighters.A.effects.some(e => e.kind === 'punishment')).toBe(false);
  expect(statBuffTotal(state.fighters.A, 'force')).toBe(gain.value);
});

test('Châtiment caps each attacker turn independently, and summon damage grants the full stat gain', () => {
  let state = fight('SACRIEUR');
  state.fighters.C = { ...state.fighters.B, id: 'C', leader: false, pos: { x: 10, y: 11 }, effects: [] };
  state.order = ['A', 'B', 'C'];
  state.fighters.B.permanent = { damage: 400 };
  state.fighters.C.permanent = { damage: 400 };
  state = pass(cast(state, 431, state.fighters.A.pos).state);
  state = cast(state, 141, state.fighters.A.pos).state;
  expect(statBuffTotal(state.fighters.A, 'force')).toBe(140);
  state = pass(state);
  state = cast(state, 141, state.fighters.A.pos).state;
  expect(statBuffTotal(state.fighters.A, 'force')).toBe(280);

  // Source classification affects the gained stat, not the damage formula.
  let summoned = fight('SACRIEUR');
  summoned = pass(cast(summoned, 431, summoned.fighters.A.pos).state);
  summoned.fighters.B.isSummon = true; summoned.fighters.B.monsterId = 246; summoned.fighters.B.summonGrade = 6;
  const spell = Object.values(spellsOf(summoned.fighters.B))[0];
  const hit = cast(summoned, spell.id, summoned.fighters.A.pos);
  expect(statBuffTotal(hit.state.fighters.A, 'force')).toBe(damage(hit, 'A')[0].amount);
});

test('a skipped turn still triggers poisons and regeneration', () => {
  let state = fight('SRAM', 'ENIRIPSA');
  state = cast(state, 66).state;
  state = pass(state);
  state.fighters.B.hp = 1000;
  state = cast(state, 131, state.fighters.B.pos).state;
  state = pass(state);
  // The real Corruption cast is made by an Enutrof on the next turn.
  state.fighters.A.classId = 'ENUTROF';
  state.fighters.A.loadout = emptyLoadout('ENUTROF'); state.fighters.A.pa = 100;
  state = cast(state, 59).state;
  const result = applyAction(state, { type: 'PASS' });
  expect(result.events.some(e => e.t === 'turn_skipped' && e.fighter === 'B')).toBe(true);
  expect(result.events.some(e => e.t === 'damage' && e.target === 'B' && e.label.includes('poison'))).toBe(true);
  expect(result.events.some(e => e.t === 'heal' && e.target === 'B' && e.label.includes('régénération'))).toBe(true);
});

test('Sram poisons from separate casters keep both ticks and independent durations', () => {
  let state = fight('SRAM', 'SRAM');
  state.fighters.C = { ...state.fighters.A, id: 'C', leader: false, pos: { x: 11, y: 11 }, effects: [] };
  state.order = ['A', 'C', 'B'];
  state = cast(state, 66).state;
  state = pass(state);
  state = cast(state, 66).state;
  const result = applyAction(state, { type: 'PASS' });
  expect(damage(result).filter(e => e.label.includes('poison'))).toHaveLength(2);
});

test.each([
  ['FECA', 20, 'armor'], ['ENUTROF', 42, 'buff'],
  ['SRAM', 72, 'invisibility'], ['XELOR', 82, 'damageReflection'], ['ECAFLIP', 103, 'ecaflipLuck'],
  ['ENIRIPSA', 131, 'regeneration'], ['IOP', 153, 'buff'], ['CRA', 166, 'buff'],
  ['SADIDA', 197, 'buff'], ['SACRIEUR', 444, 'dodgeMelee'], ['PANDAWA', 686, 'state'],
])('%s: real spell %i persists through the enemy turn, then expires on schedule', (classId, id, kind) => {
  let state = fight(classId);
  const turns = byId(state, id).effects.find(e => e.kind === kind || (kind === 'regeneration' && e.kind === 'heal') || (kind === 'buff' && e.duration > 0)).duration;
  state = cast(state, id, state.fighters.A.pos).state;
  expect(state.fighters.A.effects.some(e => e.kind === kind)).toBe(true);
  for (let i = 0; i < turns; i++) {
    state = pass(state);
    expect(state.fighters.A.effects.some(e => e.kind === kind)).toBe(true);
    state = pass(state);
  }
  state = pass(state);
  expect(state.fighters.A.effects.some(e => e.kind === kind)).toBe(false);
});

test('Osamodas character and summon buffs apply their own values and durations', () => {
  let state = fight('OSAMODAS');
  state.fighters.C = { ...state.fighters.A, id: 'C', leader: false, pos: { x: 10, y: 11 }, effects: [] };
  state.fighters.S = { ...state.fighters.C, id: 'S', isSummon: true, monsterId: 43, pos: { x: 10, y: 12 }, effects: [] };
  state = cast(state, 23, state.fighters.C.pos).state;
  expect(statBuffTotal(state.fighters.A, 'damage')).toBe(0);
  expect(statBuffTotal(state.fighters.C, 'damage')).toBe(7);
  expect(statBuffTotal(state.fighters.S, 'damage')).toBeGreaterThanOrEqual(7);
  expect(state.fighters.C.effects[0].turnsLeft).toBe(2);
  expect(state.fighters.S.effects[0].turnsLeft).toBe(11);
});

test('Feca Immunité prevents the next enemy hit, then a later hit deals damage', () => {
  let state = fight('FECA');
  state = pass(cast(state, 20, state.fighters.A.pos).state);
  const hit = cast(state, 141, state.fighters.A.pos);
  expect(damage(hit, 'A')[0].amount).toBe(0);
  state = pass(pass(hit.state));
  expect(damage(cast(state, 141, state.fighters.A.pos), 'A')[0].amount).toBeGreaterThan(0);
});

test.each([141, 446])('Xelor Contre reacts to real enemy spell %i and returns damage to its caster', attackId => {
  let state = fight('XELOR', attackId === 446 ? 'SACRIEUR' : 'IOP');
  state = pass(cast(state, 82, state.fighters.A.pos).state);
  state.fighters.B.hp = 2500; state.fighters.B.cooldowns = {};
  const hit = cast(state, attackId, state.fighters.A.pos);
  expect(damage(hit, 'B')).toContainEqual(expect.objectContaining({ amount: 7, label: 'Renvoi de sort de protection' }));
});

test.each([141, 446])('Ecaflip Chance converts or doubles actual enemy spell %i, including Punition', attackId => {
  let state = fight('ECAFLIP', attackId === 446 ? 'SACRIEUR' : 'IOP');
  state = pass(cast(state, 103, state.fighters.A.pos).state);
  state.fighters.A.hp = 1000;
  state.fighters.B.hp = 2500; state.fighters.B.cooldowns = {};
  const outcomes = new Set();
  for (let seed = 1; seed < 120; seed++) {
    const hit = applyAction({ ...state, rngState: seed }, { type: 'CAST', spell: byId(state, attackId).key, target: state.fighters.A.pos });
    expect(hit.ok).toBe(true);
    if (hit.events.some(e => e.t === 'spell_fail')) continue;
    const heal = hit.events.find(e => e.t === 'heal' && e.target === 'A');
    if (heal) {
      outcomes.add('heal');
      expect(heal.amount).toBeGreaterThan(0);
      expect(damage(hit, 'A')).toHaveLength(0);
    } else {
      outcomes.add('damage');
      const loss = damage(hit, 'A')[0];
      expect(loss.attempted).toBe(loss.calculation.afterRes * 2);
    }
  }
  expect([...outcomes].sort()).toEqual(['damage', 'heal']);
});

test('Feca Renvoi de Sort also reflects Punition, without damaging the protected fighter', () => {
  let state = fight('FECA', 'SACRIEUR');
  const id = SPELL_LIBRARY.classes.FECA.find(id => SPELL_LIBRARY.spells[id].name === 'Renvoi de Sort');
  state = pass(cast(state, id, state.fighters.A.pos).state);
  state.fighters.B.hp = 2500; state.fighters.B.cooldowns = {};
  const hit = cast(state, 446, state.fighters.A.pos);
  expect(hit.events.some(e => e.t === 'spell_reflected')).toBe(true);
  expect(damage(hit, 'A')).toHaveLength(0);
  expect(damage(hit, 'B')[0].amount).toBe(1500);
});

test('a reflected area spell keeps the coefficient at the original target cell', () => {
  let state = fight('FECA', 'CRA');
  state.fighters.B.pos = { x: 15, y: 10 };
  const id = SPELL_LIBRARY.classes.FECA.find(id => SPELL_LIBRARY.spells[id].name === 'Renvoi de Sort');
  state = pass(cast(state, id, state.fighters.A.pos).state);
  const hit = cast(state, 179, state.fighters.A.pos);
  expect(damage(hit, 'A')).toHaveLength(0);
  expect(damage(hit, 'B')[0].calculation.areaPercent).toBe(110);
});

test('Pandawa Lait de Bambou removes Picole, its PM penalty and its resistances', () => {
  let state = fight('PANDAWA');
  state = cast(state, 686, state.fighters.A.pos).state;
  expect(statBuffTotal(state.fighters.A, 'pm')).toBe(-1);
  expect(statBuffTotal(state.fighters.A, 'res_feu')).toBe(20);
  const milk = SPELL_LIBRARY.classes.PANDAWA.find(id => SPELL_LIBRARY.spells[id].name === 'Lait de Bambou');
  state = cast(state, milk, state.fighters.A.pos).state;
  expect(statBuffTotal(state.fighters.A, 'pm')).toBe(0);
  expect(statBuffTotal(state.fighters.A, 'res_feu')).toBe(0);
  expect(state.fighters.A.pm).toBe(state.fighters.A.basePm);
  expect(state.fighters.A.effects.some(e => e.kind === 'state' && e.stateId === 1)).toBe(false);
});

test('Pandawa Picole keeps its PM penalty for the same turns as its resistance and drunken state', () => {
  let state = fight('PANDAWA');
  state = cast(state, 686, state.fighters.A.pos).state;
  for (let i = 0; i < 9; i++) {
    state = round(state);
    expect(state.fighters.A.pm).toBe(2);
    expect(statBuffTotal(state.fighters.A, 'res_feu')).toBe(20);
  }
  state = round(state);
  expect(state.fighters.A.pm).toBe(3);
  expect(statBuffTotal(state.fighters.A, 'res_feu')).toBe(0);
});

test('Sadida Puissance Sylvestre prevents actions for its full duration, even after PA/PM were spent', () => {
  let state = fight('SADIDA');
  state.fighters.A.pa = byId(state, 197).pa;
  state.fighters.A.pm = 0;
  state = cast(state, 197, state.fighters.A.pos).state;
  state = pass(state);
  expect(damage(cast(state, 141, state.fighters.A.pos), 'A')[0].amount).toBe(0);
  state = pass(state);
  for (let i = 0; i < 4; i++) {
    expect(state.fighters.A.pa).toBe(0);
    expect(state.fighters.A.pm).toBe(0);
    expect(state.fighters.A.effects.some(e => e.kind === 'regeneration')).toBe(true);
    state = round(state);
  }
  expect(state.fighters.A.pa).toBe(7);
  expect(state.fighters.A.pm).toBe(3);
  expect(state.fighters.A.effects.some(e => e.kind === 'regeneration')).toBe(false);
});

test('Sadida Tremblement + Vent Empoisonné + Puissance Sylvestre damages enemies and protects the caster until expiry', () => {
  let state = fight('SADIDA');
  state = cast(state, 181, state.fighters.A.pos).state;
  state = cast(state, 196, state.fighters.A.pos).state;
  state = cast(state, 197, state.fighters.A.pos).state;
  for (let turn = 0; turn < 4; turn++) {
    const enemyTurn = applyAction(state, { type: 'PASS' });
    expect(damage(enemyTurn).map(e => e.amount)).toEqual([5, 5]);
    const ownTurn = applyAction(enemyTurn.state, { type: 'PASS' });
    expect(damage(ownTurn, 'A').map(e => e.amount)).toEqual([0, 0]);
    state = ownTurn.state;
  }
  const expired = applyAction(pass(state), { type: 'PASS' });
  expect(damage(expired, 'A').map(e => e.amount)).toEqual([5]);
  expect(damage(expired, 'A')[0].label).toContain('Vent Empoisonné');
});

test('Feca glyph damage scales from its placed center on later turns, even when that turn is skipped', () => {
  let state = fight('FECA');
  state.fighters.B.pos = { x: 13, y: 10 };
  const id = SPELL_LIBRARY.classes.FECA.find(id => SPELL_LIBRARY.spells[id].name === 'Glyphe Enflammé');
  state = cast(state, id, { x: 12, y: 10 }).state;
  state.fighters.B.effects.push({ kind: 'skipTurn', turnsLeft: 1 });
  const result = applyAction(state, { type: 'PASS' });
  expect(result.events).toContainEqual(expect.objectContaining({ t: 'turn_skipped', fighter: 'B' }));
  const hit = damage(result)[0];
  expect(hit.amount).toBeGreaterThan(0);
  expect(hit.calculation.areaPercent).toBe(100);
});

test('spell areas use distance from the aimed cell, include flat bonuses, then apply resistance', () => {
  const state = fight('CRA');
  state.fighters.B.pos = { x: 15, y: 10 };
  state.fighters.A.effects.push({ kind: 'minRolls', turnsLeft: 10 });
  state.fighters.A.permanent.damage = 80;
  for (let distance = 0; distance <= 2; distance++) {
    const id = distance === 0 ? 'B' : `C${distance}`;
    state.fighters[id] = { ...state.fighters.B, id, leader: distance === 0, pos: { x: 15 + distance, y: 10 },
      effects: [], resistances: { feu: 20 }, resistancesFixed: { feu: 10 } };
  }
  const result = cast(state, 179);
  const hits = result.events.filter(e => e.t === 'damage');
  expect(hits.map(e => e.target)).toEqual(['B', 'C1', 'C2']);
  expect(hits.map(e => e.calculation.areaPercent)).toEqual([110, 100, 90]);
  expect(hits.map(e => e.amount)).toEqual([80, 72, 64]); // base 20 + flat 80, zone, -10 fixed, -20%
  expect(areaDamagePercent('Pa', { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(100);
});

test('Retro hammer can aim at an empty cell and hits all four cells at full weapon damage', () => {
  const state = fight();
  state.fighters.B.pos = { x: 12, y: 10 };
  state.fighters.C = { ...state.fighters.B, id: 'C', leader: false, pos: { x: 11, y: 11 }, effects: [] };
  state.fighters.A.weaponSpell = weaponSpell(ITEMS[2416]);
  state.fighters.A.effects.push({ kind: 'minRolls', turnsLeft: 1 });
  const result = cast(state, 0, { x: 11, y: 10 });
  expect(result.state.fighters.A.pa).toBe(95);
  const hits = result.events.filter(e => e.t === 'damage');
  expect(hits.map(e => e.target).sort()).toEqual(['B', 'B', 'C', 'C']);
  expect(hits[0].amount).toBe(hits[1].amount);
  expect(hits.every(e => e.calculation.areaPercent === 100)).toBe(true);
  expect(validateAction(state, { type: 'CAST', spell: 'weapon', target: { x: 9, y: 10 } }).ok).toBe(true);
  expect(damage(cast(state, 0, { x: 9, y: 10 }))).toHaveLength(0);
});
