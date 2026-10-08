// Mode Jouer: le contrôleur de match en direct respecte les règles de
// l'arbitre, et l'IA Maison retourne toujours des actions légales.

import { LiveMatch } from '../game/liveMatch';
import { compileBot } from '../bots/compile';
import { getBuiltinBot } from '../bots/builtins';
import { runMatch } from '../arena/runner';
import { maisonDecide } from '../bots/maison';
import { CLASS_IDS } from '../engine/classes';

const maisonCode = getBuiltinBot('maison').code;

describe('match en direct (humain vs bot)', () => {
  test('le joueur peut bouger, lancer un sort et finir son tour', () => {
    const m = new LiveMatch({
      playerClass: 'IOP',
      botClass: 'CRA',
      mapId: 'arene',
      seed: 7,
      botName: 'IA Maison',
      botDecide: compileBot(maisonCode),
    });

    let guard = 0;
    // On avance jusqu'au tour du joueur (le bot peut avoir l'initiative).
    while (!m.over && !m.isHumanTurn() && guard++ < 200) m.botStep();
    expect(m.isHumanTurn()).toBe(true);

    const api = m.humanApi();
    const cells = api.reachable();
    expect(cells.length).toBeGreaterThan(0);
    const r = m.humanAct({ type: 'MOVE', to: cells[0].pos });
    expect(r.ok).toBe(true);
    expect(r.events.some((e) => e.t === 'move' || e.t === 'tackle')).toBe(true);

    const pass = m.humanAct({ type: 'PASS' });
    expect(pass.ok).toBe(true);
    expect(m.isHumanTurn()).toBe(false);
  });

  test('une action illégale est refusée sans casser le match', () => {
    const m = new LiveMatch({
      playerClass: 'IOP',
      botClass: 'IOP',
      mapId: 'arene',
      seed: 11,
      botName: 'Sparring',
      botDecide: compileBot('function decide(v, a) { return a.endTurn(); }'),
    });
    let guard = 0;
    while (!m.over && !m.isHumanTurn() && guard++ < 200) m.botStep();
    const r = m.humanAct({ type: 'CAST', spell: 'colere', target: { x: -3, y: 99 } });
    expect(r.ok).toBe(false);
    expect(m.over).toBe(false);
    expect(m.isHumanTurn()).toBe(true);
  });

  test('un match complet en passant tous ses tours se termine toujours', () => {
    const m = new LiveMatch({
      playerClass: 'ENIRIPSA',
      botClass: 'IOP',
      mapId: 'muraille',
      seed: 13,
      botName: 'IA Maison',
      botDecide: compileBot(maisonCode),
    });
    let guard = 0;
    while (!m.over && guard++ < 3000) {
      if (m.isHumanTurn()) m.humanAct({ type: 'PASS' });
      else m.botStep();
    }
    expect(m.over).toBe(true);
    expect(m.state.winner).toBe('B'); // passer tous ses tours = défaite méritée
  });
});

describe('IA Maison', () => {
  test('joue des matchs complets pour un échantillon de matchups', () => {
    const decide = (view, api) => maisonDecide(view, api);
    const pairs = CLASS_IDS.map((c, i) => [c, CLASS_IDS[(i + 5) % CLASS_IDS.length]]);
    for (const [ca, cb] of pairs) {
      const r = runMatch({
        bots: { A: { name: 'MaisonA', decide }, B: { name: 'MaisonB', decide } },
        classes: { A: ca, B: cb },
        mapId: 'canyon',
        seed: 99,
        collectFrames: false,
      });
      expect(r.winner === 'A' || r.winner === 'B' || r.winner === null).toBe(true);
      expect(r.stats.A.errors + r.stats.B.errors).toBe(0);
    }
  });
});
