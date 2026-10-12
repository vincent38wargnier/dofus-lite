import { newAuthoredSpell, newAuthoredEffect, duplicateAuthoredSpell, normalizeAuthoredSpell, authoredSpellErrors,
  authoredSpellWarnings, EFFECT_TYPES } from '../engine/authoredSpells';
import { SPELL_LIBRARY, resolveSpellLoadout } from '../engine/classes';
import { isCustomSpell, isCustomSpellbook } from '../engine/customSpells';
import { emptyLoadout } from '../engine/equipment';
import { createGame, applyAction, getView, validateAction } from '../engine/engine';
import { effectiveStat } from '../engine/formulas';
import { createRng } from '../engine/rng';
import { utilityDecide } from '../bots/utilityBrain';
import { makeBotApi } from '../bots/api';
import { castAnimation } from '../ui/retroAnimation';
import { castFallbackSound } from '../ui/combatSounds';
import { spellPresentation } from '../ui/spellPresentation';
import { emptyCreations, persistCreations, readCreations } from '../ui/creationsStore';

const clone = value => JSON.parse(JSON.stringify(value));
const book = spells => ({ ...emptyLoadout('IOP'), level: 200, base: {}, spells: { custom: spells, order: spells.map(s => s.id) } });
const edit = (spell, patch) => normalizeAuthoredSpell({ ...spell, ...patch });
const setup = (spells, seed = 42) => {
  const { state } = createGame({ mapId: 'arene', seed, fighters: [
    { id: 'A', classId: 'IOP', name: 'Ma classe', loadout: book(spells) },
    { id: 'B', monsterId: 494, monsterGrade: 5 },
  ] });
  state.currentIndex = state.order.indexOf('A'); state.board.obstacles = {};
  for (const f of Object.values(state.fighters)) Object.assign(f, { stats: {}, effects: [], permanent: {}, weaponSpell: null,
    resistances: {}, resistancesFixed: {}, hp: 400, maxHp: 500, baseMaxHp: 500, pa: 12, basePa: 12, pm: 3, basePm: 3 });
  state.fighters.A.pos = { x: 3, y: 3 }; state.fighters.B.pos = { x: 6, y: 3 };
  return state;
};
const cast = (state, spell, target = state.fighters.B.pos) => applyAction(state, { type: 'CAST', spell: spell.key, target });

test.each(['attack', 'heal', 'boost', 'debuff', 'teleport'])('%s preset is a valid, persistable spell with an independent identity', preset => {
  const native = JSON.stringify(SPELL_LIBRARY);
  const raw = newAuthoredSpell([], preset), duplicate = duplicateAuthoredSpell(raw, [raw.id]);
  expect(authoredSpellErrors(raw)).toEqual([]); expect(isCustomSpell(raw)).toBe(true);
  expect(duplicate.id).not.toBe(raw.id); expect(duplicate.key).not.toBe(raw.key);
  duplicate.effects[0].min++;
  expect(raw.effects).not.toEqual(duplicate.effects);
  const value = { ...emptyCreations(), characters: [{ id: 'test', name: 'Ma classe', classId: 'IOP', loadout: book([raw]) }] };
  persistCreations(localStorage, value); expect(readCreations(localStorage).value).toEqual(value);
  expect(JSON.stringify(SPELL_LIBRARY)).toBe(native);
});

