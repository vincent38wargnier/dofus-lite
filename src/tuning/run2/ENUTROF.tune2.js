// Round 2 — raffinage des matchups faibles de ENUTROF (généré).
import { refineMatchups } from '../round2';

jest.setTimeout(6 * 3600 * 1000);

test('refine ENUTROF', () => {
  const r = refineMatchups('ENUTROF', ["OSAMODAS", "SRAM", "IOP", "SACRIEUR"]);
  expect(Object.keys(r.vs).length).toBe(4);
});
