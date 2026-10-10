import { createGame, applyAction, validateAction, getView, currentFighter, effectAcceptsTarget } from '../engine/engine';
import { CLASSES } from '../engine/classes';
import { MAPS } from '../engine/maps';
import { armorReduction, applyResistances, damageAmount, rollEscape } from '../engine/formulas';
import { spellZoneCells, key } from '../engine/geometry';
import { bfs } from '../engine/pathfinding';
import { makeBotApi } from '../bots/api';
import { createRng } from '../engine/rng';
import { combatRecord } from '../ui/LogPanel';

function fresh(classId = 'IOP', seed = 1) {
  const { state } = createGame({ seed, fighters: [{ id: 'A', classId }, { id: 'B', classId: 'IOP' }] });
  state.order = ['A', 'B']; state.currentIndex = 0;
  state.fighters.A.pos = { x: 5, y: 5 };
  state.fighters.B.pos = { x: 7, y: 5 };
  return state;
}

function spellKey(classId, id) {
  return Object.values(CLASSES[classId].spells).find(s => s.id === id).key;
}

function cast(classId, spellId, prepare = () => {}, target = { x: 7, y: 5 }) {
  for (let seed = 1; seed < 100; seed++) {
    const state = fresh(classId, seed); prepare(state);
    const result = applyAction(state, { type: 'CAST', spell: spellKey(classId, spellId), target });
    expect(result.ok).toBe(true);
    if (!result.events.some(e => e.t === 'spell_fail' || (e.t === 'cast' && e.crit))) return result;
  }
  throw new Error('No normal cast');
}

test('Bluff selects exactly one damage outcome, never both or neither', () => {
  const elements = new Set();
  for (let seed = 1; seed <= 200; seed++) {
    const result = applyAction(fresh('ECAFLIP', seed), { type: 'CAST', spell: 'bluff', target: { x: 7, y: 5 } });
    expect(result.ok).toBe(true);
    if (result.events.some(e => e.t === 'spell_fail')) continue;
    const damage = result.events.filter(e => e.t === 'damage');
    expect(damage).toHaveLength(1); elements.add(damage[0].element);
    expect(result.events.filter(e => e.t === 'effect_roll' && e.selected)).toHaveLength(1);
  }
  expect([...elements].sort()).toEqual(['air', 'eau']);
});

test('Xelor keeps the 90% no-op interval and refunds one PA only on the remaining 10%', () => {
  const outcomes = new Set();
  for (let seed = 1; seed <= 200; seed++) {
    const state = fresh('XELOR', seed);
    state.fighters.B.pos = { x: 8, y: 5 };
    const r = applyAction(state, { type: 'CAST', spell: 'ralentissement', target: state.fighters.B.pos });
    expect(r.ok).toBe(true);
    if (r.events.some(e => e.t === 'spell_fail')) continue;
    const roll = r.events.find(e => e.t === 'effect_roll' && e.effectId === 120);
    expect(roll.selected).toBe(roll.roll >= 90);
    expect(r.events.some(e => e.t === 'pa_refund')).toBe(roll.selected);
    expect(r.state.fighters.A.pa).toBe(state.fighters.A.pa - 1 + Number(roll.selected));
    expect(r.state.fighters.A.effects.some(e => e.stat === 'pa')).toBe(false);
    outcomes.add(roll.selected);
  }
  expect(outcomes.size).toBe(2);
});

test('agility penalties cannot produce NaN in the critical roll or RNG state', () => {
  const r = cast('IOP', 141, state => {
    state.fighters.A.effects.push({ kind: 'buff', stat: 'agilite', value: -1000, turnsLeft: 2 });
    state.fighters.B.pos = { x: 6, y: 5 };
  }, { x: 6, y: 5 });
  expect(Number.isFinite(r.state.rngState)).toBe(true);
  expect(r.events.find(e => e.t === 'damage').amount).toBeGreaterThan(0);
});

test('per-target casts follow fighter identity, and bot validation sees the same restriction', () => {
  let state = fresh('CRA'); state.fighters.A.pa = 50;
  for (let i = 0; i < 2; i++) state = applyAction(state, { type: 'CAST', spell: 'fleche_magique', target: state.fighters.B.pos }).state;
  state.fighters.B.pos = { x: 8, y: 5 };
  state.fighters.C = { ...state.fighters.B, id: 'C', pos: { x: 7, y: 4 }, effects: [] };
  expect(validateAction(state, { type: 'CAST', spell: 'fleche_magique', target: state.fighters.B.pos }).ok).toBe(false);
  expect(validateAction(state, { type: 'CAST', spell: 'fleche_magique', target: state.fighters.C.pos }).ok).toBe(true);
  const api = makeBotApi(getView(state, 'A'), createRng(1));
  expect(api.canCast('fleche_magique', state.fighters.B.pos).ok).toBe(false);
  expect(api.canCast('fleche_magique', state.fighters.C.pos).ok).toBe(true);
});

