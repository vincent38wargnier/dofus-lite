import { createGame, applyAction, getView, spellsOf, currentFighter } from '../engine/engine';
import { DUNGEONS, DUNGEON_BOSSES, UNAVAILABLE_DUNGEONS, dungeonForBoss, dungeonRoster } from '../engine/dungeons';
import { BOSSES, getMonster, defaultMonsterGrade } from '../engine/monsters';
import { MAPS, MAP_IDS } from '../engine/maps';
import { LiveMatch } from '../game/liveMatch';

const config = { mode: 'boss', bossId: 147, playerClass: 'IOP', mapId: 'canyon', seed: 31 };
const counts = id => Object.fromEntries(dungeonForBoss(id).members.map(m => [m.monsterId, m.count]));

test('documented final rooms include their whole starting group, with distinct multi-boss encounters', () => {
  expect(counts(147)).toEqual({ 147: 1, 148: 3, 101: 4 });
  expect(counts(257)).toEqual({ 257: 1, 258: 1, 260: 1 });
  expect(counts(173)).toEqual({ 173: 1, 917: 4, 650: 3 });
  expect(counts(827)).toMatchObject({ 827: 1, 121: 1 });
  expect(counts(121)[827]).toBeUndefined();
  expect(counts(943)).toMatchObject({ 943: 1, 939: 1, 940: 1 });
  expect(counts(939)[943]).toBeUndefined();
  expect(counts(1072)).toEqual({ 1072: 1, 1085: 1, 1086: 1, 1087: 1 });
  expect(counts(1170)).toEqual({ 1170: 1, 1204: 1, 1205: 1, 1206: 1, 1207: 1 });
  expect(counts(1195)).toMatchObject({ 1195: 1, 1197: 2 });
  expect(counts(2786)).toEqual({ 2786: 1, 2788: 7 });
  expect(counts(1045)[1088]).toBeUndefined(); // The disciple must be summoned.
});

test('every boss is accounted for; unknown compositions cannot silently launch a solo boss', () => {
  const ids = DUNGEONS.flatMap(room => room.bossIds);
  expect(new Set(ids).size).toBe(ids.length);
  expect([...ids, ...UNAVAILABLE_DUNGEONS.map(row => row.bossId)].sort((a, b) => a - b))
    .toEqual(BOSSES.map(b => b.id).sort((a, b) => a - b));
  for (const row of UNAVAILABLE_DUNGEONS) expect(() => new LiveMatch({ ...config, bossId: row.bossId })).toThrow(/composition/);
});

test('the playable catalogue excludes Gladiatrool and non-dungeon variants', () => {
  expect(DUNGEON_BOSSES.map(boss => boss.id).sort((a, b) => a - b))
    .toEqual(DUNGEONS.flatMap(room => room.bossIds).sort((a, b) => a - b));
  for (const id of [499, 844, 874, 2819, 2891, 2928, 3019]) {
    expect(DUNGEON_BOSSES.some(boss => boss.id === id)).toBe(false);
  }
  for (const id of [182, 605, 2997]) expect(DUNGEON_BOSSES.some(boss => boss.id === id)).toBe(true);
  for (const id of ['constructor', 'toString', '__proto__', '147']) expect(dungeonForBoss(id)).toBeNull();
});

test.each([[182, 1776], [2997, 12307]])('previously unavailable boss %s starts on its own map at every client grade', (bossId, mapId) => {
  const boss = BOSSES.find(entry => entry.id === bossId);
  for (const grade of Object.values(boss.grades)) {
    const match = new LiveMatch({ ...config, bossId, bossGrade: grade.grade });
    expect(match.state.mapId).toBe(`dungeon_${mapId}`);
    expect(Object.keys(match.state.fighters)).toEqual(['A', 'B']);
    expect(match.state.fighters.B).toMatchObject({ monsterId: bossId, monsterGrade: grade.grade, hp: grade.baseHp, level: grade.level });
    expect(match.ready().ok).toBe(true);
    expect(match.state.phase).toBe('combat');
  }
});

