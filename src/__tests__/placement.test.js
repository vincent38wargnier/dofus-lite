import { MAPS, MAP_IDS } from '../engine/maps';
import { createGame, placeFighter, readyFighter, applyAction, getView } from '../engine/engine';
import { bfs } from '../engine/pathfinding';
import { LiveMatch } from '../game/liveMatch';
import { runMatch } from '../arena/runner';
import { maisonDecide } from '../bots/maison';

const fighters = [{ id: 'A', classId: 'IOP' }, { id: 'B', classId: 'CRA' }];
const fresh = (extra = {}) => createGame({ fighters, mapId: 'astrub_7423', seed: 17, placement: true, ...extra });
const pos = ({ x, y }) => ({ x, y });
const key = ({ x, y }) => `${x},${y}`;

test('all 22 PvP/training maps have disjoint, walkable and connected team zones; provenance is explicit', () => {
  const maps = MAP_IDS.map(id => MAPS[id]);
  expect(maps).toHaveLength(22);
  expect(maps.filter(m => m.placement.status === 'historical')).toHaveLength(9);
  expect(maps.filter(m => m.placement.status === 'local')).toHaveLength(10);
  for (const map of maps) {
    expect(map.startingCells).toHaveLength(2);
    const all = map.startingCells.flat();
    const seen = new Set();
    const { costs } = bfs(map.spawns[0], map.width * map.height, map.width, map.height,
      (x, y) => !!map.obstacles[`${x},${y}`]?.blocksMove);
    for (const team of map.startingCells) {
      expect(team.length).toBeGreaterThan(0);
      for (const cell of team) {
        expect(seen.has(key(cell))).toBe(false); seen.add(key(cell));
        expect(map.obstacles[key(cell)]?.blocksMove).toBeFalsy();
        expect(costs.has(key(cell))).toBe(true);
      }
    }
    expect(seen.size).toBe(all.length);
  }
  for (const map of maps.filter(m => m.placement.status !== 'historical')) {
    expect(map.startingCells).toEqual(map.spawns.map(p => [p]));
  }
});

test('PvP lists retain the exact archived source cell IDs and order', () => {
  expect(MAPS.astrub_7423.startingCells.map(team => team.map(c => c.cellId))).toEqual([
    [105, 119, 120, 133, 134, 147, 148, 162], [210, 224, 225, 238, 239, 252, 253, 267],
  ]);
  expect(MAPS.amakna_952.startingCells.map(team => team.map(c => c.cellId))).toEqual([
    [193, 250, 332, 337, 418, 425, 456, 459], [166, 168, 184, 214, 272, 330, 358, 371, 265],
  ]);
});

test('placement does not start a turn or allow combat actions', () => {
  const { state, events } = fresh();
  expect(state.turn).toBe(0);
  expect(events.map(e => e.t)).toEqual(['placement_start']);
  expect(getView(state, 'A').isMyTurn).toBe(false);
  for (const action of [{ type: 'PASS' }, { type: 'MOVE', to: state.fighters.A.pos },
    { type: 'CAST', spell: 'pression', target: state.fighters.B.pos }]) {
    const result = applyAction(state, action);
    expect(result.ok).toBe(false);
    expect(result.state).toBe(state);
  }
});

test('placement can visit every own start freely without spending points or advancing combat RNG', () => {
  const initial = fresh().state;
  let state = initial;
  for (const cell of state.placement.cells.A) {
    const result = placeFighter(state, 'A', cell);
    expect(result.ok).toBe(true);
    expect(result.events.map(e => e.t)).toEqual(['placement_move']);
    state = result.state;
    expect(state.fighters.A.pos).toEqual(pos(cell));
    expect(state.fighters.A.startPos).toEqual(pos(cell));
    expect(state.fighters.A.pa).toBe(initial.fighters.A.pa);
    expect(state.fighters.A.pm).toBe(initial.fighters.A.pm);
    expect(state.rngState).toBe(initial.rngState);
    expect(state.turn).toBe(0);
    expect(state.fighters.B).toEqual(initial.fighters.B);
  }
  expect(initial).toEqual(fresh().state);
});

