import { allyRoster, allyTeamErrors, isAutomaticTeam, teamRoster } from '../engine/allyTeam';
import { emptyLoadout } from '../engine/equipment';
import { LiveMatch } from '../game/liveMatch';
import { runMatch } from '../arena/runner';
import { dungeonOutcome } from '../arena/dungeonOutcome';
import { compileAllyBots, compileTeamBots, compileCompleteTeamBots } from '../ui/allyBots';
import { readAllyTeam, persistAllyTeam, ALLIES_STORAGE } from '../ui/allyTeamStore';

const loadout = classId => ({ ...emptyLoadout(classId), level: 200, base: {} });
const character = (name, controller = 'player') => ({ kind: 'character', classId: 'CRA', name,
  loadout: loadout('CRA'), controller, botId: 'test' });
const monster = { kind: 'monster', monsterId: 494, grade: 5, controller: 'ai' };
const bots = [{ id: 'test', name: 'Test', code: 'let calls = 0; function decide() { calls++; return {type: "PASS", calls}; }' }];
const setup = (allies = [character('Manuel'), character('Auto', 'ai')]) => new LiveMatch({ playerClass: 'IOP', mode: 'kanojedo', seed: 17,
  loadouts: { A: loadout('IOP') }, allies, allyBots: compileAllyBots(allies, bots) });

test('allies are independent copies; the principal profile plus at most seven allies form one team', () => {
  expect(allyRoster([])).toEqual([]);
  const saved = character('Copie'), roster = allyRoster([saved, monster, saved]);
  expect(roster.map(f => [f.id, f.team])).toEqual([['A2', 'A'], ['A3', 'A'], ['A4', 'A']]);
  roster[0].loadout.base.force = 99;
  expect(saved.loadout.base.force).toBeUndefined();
  expect(roster[2].loadout.base.force).toBeUndefined();
  expect(allyRoster(Array(7).fill(monster))).toHaveLength(7);
  for (const entries of [Array(8).fill(monster), [{ ...saved, controller: 'unknown' }], [{ ...monster, grade: 100 }],
    [{ ...saved, loadout: { ...saved.loadout, base: { force: 99999 } } }]]) {
    expect(allyTeamErrors(entries).length).toBeGreaterThan(0);
    expect(() => allyRoster(entries)).toThrow();
  }
});

test('every ally can be placed before the team becomes ready; enemy placement remains protected', () => {
  const match = setup();
  expect(match.state.placement.ready).toEqual({ A: false, A2: false, A3: false, B: true });
  const occupied = Object.values(match.state.fighters).map(f => `${f.pos.x},${f.pos.y}`);
  const free = match.state.placement.cells.A2.find(p => !occupied.includes(`${p.x},${p.y}`));
  expect(match.placeHuman(free, 'A2').ok).toBe(true);
  expect(match.state.fighters.A2.pos).toEqual({ x: free.x, y: free.y });
  expect(match.placeHuman(match.state.fighters.A.pos, 'A3').ok).toBe(false);
  expect(match.placeHuman(free, 'B').ok).toBe(false);
  expect(match.ready().ok).toBe(true);
  expect(match.placing).toBe(false);
  expect(Object.values(match.state.placement.ready).every(Boolean)).toBe(true);
});

test('manual control, current view and self-casts follow each human ally while selected AI handles its own turn', () => {
  const match = setup(); match.ready();
  match.state.order = ['A', 'A2', 'A3', 'B']; match.state.currentIndex = 0;
  expect(match.humanView().you.id).toBe('A');
  expect(match.humanAct({ type: 'PASS' }).ok).toBe(true);
  expect(match.isHumanTurn()).toBe(true);
  expect(match.humanView().you.id).toBe('A2');
  const before = match.state.fighters.A.pa;
  const cast = match.humanAct({ type: 'CAST', spell: 'tir_eloigne', target: match.current().pos });
  expect(cast.ok).toBe(true);
  expect(cast.events.some(e => e.t === 'cast' && e.fighter === 'A2')).toBe(true);
  expect(match.state.fighters.A.pa).toBe(before);
  expect(match.state.fighters.A2.effects.some(e => e.stat === 'range')).toBe(true);
  match.humanAct({ type: 'PASS' });
  expect(match.current().id).toBe('A3'); expect(match.isHumanTurn()).toBe(false);
  expect(match.humanAct({ type: 'PASS' }).ok).toBe(false);
  match.botStep(); expect(match.current().id).toBe('B');
});