test.each(DUNGEONS.map(room => [room.name, room]))('%s: all members have client templates and a reproducible roster', (_, room) => {
  expect(room.sources.length).toBeGreaterThan(0);
  for (const bossId of room.bossIds) {
    const grade = defaultMonsterGrade(bossId);
    const roster = dungeonRoster(bossId, grade, 31);
    expect(roster).toEqual(dungeonRoster(bossId, grade, 31));
    expect(roster).toHaveLength(room.members.reduce((sum, m) => sum + m.count, 0));
    expect(roster.length).toBeLessThanOrEqual(8);
    expect(roster[0]).toMatchObject({ id: 'B', team: 'B', monsterId: bossId, monsterGrade: grade });
    for (const f of roster) expect(getMonster(f.monsterId, f.monsterGrade).baseHp).toBeGreaterThan(0);
  }
});

test.each(DUNGEONS.map(room => [room.name, room]))('%s: the full group uses its final room and original starting cells', (_, room) => {
  const m = new LiveMatch({ ...config, bossId: room.bossIds[0] });
  const map = MAPS[room.combatMapId];
  const count = room.members.reduce((sum, member) => sum + member.count, 0);
  expect(m.state.mapId).toBe(room.combatMapId);
  expect(map.sourceId).toBe(room.mapId);
  expect(MAP_IDS).not.toContain(room.combatMapId);
  expect(m.state.placement.source.status).toBe('client');
  expect(m.state.placement.source.expanded).toBeUndefined();
  expect(m.state.placement.cells.A).toEqual(map.startingCells[0]);
  expect(m.state.placement.cells.B).toEqual(map.startingCells[1]);
  const fighters = Object.values(m.state.fighters);
  expect(fighters).toHaveLength(count + 1);
  expect(new Set(fighters.map(f => `${f.pos.x},${f.pos.y}`)).size).toBe(count + 1);
  expect(new Set(m.state.order)).toEqual(new Set(fighters.map(f => f.id)));
  expect(fighters.filter(f => f.team === 'B')).toHaveLength(count);
  for (const f of fighters) {
    expect(m.state.placement.cells[f.id]).toEqual(expect.arrayContaining([expect.objectContaining(f.pos)]));
    expect(m.state.board.obstacles[`${f.pos.x},${f.pos.y}`]?.blocksMove).toBeFalsy();
    expect(m.state.placement.ready[f.id]).toBe(f.id !== 'A');
  }
  expect(m.placing).toBe(true);
  expect(m.ready().ok).toBe(true);
  expect(m.state.phase).toBe('combat');
  expect(m.humanView().enemies).toHaveLength(count);
});

test('the PvP selection never changes a dungeon board, roster or either placement zone', () => {
  for (const room of DUNGEONS) {
    const expected = new LiveMatch({ ...config, bossId: room.bossIds[0] }).state;
    for (const mapId of ['astrub_7423', 'amakna_952', 'canyon', 'not-a-map']) {
      expect(new LiveMatch({ ...config, bossId: room.bossIds[0], mapId }).state).toEqual(expected);
    }
  }
});

test('the Kralamoure stays on its single original cell across seeds and cannot gain invented departures', () => {
  for (const seed of [1, 2, 17, 31, 99]) {
    const m = new LiveMatch({ ...config, bossId: 423, seed });
    expect(m.state.mapId).toBe('dungeon_11095');
    expect(m.state.placement.cells.B.map(c => c.cellId)).toEqual([509]);
  }
  expect(() => createGame({ mapId: 'dungeon_11095', fighters: [
    { id: 'A', classId: 'IOP' }, ...dungeonRoster(147, 5, 1),
  ] })).toThrow(/cases de placement/);
});

