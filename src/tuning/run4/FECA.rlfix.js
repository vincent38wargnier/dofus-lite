// Pass ciblé FECA: ancre défaut renforcée (3/5) pour regagner le terrain
// perdu contre le cerveau défaut sans lâcher le pool adaptatif.
import { selfplayClass } from '../selfplay';

jest.setTimeout(6 * 3600 * 1000);

test('selfplay ancré FECA', () => {
  const pool = selfplayClass('FECA', { rounds: 3, anchorShare: 3, pop: 14, gens: 3, seedsPerGen: 6 });
  expect(Object.keys(pool.vs).length).toBe(12);
});
