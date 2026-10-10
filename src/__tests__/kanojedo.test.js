import { LiveMatch } from '../game/liveMatch';
import { createGame, applyAction, effectAcceptsTarget, getView, spellsOf, validateAction } from '../engine/engine';
import { emptyLoadout } from '../engine/equipment';
import { KANOJEDO_MAP_ID, POUTCH_ID, getMonster } from '../engine/monsters';
import { resistanceValues } from '../engine/formulas';
import { makeBotApi } from '../bots/api';
import { createRng } from '../engine/rng';
import { readPlayerSetup } from '../ui/playerSetupState';
import { getActorId } from '../ui/RetroAssets';

function match(grade = 5, classId = 'IOP') {
  const m = new LiveMatch({ mode: 'kanojedo', monsterGrade: grade, playerClass: classId, seed: 7,
    loadouts: { A: { ...emptyLoadout(classId), level: 200, base: { force: 100 }, slots: {} },
      B: { level: -10, slots: { weapon: 'invalid' } } },
    botDecide: () => { throw new Error('A Poutch must not run a class bot.'); } });
  m.ready();
  return m;
}

test.each([[1, 1, 100], [2, 25, 500], [3, 50, 1500], [4, 75, 5000], [5, 100, 10000]])(
  'Poutch grade %i uses client level %i and %i HP without player scaling or equipment', (grade, level, hp) => {
    const m = match(grade), f = m.state.fighters.B;
    expect(m.state.mapId).toBe(KANOJEDO_MAP_ID);
    expect(f).toMatchObject({ monsterId: POUTCH_ID, monsterGrade: grade, isMonster: true, isSummon: false,
      classId: null, level, hp, maxHp: hp, basePa: 0, pa: 0, basePm: -1, pm: 0, initiative: 0 });
    expect(Object.values(f.resistances)).toEqual([0, 0, 0, 0, 0]);
    expect(f.loadout).toBeUndefined();
    const [spell] = Object.values(spellsOf(f));
    expect(spell).toMatchObject({ id: 411, name: 'Tuerie', pa: 3, grade: 1, targetMode: 'self', range: [0, 0] });
    expect(getView(m.state, 'A').enemy).toMatchObject({ isMonster: true, monsterGrade: grade, className: 'Poutch Ingball' });
  },
);

test('Poutch passes several rounds with zero AP and MP, without errors or movement', () => {
  const m = match(), original = { ...m.state.fighters.B.pos };
  for (let i = 0; i < 3; i++) {
    expect(m.isHumanTurn()).toBe(true);
    m.humanAct({ type: 'PASS' });
    expect(m.current().id).toBe('B');
    const view = getView(m.state, 'B'), api = makeBotApi(view, createRng(1));
    expect(api.canCast(view.you.spells[0].key, view.you.pos).ok).toBe(false);
    const result = m.botStep();
    expect(result.events.some(e => ['cast', 'move', 'invalid', 'bot_error'].includes(e.t))).toBe(false);
    expect(m.state.fighters.B).toMatchObject({ pa: 0, pm: 0, pos: original });
    expect(m.state.fighters.A.hp).toBe(m.state.fighters.A.maxHp);
  }
});

test.each([1, 2, 3, 4])('Tuerie requires at least three effective AP (bonus %i)', ap => {
  const m = match();
  m.state.fighters.B.effects.push({ kind: 'buff', stat: 'pa', value: ap, turnsLeft: 2 });
  m.humanAct({ type: 'PASS' });
  expect(m.state.fighters.B.pa).toBe(ap);
  const result = m.botStep();
  expect(result.events.some(e => e.t === 'cast' && e.spellId === 411)).toBe(ap >= 3);
  expect(m.over).toBe(ap >= 3);
  expect(m.state.fighters.B.hp).toBe(10000);
  if (ap >= 3) {
    expect(m.state.winner).toBe('B'); expect(m.state.fighters.A.hp).toBe(0);
    expect(m.state.fighters.B.pa).toBe(ap - 3);
  }
});

