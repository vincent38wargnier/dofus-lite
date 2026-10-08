// Auto-jeu RL de OSAMODAS — généré, un worker jest, rounds checkpointés.
import { selfplayClass } from '../selfplay';

jest.setTimeout(6 * 3600 * 1000);

test('selfplay OSAMODAS', () => {
  const pool = selfplayClass('OSAMODAS', { rounds: 6 });
  expect(Object.keys(pool.vs).length).toBe(12);
});
