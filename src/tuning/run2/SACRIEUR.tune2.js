// Round 2 — raffinage des matchups faibles de SACRIEUR (généré).
import { refineMatchups } from '../round2';

jest.setTimeout(6 * 3600 * 1000);

test('refine SACRIEUR', () => {
  const r = refineMatchups('SACRIEUR', ["OSAMODAS", "SRAM"]);
  expect(Object.keys(r.vs).length).toBe(2);
});
