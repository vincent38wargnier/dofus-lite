// Auto-jeu RL de CRA — généré, un worker jest, rounds checkpointés.
import { selfplayClass } from '../selfplay';

jest.setTimeout(6 * 3600 * 1000);

test('selfplay CRA', () => {
  const pool = selfplayClass('CRA', { rounds: 6 });
  expect(Object.keys(pool.vs).length).toBe(12);
});
