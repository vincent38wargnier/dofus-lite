// Évaluation finale de l'IA Maison après fusion (lancé seul, pas un .tune2).
import { evalMaison } from '../evalMatrix';

jest.setTimeout(2 * 3600 * 1000);

test('matrice d\'évaluation maison', () => {
  const report = evalMaison({ seedsPerPair: 8 });
  expect(Object.keys(report.matrix).length).toBe(12);
});
