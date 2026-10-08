// Auto-jeu RL de ENIRIPSA — généré, un worker jest, rounds checkpointés.
import { selfplayClass } from '../selfplay';

jest.setTimeout(6 * 3600 * 1000);

test('selfplay ENIRIPSA', () => {
  const pool = selfplayClass('ENIRIPSA', { rounds: 6 });
  expect(Object.keys(pool.vs).length).toBe(12);
});
