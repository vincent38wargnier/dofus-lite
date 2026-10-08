// Round 2 — raffinage des matchups faibles de XELOR (généré).
import { refineMatchups } from '../round2';

jest.setTimeout(6 * 3600 * 1000);

test('refine XELOR', () => {
  const r = refineMatchups('XELOR', ["OSAMODAS", "ENUTROF", "SRAM", "ECAFLIP", "ENIRIPSA", "IOP", "CRA", "SADIDA", "SACRIEUR", "PANDAWA"]);
  expect(Object.keys(r.vs).length).toBe(10);
});
