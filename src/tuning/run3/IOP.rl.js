// Auto-jeu RL de IOP — généré, un worker jest, rounds checkpointés.
import { selfplayClass } from '../selfplay';

jest.setTimeout(6 * 3600 * 1000);

test('selfplay IOP', () => {
  const pool = selfplayClass('IOP', { rounds: 6 });
  expect(Object.keys(pool.vs).length).toBe(12);
});
