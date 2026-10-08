// Auto-jeu RL de XELOR — généré, un worker jest, rounds checkpointés.
import { selfplayClass } from '../selfplay';

jest.setTimeout(6 * 3600 * 1000);

test('selfplay XELOR', () => {
  const pool = selfplayClass('XELOR', { rounds: 6 });
  expect(Object.keys(pool.vs).length).toBe(12);
});
