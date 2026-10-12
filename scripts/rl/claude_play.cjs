// Harnais interactif: Claude joue contre le champion réseau, un coup par
// invocation CLI. Persistance par REJEU (seed + journal d'actions → état
// exact, même propriété que les exports de combat), donc aucun risque de
// sérialisation d'état.
//
//   node scripts/rl/claude_play.cjs new   --id m1 --me CRA --opp IOP --map arene --seed 101 [--model DIR]
//   node scripts/rl/claude_play.cjs state --id m1
//   node scripts/rl/claude_play.cjs act   --id m1 --action '{"type":"MOVE","to":{"x":5,"y":6}}'
//   node scripts/rl/claude_play.cjs log   --id m1
//
// Je joue TOUTES les unités du camp A (racine + invocations). Le net joue la
// racine B via makeNetBot (argmax légal, ONNX si dispo); ses invocations via
// le cerveau utilitaire — exactement la config de son éval à 58%.
require('../ai_runtime.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { createGame, applyAction, getView, currentFighter } = require('../../src/engine/engine');
const { createRng, hashSeed } = require('../../src/engine/rng');
const { makeBotApi } = require('../../src/bots/api');
const { utilityDecide } = require('../../src/bots/utilityBrain');
const { makeNetBot } = require('./bot_net.cjs');

const ROOT = path.resolve(__dirname, '../../local-observations/rl/claude-play');
const DEFAULT_MODEL = path.resolve(__dirname, '../../local-observations/rl/ppo-v1/pool/iter_0120');
const MAX_ACTIONS_PER_TURN = 25;
const MAX_INVALID_PER_TURN = 3;
const MY_SIDE = 'A';

function parseArgs(argv) {
  const cmd = argv[2];
  const args = {};
  for (let i = 3; i < argv.length; i += 2) {
    if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[i + 1];
  }
  return { cmd, args };
}

const matchFile = (id) => path.join(ROOT, `${id}.json`);
const loadMatch = (id) => JSON.parse(fs.readFileSync(matchFile(id), 'utf8'));
const saveMatch = (m) => { fs.mkdirSync(ROOT, { recursive: true }); fs.writeFileSync(matchFile(m.id), JSON.stringify(m)); };

function rebuild(m) {
  let { state } = createGame({
    mapId: m.mapId, seed: m.seed,
    fighters: [
      { id: 'A', name: 'Claude', classId: m.me },
      { id: 'B', name: 'Net', classId: m.opp },
    ],
  });
  for (const rec of m.actions) state = applyAction(state, rec.a).state;
  return state;
}

// RNG fraîche par décision, dérivée de (seed, unité, index du journal):
// reproductible à travers les invocations CLI quel que soit le rejeu.
const decRng = (m, id) => createRng(hashSeed(`${m.seed}:${id}:${m.actions.length}`));

function fmtAction(a) {
  if (a.type === 'MOVE') return `MOVE→(${a.to.x},${a.to.y})`;
  if (a.type === 'CAST') return `CAST ${a.spell}→(${a.target.x},${a.target.y})`;
  return 'PASS';
}

// Fait jouer le net (et ses invocations) jusqu'à ce que ce soit à moi ou fin.
function advance(state, m, net, trace) {
  let turnKey = '';
  let steps = 0;
  let invalidThisTurn = 0;
  let guard = 0;
  while (!state.over && guard++ < 2000) {
    const actor = currentFighter(state);
    if (actor.team === MY_SIDE) break;
    const nextKey = `${state.turn}:${actor.id}`;
    if (turnKey !== nextKey) { turnKey = nextKey; steps = 0; invalidThisTurn = 0; }
    let action = { type: 'PASS' };
    try {
      const view = getView(state, actor.id);
      const api = makeBotApi(view, decRng(m, actor.id));
      action = (actor.isSummon ? utilityDecide(view, api) : net.decide(view, api)) || { type: 'PASS' };
      if (!action.type) action = { type: 'PASS' };
    } catch { action = { type: 'PASS' }; }
    if (steps >= MAX_ACTIONS_PER_TURN) action = { type: 'PASS' };
    const before = snapshotHp(state);
    const result = applyAction(state, action);
    state = result.state;
    if (!result.ok) {
      if (++invalidThisTurn >= MAX_INVALID_PER_TURN) {
        const fp = { type: 'PASS' };
        state = applyAction(state, fp).state;
        m.actions.push({ by: 'referee', a: fp });
        trace.push(`[arbitre] PASS forcé (${actor.id})`);
        invalidThisTurn = 0;
      }
      continue;
    }
    steps++;
    m.actions.push({ by: actor.id, a: action });
    trace.push(`${actor.id}${actor.isSummon ? '(invoc)' : ''}: ${fmtAction(action)}${hpDelta(before, state)}`);
  }
  return state;
}

const snapshotHp = (state) => Object.fromEntries(Object.values(state.fighters).map((f) => [f.id, f.hp]));
function hpDelta(before, state) {
  const parts = [];
  for (const f of Object.values(state.fighters)) {
    const b = before[f.id];
    if (b != null && f.hp !== b) parts.push(`${f.id}:${f.hp - b > 0 ? '+' : ''}${f.hp - b}PV`);
  }
  return parts.length ? `  [${parts.join(' ')}]` : '';
}

function fmtEffects(f) {
  const eff = (f.effects || []).map((e) => `${e.kind}${e.value != null ? ` ${e.value}` : ''}(${e.turnsLeft}t)`);
  return eff.length ? eff.join(', ') : '—';
}

function fmtRes(f) {
  const parts = [];
  for (const [el, v] of Object.entries(f.resistances || {})) if (v) parts.push(`${el}:${v}%`);
  for (const [el, v] of Object.entries(f.resistancesFixed || {})) if (v) parts.push(`${el}:${v}fixe`);
  return parts.length ? parts.join(' ') : 'aucune';
}

function fmtSpellEffects(s) {
  const rows = [];
  for (const e of s.effects || []) {
    let t = e.kind;
    if (e.min != null || e.max != null) t += ` ${e.min ?? '?'}–${e.max ?? '?'}`;
    else if (e.value != null) t += ` ${e.value}`;
    if (e.element) t += ` ${e.element}`;
    if (e.turns) t += ` (${e.turns}t)`;
    rows.push(t);
  }
  if (s.critEffects && s.critEffects.length) rows.push(`[crit: ${s.critEffects.map((e) => `${e.kind} ${e.min ?? e.value ?? ''}${e.max != null ? '–' + e.max : ''}`).join(', ')}]`);
  return rows.join(' | ') || '—';
}

function board(state, view, api) {
  const { width: W, height: H } = view.board;
  const grid = Array.from({ length: H }, () => Array(W).fill('.'));
  for (const ob of view.board.obstacles || []) {
    grid[ob.y][ob.x] = ob.blocksMove ? (ob.blocksLos ? '#' : 'o') : '%';
  }
  for (const c of api.reachable()) grid[c.pos.y][c.pos.x] = '·';
  for (const h of view.hazards || []) {
    for (const c of h.cells || []) if (grid[c.y]?.[c.x] != null) grid[c.y][c.x] = '^';
  }
  for (const f of [...view.allies, ...view.enemies]) {
    if (f.hp <= 0) continue;
    grid[f.pos.y][f.pos.x] = f.team === MY_SIDE ? 's' : (f.isSummon ? 'z' : (f.hidden ? '?' : 'E'));
  }
  grid[view.you.pos.y][view.you.pos.x] = '@';
  const header = '   ' + Array.from({ length: W }, (_, x) => x % 10).join(' ');
  const rows = grid.map((row, y) => `${String(y).padStart(2)} ${row.join(' ')}`);
  return [header, ...rows].join('\n');
}

function printState(m, state, trace) {
  const out = [];
  if (trace && trace.length) out.push(`IA DEPUIS MON DERNIER COUP:\n  ${trace.join('\n  ')}`);
  if (state.over) {
    out.push(`\n=== MATCH TERMINÉ — vainqueur: ${state.winner || 'NUL'} (tour ${state.turn}) ===`);
    console.log(out.join('\n'));
    return;
  }
  const actor = currentFighter(state);
  const view = getView(state, actor.id);
  const api = makeBotApi(view, createRng(hashSeed(`${m.seed}:print:${m.actions.length}`)));
  const you = view.you;
  const enemy = view.enemies.find((f) => !f.isSummon) || view.enemies[0];
  out.push(`\n=== ${m.id} TOUR ${view.turn}/${view.maxTurns} — À MOI: ${you.className || you.classId} (${you.id}${you.isSummon ? ', invoc' : ''}) ===`);
  out.push(board(state, view, api));
  out.push(`légende: @ moi · s allié · E ennemi · z invoc enn. · # mur · o trou · % buisson(LdV) · ^ piège/glyphe · · accessible (PM)`);
  out.push(`MOI  ${you.classId} PV ${you.hp}/${you.maxHp}  PA ${you.pa}  PM ${you.pm}  @(${you.pos.x},${you.pos.y})  | res: ${fmtRes(you)} | effets: ${fmtEffects(you)}`);
  for (const f of view.enemies) {
    const d = Math.abs(f.pos.x - you.pos.x) + Math.abs(f.pos.y - you.pos.y);
    out.push(`LUI  ${f.classId}${f.isSummon ? '(invoc)' : ''} PV ${f.hp}/${f.maxHp}  PA ${f.pa}  PM ${f.pm}  @(${f.pos.x},${f.pos.y})${f.hidden ? ' CACHÉ(dernière pos)' : ''}  dist ${d} | res: ${fmtRes(f)} | effets: ${fmtEffects(f)}`);
  }
  for (const h of view.hazards || []) {
    out.push(`DANGER: ${h.kind || 'hazard'} de ${h.owner || h.team} cells=${(h.cells || []).map((c) => `(${c.x},${c.y})`).join('')} ${h.turnsLeft != null ? h.turnsLeft + 't' : ''}`);
  }
  if (enemy && enemy.spells) {
    const cd = enemy.spells.filter((s) => (s.cooldownLeft || 0) > 0).map((s) => `${s.key}(cd${s.cooldownLeft})`);
    out.push(`SES CD: ${cd.length ? cd.join(' ') : 'tout prêt'}`);
  }
  out.push('MES SORTS (→LUI = castable sur sa case maintenant):');
  const spellLine = (s, tag) => {
    if (!s) return;
    const afford = (s.pa || 0) <= you.pa && (s.cooldownLeft || 0) <= 0 && (s.usesLeft ?? 99) > 0;
    const targets = afford ? api.castTargets(s.key) : [];
    const onEnemy = enemy && afford && api.canCast(s.key, enemy.pos).ok;
    const flags = [s.needsLos === false ? 'sansLdV' : null, s.lineOnly ? 'ligne' : null, s.zone ? 'zone' : null].filter(Boolean).join(',');
    out.push(` ${tag} ${s.key}  PA${s.pa} rng${s.range?.[0] ?? '?'}-${s.range?.[1] ?? '?'}${flags ? '(' + flags + ')' : ''} cd:${s.cooldownLeft || 0}${s.cooldown ? '/' + s.cooldown : ''} uses:${s.usesLeft ?? '∞'} crit:${s.critChance ?? 0}%  ${fmtSpellEffects(s)}  ${afford ? `| cibles:${targets.length}${onEnemy ? ' →LUI ✓' : ''}` : '| INDISPONIBLE'}`);
  };
  (you.spells || []).forEach((s, i) => spellLine(s, `[${i}]`));
  spellLine(you.weaponSpell, '[W]');
  console.log(out.join('\n'));
}

function main() {
  const { cmd, args } = parseArgs(process.argv);
  if (cmd === 'new') {
    const m = {
      id: args.id, me: args.me, opp: args.opp, mapId: args.map || 'arene',
      seed: Number(args.seed || 1), model: args.model || DEFAULT_MODEL, actions: [],
    };
    const net = makeNetBot(m.model);
    let state = rebuild(m);
    const trace = [];
    state = advance(state, m, net, trace);
    saveMatch(m);
    printState(m, state, trace);
    return;
  }
  const m = loadMatch(args.id);
  const net = makeNetBot(m.model);
  if (cmd === 'state') {
    printState(m, rebuild(m), null);
    return;
  }
  if (cmd === 'log') {
    console.log(m.actions.map((r, i) => `${i} ${r.by}: ${fmtAction(r.a)}`).join('\n'));
    return;
  }
  if (cmd === 'act') {
    let state = rebuild(m);
    if (state.over) { printState(m, state, null); return; }
    const actor = currentFighter(state);
    if (actor.team !== MY_SIDE) { console.log('PAS MON TOUR (incohérence)'); return; }
    const action = JSON.parse(args.action);
    const before = snapshotHp(state);
    const result = applyAction(state, action);
    if (!result.ok) {
      console.log(`REFUSÉ: ${fmtAction(action)} — ${result.reason || JSON.stringify(Object.fromEntries(Object.entries(result).filter(([k]) => k !== 'state')))}`);
      printState(m, state, null);
      return;
    }
    state = result.state;
    m.actions.push({ by: actor.id, a: action });
    console.log(`OK: ${fmtAction(action)}${hpDelta(before, state)}`);
    const trace = [];
    const nowActor = state.over ? null : currentFighter(state);
    if (!state.over && nowActor.team !== MY_SIDE) state = advance(state, m, net, trace);
    saveMatch(m);
    printState(m, state, trace);
    return;
  }
  console.log('commandes: new | state | act | log');
}

main();
