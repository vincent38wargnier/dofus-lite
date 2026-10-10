import DATA from '../engine/monsterData.json';
import { BOSSES, getMonster, monsterGrades, defaultMonsterGrade } from '../engine/monsters';
import { LiveMatch } from '../game/liveMatch';
import { createGame, applyAction, getView, spellsOf, validateAction, effectAcceptsTarget } from '../engine/engine';
import { readPlayerSetup } from '../ui/playerSetupState';
import { makeBotApi } from '../bots/api';
import { createRng } from '../engine/rng';

function match(bossId, bossGrade = defaultMonsterGrade(bossId)) {
  // Exercise every template's spells independently of its dungeon roster.
  const m = new LiveMatch({ mode: 'kanojedo', playerClass: 'IOP', seed: 31,
    loadouts: { B: { level: -10, slots: { weapon: 'invalid' } } },
    botDecide: () => { throw new Error('A boss must not run the selected player bot.'); } });
  m.state = createGame({ mapId: 'canyon', seed: 31, fighters: [
    { id: 'A', classId: 'IOP' }, { id: 'B', monsterId: bossId, monsterGrade: bossGrade },
  ] }).state;
  m.state.board = { width: 7, height: 7, obstacles: {} };
  m.state.fighters.A.pos = { x: 2, y: 3 };
  m.state.fighters.B.pos = { x: 4, y: 3 };
  if (m.isHumanTurn()) m.humanAct({ type: 'PASS' });
  return m;
}

test('the catalogue includes classic, Otomai, seasonal and recent Retro bosses', () => {
  expect(BOSSES.length).toBe(69);
  for (const id of [147, 113, 180, 257, 827, 943, 1045, 1087, 1159, 1170, 1195, 1194, 2800, 2801, 3019]) {
    expect(BOSSES.some(boss => boss.id === id)).toBe(true);
  }
  expect(BOSSES.some(boss => boss.id === 494)).toBe(false);
  for (const boss of DATA.unavailableBosses) expect(BOSSES.some(entry => entry.id === boss.id)).toBe(false);
});

test.each(BOSSES.map(boss => [boss.name, boss.id]))('%s: every client grade is a valid independent opponent', (_, id) => {
  for (const grade of monsterGrades(id)) {
    const { state } = createGame({ mapId: 'canyon', seed: 2, fighters: [
      { id: 'A', classId: 'IOP' }, { id: 'B', monsterId: id, monsterGrade: grade.grade },
    ] });
    const f = state.fighters.B;
    expect(f).toMatchObject({ isMonster: true, isSummon: false, classId: null, level: grade.level,
      hp: grade.baseHp, basePa: grade.basePa, basePm: grade.basePm, resistances: grade.resistances,
      stats: grade.stats, initiative: grade.initiative });
    expect(f.loadout).toBeUndefined();
    expect(Object.values(spellsOf(f)).map(s => [s.id, s.grade])).toEqual(grade.spells.map(s => [s.id, s.grade]));
  }
});

test.each(BOSSES.map(boss => [boss.name, boss.id]))('%s: AI completes three rounds with valid actions and finite state', (_, id) => {
  const m = match(id);
  const events = [];
  for (let round = 0; round < 3 && !m.over; round++) {
    if (m.isHumanTurn()) m.humanAct({ type: 'PASS' });
    let steps = 0;
    while (!m.over && !m.isHumanTurn() && steps++ < 100) events.push(...m.botStep().events);
    expect(steps).toBeLessThan(100);
  }
  expect(events.filter(e => ['invalid', 'bot_error'].includes(e.t))).toEqual([]);
  for (const fighter of Object.values(m.state.fighters)) {
    for (const field of ['hp', 'maxHp', 'pa', 'pm', 'level']) expect(Number.isFinite(fighter[field])).toBe(true);
    expect(fighter.hp).toBeGreaterThanOrEqual(0);
    expect(fighter.hp).toBeLessThanOrEqual(fighter.maxHp);
  }
});

test('a boss can summon a client monster, which has its own unscaled stats and turn', () => {
  const m = match(58);
  const summoning = Object.values(spellsOf(m.state.fighters.B)).find(s => s.effects.some(e => e.kind === 'summon'));
  const effect = summoning.effects.find(e => e.kind === 'summon');
  const template = getMonster(effect.p1, effect.p2);
  const view = getView(m.state, 'B'), api = makeBotApi(view, createRng(1));
  const target = api.castTargets(summoning.key)[0];
  expect(target).toBeDefined();
  const result = applyAction(m.state, api.cast(summoning.key, target));
  expect(result.ok).toBe(true);
  const summoned = Object.values(result.state.fighters).find(f => f.ownerId === 'B');
  expect(summoned).toMatchObject({ isMonster: true, isSummon: true, monsterId: effect.p1,
    monsterGrade: effect.p2, level: template.level, hp: template.baseHp, stats: template.stats });
  expect(result.state.order).toContain(summoned.id);
  expect(Object.values(spellsOf(summoned)).length).toBeGreaterThan(0);
});

test('Bouftou Royal uses Morsure against players and reserves Abolissement for summons', () => {
  const m = match(147), { A, B } = m.state.fighters;
  const spell = Object.values(spellsOf(B)).find(s => s.id === 251);
  for (const effect of [...spell.effects, ...spell.critEffects]) {
    expect(effectAcceptsTarget(effect, B, A)).toBe(false);
    expect(effectAcceptsTarget(effect, B, { ...A, isSummon: true })).toBe(true);
  }
  const events = [];
  for (let round = 0; round < 3 && !m.over; round++) {
    if (m.isHumanTurn()) m.humanAct({ type: 'PASS' });
    let steps = 0;
    while (!m.over && !m.isHumanTurn() && steps++ < 30) events.push(...m.botStep().events);
  }
  expect(events.some(e => e.t === 'cast' && e.spellId === 251)).toBe(false);
  expect(events.some(e => e.t === 'cast' && e.spellId === 202)).toBe(true);
  expect(events.some(e => e.t === 'damage' && e.source === 'B' && e.target === 'A')).toBe(true);
});

test('missing summon definitions cannot consume AP for an action that creates nothing', () => {
  for (const boss of BOSSES) {
    const m = match(boss.id), f = m.state.fighters.B;
    for (const spell of Object.values(spellsOf(f)).filter(s => s.missingSummons.length)) {
      expect(validateAction(m.state, { type: 'CAST', spell: spell.key, target: f.pos })).toMatchObject({ ok: false });
    }
  }
});

test('boss/grade choices restore safely, including bosses with one or six grades', () => {
  for (const boss of BOSSES) {
    for (const grade of monsterGrades(boss.id)) {
      const saved = { mode: 'boss', bossId: boss.id, bossGrade: grade.grade, monsterGrade: 2, mapId: 'canyon' };
      expect(readPlayerSetup({ getItem: () => JSON.stringify(saved) })).toMatchObject(saved);
    }
  }
  for (const bossId of [-1, 494, '147', 'constructor', null]) {
    expect(readPlayerSetup({ getItem: () => JSON.stringify({ mode: 'boss', bossId, bossGrade: 500 }) }))
      .toMatchObject({ mode: 'boss', bossId: 147, bossGrade: 5 });
  }
  expect(readPlayerSetup({ getItem: () => JSON.stringify({ mode: 'boss', bossId: 3019, bossGrade: 5 }) }).bossGrade).toBe(1);
});
