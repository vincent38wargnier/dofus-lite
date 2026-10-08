// Auto-jeu RL de SADIDA — généré, un worker jest, rounds checkpointés.
import { selfplayClass } from '../selfplay';

jest.setTimeout(6 * 3600 * 1000);

test('selfplay SADIDA', () => {
  const pool = selfplayClass('SADIDA', { rounds: 6 });
  expect(Object.keys(pool.vs).length).toBe(12);
});