test('the principal can use its selected AI while a manual companion keeps its turn and commands', () => {
  const allies = [character('Manuel'), character('Auto', 'ai')];
  const compiled = compileTeamBots('ai', 'test', allies, bots);
  const principalDecide = jest.spyOn(compiled.A, 'decide');
  const match = new LiveMatch({ playerClass: 'IOP', playerController: 'ai', mode: 'kanojedo', seed: 17,
    loadouts: { A: loadout('IOP') }, allies, allyBots: compiled });
  expect([...match.humanIds]).toEqual(['A2']);
  expect(match.controlledFighter().id).toBe('A2');
  match.ready(); match.state.order = ['A', 'A2', 'A3', 'B']; match.state.currentIndex = 0;
  expect(match.isHumanTurn()).toBe(false);
  expect(match.humanAct({ type: 'PASS' }).ok).toBe(false);
  match.botStep();
  expect(principalDecide).toHaveBeenCalledTimes(1);
  expect(principalDecide.mock.calls[0][0].you.id).toBe('A');
  expect(match.isHumanTurn()).toBe(true);
  expect(match.humanView().you.id).toBe('A2');
  expect(match.humanAct({ type: 'CAST', spell: 'tir_eloigne', target: match.current().pos }).ok).toBe(true);
  match.humanAct({ type: 'PASS' });
  expect(match.controlledFighter().id).toBe('A2');
  match.botStep(); expect(match.current().id).toBe('B');
  // The same selected script must not share its principal's memory with an ally.
  expect(compiled.A.decide({}, {}).calls).toBe(2);
  expect(compiled.A3.decide({}, {}).calls).toBe(2);
});

test('only an AI principal with exclusively AI companions is an automatic team, including manually controlled monsters', () => {
  expect(isAutomaticTeam('player', [])).toBe(false);
  expect(isAutomaticTeam('player', [monster])).toBe(false);
  expect(isAutomaticTeam('ai', [])).toBe(true);
  expect(isAutomaticTeam('ai', [monster, character('Auto', 'ai')])).toBe(true);
  expect(isAutomaticTeam('ai', [character('Manuel')])).toBe(false);
  expect(isAutomaticTeam('ai', [{ ...monster, controller: 'player' }])).toBe(false);
  const match = new LiveMatch({ playerClass: 'IOP', playerController: 'ai', mode: 'kanojedo', seed: 17,
    loadouts: { A: loadout('IOP') }, allies: [monster], allyBots: compileTeamBots('ai', 'test', [monster], bots) });
  match.ready(); expect(match.humanIds.size).toBe(0); expect(match.isHumanTurn()).toBe(false);
});

test('invalid principal AI is rejected before combat; manual control does not compile an unused AI', () => {
  expect(compileTeamBots('player', 'deleted', [], bots)).toEqual({});
  expect(() => compileTeamBots('ai', 'deleted', [], bots)).toThrow(/personnage principal/);
  expect(() => compileTeamBots('ai', 'broken', [], [...bots, { id: 'broken', name: 'Cassée', code: '!!! invalid syntax' }])).toThrow(/Personnage principal · Cassée/);
});

test('the same selected AI has independent memory for each ally, including automatic simulations', () => {
  const allies = [character('Premier', 'ai'), character('Second', 'ai')];
  const compiled = compileAllyBots(allies, bots);
  expect(compiled.A2.decide({}, {}).calls).toBe(1);
  expect(compiled.A2.decide({}, {}).calls).toBe(2);
  expect(compiled.A3.decide({}, {}).calls).toBe(1);
  expect(compileAllyBots([character('Manuel')], bots)).toEqual({});
  expect(compileAllyBots([character('Manuel')], bots, true).A2).toBeDefined();
  expect(() => compileAllyBots([{ ...allies[0], botId: 'deleted' }], bots)).toThrow(/IA disponible/);
  const result = runMatch({ classes: { A: 'IOP' }, loadouts: { A: loadout('IOP') }, allies,
    opponents: [monster], bots: { A: { name: 'Principal', decide: () => ({ type: 'PASS' }) }, ...compileAllyBots(allies, bots) } });
  expect(result.config.allies).toEqual(allies);
  expect(result.stats.A2.actions).toBeGreaterThan(0); expect(result.stats.A3.actions).toBeGreaterThan(0);
  expect(result.events.filter(e => e.t === 'bot_error')).toEqual([]);
});

test('a manual ally keeps playing after the principal character dies, and its victory belongs to the whole team', () => {
  const match = setup([character('Survivant')]); match.ready();
  match.state.fighters.A.hp = 0;
  match.state.currentIndex = match.state.order.indexOf('A2');
  match.state.board.obstacles = {};
  match.state.fighters.A2.pos = { x: 5, y: 5 };
  match.state.fighters.B.pos = { x: 7, y: 5 }; match.state.fighters.B.hp = 1;
  match.state.fighters.A2.pa = 10; match.state.rngState = 100;
  expect(match.isHumanTurn()).toBe(true);
  expect(match.controlledFighter().id).toBe('A2');
  expect(match.humanAct({ type: 'CAST', spell: 'fleche_magique', target: match.state.fighters.B.pos }).ok).toBe(true);
  expect(match.state.winner).toBe('A2'); expect(match.over).toBe(true);
  expect(dungeonOutcome({ finalState: match.state, endReason: 'ko', turns: 1 }).status).toBe('victory');
});

