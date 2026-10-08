// Round 2 — raffinage des matchups faibles de CRA (généré).
import { refineMatchups } from '../round2';

jest.setTimeout(6 * 3600 * 1000);

test('refine CRA', () => {
  const r = refineMatchups('CRA', ["OSAMODAS"]);
  expect(Object.keys(r.vs).length).toBe(1);
});
