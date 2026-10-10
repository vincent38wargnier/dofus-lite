import { runMatch, runMatchAsync } from '../arena/runner';
import { dungeonOutcome } from '../arena/dungeonOutcome';
import { dungeonForBoss, dungeonRoster } from '../engine/dungeons';
import { emptyLoadout, resolveLoadout } from '../engine/equipment';
import { LiveMatch } from '../game/liveMatch';
import { compileBot } from '../bots/compile';
import { getBuiltinBot } from '../bots/builtins';

const loadout = { ...emptyLoadout('IOP'), level: 200, base: { force: 100 }, slots: { weapon: 2416 },
  spells: { common: [350, 367], grades: { 141: 5 }, order: [0, 141, 153] } };
const config = (decide = () => ({ type: 'PASS' }), bossId = 147) => ({ mode: 'boss', bossId, bossGrade: 1, seed: 31,
  mapId: 'canyon', classes: { A: 'IOP' }, bots: { A: { name: 'Vous', decide } }, loadouts: { A: loadout } });

test('automatic dungeon uses the exact final room, whole roster, original placements and equipped player', () => {
  const cfg = config();
  const before = JSON.stringify(cfg.loadouts);
  const result = runMatch(cfg);
  const initial = result.frames[0].state;
  const manual = new LiveMatch({ ...cfg, playerClass: 'IOP', mode: 'boss' }).state;
  expect(result.config.mapId).toBe(dungeonForBoss(147).combatMapId);
  expect(Object.keys(initial.fighters)).toHaveLength(dungeonRoster(147, 1, 31).length + 1);
  for (const fighter of Object.values(initial.fighters)) {
    expect(fighter.startPos).toEqual(manual.fighters[fighter.id].startPos);
    expect(initial.placement.cells[fighter.id]).toEqual(manual.placement.cells[fighter.id]);
  }
  const player = initial.fighters.A, equipped = resolveLoadout('IOP', loadout);
  expect(player).toMatchObject({ level: 200, hp: equipped.hp, basePa: equipped.pa, basePm: equipped.pm,
    stats: equipped.stats, resistances: equipped.resistances, loadout: equipped.snapshot });
  expect(JSON.stringify(cfg.loadouts)).toBe(before);
  expect(result.finalState.over).toBe(true);
  expect(result.events.filter(e => ['bot_error', 'invalid'].includes(e.t))).toEqual([]);
  for (const id of Object.keys(initial.fighters).filter(id => id !== 'A')) expect(result.stats[id].actions).toBeGreaterThan(0);
  expect(dungeonOutcome(result).status).toBe('defeat');
});

test('the selected player AI plays its own spells and a complete result can be replayed', () => {
  const decide = jest.fn(compileBot(getBuiltinBot('maison').code));
  const result = runMatch(config(decide));
  expect(decide).toHaveBeenCalled();
  expect(decide.mock.calls[0][0].you.id).toBe('A');
  expect(decide.mock.calls[0][0].enemies).toHaveLength(8);
  expect(result.events.some(e => e.t === 'cast' && e.fighter === 'A')).toBe(true);
  expect(result.stats.A.damageDealt).toBeGreaterThan(0);
  expect(result.frames.at(-1).state).toEqual(result.finalState);
  expect(result.frames.flatMap(frame => frame.events)).toEqual(result.events);
  expect(result.frames[0].state.over).toBe(false);
  expect(result.events.filter(e => e.t === 'match_end')).toHaveLength(1);
  expect(result.stats.A.errors).toBe(0);
}, 30000);

test('asynchronous simulation yields, stays deterministic and can be cancelled', async () => {
  const cfg = config();
  const expected = runMatch(cfg);
  const yieldControl = jest.fn(() => Promise.resolve());
  const result = await runMatchAsync(cfg, { yieldControl });
  expect(result.events).toEqual(expected.events);
  expect(result.finalState).toEqual(expected.finalState);
  expect(yieldControl).toHaveBeenCalled();
  const controller = new AbortController();
  const decide = jest.fn(() => ({ type: 'PASS' }));
  await expect(runMatchAsync(config(decide), { signal: controller.signal,
    yieldControl: async () => controller.abort() })).rejects.toMatchObject({ name: 'AbortError' });
  expect(decide).not.toHaveBeenCalled();
});

test('a failed player bot forfeits its turns instead of breaking the dungeon simulation', () => {
  const result = runMatch(config(() => { throw new Error('bot test'); }));
  expect(result.stats.A.errors).toBeGreaterThan(0);
  expect(result.finalState.over).toBe(true);
  expect(result.events.some(e => e.t === 'bot_error' && e.fighter === 'A')).toBe(true);
});

test('a turn-limit points winner and a dead boss with surviving companions never count as a cleared room', () => {
  const state = { fighters: { A: { hp: 100, maxHp: 150, team: 'A' }, B: { team: 'B', hp: 0 }, B2: { team: 'B', hp: 0 },
    Bs1: { team: 'B', hp: 0, isSummon: true } } };
  const result = { finalState: state, endReason: 'ko', winner: 'A', turns: 8 };
  expect(dungeonOutcome(result)).toMatchObject({ status: 'victory', total: 2, defeated: 2, hp: 100 });
  state.fighters.B2.hp = 20;
  expect(dungeonOutcome(result).status).toBe('unfinished');
  expect(dungeonOutcome({ ...result, endReason: 'turn_limit' })).toMatchObject({ status: 'unfinished', remaining: 1, label: 'Limite de tours atteinte' });
  state.fighters.A.hp = 0;
  expect(dungeonOutcome(result).status).toBe('defeat');
});
