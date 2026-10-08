// Réglage CEM de la classe FECA contre les 12 classes — généré, un worker jest.
import { tuneClass } from '../classTuner';

jest.setTimeout(6 * 3600 * 1000);

test('tune FECA', () => {
  const r = tuneClass('FECA', { pop: 16, elite: 4, gens: 8, seedsPerGen: 8, holdoutSeeds: 16 });
  expect(Object.keys(r.vs).length).toBe(12);
});