test('Mot Curatif enforces its separate once-per-turn limit', () => {
  const { state } = cast('ENIRIPSA', 121, s => { s.fighters.A.hp = 100; }, { x: 5, y: 5 });
  expect(CLASSES.ENIRIPSA.spells.mot_curatif.usesPerTurn).toBe(1);
  expect(validateAction(state, { type: 'CAST', spell: 'mot_curatif' }).ok).toBe(false);
});

test('Mot Stimulant reaches allies four cells away and excludes enemies', () => {
  const result = cast('ENIRIPSA', 126, s => {
    s.fighters.C = { ...s.fighters.A, id: 'C', pos: { x: 5, y: 9 }, effects: [] };
    s.fighters.B.pos = { x: 9, y: 5 };
  }, { x: 5, y: 5 });
  expect(result.state.fighters.C.effects.some(e => e.stat === 'pa')).toBe(true);
  expect(result.state.fighters.B.effects.some(e => e.stat === 'pa')).toBe(false);
  expect(result.events.find(e => e.t === 'damage').target).toBe('A');
  expect(spellZoneCells('Xe', { x: 5, y: 5 }, { x: 5, y: 5 })).toHaveLength(17);
});

test('Piqûre applies distinct buff rows to a summon and another character, not the caster', () => {
  const result = cast('OSAMODAS', 27, s => {
    s.fighters.A.pos = { x: 5, y: 6 };
    s.fighters.B.pos = { x: 12, y: 12 };
    s.fighters.C = { ...s.fighters.A, id: 'C', pos: { x: 4, y: 5 }, effects: [] };
    s.fighters.S = { ...s.fighters.A, id: 'S', leader: false, isSummon: true, pos: { x: 5, y: 5 }, effects: [] };
  }, { x: 5, y: 5 });
  expect(result.state.fighters.A.effects.filter(e => e.stat === 'pa')).toHaveLength(0);
  expect(result.state.fighters.C.effects.filter(e => e.stat === 'pa')).toHaveLength(1);
  expect(result.state.fighters.S.effects.filter(e => e.stat === 'pa')).toHaveLength(1);
  // Client description + Nao agree: the stronger, longer row is for summons.
  expect(result.state.fighters.C.effects.find(e => e.stat === 'pa').value).toBe(2);
  expect(result.state.fighters.S.effects.find(e => e.stat === 'pa').value).toBe(3);
});

test('elemental armor uses the source Feca and only its matching elements', () => {
  const owner = fresh('FECA').fighters.A;
  const target = { stats: { intelligence: 0, force: 0 }, effects: [{ kind: 'armor', spellId: 6, source: 'A', value: 11 }] };
  // Owner has 281 intelligence, 141 strength: floor(11 × (1 + 211/100)).
  expect(armorReduction(target, 'terre', { A: owner })).toBe(34);
  expect(armorReduction(target, 'neutre', { A: owner })).toBe(34);
  expect(armorReduction(target, 'feu', { A: owner })).toBe(0);
});

test('Pesanteur allows walking with MP while still preventing Bond', () => {
  const state = fresh('IOP');
  state.fighters.A.effects.push({ kind: 'state', stateId: 7, turnsLeft: 1 });
  const to = { x: 4, y: 5 };
  expect(validateAction(state, { type: 'CAST', spell: 'bond', target: to }).ok).toBe(false);
  const api = makeBotApi(getView(state, 'A'), createRng(1));
  expect(api.canMove(to).ok).toBe(true);
  const result = applyAction(state, { type: 'MOVE', to });
  expect(result.ok).toBe(true);
  expect(result.state.fighters.A.pos).toEqual(to);
  expect(result.state.fighters.A.pm).toBe(state.fighters.A.pm - 1);
});

test('fixed resistance precedes percentage, player resistance caps at 50%, damage cannot become healing', () => {
  expect(applyResistances(100, 'feu', { resistances: { feu: 90 }, resistancesFixed: { feu: 20 } })).toBe(40);
  expect(damageAmount(10, 'feu', { stats: { intelligence: -1000 }, effects: [] })).toBe(10);
});

test('life steal heals from HP actually lost, not overkill', () => {
  const r = cast('ENIRIPSA', 134, s => { s.fighters.A.hp = 100; s.fighters.B.hp = 2; });
  expect(r.events.find(e => e.t === 'damage').amount).toBe(2);
  expect(r.events.find(e => e.t === 'heal').amount).toBe(1);
  expect(r.state.fighters.A.hp).toBe(101);
});

