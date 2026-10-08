// Auto-jeu RL de PANDAWA — généré, un worker jest, rounds checkpointés.
import { selfplayClass } from '../selfplay';

jest.setTimeout(6 * 3600 * 1000);

test('selfplay PANDAWA', () => {
  const pool = selfplayClass('PANDAWA', { rounds: 6 });
  expect(Object.keys(pool.vs).length).toBe(12);
});