test.each([
  ['negative AP', raw => { raw.pa = -1; }], ['zero AP', raw => { raw.pa = 0; }],
  ['fractional AP', raw => { raw.pa = 2.5; }], ['empty name', raw => { raw.name = ' '; }],
  ['range', raw => { raw.rangeMin = 9; raw.rangeMax = 2; }],
  ['bad visual', raw => { raw.visualSpellId = 999999; }],
  ['native identity', raw => { raw.id = 153; raw.key = 'puissance'; }],
  ['too many effects', raw => { raw.effects = Array(5).fill(raw.effects[0]); }],
  ['unknown action', raw => { raw.effects[0].kind = 'kill'; }],
  ['delayed damage', raw => { raw.effects[0].duration = 3; }],
  ['reversed roll', raw => { raw.effects[0].min = 300; }],
  ['unknown element', raw => { raw.effects[0].element = 'void'; }],
  ['nested trigger', raw => { raw.effects[0].trigger = { effects: [] }; }],
  ['probability', raw => { raw.effects[0].chance = 50; }],
  ['initial cooldown', raw => { raw.initialCooldown = 1; }],
  ['unbounded casts', raw => { raw.maxPerTurn = 0; }],
  ['missing critical effects', raw => { raw.critRate = 50; }],
  ['orphan critical effects', raw => { raw.critEffects = clone(raw.effects); }],
])('rejects %s at combat and storage validation boundaries', (_name, change) => {
  const raw = newAuthoredSpell(); change(raw);
  expect(authoredSpellErrors(raw).length).toBeGreaterThan(0);
  expect(isCustomSpell(raw)).toBe(false);
  expect(resolveSpellLoadout('IOP', book([raw])).valid).toBe(false);
  expect(() => persistCreations(localStorage, { ...emptyCreations(), characters: [
    { id: 'invalid', name: 'Invalid', classId: 'IOP', loadout: book([raw]) },
  ] })).toThrow();
});

test('ten-spell and level limits apply equally to invented and native spells', () => {
  const spells = Array.from({ length: 10 }, (_, i) => edit(newAuthoredSpell(), { id: 1000000000000 + i, key: `custom_${1000000000000 + i}` }));
  expect(isCustomSpellbook(spells)).toBe(true);
  expect(isCustomSpellbook([...spells, duplicateAuthoredSpell(spells[0], spells.map(s => s.id))])).toBe(false);
  expect(resolveSpellLoadout('IOP', { ...book(spells), level: 199 }).errors[0]).toContain('200');
  expect(resolveSpellLoadout('IOP', book(spells)).valid).toBe(true);
});

test.each(Object.keys(EFFECT_TYPES))('%s authored effect executes through real combat', kind => {
  let raw = newAuthoredSpell([], kind === 'teleport' ? 'teleport' : 'attack');
  const effect = newAuthoredEffect(kind);
  const self = effect.targetMask === 32 || kind === 'heal';
  raw = edit(raw, { effects: [effect], ...(self && kind !== 'teleport' ? { targetMode: 'self', rangeMin: 0, rangeMax: 0 } : {}) });
  if (kind === 'buffPa') raw = edit(raw, { maxPerTurn: 1, maxPerTarget: 1, cooldown: 2 });
  expect(authoredSpellErrors(raw)).toEqual([]);
  const state = setup([raw]);
  const target = kind === 'teleport' ? { x: 3, y: 5 } : self ? state.fighters.A.pos : state.fighters.B.pos;
  const result = cast(state, raw, target);
  expect(result.ok).toBe(true);
  expect(result.events.some(e => e.t === 'cast' && e.spellId === raw.id && e.visualSpellId === raw.visualSpellId)).toBe(true);
  const event = kind === 'damage' || kind === 'lifeSteal' ? 'damage'
    : kind === 'heal' ? 'heal' : ['removePa', 'removePm'].includes(kind) ? 'point_removal'
      : ['push', 'pull', 'teleport'].includes(kind) ? kind : 'effect_add';
  expect(result.events.some(e => e.t === event)).toBe(true);
  if (kind === 'lifeSteal') expect(result.state.fighters.A.hp).toBe(406);
  if (kind === 'teleport') expect(result.state.fighters.A.pos).toEqual(target);
  if (kind === 'resistBuff') expect(effectiveStat(result.state.fighters.A, 'res_feu')).toBe(10);
});

test('effect ordering changes same-cast damage, and the bonus persists for the following cast', () => {
  const attack = newAuthoredSpell();
  const boost = { ...newAuthoredEffect('buffDamage'), duration: 1 };
  const first = edit(attack, { effects: [boost, ...attack.effects] });
  const before = cast(setup([first]), first);
  expect(before.events.find(e => e.t === 'damage').amount).toBe(26);
  const after = cast(before.state, first);
  expect(after.events.find(e => e.t === 'damage').amount).toBe(34);
  const reversed = edit(attack, { effects: [...attack.effects, boost] });
  expect(cast(setup([reversed]), reversed).events.find(e => e.t === 'damage').amount).toBe(18);
});

