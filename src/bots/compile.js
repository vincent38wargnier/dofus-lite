/* global globalThis */
// Turns bot source code into a decide(view, api) function.
// User code runs in the page (this is a local playground, like a JS console):
// the sandbox here is about protecting the MATCH (cloned views, validated
// actions, action budget), not the browser.
//
// Protection anti-boucle infinie: on parse le code (acorn) et on injecte un
// compteur dans chaque corps de boucle. Au-delà du budget d'itérations, le
// bot lève une erreur — l'arbitre lui fait alors passer son tour, le match
// continue et se termine toujours.

import * as acorn from 'acorn';

const GUARD = '__kolizGuard';
const OPS_BUDGET = 2_000_000; // par appel à decide() — large pour du code légitime
const LOOP_TYPES = new Set([
  'WhileStatement', 'DoWhileStatement', 'ForStatement', 'ForInStatement', 'ForOfStatement',
]);

// Insère un appel au garde-fou au début de chaque corps de boucle.
// Retourne le code intact si acorn ne peut pas le parser (l'erreur de
// syntaxe remontera de new Function avec un message plus parlant).
export function protectLoops(code) {
  let ast;
  try {
    ast = acorn.parse(code, { ecmaVersion: 'latest' });
  } catch (e) {
    return code;
  }

  const edits = [];
  (function walk(node) {
    if (!node || typeof node.type !== 'string') return;
    if (LOOP_TYPES.has(node.type) && node.body) {
      if (node.body.type === 'BlockStatement') {
        edits.push({ pos: node.body.start + 1, text: `${GUARD}();` });
      } else {
        // corps sans accolades: while (x) f(); → while (x) { guard(); f(); }
        edits.push({ pos: node.body.start, text: `{${GUARD}();` });
        edits.push({ pos: node.body.end, text: '}' });
      }
    }
    for (const k of Object.keys(node)) {
      if (k === 'start' || k === 'end') continue;
      const v = node[k];
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v.type === 'string') walk(v);
    }
  }(ast));

  edits.sort((a, b) => b.pos - a.pos);
  let out = code;
  for (const e of edits) out = out.slice(0, e.pos) + e.text + out.slice(e.pos);
  return out;
}

function buildFactory(code) {
  // eslint-disable-next-line no-new-func
  return new Function(
    GUARD,
    '"use strict";\n' + code + '\n;if (typeof decide !== "function") { throw new Error("Le code doit définir une fonction decide(view, api)"); }\nreturn decide;',
  );
}

export function compileBot(code) {
  if (process.env.REACT_APP_PLATFORM === '1') {
    if (!globalThis.__ARENA_COMPILE_BOT__) throw new Error('Environnement IA non initialisé.');
    return globalThis.__ARENA_COMPILE_BOT__(code);
  }
  let ops = 0;
  const guard = () => {
    ops += 1;
    if (ops > OPS_BUDGET) {
      throw new Error(`Boucle infinie détectée (budget de ${OPS_BUDGET.toLocaleString('fr-FR')} itérations dépassé)`);
    }
  };

  let factory;
  try {
    factory = buildFactory(protectLoops(code));
  } catch (e) {
    // L'injection ne devrait jamais casser du code valide; par prudence on
    // retente le code brut pour remonter la vraie erreur de syntaxe.
    try {
      factory = buildFactory(code);
    } catch (e2) {
      throw new Error(`Erreur de syntaxe: ${e2.message}`);
    }
  }

  const decide = factory(guard); // le code top-level profite aussi du garde-fou
  return (view, api) => {
    ops = 0;
    return decide(view, api);
  };
}

// Compile + smoke-run one decision on a fake minimal call to catch the most
// obvious crashes before a match. Returns { ok, error }.
export function checkBot(code, sampleView, sampleApi) {
  try {
    const decide = compileBot(code);
    if (sampleView && sampleApi) {
      const action = decide(sampleView, sampleApi);
      if (!action || typeof action.type !== 'string') {
        return { ok: false, error: 'decide() doit retourner une action (api.move / api.cast / api.endTurn)' };
      }
    }
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