test('non-dodgeable PM removal works even if the target spent all PM last turn', () => {
  const r = cast('CRA', 174, s => { s.fighters.B.pm = 0; });
  const removal = r.events.find(e => e.t === 'point_removal');
  expect(removal.removed).toBeGreaterThan(0); expect(removal.dodged).toBe(0);
  const after = applyAction(r.state, { type: 'PASS' }).state;
  expect(after.fighters.B.pm).toBe(after.fighters.B.basePm - removal.removed);
});

test('regeneration heals on later turns and produces the full number of ticks on self', () => {
  const r = cast('ENIRIPSA', 131, s => { s.fighters.A.hp = 100; }, { x: 5, y: 5 });
  expect(r.state.fighters.A.hp).toBe(100);
  const turns = CLASSES.ENIRIPSA.spells[spellKey('ENIRIPSA', 131)].effects[0].duration;
  let state = r.state; const ticks = [];
  for (let i = 0; i < turns * 2 + 2; i++) {
    const step = applyAction(state, { type: 'PASS' }); state = step.state;
    ticks.push(...step.events.filter(e => e.t === 'heal'));
  }
  expect(ticks).toHaveLength(turns);
});

test('Colère keeps its charge until the next permitted cast', () => {
  const r = cast('IOP', 159, s => { s.fighters.B.pos = { x: 5, y: 4 }; s.fighters.B.hp = 5000; s.fighters.B.maxHp = 5000; }, { x: 5, y: 4 });
  let state = r.state;
  for (let i = 0; i < 8; i++) state = applyAction(state, { type: 'PASS' }).state;
  expect(currentFighter(state).id).toBe('A'); expect(state.fighters.A.cooldowns.colere).toBe(0);
  expect(state.fighters.A.effects.find(e => e.kind === 'spellBoost').value).toBe(240);
  const next = applyAction(state, { type: 'CAST', spell: 'colere', target: { x: 5, y: 4 } });
  expect(next.events.find(e => e.t === 'damage').calculation.boost).toBe(240);
});

test('states constrain subsequent casts and expire with their duration', () => {
  const r = cast('PANDAWA', 686, () => {}, { x: 5, y: 5 });
  expect(r.state.fighters.A.effects.some(e => e.kind === 'state' && e.stateId === 1)).toBe(true);
  expect(validateAction(r.state, { type: 'CAST', spell: spellKey('PANDAWA', 700), target: { x: 7, y: 5 } }).reason).toMatch(/état/);
});

test('tackle uses exact percentage boundaries and checks intermediate path cells', () => {
  expect(rollEscape({ int: () => 50 }, 60, 60, 8).escaped).toBe(false);
  let interrupted;
  for (let seed = 1; seed < 60; seed++) {
    const state = fresh('IOP', seed); state.fighters.A.pos = { x: 1, y: 1 }; state.fighters.B.pos = { x: 3, y: 2 };
    state.fighters.B.stats.agilite = 1000;
    const r = applyAction(state, { type: 'MOVE', to: { x: 5, y: 1 } });
    if (r.events.some(e => e.t === 'tackle')) { interrupted = r; break; }
  }
  expect(interrupted.state.fighters.A.pos).toEqual({ x: 3, y: 1 });
  expect(interrupted.state.fighters.A.pm).toBe(0);
  expect(interrupted.events.find(e => e.t === 'move').cost).toBe(2);
});

test.each([NaN, Infinity, 1.5])('invalid coordinate %s is rejected without spending PA', x => {
  const state = fresh(); const before = JSON.stringify(state);
  expect(applyAction(state, { type: 'CAST', spell: 'epee_destin', target: { x, y: 5 } }).ok).toBe(false);
  expect(JSON.stringify(state)).toBe(before);
});

test('every map has distinct, connected, walkable starting cells', () => {
  expect(Object.values(MAPS).filter(m => m.sourceId)).toHaveLength(18);
  expect(MAPS.astrub_7423).toMatchObject({ sourceId: 7423, coordinate: '[5,-23]', area: 'Astrub' });
  expect(MAPS.amakna_952).toMatchObject({ sourceId: 952, coordinate: '[-1,0]', area: 'Amakna' });
  for (const map of Object.values(MAPS)) {
    const [a, b] = map.spawns;
    expect(map.obstacles[key(a.x, a.y)]?.blocksMove).toBeFalsy();
    expect(map.obstacles[key(b.x, b.y)]?.blocksMove).toBeFalsy();
    const { costs } = bfs(a, map.width * map.height, map.width, map.height, (x, y) => !!map.obstacles[key(x, y)]?.blocksMove);
    expect(costs.get(key(b.x, b.y))).toBeGreaterThan(0);
  }
});

test('journal export retains damage calculations, spell identity, seed, and state', () => {
  const result = cast('IOP', 141, s => { s.fighters.B.pos = { x: 5, y: 4 }; }, { x: 5, y: 4 });
  const record = combatRecord(result.events, { A: 'Player', B: 'Bot' }, result.state);
  expect(JSON.parse(JSON.stringify(record))).toEqual(record);
  expect(record.events.find(e => e.t === 'cast').spellId).toBe(141);
  expect(record.events.find(e => e.t === 'damage').calculation.jet).toBeGreaterThan(0);
  expect(record.state.seed).toBe(record.seed);
});

