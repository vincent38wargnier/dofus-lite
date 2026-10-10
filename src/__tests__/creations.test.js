import MONSTERS from '../engine/monsterData.json';
import { SPELL_LIBRARY, resolveSpellLoadout } from '../engine/classes';
import { isCustomSpellbook, MAX_CUSTOM_SPELLS } from '../engine/customSpells';
import { addCustomDungeonMonster, customDungeonErrors, customDungeonRoster } from '../engine/customDungeons';
import { emptyLoadout, resolveLoadout } from '../engine/equipment';
import { createGame, applyAction, spellsOf } from '../engine/engine';
import { getMonster } from '../engine/monsters';
import { LiveMatch } from '../game/liveMatch';
import { runMatch, runMatchAsync } from '../arena/runner';
import { utilityDecide } from '../bots/utilityBrain';
import { CREATION_SPELLS, CREATION_SPELLS_BY_ID, filterCreationSpells } from '../ui/creationCatalogue';
import { CREATIONS_STORAGE, emptyCreations, readCreations, persistCreations } from '../ui/creationsStore';

const raw = id => CREATION_SPELLS_BY_ID[id].grades.at(-1);
const loadout = (ids = [202, 305, 214]) => ({ ...emptyLoadout('IOP'), level: 200, base: {},
  spells: { custom: ids.map(raw), order: [...ids].reverse() } });
const room = { name: 'Ma salle mixte', mapId: 'dungeon_2083', members: [
  { monsterId: 147, grade: 1, count: 1 }, { monsterId: 494, grade: 2, count: 2 },
] };
const setup = (ids, hp = 10000) => {
  const { state } = createGame({ mapId: 'arene', seed: 19, fighters: [
    { id: 'A', name: 'Hybride', classId: 'IOP', loadout: loadout(ids) },
    { id: 'B', monsterId: 494, monsterGrade: 5 },
  ] });
  state.currentIndex = state.order.indexOf('A');
  state.board.obstacles = {};
  state.fighters.A.pos = { x: 3, y: 3 };
  state.fighters.A.pa = 30;
  state.fighters.B.pos = { x: 4, y: 3 };
  state.fighters.B.hp = state.fighters.B.maxHp = hp;
  return state;
};
const spellKey = (state, id) => Object.values(spellsOf(state.fighters.A)).find(spell => spell.id === id).key;
const cast = (state, id, target = state.fighters.A.pos) => applyAction(state, { type: 'CAST', spell: spellKey(state, id), target });

test('catalogue includes every class and imported monster spell, with unique valid grades and origins', () => {
  const expected = new Set([...Object.values(SPELL_LIBRARY.classes).flat(), ...SPELL_LIBRARY.common,
    ...Object.values(MONSTERS.monsters).flatMap(monster => Object.values(monster.grades).flatMap(grade => grade.spells.map(spell => spell.id)))]);
  expect(CREATION_SPELLS.length).toBeGreaterThanOrEqual(expected.size);
  for (const id of expected) expect(CREATION_SPELLS_BY_ID[id]).toBeDefined();
  for (const entry of CREATION_SPELLS) {
    expect(entry.sources.length).toBeGreaterThan(0);
    expect(new Set(entry.grades.map(grade => grade.grade)).size).toBe(entry.grades.length);
    for (const grade of entry.grades) expect(isCustomSpellbook([grade])).toBe(true);
  }
});

test('catalogue combines owner, role, action, element and zone filters, including mixed spells', () => {
  for (const role of ['damage', 'boost']) {
    expect(filterCreationSpells(CREATION_SPELLS, { query: 'furie', role }).some(entry => entry.id === 447)).toBe(true);
  }
  const results = filterCreationSpells(CREATION_SPELLS, { source: 'class:IOP', role: 'damage', element: 'terre', area: 'area' });
  expect(results.some(entry => entry.name.includes('Iop'))).toBe(true);
  expect(results.every(entry => entry.sources.some(source => source.id === 'class:IOP') && entry.elements.includes('terre') && entry.area)).toBe(true);
  expect(filterCreationSpells(CREATION_SPELLS, { query: 'bouftou royal', action: 'damage', origin: 'monster' }).some(entry => entry.id === 202)).toBe(true);
  expect(filterCreationSpells(CREATION_SPELLS, { query: 'zzzzzzzz' })).toEqual([]);
  expect(filterCreationSpells(CREATION_SPELLS, { query: 'invocation d’Arakne' }).some(entry => entry.id === 214)).toBe(true);
  const subset = [CREATION_SPELLS_BY_ID[305], CREATION_SPELLS_BY_ID[202]];
  expect(filterCreationSpells(subset, { sort: 'action' })[0].id).toBe(202);
  expect(filterCreationSpells(subset, { sort: 'element' })[0].id).toBe(202);
});

