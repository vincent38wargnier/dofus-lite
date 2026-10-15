import { clampCamera, zoomCamera, fitCamera } from '../ui/useBoardCamera';
const size = { width: 800, height: 500, viewportWidth: 800, viewportHeight: 500 };
test('wheel zoom preserves the map point under the cursor in both directions', () => {
  const point = { x: 150, y: -70 }, before = fitCamera();
  const after = zoomCamera(before, 2.5, point, size);
  expect((point.x - after.x) / after.zoom).toBe(point.x);
  expect((point.y - after.y) / after.zoom).toBe(point.y);
  expect(zoomCamera(after, 1, point, size)).toEqual(before);
});
test('pan and resize never let the entire battlefield disappear off-screen', () => {
  const panned = clampCamera({ zoom: 3, x: 100000, y: -100000 }, size);
  expect(panned).toEqual({ zoom: 3, x: 800, y: -500 });
  expect(clampCamera(panned, { ...size, viewportWidth: 2500, viewportHeight: 2000 })).toEqual({ zoom: 3, x: 0, y: 0 });
});
test('zoom has bounded readable limits and fit resets panning', () => {
  expect(zoomCamera(fitCamera(), 99, { x: 0, y: 0 }, size).zoom).toBe(4);
  expect(clampCamera({ zoom: 0, x: 40, y: 90 }, size)).toEqual(fitCamera());
});
