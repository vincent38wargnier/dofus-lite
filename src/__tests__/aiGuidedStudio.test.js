import React from 'react';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AiStudio from '../ui/AiStudio';
import { useCustomBots, listAllBots } from '../ui/botsStore';
import { aiFighterChoices, aiFighterSnapshot, buildAiPrompt, parseAiResponse } from '../bots/aiAuthoring';
import { makeFlow, visualBotPackage, flowToCode } from '../bots/visualGraph';
import { CLASS_IDS } from '../engine/classes';
import { emptyLoadout } from '../engine/equipment';
import { starterSpell } from '../ui/workshopStarters';
import { runFlowLab } from '../bots/flowLab';

jest.mock('../bots/flowLab',()=>({...jest.requireActual('../bots/flowLab'),runFlowLab:jest.fn()}));
function Studio(props){const bots=useCustomBots();return <AiStudio {...bots} allBots={listAllBots(bots.customBots)} {...props}/>;}
const click=name=>fireEvent.click(screen.getByRole('button',{name}));
beforeEach(()=>{localStorage.clear();jest.clearAllMocks();Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:jest.fn().mockResolvedValue(undefined)}});});

test.each(CLASS_IDS)('the %s prompt contains actual spell costs, targeting, effects and a valid importable example',classId=>{
  const fighter={id:classId,classId,name:classId},snapshot=aiFighterSnapshot(fighter);
  const prompt=buildAiPrompt({fighter,snapshot,goal:'Battre Maison sans gaspiller mes PA'});
  expect(prompt).toContain('Battre Maison sans gaspiller mes PA');
  for(const s of snapshot.spells){expect(prompt).toContain(JSON.stringify(s.key));expect(prompt).toContain(`"pa": ${s.pa}`);}
  expect(prompt).toContain('needsLos');expect(prompt).toContain('usesPerTarget');expect(prompt).toContain('boost + attaques');expect(prompt).toContain('position invisible');
  const example=prompt.split('EXEMPLE IMPORTABLE\n')[1].split('\n\nSTRATÉGIE')[0];
  expect(parseAiResponse(example).graph).toEqual(makeFlow('prudent'));
});

test('custom spells and equipped stats, not the appearance class spells, enter the prompt',()=>{
  const spell={...starterSpell('attack'),name:'Flamme personnelle'},loadout={...emptyLoadout('IOP'),level:200,spells:{custom:[spell],order:[]}};
  const choices=aiFighterChoices([{id:'p',name:'Testeur',classId:'IOP',loadout}],[{id:'c',name:'Création',classId:'CRA',loadout}]);
  expect(choices[0].loadout).toBe(loadout);expect(choices[1].id).toBe('creation:c');
  const snapshot=aiFighterSnapshot(choices[0]),prompt=buildAiPrompt({fighter:choices[0],snapshot});
  expect(snapshot.level).toBe(200);expect(prompt).toContain('Flamme personnelle');expect(snapshot.spells.some(s=>s.key==='epee_de_iop')).toBe(false);
});

test('pasted responses accept a JSON fence, reject malformed or cyclic programs and never trust supplied JS',()=>{
  const pkg={...visualBotPackage('Coach',makeFlow()),code:'throw Error("bad")'};
  expect(parseAiResponse('```json\n'+JSON.stringify(pkg)+'\n```')).toEqual(visualBotPackage('Coach',makeFlow()));
  expect(()=>parseAiResponse('function decide(){return 1;}')).toThrow();
  expect(()=>parseAiResponse(' '.repeat(250001))).toThrow(/250/);
  pkg.graph.nodes[1].links.fallback='start';expect(()=>parseAiResponse(JSON.stringify(pkg))).toThrow();
});

test('coaching can repair an incomplete draft without crashing or accepting it as a runnable AI',()=>{
  const fighter={classId:'OSAMODAS',name:'Invocateur'},snapshot=aiFighterSnapshot(fighter),graph=makeFlow();
  graph.nodes[1].links.fallback='missing';
  const prompt=buildAiPrompt({fighter,snapshot,graph});
  expect(prompt).toContain('Ce brouillon est incomplet');expect(prompt).toContain('reliez la sortie');expect(prompt).toContain('summonLimit');
  expect(()=>parseAiResponse(JSON.stringify({format:'koliseum-visual-ai',version:1,name:'Incomplet',graph}))).toThrow();
});

