import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';
import { inspectAiSource, checkAiCode, checkAiAction, aiTestCases, benchmarkAiCode } from '../bots/aiCodeTesting';
import { codingProjectFiles, buildCodingPrompt, downloadAiCodingProject } from '../bots/aiCodingProject';
import { makeFlow, flowToCode } from '../bots/visualGraph';
import { CLASS_IDS } from '../engine/classes';
import { emptyLoadout } from '../engine/equipment';
import { starterSpell } from '../ui/workshopStarters';
import AiStudio from '../ui/AiStudio';
import { listAllBots, useCustomBots } from '../ui/botsStore';

jest.mock('../bots/aiCodingProject', () => ({ ...jest.requireActual('../bots/aiCodingProject'), downloadAiCodingProject: jest.fn() }));
beforeAll(() => { global.TextEncoder = TextEncoder; global.TextDecoder = TextDecoder; });
beforeEach(() => {
  localStorage.clear(); jest.clearAllMocks();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: jest.fn().mockResolvedValue() } });
});
const fighter = { name: 'Invocateur', classId: 'OSAMODAS' };
const pass = 'function decide(view, api) { return api.endTurn(); }';
const maison = 'function decide(view, api) { return api.maison(); }';
function Studio() { const bots = useCustomBots(); return <AiStudio {...bots} allBots={listAllBots(bots.customBots)}/>; }
const click = name => fireEvent.click(screen.getByRole('button', { name }));
const file = (name, text) => ({ name, size: text.length, text: async () => text });

test('syntax inspection never evaluates code and requires a synchronous top-level decide', () => {
  delete global.__aiImported;
  expect(inspectAiSource(`globalThis.__aiImported=1; ${pass}`).ok).toBe(true);
  expect(global.__aiImported).toBeUndefined();
  for (const bad of ['', 'function decide( {', 'function other(){}', 'export function decide(){}', 'async function decide(){}', 'function* decide(){}', 'const decide = async () => 1;']) {
    expect(inspectAiSource(bad).ok).toBe(false);
  }
  expect(inspectAiSource('const decide = (view, api) => api.endTurn();').ok).toBe(true);
});

test.each(CLASS_IDS)('default Maison has legal decisions for %s in the real test situations', classId => {
  const result = checkAiCode({ code: maison, fighter: { classId, name: classId } });
  expect(result.cases).toHaveLength(10);
  expect(result.errors).toEqual([]);
  expect(result.ok).toBe(true);
});

test('test cases include exhausted resources, real cooldowns, allies and hidden information', () => {
  const cases = aiTestCases(fighter);
  expect(cases.find(c => c.name === 'Ennemi invisible').view.enemies[0].hidden).toBe(true);
  const empty = cases.find(c => c.name === 'PA et PM épuisés').view;
  expect([empty.you.pa, empty.you.pm]).toEqual([0, 0]);
  expect(cases.find(c => c.name === 'Allié blessé').view.allies[0].hp).toBe(1);
  expect(cases.find(c => c.name === 'Sorts en relance').view.you.spells.every(s => s.cooldownLeft === 2)).toBe(true);
});

test.each([
  ['function decide() { return {type:"BOGUS"}; }', /inconnu/],
  ['function decide() { return {type:"MOVE",to:{x:10000,y:10000}}; }', /portée/],
  ['function decide(v,a) { return a.cast("invente",v.enemy.pos); }', /inconnu/],
  ['function decide() { throw new Error("KO"); }', /KO/],
  ['function decide() { return Promise.resolve({type:"PASS"}); }', /synchrone/],
  ['function decide(v,a) { return a.neural(); }', /modèles/],
])('checks reject illegal actions, not just syntactically valid code: %s', (code, message) => {
  const result = checkAiCode({ code, fighter });
  expect(result.ok).toBe(false); expect(result.errors.join()).toMatch(message);
});

test('action validation uses an untouched view and respects PA, cooldowns and coordinates', () => {
  const view = aiTestCases(fighter).find(c => c.name === 'PA et PM épuisés').view;
  expect(checkAiAction(view, { type: 'PASS' }).ok).toBe(true);
  expect(checkAiAction(view, { type: 'MOVE', to: { x: 3.2, y: 4 } }).ok).toBe(false);
  expect(checkAiAction(view, { type: 'SAY', text: 'ok' }).ok).toBe(true);
  expect(checkAiAction(view, { type: 'SAY', text: {} }).ok).toBe(false);
  expect(checkAiCode({ code: 'function decide(v,a){v.you.pa=100;return a.cast("crapaud",v.you.pos);}', fighter,
    cases: [{ name: 'No AP', view }] }).ok).toBe(false);
});

