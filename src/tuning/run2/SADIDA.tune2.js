// Round 2 — raffinage des matchups faibles de SADIDA (généré).
import { refineMatchups } from '../round2';

jest.setTimeout(6 * 3600 * 1000);

test('refine SADIDA', () => {
  const r = refineMatchups('SADIDA', ["OSAMODAS", "ENIRIPSA", "CRA"]);
  expect(Object.keys(r.vs).length).toBe(3);
});
