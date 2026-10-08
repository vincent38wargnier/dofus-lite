// Réglage CEM de la classe PANDAWA contre les 12 classes — généré, un worker jest.
import { tuneClass } from '../classTuner';

jest.setTimeout(6 * 3600 * 1000);

test('tune PANDAWA', () => {
  const r = tuneClass('PANDAWA', { pop: 16, elite: 4, gens: 8, seedsPerGen: 8, holdoutSeeds: 16 });
  expect(Object.keys(r.vs).length).toBe(12);
});