test('first visit is guided, a manual strategy and its selected class save and reload without code',()=>{
  let mounted=render(<Studio/>);
  expect(screen.getByRole('heading',{name:'Qui allez-vous rendre imbattable ?'})).toBeInTheDocument();
  expect(screen.queryByRole('region',{name:'Graphe de décision'})).not.toBeInTheDocument();
  click(/^Cra/);click('Créer sa stratégie');
  fireEvent.change(screen.getByLabelText('Nom de l’IA'),{target:{value:'Mon archer'}});click(/^Offensive/);
  fireEvent.change(screen.getByLabelText('Éviter les risques'),{target:{value:'2.4'}});click(/^Enregistrer$/);
  const saved=JSON.parse(localStorage.getItem('koliseum.bots.v1'))[0];
  expect(saved.classId).toBe('CRA');expect(saved.fighterId).toBe('CRA');expect(saved.flow.nodes[1].config.weights.threat).toBe(2.4);expect(saved.code).toBe(flowToCode(saved.flow));
  mounted.unmount();mounted=render(<Studio/>);
  expect(screen.getByLabelText('Nom de l’IA')).toHaveValue('Mon archer');expect(screen.getByLabelText('Éviter les risques')).toHaveValue('2.4');
  click('Passer au défi');expect(screen.getByRole('combobox',{name:'Combattant adverse'})).toHaveValue('same');
});

test('ChatGPT flow copies a fighter-specific prompt, refuses invalid replies, creates an independent draft and preserves original',async()=>{
  render(<Studio/>);click('Créer sa stratégie');fireEvent.change(screen.getByLabelText('Nom de l’IA'),{target:{value:'Original'}});click(/^Enregistrer$/);click('Préparer mon prompt');
  fireEvent.change(screen.getByLabelText('Mon idée'),{target:{value:'Soigner mes alliés en priorité'}});click('Copier le prompt');
  await waitFor(()=>expect(navigator.clipboard.writeText).toHaveBeenCalled());expect(navigator.clipboard.writeText.mock.calls[0][0]).toContain('Soigner mes alliés en priorité');
  fireEvent.change(screen.getByLabelText('Réponse de ChatGPT'),{target:{value:'not json'}});click('Vérifier et créer mon IA');
  expect(within(screen.getByRole('dialog')).getByRole('alert')).toBeInTheDocument();expect(JSON.parse(localStorage.getItem('koliseum.bots.v1'))).toHaveLength(1);
  const graph=makeFlow();graph.nodes[1].config={kind:'spell',base:'maison',weights:{},spellKey:'invented'};
  fireEvent.change(screen.getByLabelText('Réponse de ChatGPT'),{target:{value:JSON.stringify(visualBotPackage('Bad',graph))}});click('Vérifier et créer mon IA');expect(screen.getByRole('alert')).toHaveTextContent('Sort absent');
  fireEvent.change(screen.getByLabelText('Réponse de ChatGPT'),{target:{value:JSON.stringify(visualBotPackage('Coach',makeFlow('prudent')))}});click('Vérifier et créer mon IA');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(screen.getByLabelText('Nom de l’IA')).toHaveValue('Coach');click(/^Enregistrer$/);
  const saved=JSON.parse(localStorage.getItem('koliseum.bots.v1'));expect(saved.map(b=>b.name)).toEqual(['Original','Coach']);expect(saved[0].flow).toEqual(makeFlow());
});

test('a denied clipboard still offers the full prompt and never reports a successful copy',async()=>{
  navigator.clipboard.writeText.mockRejectedValue(new Error('denied'));
  render(<Studio/>);click('Créer sa stratégie');click('Préparer mon prompt');click('Copier le prompt');
  await waitFor(()=>expect(within(screen.getByRole('dialog')).getByRole('status')).toHaveTextContent('Copie automatique indisponible'));
  expect(screen.getByRole('button',{name:'Copier le prompt'})).toBeInTheDocument();expect(screen.getByLabelText('Prompt complet').value).toContain('EXEMPLE IMPORTABLE');
});

