import { createGame, getView, currentFighter, applyAction } from '../engine/engine';
import { makeBotApi } from '../bots/api';
import { createRng } from '../engine/rng';
import { compileBot } from '../bots/compile';
import { makeMaisonFlow, makeFlow, flowToCode, expandMaison, collapseMaison, flowErrors, parseVisualBot, visualBotPackage, maisonGroupConfig } from '../bots/visualGraph';
import { MAISON_STAGES, MAISON_CONTROLS, maisonSettingsErrors } from '../bots/maisonStages';
import BASELINE from './fixtures/maison-before-stages.json';
import SOURCE from '../bots/maisonSource.json';

const execute=compileBot(flowToCode(makeMaisonFlow()));
function scenario(spec) {
  const {classId,enemyClass,variant,seed}=spec;
  const {state}=createGame({mapId:'arene',seed,fighters:[{id:'A',name:'Test',classId},{id:'B',name:'Adversaire',classId:enemyClass}]});
  state.currentIndex=state.order.indexOf('A');state.fighters.A.pos={x:4,y:5};state.fighters.B.pos={x:variant%2?10:6,y:5};
  if(variant>=2)state.fighters.A.hp=Math.floor(state.fighters.A.maxHp*.25);
  if(variant===4)state.fighters.A.pa=0;
  if(variant===5)state.fighters.A.pm=0;
  return state;
}
function run(state,graph=makeMaisonFlow()) {
  const view=getView(state,'A'),api=makeBotApi(view,createRng(88)),trace=[],reports=[];
  api.flowTrace=s=>trace.push(s);api.flowInspect=p=>reports.push(p);
  const action=compileBot(flowToCode(graph))(view,api);
  return {action,trace,report:reports[0],reports};
}
test.each(BASELINE.cases)('frozen pre-refactor decision remains identical: $classId / variant $variant',spec=>{
  const state=scenario(spec),view=getView(state,'A'),before=JSON.stringify(view);
  expect(makeBotApi(view,createRng(88)).maison()).toEqual(spec.action);
  expect(execute(view,makeBotApi(view,createRng(88)))).toEqual(spec.action);
  const result=run(state);expect(result.action).toEqual(spec.action);
  expect(result.trace.filter(s=>s.stage).map(s=>s.stage.stage)).toEqual(MAISON_STAGES.map(s=>s.id));
  expect(result.report.selected).toEqual(spec.action);expect(JSON.stringify(view)).toBe(before);
});
test.each(BASELINE.sequences)('sequential pre-refactor decisions remain identical for $classId',spec=>{
  let {state}=createGame({mapId:spec.mapId,seed:spec.seed,fighters:[{id:'A',name:'A',classId:spec.classId},{id:'B',name:'B',classId:spec.enemyClass}]});
  for(const [step,expected] of spec.actions.entries()){
    expect(currentFighter(state).id).toBe(expected.id);
    const view=getView(state,expected.id),api=makeBotApi(view,createRng(99+step));
    const action=execute(view,api);expect(action).toEqual(expected.action);
    const next=applyAction(state,action);expect(next.ok).toBe(expected.ok);
    if(!next.ok)break;state=next.state;
  }
});
test('each stage executes lazily, in order, once; the final action is remembered once',()=>{
  const state=scenario(BASELINE.cases[0]),view=getView(state,'A'),api=makeBotApi(view,createRng(1)),inspect=jest.fn();
  const memory=jest.spyOn(api,'rememberDecision');
  const session=api.maisonPipeline({base:'maison',kind:'auto',weights:{}},inspect);
  expect(memory).not.toHaveBeenCalled();expect(inspect).not.toHaveBeenCalled();
  expect(()=>session.step('spells')).toThrow(/ordre/);
  for(const s of MAISON_STAGES.slice(0,-1)){expect(session.step(s.id).stage).toBe(s.id);expect(memory).not.toHaveBeenCalled();}
  const final=session.step('choose');expect(final.action).toEqual(BASELINE.cases[0].action);
  expect(memory).toHaveBeenCalledTimes(1);expect(inspect).toHaveBeenCalledTimes(1);
  expect(()=>session.step('choose')).toThrow(/ordre/);
});
test('no enemies returns PASS through a complete trace without inventing calculations',()=>{
  const state=scenario(BASELINE.cases[0]);state.fighters.B.hp=0;
  const result=run(state);expect(result.action).toEqual({type:'PASS'});
  expect(result.trace.filter(s=>s.stage?.skipped)).toHaveLength(6);expect(result.report.candidates).toEqual([]);
});
test('movement and combo switches change the real calculation; collapse preserves them',()=>{
  const state=scenario(BASELINE.cases[4]),g=makeMaisonFlow();
  g.nodes.find(n=>n.config?.stage==='movement').config.settings.movementEnabled=false;
  expect(run(state,g).action).toEqual({type:'PASS'});
  const combat=scenario(BASELINE.cases[0]);
  const defaultRun=run(combat);expect(defaultRun.report.candidates.some(c=>c.continuation>0)).toBe(true);
  g.nodes.find(n=>n.config?.stage==='combos').config.settings.combosEnabled=false;
  const changed=run(combat,g);expect(changed.report.candidates.every(c=>c.continuation===0)).toBe(true);
  const compact=collapseMaison(g,'brain');expect(flowErrors(compact)).toEqual([]);
  expect(run(combat,compact).action).toEqual(changed.action);
  expect(maisonGroupConfig(expandMaison(compact,'brain'),'brain')).toEqual(maisonGroupConfig(g,'brain'));
});
test('target rules select different visible placement targets',()=>{
  const {state}=createGame({mapId:'arene',seed:1,fighters:[{id:'A',team:'A',classId:'IOP'},{id:'B',team:'B',classId:'IOP'},{id:'C',team:'B',classId:'CRA'}]});
  state.currentIndex=state.order.indexOf('A');state.fighters.A.pos={x:3,y:3};state.fighters.B.pos={x:4,y:3};state.fighters.C.pos={x:9,y:3};state.fighters.C.hp=15;
  const g=makeMaisonFlow(),config=g.nodes.find(n=>n.config?.stage==='target').config;
  config.settings.targetPolicy='nearest';expect(run(state,g).report.target.id).toBe('B');
  config.settings.targetPolicy='weakest';expect(run(state,g).report.target.id).toBe('C');
});
test('whole pipelines can branch and fall through; expanded programs round-trip',()=>{
  let graph=expandMaison(expandMaison(makeFlow('prudent'),'brain'),'heal');
  const state=scenario(BASELINE.cases[2]);
  const result=run(state,graph);expect(result.reports).toHaveLength(2);expect(result.reports[0].selected.type).toBe('PASS');
  const imported=parseVisualBot(JSON.stringify(visualBotPackage('Two brains',graph)));
  expect(flowToCode(imported.graph)).toBe(flowToCode(graph));
  expect(run(state,imported.graph).action).toEqual(result.action);
});
test('broken dependencies, partial pipelines, external jumps and invalid search settings are rejected',()=>{
  const g=makeMaisonFlow();g.nodes.find(n=>n.config?.stage==='spells').links.next='brain-movement';
  expect(flowErrors(g).join()).toMatch(/ordre/);
  const jump=makeMaisonFlow();jump.nodes[0].links.next='brain-combos';expect(flowErrors(jump).join()).toMatch(/externe/);
  const missing=makeMaisonFlow();missing.nodes=missing.nodes.filter(n=>n.config?.stage!=='target');expect(()=>flowToCode(missing)).toThrow(/incomplet/);
  for(const settings of [{moveCells:500},{moveCells:2.5},{combosEnabled:'false'},{unknown:5},{targetPolicy:'__proto__'}])expect(maisonSettingsErrors(settings).length).toBeGreaterThan(0);
  const wrong=makeMaisonFlow();wrong.nodes[1].config.settings={moveCells:6};expect(flowErrors(wrong).length).toBeGreaterThan(0);
  const full=makeFlow();for(let i=0;i<27;i++)full.nodes.push({...full.nodes[1],id:`copy${i}`});expect(()=>expandMaison(full,'brain')).toThrow(/32/);
});
test('source viewer contains the actual executed regions and shared helpers',()=>{
  for(const stage of MAISON_STAGES)expect(SOURCE.stages[stage.id].chunks.some(c=>c.code.includes(`stage('${stage.id}'`))).toBe(true);
  expect(SOURCE.stages.combos.chunks[0].code).toContain('bestBudget(options, boosted.pa)');
  expect(SOURCE.stages.helpers.chunks[1].file).toBe('src/bots/tactics.js');
  expect(MAISON_CONTROLS.every(c=>SOURCE.stages[c.stage].chunks.some(s=>s.code.includes(c.key))||['targetPolicy','castFloor','continuationWeight'].includes(c.key))).toBe(true);
});
