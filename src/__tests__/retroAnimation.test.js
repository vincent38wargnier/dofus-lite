import { act, renderHook } from '@testing-library/react';
import { castAnimation, facing, resolveAnimation } from '../ui/retroAnimation';
import useFighterAnimation from '../ui/useFighterAnimation';

const origin = { x: 0, y: 0 };
const actor = { animations: ['staticR', 'staticL', 'anim1L', 'anim1R', 'anim2L', 'anim2R', 'walkR', 'walkL'],
  durations: { anim1L: 900, anim1R: 500, anim2L: 600, anim2R: 600 } };
const assets = { spells: { 142: { animation: 'anim1' }, 141: { animation: 'anim2' }, 693: { animation: null, skipAnimation: true } } };
const fighter = { id: 'A', team: 'A', hp: 100, pos: origin };
const cast = (target, spellId = 142) => ({ t: 'cast', fighter: 'A', from: origin, target, spellId });

test.each([
  [{ x: 1, y: -1 }, 'R', false], // screen east belongs to quadrant 1
  [{ x: 1, y: 1 }, 'R', true],   // screen south belongs to quadrant 3
  [{ x: -1, y: 1 }, 'R', true],
  [{ x: -1, y: -1 }, 'L', true], // screen north belongs to quadrant 7
])('cast quadrant boundaries match the client: %j', (to, suffix, mirror) => {
  expect(facing(origin, to)).toEqual({ suffix, mirror });
});

test('self casts preserve orientation and missing gestures use the same-facing idle', () => {
  const direction = { suffix: 'L', mirror: false };
  expect(facing(origin, origin, direction)).toBe(direction);
  expect(resolveAnimation(actor, 'anim999', 'L')).toBe('staticL');
  expect(castAnimation({ spellId: 142 }, assets)).toBe('anim1');
  expect(castAnimation({ spellId: 0, weaponAnimation: 6 }, assets)).toBe('anim6');
  expect(castAnimation({ spellId: 10 }, { spells: { 10: { animation: null } } })).toBe('static');
});

describe('independent fighter timelines', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  const setup = () => renderHook(({ f, events, frame }) => useFighterAnimation(f, events, frame, actor, assets),
    { initialProps: { f: fighter, events: [], frame: 0 } });

  test('another action does not interrupt, restart, or prolong the casting gesture', () => {
    const { result, rerender } = setup();
    rerender({ f: fighter, events: [cast({ x: -1, y: 0 })], frame: 1 });
    expect(result.current).toMatchObject({ pose: 'anim1', direction: { suffix: 'L', mirror: false } });
    const restart = result.current.restart;
    act(() => jest.advanceTimersByTime(400));
    rerender({ f: fighter, events: [{ t: 'cast', fighter: 'B', from: origin, target: origin }], frame: 2 });
    expect(result.current).toMatchObject({ pose: 'anim1', restart });
    act(() => jest.advanceTimersByTime(499));
    expect(result.current.pose).toBe('anim1');
    act(() => jest.advanceTimersByTime(1));
    expect(result.current.pose).toBe('static');
    expect(result.current.direction).toEqual({ suffix: 'L', mirror: false });
  });

  test('a second cast restarts immediately and self-targeting keeps the current facing', () => {
    const { result, rerender } = setup();
    rerender({ f: fighter, events: [cast({ x: 0, y: -1 })], frame: 1 });
    const restart = result.current.restart;
    act(() => jest.advanceTimersByTime(100));
    rerender({ f: fighter, events: [cast(origin)], frame: 2 });
    expect(result.current).toMatchObject({ pose: 'anim1', restart: restart + 1, direction: { suffix: 'L', mirror: true } });
    act(() => jest.advanceTimersByTime(800));
    expect(result.current.pose).toBe('anim1');
    act(() => jest.advanceTimersByTime(100));
    expect(result.current.pose).toBe('static');
  });

  test('a bent walk finishes facing its last segment, even during another fighter action', () => {
    const { result, rerender } = setup();
    const path = [origin, { x: 1, y: 0 }, { x: 1, y: -1 }];
    const f = { ...fighter, pos: path[2] };
    rerender({ f, events: [{ t: 'move', fighter: 'A', path }], frame: 1 });
    expect(result.current.direction).toEqual({ suffix: 'R', mirror: false });
    act(() => jest.advanceTimersByTime(130));
    rerender({ f, events: [{ t: 'turn_end', fighter: 'B' }], frame: 2 });
    expect(result.current.pose).toBe('walk');
    act(() => jest.advanceTimersByTime(130));
    expect(result.current).toMatchObject({ pose: 'static', position: null, direction: { suffix: 'L', mirror: true } });
  });

  test('displacement does not turn its victim and death is not replayed by unrelated events', () => {
    const { result, rerender } = setup();
    const f = { ...fighter, pos: { x: -1, y: 0 } };
    rerender({ f, events: [{ t: 'push', target: 'A' }], frame: 1 });
    expect(result.current.direction).toEqual({ suffix: 'R', mirror: false });
    rerender({ f: { ...f, hp: 0 }, events: [{ t: 'death', fighter: 'A' }], frame: 2 });
    const death = result.current;
    rerender({ f: { ...f, hp: 0 }, events: [], frame: 3 });
    expect(result.current).toBe(death);
    expect(death.pose).toBe('die');
  });

  test('the native -1 gesture used by carrying spells preserves pose and facing', () => {
    const { result, rerender } = setup();
    const before = result.current;
    rerender({ f: fighter, events: [cast({ x: -1, y: 0 }, 693)], frame: 1 });
    expect(result.current).toBe(before);
  });
});