test('custom spellbook replaces the class spells and preserves chosen grades, order and equipment', () => {
  const selected = loadout();
  selected.slots.weapon = 2416;
  const resolved = resolveSpellLoadout('CRA', selected);
  expect(resolved.valid).toBe(true);
  expect(Object.values(resolved.spells).map(spell => spell.id)).toEqual([214, 305, 202]);
  expect(Object.values(resolved.spells).every(spell => spell.grade === raw(spell.id).grade)).toBe(true);
  const summary = resolveLoadout('CRA', selected);
  expect(summary.valid).toBe(true);
  expect(summary.snapshot.spells.custom).toEqual(selected.spells.custom);
  const state = createGame({ mapId: 'arene', seed: 1, fighters: [
    { id: 'A', classId: 'CRA', loadout: selected }, { id: 'B', monsterId: 494, monsterGrade: 1 },
  ] }).state;
  const spells = Object.values(spellsOf(state.fighters.A));
  expect(spells[0].isWeapon).toBe(true);
  expect(spells.slice(1).map(spell => spell.id)).toEqual([214, 305, 202]);
  // Original AI scripts can still address class spells by their public keys.
  expect(resolveSpellLoadout('CRA', loadout([141])).spells.pression.id).toBe(141);
});

test('custom spells still enforce PA, cooldown and targeting, and monster boosts apply immediately', () => {
  let state = setup([202, 305]);
  let hit = cast(state, 202, state.fighters.B.pos);
  expect(hit.ok).toBe(true);
  expect(hit.events.some(event => event.t === 'damage' && event.target === 'B' && event.amount > 0)).toBe(true);
  expect(hit.state.fighters.A.pa).toBe(30 - raw(202).pa);
  const boosted = cast(state, 305);
  expect(boosted.ok).toBe(true);
  expect(boosted.state.fighters.A.effects.some(effect => effect.stat === 'damage' && effect.value > 0)).toBe(true);
  state = boosted.state;
  const after = cast(state, 202, state.fighters.B.pos);
  expect(after.ok).toBe(true);
  expect(after.events.find(event => event.t === 'damage').amount).toBeGreaterThan(hit.events.find(event => event.t === 'damage').amount);
  state = { ...after.state, fighters: { ...after.state.fighters, A: { ...after.state.fighters.A, pa: 0 } } };
  expect(cast(state, 202, state.fighters.B.pos).ok).toBe(false);
  expect(cast(setup([202]), 202, { x: 12, y: 12 }).ok).toBe(false);
  const cooling = setup([305]);
  cooling.fighters.A.cooldowns[spellKey(cooling, 305)] = 2;
  expect(cast(cooling, 305).ok).toBe(false);
});

test('a player can use a monster summon spell, preserving its species, grade, stats and playable turn', () => {
  const state = setup([214]);
  const result = cast(state, 214, { x: 3, y: 4 });
  expect(result.ok).toBe(true);
  const event = result.events.find(value => value.t === 'summon_add');
  expect(event).toBeDefined();
  const summon = result.state.fighters[event.id];
  const effect = raw(214).effects.find(value => value.kind === 'summon');
  const template = getMonster(effect.p1, effect.p2);
  expect(summon).toMatchObject({ isSummon: true, isMonster: true, team: 'A', monsterId: effect.p1,
    monsterGrade: effect.p2, hp: template.baseHp });
  expect(Object.keys(spellsOf(summon)).length).toBeGreaterThan(0);
  expect(result.state.order).toContain(summon.id);
});