function killableGroup() {
  const state = createGame({ seed: 7, fighters: [
    { id: 'A', classId: 'IOP' }, { id: 'B', team: 'B', monsterId: 147, monsterGrade: 5 },
    { id: 'B2', team: 'B', monsterId: 101, monsterGrade: 5 },
  ] }).state;
  state.board = { width: 7, height: 7, obstacles: {} };
  state.order = ['A', 'B', 'B2']; state.currentIndex = 0;
  state.fighters.A.pos = { x: 3, y: 3 };
  state.fighters.B.pos = { x: 3, y: 2 }; state.fighters.B.hp = 1;
  state.fighters.B2.pos = { x: 3, y: 4 }; state.fighters.B2.hp = 1;
  state.fighters.A.weaponSpell = { ...spellsOf(state.fighters.A).pression, key: 'weapon', isWeapon: true,
    pa: 0, failRate: 0, critRate: 0, usesPerTurn: 0, usesPerTarget: 0, cooldown: 0 };
  return state;
}

test('killing the boss keeps companions alive, retargets the view, skips its turn and delays victory', () => {
  const state = killableGroup();
  const hit = applyAction(state, { type: 'CAST', spell: 'weapon', target: state.fighters.B.pos });
  expect(hit.ok).toBe(true);
  expect(hit.state.fighters.B.hp).toBe(0);
  expect(hit.state.over).toBe(false);
  expect(hit.events.some(e => e.t === 'match_end')).toBe(false);
  expect(getView(hit.state, 'A').enemy.id).toBe('B2');
  const pass = applyAction(hit.state, { type: 'PASS' });
  expect(currentFighter(pass.state).id).toBe('B2');
  const last = applyAction(hit.state, { type: 'CAST', spell: 'weapon', target: state.fighters.B2.pos });
  expect(last.ok).toBe(true);
  expect(last.state).toMatchObject({ over: true, winner: 'A', endReason: 'ko' });
  expect(last.events.filter(e => e.t === 'match_end')).toHaveLength(1);
});

test('a dead monster removes its own summons without killing independent teammates', () => {
  const state = killableGroup();
  state.fighters.summon = { ...JSON.parse(JSON.stringify(state.fighters.B2)), id: 'summon',
    leader: false, isSummon: true, ownerId: 'B', hp: 50, pos: { x: 1, y: 1 } };
  state.order.push('summon');
  const hit = applyAction(state, { type: 'CAST', spell: 'weapon', target: state.fighters.B.pos });
  expect(hit.state.fighters.summon.hp).toBe(0);
  expect(hit.state.fighters.B2.hp).toBe(1);
  expect(hit.state.over).toBe(false);
});

test('turn limit scores the whole original team, including a surviving companion after boss death', () => {
  const state = killableGroup();
  state.fighters.B.hp = 0;
  state.fighters.B2.hp = state.fighters.B2.maxHp;
  state.fighters.A.hp = 1;
  state.currentIndex = 2; state.maxTurns = state.turn;
  const result = applyAction(state, { type: 'PASS' });
  expect(result.state).toMatchObject({ over: true, winner: 'B2', endReason: 'turn_limit' });
});

test.each(DUNGEONS.map(room => room.bossIds[0]))('group %i completes a round with every living enemy acting', bossId => {
  const m = new LiveMatch({ ...config, bossId });
  m.ready();
  m.state.fighters.A.hp = m.state.fighters.A.maxHp = m.state.fighters.A.baseMaxHp = 1000000;
  const initialEnemies = Object.values(m.state.fighters).filter(f => f.team === 'B').map(f => f.id);
  const played = new Set(), events = [];
  let steps = 0;
  while (!m.over && steps++ < 200 && !initialEnemies.every(id => played.has(id) || m.state.fighters[id].hp <= 0)) {
    const id = m.current().id;
    const result = id === 'A' ? m.humanAct({ type: 'PASS' }) : m.botStep();
    events.push(...result.events);
    for (const e of result.events) if (e.t === 'turn_end') played.add(e.fighter);
  }
  expect(steps).toBeLessThan(200);
  expect(events.filter(e => ['invalid', 'bot_error'].includes(e.t))).toEqual([]);
  expect(initialEnemies.every(id => played.has(id) || m.state.fighters[id].hp <= 0)).toBe(true);
});
