// Round 2 — raffinage des matchups faibles de ECAFLIP (généré).
import { refineMatchups } from '../round2';

jest.setTimeout(6 * 3600 * 1000);

test('refine ECAFLIP', () => {
  const r = refineMatchups('ECAFLIP', ["OSAMODAS", "SRAM"]);
  expect(Object.keys(r.vs).length).toBe(2);
});
