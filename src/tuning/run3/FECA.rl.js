// Auto-jeu RL de FECA — généré, un worker jest, rounds checkpointés.
import { selfplayClass } from '../selfplay';

jest.setTimeout(6 * 3600 * 1000);

test('selfplay FECA', () => {
  const pool = selfplayClass('FECA', { rounds: 6 });
  expect(Object.keys(pool.vs).length).toBe(12);
});