test('manual monsters are controllable, while subsequent summons remain autonomous', () => {
  const match = setup([{ ...monster, controller: 'player' }]); match.ready();
  match.state.currentIndex = match.state.order.indexOf('A2');
  expect(match.humanView().you.id).toBe('A2'); expect(match.isHumanTurn()).toBe(true);
  expect(match.humanAct({ type: 'PASS' }).ok).toBe(true);
  const summon = { ...match.state.fighters.A2, id: 'summon', isSummon: true, leader: false };
  match.state.fighters.summon = summon; match.state.order.push('summon'); match.state.currentIndex = match.state.order.length - 1;
  expect(match.isHumanTurn()).toBe(false);
});

test('persistence keeps all control modes and equipment; invalid saves are reported without erasing them', () => {
  const data = new Map(), storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
  const entries = [character('Manuel'), character('Auto', 'ai'), monster];
  persistAllyTeam(storage, entries); expect(readAllyTeam(storage)).toEqual({ entries, includePlayer: true, error: '' });
  storage.setItem(ALLIES_STORAGE, '{broken');
  expect(readAllyTeam(storage).error).toBeTruthy(); expect(storage.getItem(ALLIES_STORAGE)).toBe('{broken');
});

test('a complete team replaces the implicit profile and keeps control IDs aligned with each remaining member', () => {
  const team = [character('Nouveau', 'ai'), character('Manuel')];
  const compiled = compileCompleteTeamBots(team, bots), decide = jest.spyOn(compiled.A, 'decide');
  const match = new LiveMatch({ playerClass: 'IOP', playerName: 'Retiré', mode: 'kanojedo', seed: 17, team, allyBots: compiled });
  expect(Object.values(match.state.fighters).filter(f => f.team === 'A').map(f => f.name)).toEqual(['Nouveau', 'Manuel']);
  expect(match.state.fighters.A.classId).toBe('CRA'); expect([...match.humanIds]).toEqual(['A2']);
  match.ready(); match.state.order = ['A', 'A2', 'B']; match.state.currentIndex = 0;
  match.botStep(); expect(decide).toHaveBeenCalledTimes(1);
  expect(match.controlledFighter().name).toBe('Manuel'); expect(match.isHumanTurn()).toBe(true);
  expect(match.humanAct({ type: 'CAST', spell: 'tir_eloigne', target: match.current().pos }).ok).toBe(true);
});

test('an empty team cannot start, while eight chosen members need no extra principal slot', () => {
  expect(() => teamRoster([])).toThrow(/Ajoutez au moins/);
  expect(() => teamRoster(Array(9).fill(monster))).toThrow(/maximum 8/);
  const match = new LiveMatch({ mode: 'kanojedo', team: Array(8).fill(monster), seed: 17 });
  expect(Object.values(match.state.fighters).filter(f => f.team === 'A')).toHaveLength(8);
  expect(match.state.fighters.A.isMonster).toBe(true); expect(match.ready().ok).toBe(true);
  expect(isAutomaticTeam('player', [monster], false)).toBe(true);
  expect(isAutomaticTeam('ai', [character('Manuel')], false)).toBe(false);
  expect(isAutomaticTeam('ai', [], false)).toBe(false);
});

test('automatic combat uses only the chosen team, including an entirely native monster team', () => {
  for (const team of [[character('Remplaçant', 'ai'), character('Copie', 'ai')], [monster]]) {
    const compiled = compileCompleteTeamBots(team, bots);
    const result = runMatch({ team, opponents: [monster], classes: { A: 'IOP' }, bots: compiled, seed: 17 });
    expect(result.frames[0].state.fighters.A.classId).not.toBe('IOP');
    expect(result.config.team).toEqual(team);
    expect(result.events.filter(e => e.t === 'bot_error')).toEqual([]);
    expect(Object.values(result.finalState.fighters).filter(f => f.team === 'A')).toHaveLength(team.length);
    expect(result.stats.A.actions).toBeGreaterThan(0);
    if (compiled.A2) expect(compiled.A.decide({}, {}).calls).toBe(compiled.A2.decide({}, {}).calls);
  }
});

test('removed profile and empty teams persist; legacy companion-only saves still include the profile', () => {
  const storage = { getItem: jest.fn(), setItem: jest.fn() };
  storage.getItem.mockReturnValue(JSON.stringify({ version: 1, entries: [monster] }));
  expect(readAllyTeam(storage)).toMatchObject({ entries: [monster], includePlayer: true, error: '' });
  for (const entries of [[], [character('Nouveau')], Array(8).fill(monster)]) {
    persistAllyTeam(storage, entries, false);
    storage.getItem.mockReturnValue(storage.setItem.mock.calls.at(-1)[1]);
    expect(readAllyTeam(storage)).toEqual({ entries, includePlayer: false, error: '' });
  }
  expect(() => persistAllyTeam(storage, Array(8).fill(monster), true)).toThrow();
});
