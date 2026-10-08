// Auto-jeu RL de SACRIEUR — généré, un worker jest, rounds checkpointés.
import { selfplayClass } from '../selfplay';

jest.setTimeout(6 * 3600 * 1000);

test('selfplay SACRIEUR', () => {
  const pool = selfplayClass('SACRIEUR', { rounds: 6 });
  expect(Object.keys(pool.vs).length).toBe(12);
});