test('behavior brief is guided, fighter-specific and survives dialog close, import, save and reload', async () => {
  let mounted = render(<Studio/>);
  click(/^Osamodas/); click('Créer sa stratégie'); click('Préparer mon prompt');
  expect(screen.getByRole('heading', { name: /Comment votre IA doit-elle jouer/ })).toBeInTheDocument();
  expect(screen.getByLabelText('Informations incluses dans le prompt')).toHaveTextContent('7 invocations');
  fireEvent.click(screen.getByText('Un exemple pour Osamodas'));
  click('Utiliser cet exemple');
  expect(screen.getByLabelText('Mon idée').value).toContain('Invocation de Tofu');
  fireEvent.change(screen.getByLabelText('Mon idée'), { target: { value: 'Invoquer sans bloquer mes alliés. Reculer sous 40 % de PV.' } });
  click('Copier le prompt');
  await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled());
  expect(navigator.clipboard.writeText.mock.calls[0][0]).toContain('Reculer sous 40 %');
  click('Fermer le prompt'); click('Préparer mon prompt');
  expect(screen.getByLabelText('Mon idée').value).toContain('Reculer sous 40 %');
  fireEvent.change(screen.getByLabelText('Réponse de ChatGPT'), { target: { value: JSON.stringify(visualBotPackage('Invocateur prudent', makeFlow('prudent'))) } });
  click('Vérifier et créer mon IA'); click(/^Enregistrer$/);
  mounted.unmount(); mounted = render(<Studio/>); click('Préparer mon prompt');
  expect(screen.getByLabelText('Mon idée').value).toContain('Reculer sous 40 %');
  click('Fermer le prompt'); click(/Mon combattant/); click(/^Cra/); click('Créer sa stratégie'); click('Préparer mon prompt');
  expect(screen.getByLabelText('Mon idée')).toHaveValue('');
  expect(screen.getByLabelText('Informations incluses dans le prompt')).not.toHaveTextContent('7 invocations');
  click('Fermer le prompt'); click(/Mon combattant/); click(/^Osamodas/); click('Créer sa stratégie'); click('Préparer mon prompt');
  expect(screen.getByLabelText('Mon idée').value).toContain('Reculer sous 40 %');
});

test('a measured challenge keeps the results primary, injects evidence into the improvement prompt and opens exact saved combat settings',async()=>{
  const watch=jest.fn(),snapshot=aiFighterSnapshot({classId:'IOP',name:'Iop'});
  const game={outcome:'win',turns:7,stats:{damageDealt:222,invalid:0,errors:0},remainingHp:100,opponentHp:0,entries:[{turn:1,view:{you:snapshot},action:{type:'PASS'},steps:[],plans:[]}],totalDecisions:1,mapId:'arene',side:'A',seed:12000,events:[]};
  runFlowLab.mockImplementation(async (config,handlers)=>{handlers.onGame(game);return [game];});
  render(<Studio onWatch={watch}/>);click('Créer sa stratégie');click(/^Enregistrer$/);click('Passer au défi');click('Lancer un duel');
  await screen.findByRole('heading',{name:'Victoire'});
  await waitFor(()=>expect(screen.getByRole('button',{name:'Améliorer avec ChatGPT'})).toBeEnabled());
  expect(screen.queryByText('Lecture d’une décision enregistrée · version testée')).not.toBeInTheDocument();
  expect(runFlowLab.mock.calls[0][0].mine).toEqual(runFlowLab.mock.calls[0][0].opponent);
  click('Améliorer avec ChatGPT');expect(screen.getByLabelText('Prompt complet').value).toContain('"damageDealt": 222');click('Fermer le prompt');
  click('Regarder le duel');expect(watch).toHaveBeenCalledWith(expect.objectContaining({botA:JSON.parse(localStorage.getItem('koliseum.bots.v1'))[0].id,botB:'brutus',classA:'IOP',classB:'IOP',seed:12000}));
  click('Lancer un duel');await screen.findByText(/Test précédent/);
  click('Ajuster ma stratégie');fireEvent.change(screen.getByLabelText('Infliger des dégâts'),{target:{value:'2'}});click('Passer au défi');expect(screen.getByText(/Les réglages ont changé/)).toBeInTheDocument();expect(screen.queryByRole('button',{name:'Regarder le duel'})).not.toBeInTheDocument();
});
