// Round 2 — raffinage des matchups faibles de PANDAWA (généré).
import { refineMatchups } from '../round2';

jest.setTimeout(6 * 3600 * 1000);

test('refine PANDAWA', () => {
  const r = refineMatchups('PANDAWA', ["OSAMODAS", "SRAM", "IOP", "CRA", "SACRIEUR"]);
  expect(Object.keys(r.vs).length).toBe(5);
});
