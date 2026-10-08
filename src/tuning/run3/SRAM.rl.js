// Auto-jeu RL de SRAM — généré, un worker jest, rounds checkpointés.
import { selfplayClass } from '../selfplay';

jest.setTimeout(6 * 3600 * 1000);

test('selfplay SRAM', () => {
  const pool = selfplayClass('SRAM', { rounds: 6 });
  expect(Object.keys(pool.vs).length).toBe(12);
});
