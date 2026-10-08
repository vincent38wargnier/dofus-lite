// Auto-jeu RL de ENUTROF — généré, un worker jest, rounds checkpointés.
import { selfplayClass } from '../selfplay';

jest.setTimeout(6 * 3600 * 1000);

test('selfplay ENUTROF', () => {
  const pool = selfplayClass('ENUTROF', { rounds: 6 });
  expect(Object.keys(pool.vs).length).toBe(12);
});
