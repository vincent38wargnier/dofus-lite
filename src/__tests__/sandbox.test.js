// Le bac à sable des bots: un bot ne peut JAMAIS geler un match.
// Boucle infinie → budget d'itérations dépassé → erreur → tour passé,
// et le match se termine toujours (K.O. ou limite de tours).

import { compileBot, protectLoops, checkBot } from '../bots/compile';
import { runMatch } from '../arena/runner';

const runVs = (codeA, codeB, seed = 42) => runMatch({
  bots: {
    A: { name: 'A', decide: compileBot(codeA) },
    B: { name: 'B', decide: compileBot(codeB) },
  },
  classes: { A: 'IOP', B: 'CRA' },
  mapId: 'arene',
  seed,
  collectFrames: false,
});

describe('protection anti-boucle infinie', () => {
  test('while(true) est neutralisé et le match se termine', () => {
    const t0 = Date.now();
    const r = runVs(
      'function decide(view, api) { while (true) {} }',
      'function decide(view, api) { return api.suggest(); }',
    );
    expect(Date.now() - t0).toBeLessThan(15000);
    expect(r.winner).toBe('B'); // le bot gelé se fait démonter
    expect(r.events.some((e) => e.t === 'bot_error' && /Boucle infinie/.test(e.message))).toBe(true);
  });

  test('for(;;) sans accolades est aussi neutralisé', () => {
    const r = runVs(
      'function decide(view, api) { let x = 0; for (;;) x += 1; }',
      'function decide(view, api) { return api.endTurn(); }',
    );
    expect(r.events.some((e) => e.t === 'bot_error' && /Boucle infinie/.test(e.message))).toBe(true);
    expect(r.winner === 'B' || r.winner === null).toBe(true);
  });

  test('la récursion infinie est neutralisée (stack overflow attrapé)', () => {
    const r = runVs(
      'function loop() { return loop(); }\nfunction decide(view, api) { return loop(); }',
      'function decide(view, api) { return api.suggest(); }',
    );
    expect(r.events.some((e) => e.t === 'bot_error')).toBe(true);
    expect(r.winner).toBe('B');
  });

  test('les boucles légitimes passent sans encombre', () => {
    const code = `
      function decide(view, api) {
        let total = 0;
        for (let i = 0; i < 5000; i++) total += i;
        for (const s of view.you.spells) total += s.pa;
        let j = 0;
        while (j < 100) j += 1;
        do { j -= 1; } while (j > 0);
        return api.suggest();
      }`;
    expect(checkBot(code).ok).toBe(true);
    const r = runVs(code, 'function decide(view, api) { return api.suggest(); }');
    expect(r.events.some((e) => e.t === 'bot_error')).toBe(false);
    expect(r.winner === 'A' || r.winner === 'B' || r.winner === null).toBe(true);
  });

  test('protectLoops instrumente tous les types de boucles', () => {
    const src = 'while (a) f();\nfor (const x of xs) { g(x); }\ndo h(); while (b);';
    const out = protectLoops(src);
    expect(out.match(/__kolizGuard\(\)/g)).toHaveLength(3);
  });

  test('le code top-level en boucle infinie échoue à la compilation', () => {
    expect(checkBot('let i = 0; while (true) { i += 1; }\nfunction decide(v, a) { return a.endTurn(); }').ok).toBe(false);
  });
});
