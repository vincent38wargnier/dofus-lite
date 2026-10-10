import { spellEffectPlan, withStageBounds } from '../ui/retroSpellEffect';

const from = { x: 0, y: 0 }, to = { x: 107, y: 53.5 };
const plan = (type, a = from, b = to) => spellEffectPlan({ type, fps: 60, duration: 500, exportFrames: { shoot: 90 } }, a, b, 1, 6);

test.each([[10, '-107', '-53.5'], [11, '0', '0'], [12, '-107', '-53.5'],
  [21, '-107', '-53.5'], [51, '0', '0']])('type %s uses its native origin and level', (type, x, y) => {
  expect(plan(type).parameters).toMatchObject({ effectX: x, effectY: y, spellLevel: '6', fromX: '-107', fromY: '-53.5' });
});

test('a native ballistic projectile has an arc and retains the complete impact tail', () => {
  const result = plan(31);
  expect(result.parameters).toMatchObject({ effectX: '-107', effectY: '-63.5', effectScaleX: '100' });
  expect(result.motion[0].slice(0, 3)).toEqual([1, 0, 0]);
  expect(result.motion[0][3]).toBeCloseTo(14.90854605937);
  const impact = result.motion[result.motion.length - 1];
  expect(impact.slice(0, 3)).toEqual([2, 107, 53.5]);
  const midpoint = result.motion[Math.floor(result.motion.length / 2)];
  expect(midpoint[2]).toBeLessThan(midpoint[1] * .5);
  expect(result.duration).toBe((result.motion.length + 90) / 60 * 1000);
  expect(plan(30).motion[0][3]).toBeCloseTo(-31.71747441146);
});

test('trail effects space their duplicate clips by three frames and optionally impact', () => {
  const result = plan(41, from, { x: 100, y: 0 });
  expect(result.motion.map(row => row[0])).toEqual([3, 0, 0, 3, 0, 0, 3, 0, 0, 3, 0, 0, 3, 0, 0, 2]);
  expect(result.motion[0][1]).toBeCloseTo(100 / 15);
  expect(result.motion[3][1]).toBeCloseTo(400 / 15);
  expect(plan(40).motion.at(-1)[0]).toBe(0);
});

test.each([30, 31, 40, 41])('type %s terminates for coincident and axis-aligned cells', type => {
  for (const target of [from, { x: 0, y: -100 }, { x: 0, y: 100 }, { x: -200, y: 0 }]) {
    const result = plan(type, from, target);
    expect(result.motion.length).toBeLessThan(1800);
    expect(result.motion.flat().every(Number.isFinite)).toBe(true);
    expect(result.parameters.motion).not.toMatch(/NaN|Infinity/);
  }
  expect(plan(31, to, from).parameters.effectScaleX).toBe('-100');
});

test('a long trajectory fits inside the stage instead of being cropped at 200 pixels', () => {
  const result = plan(31, { x: -650, y: 0 }, from);
  expect(result.bounds[0]).toBeLessThanOrEqual(-850);
  expect(result.bounds[1]).toBeGreaterThanOrEqual(200);
});

test('expanding an uncompressed SWF changes only its RECT and file length', async () => {
  // FWS v8, a two-byte zero RECT, then arbitrary original timeline bytes.
  const source = Uint8Array.from([70, 87, 83, 8, 16, 0, 0, 0, 8, 0, 0, 60, 1, 0, 0, 0]);
  const result = new Uint8Array(await withStageBounds(source.buffer, [-900, 200, -300, 200]));
  expect(new DataView(result.buffer).getUint32(4, true)).toBe(result.length);
  expect([...result.slice(-6)]).toEqual([...source.slice(-6)]);
  expect([...source.slice(0, 8)]).toEqual([70, 87, 83, 8, 16, 0, 0, 0]);
});