test('empty-center area casting uses actual area and recipient rules', () => {
  const raw = edit(newAuthoredSpell(), { pa: 6, targetMode: 'cell', effects: [{ ...newAuthoredEffect(), min: 20, max: 20, zone: 'Cc', targetMask: 0 }] });
  const state = setup([raw]); state.fighters.B.pos = { x: 5, y: 3 };
  const result = cast(state, raw, { x: 4, y: 3 });
  expect(result.ok).toBe(true);
  expect(result.events.filter(e => e.t === 'damage').map(e => [e.target, e.amount])).toEqual(expect.arrayContaining([['A', 20], ['B', 20]]));
  expect(result.events.find(e => e.t === 'cast').aoe).toHaveLength(13);
  const enemiesOnly = edit(raw, { effects: [{ ...raw.effects[0], targetMask: 1 }] });
  expect(cast(setup([enemiesOnly]), enemiesOnly, { x: 4, y: 3 }).events.some(e => e.t === 'damage' && e.target === 'A')).toBe(false);
});

test('same visual preserves separate cooldowns, actual element, and correct native animation and sound', () => {
  const one = edit(newAuthoredSpell(), { cooldown: 3 });
  const two = duplicateAuthoredSpell(one, [one.id]);
  const result = cast(setup([one, two]), one);
  expect(cast(result.state, one).ok).toBe(false);
  expect(cast(result.state, two).ok).toBe(true);
  const view = getView(result.state, 'A'), spell = view.you.spells.find(s => s.id === one.id);
  expect(spell).toMatchObject({ visualSpellId: 161, cooldownLeft: 3 });
  expect(spellPresentation(spell).category).toBe('feu');
  const event = result.events.find(e => e.t === 'cast');
  const assets = { spells: { 161: { animation: 'anim3', sounds: ['NATIVE'] } }, audio: { cues: { NATIVE: { url: 'native.mp3' }, PUNCH: { url: 'punch.mp3' } } } };
  expect(castAnimation(event, assets)).toBe('anim3');
  expect(castFallbackSound(event, spell, { animations: ['staticR'], sounds: {} }, assets)).toBeNull();
});

test('critical effect list replaces normal effects and per-target limits still apply', () => {
  let raw = newAuthoredSpell();
  raw = edit(raw, { critRate: 2, effects: [{ ...newAuthoredEffect(), min: 10, max: 10 }],
    critEffects: [{ ...newAuthoredEffect(), min: 30, max: 30 }], maxPerTarget: 1 });
  const results = Array.from({ length: 20 }, (_, i) => cast(setup([raw], i + 1), raw));
  const critical = results.find(result => result.events.some(e => e.t === 'cast' && e.crit));
  const normal = results.find(result => result.events.some(e => e.t === 'cast' && !e.crit));
  expect(critical.events.filter(e => e.t === 'damage').map(e => e.amount)).toEqual([30]);
  expect(normal.events.filter(e => e.t === 'damage').map(e => e.amount)).toEqual([10]);
  expect(cast(critical.state, raw).ok).toBe(false);
});

test('AI can choose and cast an invented spell without any native spell-ID rule', () => {
  const raw = newAuthoredSpell(), state = setup([raw]); state.fighters.A.pm = 0;
  const view = getView(state, 'A');
  const action = utilityDecide(view, makeBotApi(view, createRng(1)));
  expect(action).toMatchObject({ type: 'CAST', spell: raw.key, target: state.fighters.B.pos });
  expect(validateAction(state, action).ok).toBe(true);
  expect(applyAction(state, action).events.some(e => e.t === 'damage')).toBe(true);
});

test('balance validation rejects high output while guidance still explains kit synergies', () => {
  const raw = edit(newAuthoredSpell(), { effects: [{ ...newAuthoredEffect(), min: 200, max: 250 }] });
  expect(authoredSpellErrors(raw).join()).toContain('score');
  expect(authoredSpellWarnings(raw, [newAuthoredSpell([], 'boost')]).join(' ')).toMatch(/Dégâts bruts.*Votre classe/);
  const criticalOnly = edit(newAuthoredSpell(), { critRate: 2, critEffects: raw.effects });
  expect(authoredSpellWarnings(criticalOnly).join(' ')).toContain('Dégâts critiques');
  const emptyOnly = edit(newAuthoredSpell(), { targetMode: 'freeCell' });
  expect(authoredSpellErrors(emptyOnly).join(' ')).toContain('aucun combattant');
});
