// Auto-jeu RL de ECAFLIP — généré, un worker jest, rounds checkpointés.
import { selfplayClass } from '../selfplay';

jest.setTimeout(6 * 3600 * 1000);

test('selfplay ECAFLIP', () => {
  const pool = selfplayClass('ECAFLIP', { rounds: 6 });
  expect(Object.keys(pool.vs).length).toBe(12);
});
