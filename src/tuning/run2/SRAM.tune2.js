// Round 2 — raffinage des matchups faibles de SRAM (généré).
import { refineMatchups } from '../round2';

jest.setTimeout(6 * 3600 * 1000);

test('refine SRAM', () => {
  const r = refineMatchups('SRAM', ["OSAMODAS"]);
  expect(Object.keys(r.vs).length).toBe(1);
});
