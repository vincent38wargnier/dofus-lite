import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import AiStudio from '../ui/AiStudio';
import { useCustomBots, listAllBots } from '../ui/botsStore';
import { flowToCode, makeFlow } from '../bots/visualGraph';

function Studio(){const props=useCustomBots();return <AiStudio {...props} allBots={listAllBots(props.customBots)}/>;}
beforeEach(()=>{localStorage.clear();localStorage.setItem('koliseum.ai-studio.v1',JSON.stringify({active:'maison',drafts:{}}));});
const advanced=()=>fireEvent.click(screen.getByRole('button',{name:'Ouvrir les blocs et le code'}));
function renderStudio(){const mounted=render(<Studio/>);advanced();return mounted;}
afterEach(cleanup);
test('Maison stays protected; a visual copy can be edited, saved and restored without changing the reference',()=>{
  const mounted=renderStudio();
  expect(screen.getByLabelText('Nom de l’IA')).toHaveValue('IA Maison');expect(screen.getByLabelText('Nom de l’IA')).toBeDisabled();
  fireEvent.click(screen.getByRole('button',{name:'Créer ma version'}));
  fireEvent.change(screen.getByLabelText('Nom de l’IA'),{target:{value:'Mon cerveau'}});
  fireEvent.change(screen.getByLabelText('Dégâts utiles'),{target:{value:'1.75'}});
  fireEvent.click(screen.getByRole('button',{name:'Enregistrer',exact:true}));
  let bots=JSON.parse(localStorage.getItem('koliseum.bots.v1'));
  expect(bots).toHaveLength(1);expect(bots[0].flow.nodes[1].config.weights.damage).toBe(1.75);
  expect(bots[0].code).toBe(flowToCode(bots[0].flow));
  mounted.unmount();renderStudio();expect(screen.getByLabelText('Nom de l’IA')).toHaveValue('Mon cerveau');
  fireEvent.click(screen.getByText('Explorer les IA du jeu'));fireEvent.click(screen.getByRole('button',{name:/^.*IA Maison Cerveau inspectable$/}));
  expect(screen.getByLabelText('Nom de l’IA')).toHaveValue('IA Maison');expect(screen.getByLabelText('Nom de l’IA')).toBeDisabled();
  bots=JSON.parse(localStorage.getItem('koliseum.bots.v1'));expect(bots[0].name).toBe('Mon cerveau');
});
test('conditions, connections, undo and code always describe the same graph',()=>{
  renderStudio();fireEvent.click(screen.getByRole('button',{name:'Créer mon IA'}));fireEvent.click(screen.getByRole('button',{name:'Créer sa stratégie'}));fireEvent.click(screen.getByRole('button',{name:/^Protectrice/}));advanced();
  fireEvent.click(screen.getByRole('button',{name:'Configurer Un allié en danger ?'}));
  fireEvent.change(screen.getByLabelText('Seuil'),{target:{value:'55'}});
  fireEvent.change(screen.getByLabelText('Destination Oui'),{target:{value:'brain'}});
  fireEvent.click(screen.getByRole('button',{name:'Annuler la modification'}));
  expect(screen.getByLabelText('Destination Oui')).toHaveValue('heal');
  fireEvent.click(screen.getByRole('button',{name:'Code généré'}));expect(screen.getByLabelText('Code de l’IA').value).toContain('value < 55');
  fireEvent.click(screen.getByRole('button',{name:'Logique visuelle'}));
  fireEvent.click(screen.getByRole('button',{name:'Configurer IA Maison'}));fireEvent.change(screen.getByLabelText('Destination Impossible'),{target:{value:'health'}});
  expect(screen.getByRole('alert')).toHaveTextContent('Boucle');expect(screen.getByLabelText('Destination Impossible')).toHaveValue('end');
});
test('legacy JavaScript bots remain editable and are not silently replaced by graphs',()=>{
  const code='function decide(v,a){return a.endTurn();}';localStorage.setItem('koliseum.bots.v1',JSON.stringify([{id:'custom-old',name:'Ancien bot',code,custom:true}]));
  renderStudio();fireEvent.click(screen.getByRole('button',{name:/Ancien bot JavaScript/}));advanced();
  expect(screen.getByLabelText('Code de l’IA')).toHaveValue(code);expect(screen.getByRole('button',{name:'Logique visuelle'})).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Code de l’IA'),{target:{value:'function decide(v,a){return a.maison();}'}});
  fireEvent.click(screen.getByRole('button',{name:'Enregistrer',exact:true}));
  const saved=JSON.parse(localStorage.getItem('koliseum.bots.v1'));expect(saved).toHaveLength(1);expect(saved[0].flow).toBeNull();expect(saved[0].code).toContain('a.maison()');
});
test('adding a block inserts a fallback and removing it restores the connection',()=>{
  renderStudio();fireEvent.click(screen.getByRole('button',{name:'Créer ma version'}));
  fireEvent.click(screen.getByRole('button',{name:'Ajouter un bloc'}));fireEvent.click(screen.getByRole('button',{name:/^Attaquer Sinon/}));
  fireEvent.click(screen.getByRole('button',{name:'Enregistrer',exact:true}));
  const added=JSON.parse(localStorage.getItem('koliseum.bots.v1'))[0];expect(added.flow.nodes).toHaveLength(10);expect(added.flow.nodes.find(n=>n.config?.stage==='choose').links.fallback).not.toBe('end');
  fireEvent.click(screen.getByRole('button',{name:'Retirer ce bloc'}));fireEvent.click(screen.getByRole('button',{name:'Enregistrer',exact:true}));
  const removed=JSON.parse(localStorage.getItem('koliseum.bots.v1'))[0];expect(removed.flow.nodes).toHaveLength(9);expect(removed.flow.nodes.find(n=>n.config?.stage==='choose').links.fallback).toBe('end');
});
test('a saved graph is available through the ordinary bot compiler interface',()=>{
  const flow=makeFlow('prudent');localStorage.setItem('koliseum.bots.v1',JSON.stringify([{id:'custom-graph',name:'Sentinelle enregistrée',flow,code:flowToCode(flow),custom:true}]));
  renderStudio();fireEvent.click(screen.getByRole('button',{name:/Sentinelle enregistrée Graphe visuel/}));advanced();
  expect(screen.getByRole('button',{name:'Logique visuelle'})).toBeEnabled();expect(screen.getByRole('button',{name:'Configurer Un allié en danger ?'})).toBeInTheDocument();
});
test('storage failure keeps the editable draft without publishing a disappearing bot',()=>{
  renderStudio();fireEvent.click(screen.getByRole('button',{name:'Créer ma version'}));
  const original=Storage.prototype.setItem;
  const spy=jest.spyOn(Storage.prototype,'setItem').mockImplementation(function(key,value){if(key==='koliseum.bots.v1')throw new Error('Quota exceeded');return original.call(this,key,value);});
  fireEvent.click(screen.getByRole('button',{name:'Enregistrer',exact:true}));
  expect(screen.getByRole('alert')).toHaveTextContent('Enregistrement impossible');expect(localStorage.getItem('koliseum.bots.v1')).toBeNull();expect(screen.getByLabelText('Nom de l’IA')).toBeEnabled();spy.mockRestore();
});
test('undo after first publication keeps editing the same saved bot',()=>{
  renderStudio();fireEvent.click(screen.getByRole('button',{name:'Créer ma version'}));
  fireEvent.change(screen.getByLabelText('Dégâts utiles'),{target:{value:'1.75'}});fireEvent.click(screen.getByRole('button',{name:'Enregistrer',exact:true}));
  const id=JSON.parse(localStorage.getItem('koliseum.bots.v1'))[0].id;
  fireEvent.click(screen.getByRole('button',{name:'Annuler la modification'}));fireEvent.click(screen.getByRole('button',{name:'Enregistrer',exact:true}));
  const bots=JSON.parse(localStorage.getItem('koliseum.bots.v1'));expect(bots).toHaveLength(1);expect(bots[0].id).toBe(id);expect(bots[0].flow.nodes[1].config.weights.damage).toBeUndefined();
});

