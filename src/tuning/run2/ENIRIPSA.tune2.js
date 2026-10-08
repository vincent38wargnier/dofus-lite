// Round 2 — raffinage des matchups faibles de ENIRIPSA (généré).
import { refineMatchups } from '../round2';

jest.setTimeout(6 * 3600 * 1000);

test('refine ENIRIPSA', () => {
  const r = refineMatchups('ENIRIPSA', ["OSAMODAS"]);
  expect(Object.keys(r.vs).length).toBe(1);
});