test('six real duels are mirrored, reproducible and do not pretend draws are wins', async () => {
  const config = { code: pass, opponentCode: pass, fighter: { classId: 'IOP' }, seed: 5600, count: 6 };
  const result = await benchmarkAiCode(config);
  expect(result.ok).toBe(true); expect(result.comparisonValid).toBe(true);
  expect(result.summary).toMatchObject({ wins: 0, losses: 0, draws: 6, invalidActions: 0, errors: 0 });
  expect(result.games.map(g => [g.mapId, g.side, g.seed])).toEqual([
    ['arene','A',5600],['arene','B',5600],['muraille','A',5601],['muraille','B',5601],['canyon','A',5602],['canyon','B',5602],
  ]);
  expect(await benchmarkAiCode(config)).toEqual(result);
});

test('match validation catches exceptions and invalid responses after the opening', async () => {
  const code = 'let calls=0; function decide(v,a){if(++calls>1)throw Error("later");return a.endTurn();}';
  const result = await benchmarkAiCode({ code, opponentCode: pass, fighter: { classId: 'IOP' }, count: 1 });
  expect(result.ok).toBe(false); expect(result.summary.errors).toBeGreaterThan(0);
  const invalid = await benchmarkAiCode({ code: 'function decide(){return {type:"FIRE"};}', opponentCode: pass, fighter, count: 1 });
  expect(invalid.ok).toBe(false); expect(invalid.summary.invalidActions).toBeGreaterThan(0);
});

test('project carries the executable source, actual fighter and summon books, not only an API stub', () => {
  const graph = makeFlow(), code = flowToCode(graph);
  const files = codingProjectFiles({ name: 'Osa malin', code, fighter, graph, goal: 'Soigner sous 40 %.', origin: 'http://example.test' }, {
    'runtime.cjs': new Uint8Array([1]), 'test.cjs': new Uint8Array([2]), 'runtime-version.json': new Uint8Array([3]),
    'sources.json': new TextEncoder().encode(JSON.stringify({ 'src/bots/api.js': '// real source' })),
  });
  expect(files.get('bot.js')).toBe(code + '\n');
  expect(JSON.parse(files.get('fighter.json')).classId).toBe('OSAMODAS');
  expect(JSON.parse(files.get('fighter-reference.json')).summons).toHaveLength(7);
  expect(files.get('engine-source/src/bots/api.js')).toBe('// real source');
  expect(files.get('PROMPT.md')).toContain('Soigner sous 40 %.');
  expect(files.get('README.md')).toContain('koliseum.bots.v1');
  expect(files.get('README.md')).toContain('pas de synchronisation automatique');
  expect(files.get('API.md')).toContain('api.canCast(key, target)');
  expect(JSON.parse(files.get('original-flow.json')).graph).toEqual(graph);
});

test('custom loadout and spells travel as data; the kit never substitutes the appearance class', () => {
  const loadout = { ...emptyLoadout('IOP'), level: 200, spells: { custom: [{ ...starterSpell('attack'), name: 'Rayon personnel' }], order: [] } };
  const files = codingProjectFiles({ name: 'Perso', code: pass, fighter: { classId: 'IOP', name: 'Perso', loadout } }, {
    'runtime.cjs': 'runtime', 'test.cjs': 'test', 'runtime-version.json': '{}', 'sources.json': new TextEncoder().encode('{}'),
  });
  expect(JSON.parse(files.get('fighter.json')).loadout).toEqual(loadout);
  expect(files.get('fighter-reference.json')).toContain('Rayon personnel');
  expect(JSON.parse(files.get('example-view.json')).you.level).toBe(200);
});