test('effect mask bits preserve caster, team, and summon distinctions', () => {
  const caster = { id: 'A', team: 'A' };
  expect(effectAcceptsTarget({ targetMask: 32 }, caster, caster)).toBe(true);
  expect(effectAcceptsTarget({ targetMask: 32 }, caster, { id: 'S', team: 'A' })).toBe(false);
  expect(effectAcceptsTarget({ targetMask: 8 }, caster, { id: 'S', team: 'A', isSummon: true })).toBe(true);
  expect(effectAcceptsTarget({ targetMask: 4 }, caster, { id: 'B', team: 'B' })).toBe(false);
});

test('a trap is hidden from the opposing bot, triggers on entry once, and costs no extra caster PA', () => {
  const placed = cast('SRAM', 65, () => {}, { x: 6, y: 5 });
  expect(placed.events.some(e => e.t === 'damage')).toBe(false);
  expect(placed.state.hazards).toHaveLength(1);
  expect(getView(placed.state, 'A').hazards).toHaveLength(1);
  expect(getView(placed.state, 'B').hazards).toHaveLength(0);
  const state = applyAction(placed.state, { type: 'PASS' }).state;
  const pa = state.fighters.A.pa;
  const stepped = applyAction(state, { type: 'MOVE', to: { x: 6, y: 5 } });
  expect(stepped.ok).toBe(true);
  expect(stepped.events.filter(e => e.t === 'hazard_trigger')).toHaveLength(1);
  expect(stepped.events.find(e => e.t === 'damage').target).toBe('B');
  expect(stepped.state.hazards).toHaveLength(0);
  expect(stepped.state.fighters.A.pa).toBe(pa);
});

test('glyphs tick on affected fighters and expire on their owner’s turn', () => {
  const placed = cast('FECA', 10, () => {}, { x: 6, y: 5 });
  expect(placed.state.hazards[0].turnsLeft).toBe(2);
  let state = placed.state; const hits = [];
  for (let i = 0; i < 4; i++) {
    const r = applyAction(state, { type: 'PASS' }); state = r.state;
    hits.push(...r.events.filter(e => e.t === 'damage'));
  }
  expect(hits.filter(e => e.target === 'B')).toHaveLength(2);
  expect(hits.filter(e => e.target === 'A')).toHaveLength(1);
  expect(state.hazards).toHaveLength(0);
});

test('teleporting onto a trap triggers its linked spell', () => {
  const placed = cast('SRAM', 65, () => {}, { x: 6, y: 5 });
  const state = applyAction(placed.state, { type: 'PASS' }).state;
  let jumped;
  for (let seed = 10; seed < 40; seed++) {
    state.rngState = createRng(seed).getState();
    jumped = applyAction(state, { type: 'CAST', spell: 'bond', target: { x: 6, y: 5 } });
    if (!jumped.events.some(e => e.t === 'spell_fail')) break;
  }
  expect(jumped.ok).toBe(true);
  expect(jumped.events.some(e => e.t === 'teleport')).toBe(true);
  expect(jumped.events.some(e => e.t === 'hazard_trigger')).toBe(true);
  expect(jumped.state.fighters.B.hp).toBeLessThan(state.fighters.B.hp);
});

test('trap damage is deterministic and replaying an action leaves the original state intact', () => {
  const placed = cast('SRAM', 65, () => {}, { x: 6, y: 5 });
  const state = applyAction(placed.state, { type: 'PASS' }).state;
  const saved = JSON.stringify(state);
  const action = { type: 'MOVE', to: { x: 6, y: 5 } };
  expect(applyAction(state, action)).toEqual(applyAction(state, action));
  expect(JSON.stringify(state)).toBe(saved);
});

test('a summon killed while walking into a trap immediately yields the turn', () => {
  const { state } = cast('SRAM', 65, () => {}, { x: 6, y: 5 });
  state.fighters.S = { ...state.fighters.B, id: 'S', team: 'B', leader: false,
    isSummon: true, hp: 1, pos: { x: 7, y: 5 }, effects: [] };
  state.fighters.B.pos = { x: 10, y: 10 };
  state.order = ['A', 'S', 'B']; state.currentIndex = 1;
  const r = applyAction(state, { type: 'MOVE', to: { x: 6, y: 5 } });
  expect(r.state.fighters.S.hp).toBe(0);
  expect(r.state.over).toBe(false);
  expect(currentFighter(r.state).id).toBe('B');
  expect(r.events.some(e => e.t === 'turn_start' && e.fighter === 'B')).toBe(true);
});
