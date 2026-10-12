// Les SAY « réflexion » (bots asynchrones type Stratège: le Worker calcule,
// decide() rend des ticks SAY en attendant) ne doivent PAS consommer le budget
// d'actions du tour — sinon un bot lent se faisait passer son tour de force
// après ~2 vraies actions. Un plafond séparé (MAX_SAYS_PER_TURN) borne
// néanmoins tout bot qui parlerait sans jamais agir.
import { LiveMatch } from '../game/liveMatch';

const duel = (botDecide) => {
  const match = new LiveMatch({ playerClass: 'IOP', botClass: 'CRA', mode: 'duel', mapId: 'canyon', seed: 17, botDecide });
  match.ready();
  match.state.order = ['B', 'A'];
  match.state.currentIndex = 0;
  return match;
};

test("les SAY réflexion ne consomment pas le budget d'actions du tour", () => {
  let says = 0;
  const match = duel((view, api) => {
    if (says < 30) { says += 1; return { type: 'SAY', text: '♟️ (calcule…)' }; }
    return api.moveToward(view.enemies[0].pos) || { type: 'PASS' };
  });
  const events = [];
  for (let i = 0; i < 31; i++) events.push(...match.botStep().events);
  // 30 ticks (> MAX_ACTIONS_PER_TURN=25) puis 1 vraie action: le tour doit
  // rester au bot — avant le correctif, le référent le passait de force ici.
  expect(events.filter(e => e.t === 'say').length).toBe(30);
  expect(events.filter(e => e.t === 'bot_error')).toEqual([]);
  expect(match.current().id).toBe('B');
  expect(match.actions).toBe(1);
});

test('un bot qui ne fait que parler finit par passer son tour (plafond anti-blocage)', () => {
  const match = duel(() => ({ type: 'SAY', text: 'blabla' }));
  let ticks = 0;
  while (match.current().id === 'B' && ticks < 500) { match.botStep(); ticks += 1; }
  expect(ticks).toBe(200); // MAX_SAYS_PER_TURN
  expect(match.current().id).toBe('A');
});