test('coding prompt requests actual file edits and measured comparisons, not visual JSON', () => {
  const text = buildCodingPrompt({ name: 'Test', fighter, goal: 'Garder la distance' });
  expect(text).toContain('Garder la distance'); expect(text).toContain('bot.js'); expect(text).toContain('node test.cjs benchmark');
  expect(text).toContain('baseline.js'); expect(text).toContain('fighter-reference.json');
  expect(text).not.toContain('retourne uniquement un objet JSON');
});

test('code dialog explains storage, exports selected context and preserves the shared behavior brief', async () => {
  render(<Studio/>); click(/^Osamodas/); click('Code & fichiers');
  const dialog = screen.getByRole('dialog');
  expect(dialog).toHaveTextContent('enregistrée dans ce navigateur');
  fireEvent.change(screen.getByLabelText('Mon plan de jeu'), { target: { value: 'Invoquer puis reculer.' } });
  click('Copier la consigne'); await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled());
  expect(navigator.clipboard.writeText.mock.calls[0][0]).toContain('Invoquer puis reculer.');
  downloadAiCodingProject.mockResolvedValue(12); click('Télécharger le projet');
  await waitFor(() => expect(within(dialog).getByRole('status')).toHaveTextContent('ZIP préparé'));
  expect(downloadAiCodingProject.mock.calls[0][0]).toMatchObject({ fighter: { classId: 'OSAMODAS' }, goal: 'Invoquer puis reculer.' });
  click('Fermer les fichiers IA'); click('Créer sa stratégie'); click('Préparer mon prompt');
  expect(screen.getByLabelText('Mon idée')).toHaveValue('Invoquer puis reculer.');
});

test('JS import creates a separate draft without running it, keeps selected fighter, saves and reloads', async () => {
  let mounted = render(<Studio/>); click(/^Osamodas/); click('Créer sa stratégie'); click(/^Enregistrer$/);
  const original = JSON.parse(localStorage.getItem('koliseum.bots.v1'));
  delete global.__aiImported;
  fireEvent.change(screen.getByLabelText('Importer une IA visuelle ou JavaScript'), { target: { files: [file('Osa externe.js', `globalThis.__aiImported=1;\n${pass}`)] } });
  await waitFor(() => expect(screen.getByLabelText('Nom de l’IA')).toHaveValue('Osa externe'));
  expect(global.__aiImported).toBeUndefined(); expect(screen.getByLabelText('Code de l’IA')).toHaveValue(`globalThis.__aiImported=1;\n${pass}`);
  expect(JSON.parse(localStorage.getItem('koliseum.bots.v1'))).toEqual(original);
  click(/^Enregistrer$/); expect(global.__aiImported).toBe(1); delete global.__aiImported;
  const saved = JSON.parse(localStorage.getItem('koliseum.bots.v1'));
  expect(saved).toHaveLength(2); expect(saved[1].flow).toBeNull(); expect(saved[1].classId).toBe('OSAMODAS');
  mounted.unmount(); mounted = render(<Studio/>);
  expect(screen.getByLabelText('Nom de l’IA')).toHaveValue('Osa externe');
});

test('malformed code import and unavailable download report errors without discarding the current AI', async () => {
  render(<Studio/>); click('Créer sa stratégie');
  fireEvent.change(screen.getByLabelText('Importer une IA visuelle ou JavaScript'), { target: { files: [file('bad.js', 'function nope(')] } });
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Import refusé'));
  expect(screen.getByLabelText('Nom de l’IA')).toHaveValue('Mon IA');
  click('Code & fichiers'); downloadAiCodingProject.mockRejectedValue(new Error('Réseau absent')); click('Télécharger le projet');
  await waitFor(() => expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('Réseau absent'));
  expect(screen.queryByText(/ZIP préparé/)).not.toBeInTheDocument();
});

test('a JavaScript copy retains its fighter, and saving rejects an illegal action', () => {
  render(<Studio/>); click(/^Osamodas/); click('Créer sa stratégie');
  click('Ouvrir les blocs et le code'); click('Code généré'); click('Créer une copie JavaScript');
  expect(screen.getByRole('button', { name: /Mon combattant Osamodas/ })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Code de l’IA'), { target: { value: 'function decide(){return {type:"INVALID"};}' } });
  click(/^Enregistrer$/);
  expect(screen.getByRole('alert')).toHaveTextContent('Type d\'action inconnu');
  expect(localStorage.getItem('koliseum.bots.v1')).toBeNull();
});