test('Maison opens as seven real stages and exposes readable source without changing the protected bot',()=>{
  renderStudio();
  expect(document.querySelectorAll('.type-maison-stage')).toHaveLength(7);
  fireEvent.click(screen.getByRole('button',{name:'Configurer Anticiper les enchaînements'}));
  expect(screen.getByLabelText('Anticiper les attaques suivantes')).toBeDisabled();
  expect(screen.getByLabelText('Poids des attaques suivantes')).toHaveValue(.85);
  fireEvent.click(screen.getByRole('button',{name:'Code de cette étape'}));
  expect(screen.getByRole('dialog',{name:'Code interne de Maison'})).toHaveTextContent('bestBudget(options, boosted.pa)');
  fireEvent.change(screen.getByLabelText('Étape du code Maison'),{target:{value:'movement'}});
  expect(screen.getByRole('dialog')).toHaveTextContent('W.lookahead * (future - bestCast.score)');
  fireEvent.click(screen.getByRole('button',{name:'Fermer le code interne'}));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(localStorage.getItem('koliseum.bots.v1')).toBeNull();
});
test('an editable pipeline preserves custom rules across folding, expansion, save and reload',()=>{
  const mounted=renderStudio();fireEvent.click(screen.getByRole('button',{name:'Créer ma version'}));
  fireEvent.click(screen.getByRole('button',{name:'Configurer Anticiper les enchaînements'}));
  fireEvent.click(screen.getByLabelText('Anticiper les attaques suivantes'));
  fireEvent.change(screen.getByLabelText('Poids des attaques suivantes'),{target:{value:'0.5'}});
  fireEvent.click(screen.getByRole('button',{name:'Replier le cerveau'}));expect(document.querySelectorAll('.type-maison-stage')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button',{name:'Déplier le cerveau'}));expect(document.querySelectorAll('.type-maison-stage')).toHaveLength(7);
  fireEvent.click(screen.getByRole('button',{name:'Configurer Anticiper les enchaînements'}));
  expect(screen.getByLabelText('Anticiper les attaques suivantes')).not.toBeChecked();expect(screen.getByLabelText('Poids des attaques suivantes')).toHaveValue(.5);
  fireEvent.click(screen.getByRole('button',{name:'Enregistrer',exact:true}));
  const saved=JSON.parse(localStorage.getItem('koliseum.bots.v1'))[0];expect(saved.code).toContain('api.maisonPipeline');
  mounted.unmount();renderStudio();fireEvent.click(screen.getByRole('button',{name:'Configurer Anticiper les enchaînements'}));
  expect(screen.getByLabelText('Anticiper les attaques suivantes')).not.toBeChecked();expect(screen.getByLabelText('Poids des attaques suivantes')).toHaveValue(.5);
});
test('old saved visual bots stay compact while the readonly Maison reference refreshes',()=>{
  const flow=makeFlow();localStorage.setItem('koliseum.ai-studio.v1',JSON.stringify({active:'maison',drafts:{maison:{id:'maison',name:'IA Maison',graph:flow,code:flowToCode(flow)}}}));
  localStorage.setItem('koliseum.bots.v1',JSON.stringify([{id:'custom-legacy-flow',name:'Ancien graphe',flow,code:flowToCode(flow),custom:true}]));
  renderStudio();expect(document.querySelectorAll('.type-maison-stage')).toHaveLength(7);
  fireEvent.click(screen.getByRole('button',{name:/Ancien graphe Graphe visuel/}));advanced();expect(document.querySelectorAll('.type-maison-stage')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button',{name:'Déplier le cerveau'}));expect(document.querySelectorAll('.type-maison-stage')).toHaveLength(7);
});