test('custom room uses the chosen map and complete roster with identical manual / AI placements', () => {
  const roster = customDungeonRoster(room);
  expect(roster).toHaveLength(3);
  expect(new Set(roster.map(member => member.id)).size).toBe(3);
  expect(roster.map(member => member.monsterGrade)).toEqual([1, 2, 2]);
  const manual = new LiveMatch({ mode: 'custom', dungeon: room, mapId: 'canyon', playerClass: 'IOP',
    seed: 31, loadouts: { A: loadout() } });
  expect(manual.state.mapId).toBe(room.mapId);
  expect(Object.values(manual.state.fighters).filter(fighter => fighter.team === 'B')).toHaveLength(3);
  const result = runMatch({ mode: 'custom', dungeon: room, mapId: 'canyon', seed: 31, classes: { A: 'IOP' },
    bots: { A: { name: 'Hybride', decide: () => ({ type: 'PASS' }) } }, loadouts: { A: loadout() } });
  expect(result.config.dungeon).toEqual(room);
  expect(result.config.mapId).toBe(room.mapId);
  for (const fighter of Object.values(result.frames[0].state.fighters)) {
    expect(fighter.startPos).toEqual(manual.state.fighters[fighter.id].startPos);
    expect(result.frames[0].state.placement.cells[fighter.id]).toEqual(manual.state.placement.cells[fighter.id]);
  }
  expect(result.events.filter(event => event.t === 'bot_error')).toEqual([]);
});

test('room rejects unknown maps, missing monsters, unavailable grades and teams over eight', () => {
  for (const invalid of [null, { ...room, mapId: 'not-a-map' }, { ...room, members: [] },
    { ...room, members: [{ monsterId: 147, grade: 999, count: 1 }] },
    { ...room, members: [{ monsterId: 494, grade: 1, count: 9 }] }]) {
    expect(customDungeonErrors(invalid).length).toBeGreaterThan(0);
    expect(() => customDungeonRoster(invalid)).toThrow();
  }
});

test('selected AI can use a custom spellbook to complete a custom room without bot errors', async () => {
  const decide = jest.fn(utilityDecide);
  const result = await runMatchAsync({ mode: 'custom', dungeon: { ...room, mapId: 'arene',
    members: [{ monsterId: 494, grade: 1, count: 1 }] }, seed: 16, classes: { A: 'IOP' },
    bots: { A: { name: 'Mon hybride', decide } }, loadouts: { A: loadout([202, 305]) } });
  expect(decide).toHaveBeenCalled();
  expect(result.winner).toBe('A');
  expect(result.endReason).toBe('ko');
  expect(result.events.some(event => event.t === 'cast' && event.fighter === 'A')).toBe(true);
  expect(result.events.filter(event => event.t === 'bot_error')).toEqual([]);
  expect(result.config.loadouts.A.spells.custom.map(spell => spell.id)).toEqual([202, 305]);
}, 30000);

test('saved creations survive reload without touching normal drafts; failed and corrupt storage are not overwritten', () => {
  localStorage.clear();
  const value = { ...emptyCreations(), characters: [{ id: 'hybrid', name: 'Hybride', classId: 'IOP', loadout: loadout() }],
    dungeons: [{ ...room, id: 'room' }] };
  localStorage.setItem('dofus-lite-loadouts-v1', 'existing-user-draft');
  persistCreations(localStorage, value);
  expect(readCreations(localStorage)).toEqual({ value, error: '' });
  expect(localStorage.getItem('dofus-lite-loadouts-v1')).toBe('existing-user-draft');
  expect(() => persistCreations({ setItem() { throw new Error('quota'); } }, value)).toThrow('quota');
  localStorage.setItem(CREATIONS_STORAGE, '{bad');
  expect(readCreations(localStorage).error).toBeTruthy();
  expect(localStorage.getItem(CREATIONS_STORAGE)).toBe('{bad');
  expect(isCustomSpellbook([raw(202), raw(202)])).toBe(false);
  expect(resolveSpellLoadout('IOP', { spells: { custom: [{ id: 202 }] } }).valid).toBe(false);
});

