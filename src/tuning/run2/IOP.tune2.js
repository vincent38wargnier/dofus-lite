// Round 2 — raffinage des matchups faibles de IOP (généré).
import { refineMatchups } from '../round2';

jest.setTimeout(6 * 3600 * 1000);

test('refine IOP', () => {
  const r = refineMatchups('IOP', ["OSAMODAS", "SRAM", "CRA", "SACRIEUR"]);
  expect(Object.keys(r.vs).length).toBe(4);
});