test('a real Ecaflip Roulette can give a Poutch enough AP for Tuerie', () => {
  const m = match(5, 'ECAFLIP');
  const player = m.state.fighters.A;
  // Isolate the spell interaction from the map's initial placement distance.
  m.state.board = { width: 5, height: 5, obstacles: {} };
  player.pos = { x: 2, y: 2 }; m.state.fighters.B.pos = { x: 3, y: 2 };
  const roulette = Object.values(spellsOf(player)).find(s => s.id === 101);
  expect(roulette.effects.some(e => e.kind === 'buffPa' && e.max === 3 && e.targetMask === 0)).toBe(true);
  const action = { type: 'CAST', spell: roulette.key, target: player.pos };
  let grant;
  for (let seed = 1; seed < 5000; seed++) {
    const result = applyAction({ ...m.state, rngState: seed }, action);
    if (result.state.fighters.B.effects.some(e => e.stat === 'pa' && e.value === 3)) { grant = result; break; }
  }
  expect(grant?.ok).toBe(true);
  m.state = grant.state;
  expect(m.state.fighters.B.effects.some(e => e.stat === 'pa' && e.value === 3)).toBe(true);
  m.humanAct({ type: 'PASS' }); m.botStep();
  expect(m.state.winner).toBe('B');
});

test('attacks can kill the Poutch and finish the fight normally', () => {
  const m = match(1), f = m.state.fighters.A;
  m.state.board = { width: 5, height: 5, obstacles: {} };
  f.pos = { x: 2, y: 2 }; m.state.fighters.B.pos = { x: 3, y: 2 };
  f.stats.force = 1000;
  const result = m.humanAct({ type: 'CAST', spell: 'pression', target: m.state.fighters.B.pos });
  expect(result.ok).toBe(true);
  expect(result.events.some(e => e.t === 'damage' && e.target === 'B' && e.amount > 0)).toBe(true);
  expect(m.state.fighters.B.hp).toBe(0); expect(m.state.winner).toBe('A');
});

test('natural monsters are not summons and do not inherit PvP resistance rules', () => {
  const { fighters } = match().state;
  expect(effectAcceptsTarget({ targetMask: 8 }, fighters.A, fighters.B)).toBe(false);
  expect(effectAcceptsTarget({ targetMask: 16 }, fighters.A, fighters.B)).toBe(true);
  fighters.B.resistances.feu = 80;
  expect(resistanceValues('feu', fighters.B, fighters.A).percent).toBe(80);
  fighters.A.permanent = { pvpRes_feu: 20, pvpFixed_feu: 10 };
  fighters.A.resistances = {};
  fighters.A.resistancesFixed = {};
  expect(resistanceValues('feu', fighters.A, fighters.B)).toEqual({ percent: 0, fixed: 0 });
  expect(getActorId({ monsters: { 494: '1219' }, classes: {} }, fighters.B)).toBe('1219');
});

test('all monster turns and spell targets have the same validation through the bot API', () => {
  const m = match(); m.humanAct({ type: 'PASS' });
  m.state.fighters.B.pa = 3;
  const view = getView(m.state, 'B'), api = makeBotApi(view, createRng(1));
  const action = api.cast(view.you.spells[0].key, view.you.pos);
  expect(api.canCast(action.spell, action.target).ok).toBe(true);
  expect(validateAction(m.state, action).ok).toBe(true);
  expect(applyAction(m.state, action).state.winner).toBe('B');
});

test('saved training choice preserves the duel map and rejects invalid grades', () => {
  const saved = { mode: 'kanojedo', monsterGrade: 2, mapId: 'canyon', botClass: 'FECA', botId: 'custom' };
  expect(readPlayerSetup({ getItem: () => JSON.stringify(saved) })).toMatchObject(saved);
  for (const grade of [0, -1, 6, 100, '2', 'constructor']) {
    expect(readPlayerSetup({ getItem: () => JSON.stringify({ ...saved, monsterGrade: grade }) }).monsterGrade).toBe(5);
  }
  expect(() => createGame({ fighters: [{ id: 'A', classId: 'IOP' }, { id: 'B', monsterId: 494, monsterGrade: 0 }] })).toThrow('Unknown monster/grade');
  expect(getMonster(494, 6)).toBeNull();
});
