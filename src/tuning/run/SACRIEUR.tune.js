// Réglage CEM de la classe SACRIEUR contre les 12 classes — généré, un worker jest.
import { tuneClass } from '../classTuner';

jest.setTimeout(6 * 3600 * 1000);

test('tune SACRIEUR', () => {
  const r = tuneClass('SACRIEUR', { pop: 16, elite: 4, gens: 8, seedsPerGen: 8, holdoutSeeds: 16 });
  expect(Object.keys(r.vs).length).toBe(12);
});
