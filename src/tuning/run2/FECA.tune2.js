// Round 2 — raffinage des matchups faibles de FECA (généré).
import { refineMatchups } from '../round2';

jest.setTimeout(6 * 3600 * 1000);

test('refine FECA', () => {
  const r = refineMatchups('FECA', ["OSAMODAS", "ENUTROF", "ENIRIPSA", "SACRIEUR"]);
  expect(Object.keys(r.vs).length).toBe(4);
});