test('custom classes allow ten spells plus the weapon, and refuse an eleventh in manual and AI combat', () => {
  expect(MAX_CUSTOM_SPELLS).toBe(10);
  const ids = CREATION_SPELLS.slice(0, 11).map(entry => entry.id);
  const selected = loadout(ids.slice(0, 10));
  selected.slots.weapon = 2416;
  expect(isCustomSpellbook(selected.spells.custom)).toBe(true);
  const fighters = [{ id: 'A', name: 'Gardien des flammes', classId: 'IOP', loadout: selected }, { id: 'B', monsterId: 494, monsterGrade: 1 }];
  const state = createGame({ mapId: 'arene', seed: 1, fighters }).state;
  expect(state.fighters.A.name).toBe('Gardien des flammes');
  expect(Object.values(spellsOf(state.fighters.A)).filter(spell => !spell.isWeapon)).toHaveLength(10);
  expect(Object.values(spellsOf(state.fighters.A))[0].isWeapon).toBe(true);
  const oversized = loadout(ids);
  expect(isCustomSpellbook(oversized.spells.custom)).toBe(false);
  expect(resolveLoadout('IOP', oversized).errors.join(' ')).toContain('maximum 10 sorts');
  expect(() => new LiveMatch({ mode: 'custom', dungeon: room, playerClass: 'IOP', loadouts: { A: oversized } })).toThrow('maximum 10 sorts');
  expect(() => runMatch({ mode: 'custom', dungeon: room, classes: { A: 'IOP' }, loadouts: { A: oversized },
    bots: { A: { name: 'Gardien', decide: () => ({ type: 'PASS' }) } } })).toThrow('maximum 10 sorts');
  // The new limit applies only to user-created classes.
  expect(Object.values(resolveSpellLoadout('IOP', { level: 200 }).spells).length).toBeGreaterThan(10);
});

test('older forty-spell creations remain saved while their owner reduces the spellbook to ten', () => {
  const original = { ...emptyCreations(), characters: [{ id: 'legacy', name: 'Ancienne classe', classId: 'IOP',
    loadout: loadout(CREATION_SPELLS.slice(0, 40).map(entry => entry.id)) }], dungeons: [{ ...room, id: 'room' }] };
  localStorage.setItem(CREATIONS_STORAGE, JSON.stringify(original));
  expect(readCreations(localStorage)).toEqual({ value: original, error: '' });
  const value = readCreations(localStorage).value;
  value.characters[0].loadout.spells.custom.pop();
  persistCreations(localStorage, value);
  expect(readCreations(localStorage).value.characters[0].loadout.spells.custom).toHaveLength(39);
  expect(readCreations(localStorage).value.dungeons).toEqual(original.dungeons);
  expect(resolveLoadout('IOP', value.characters[0].loadout).valid).toBe(false);
  value.characters[0].loadout.spells.custom = value.characters[0].loadout.spells.custom.slice(0, 10);
  persistCreations(localStorage, value);
  expect(resolveLoadout('IOP', readCreations(localStorage).value.characters[0].loadout).valid).toBe(true);
});

test('dungeon additions accept every imported monster and preserve chosen grades, copies and the eight-monster limit', () => {
  const empty = { ...room, members: [] };
  for (const monster of Object.values(MONSTERS.monsters)) for (const grade of Object.values(monster.grades)) {
    const next = addCustomDungeonMonster(empty, { monsterId: monster.id, grade: grade.grade });
    expect(next.members).toEqual([{ monsterId: monster.id, grade: grade.grade, count: 1 }]);
  }
  expect(empty.members).toEqual([]);
  const member = { monsterId: 494, grade: 1 };
  const once = addCustomDungeonMonster(empty, member);
  const twice = addCustomDungeonMonster(once, member);
  expect(twice.members).toEqual([{ ...member, count: 2 }]);
  expect(once.members[0].count).toBe(1);
  const differentGrade = addCustomDungeonMonster(twice, { ...member, grade: 2 });
  expect(differentGrade.members).toHaveLength(2);
  let full = empty;
  for (let n = 0; n < 8; n++) full = addCustomDungeonMonster(full, member);
  expect(addCustomDungeonMonster(full, member)).toBe(full);
  for (const invalid of [{}, { monsterId: 999999, grade: 1 }, { ...member, grade: 999 }, { ...member, grade: '1' }]) {
    expect(addCustomDungeonMonster(empty, invalid)).toBe(empty);
  }
});