test('enemy, ordinary floor, blocked, malformed, occupied and unknown-fighter placements are rejected', () => {
  const state = fresh().state;
  const allStarts = new Set(Object.values(state.placement.cells).flat().map(key));
  let outside;
  for (let x = 0; x < state.board.width && !outside; x++) for (let y = 0; y < state.board.height; y++) {
    if (!state.board.obstacles[`${x},${y}`] && !allStarts.has(`${x},${y}`)) { outside = { x, y }; break; }
  }
  expect(outside).toBeDefined();
  const invalid = [outside, state.placement.cells.B[0], Object.values(state.board.obstacles)[0],
    null, {}, { x: -1, y: 0 }, { x: 1.5, y: 1 }, { x: NaN, y: 1 }, { x: Infinity, y: 1 }, { x: '1', y: 1 }];
  for (const cell of invalid) {
    expect(placeFighter(state, 'A', cell)).toMatchObject({ ok: false, state, events: [] });
  }
  expect(placeFighter(state, 'unknown', state.placement.cells.A[0]).ok).toBe(false);
  const occupied = JSON.parse(JSON.stringify(state));
  occupied.fighters.B.pos = pos(occupied.placement.cells.A[0]);
  expect(placeFighter(occupied, 'A', occupied.fighters.B.pos).ok).toBe(false);
});

test('both teams must be ready, then positions lock and exactly one first turn starts', () => {
  const initial = fresh().state;
  const chosen = initial.placement.cells.A[2];
  const moved = placeFighter(initial, 'A', chosen).state;
  const first = readyFighter(moved, 'A');
  expect(first.state.phase).toBe('placement');
  expect(placeFighter(first.state, 'A', first.state.placement.cells.A[3]).ok).toBe(false);
  expect(readyFighter(first.state, 'A').ok).toBe(false);
  const second = readyFighter(first.state, 'B');
  expect(second.state.phase).toBe('combat');
  expect(second.state.turn).toBe(1);
  expect(second.events.map(e => e.t)).toEqual(['placement_ready', 'match_start', 'turn_start']);
  expect(second.events[1].startingPositions.A).toEqual(pos(chosen));
  expect(second.events[1].placement.source.status).toBe('historical');
  expect(placeFighter(second.state, 'A', first.state.placement.cells.A[0]).ok).toBe(false);
  expect(readyFighter(second.state, 'B').state).toBe(second.state);
});

test('seeded automated starts use only assigned zones on every map', () => {
  for (const mapId of Object.keys(MAPS)) for (const seed of [1, 2, 17, 12345]) {
    const config = { mapId, seed, fighters };
    const game = createGame(config);
    expect(createGame(config)).toEqual(game);
    expect(game.state.phase).toBe('combat');
    for (const id of ['A', 'B']) {
      expect(game.state.placement.cells[id].map(pos)).toContainEqual(game.state.fighters[id].pos);
    }
  }
});

test('LiveMatch holds the opponent and human until ready, including after repositioning', () => {
  const decide = jest.fn(() => ({ type: 'PASS' }));
  const live = new LiveMatch({ playerClass: 'IOP', botClass: 'CRA', mapId: 'astrub_7423', seed: 17,
    botName: 'Test', botDecide: decide });
  expect(live.placing).toBe(true);
  expect(live.isHumanTurn()).toBe(false);
  expect(live.state.placement.ready).toEqual({ A: false, B: true });
  const before = JSON.stringify(live.state);
  for (let i = 0; i < 5; i++) live.botStep();
  expect(decide).not.toHaveBeenCalled();
  expect(live.humanAct({ type: 'PASS' }).ok).toBe(false);
  expect(JSON.stringify(live.state)).toBe(before);
  expect(live.placeHuman(live.state.placement.cells.A[2]).ok).toBe(true);
  expect(live.ready().ok).toBe(true);
  expect(live.placing).toBe(false);
  expect(live.state.turn).toBe(1);
  expect(live.placeHuman(live.state.placement.cells.A[3]).ok).toBe(false);
});

test.each(['astrub_7423', 'amakna_952'])('bots finish a fight on %s from historical starting cells', mapId => {
  const result = runMatch({ mapId, seed: 17, classes: { A: 'IOP', B: 'CRA' }, collectFrames: false,
    bots: { A: { name: 'A', decide: maisonDecide }, B: { name: 'B', decide: maisonDecide } } });
  expect(result.finalState.over).toBe(true);
  expect(result.stats.A.errors + result.stats.B.errors).toBe(0);
  const start = result.events.find(e => e.t === 'match_start');
  for (const id of ['A', 'B']) expect(start.placement.cells[id].map(pos)).toContainEqual(start.startingPositions[id]);
});
