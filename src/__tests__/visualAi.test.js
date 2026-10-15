import { createGame, getView, validateAction, applyAction } from '../engine/engine';
import { CLASS_IDS } from '../engine/classes';
import { createRng } from '../engine/rng';
import { makeBotApi } from '../bots/api';
import { compileBot } from '../bots/compile';
import { makeFlow, flowToCode, flowErrors, disconnectedNodes, parseVisualBot, visualBotPackage } from '../bots/visualGraph';
import { runFlowLab } from '../bots/flowLab';

function context(classId='IOP') {
  const {state}=createGame({mapId:'arene',seed:214,fighters:[{id:'A',name:'Testeur',classId},{id:'B',name:'Ennemi',classId:'IOP'}]});
  state.currentIndex=state.order.indexOf('A');
  state.fighters.A.pos={x:4,y:5};state.fighters.B.pos={x:7,y:5};
  return {state,view:getView(state,'A')};
}
test.each(CLASS_IDS)('the unedited Maison graph matches the real policy and diagnostics do not alter %s decisions',classId=>{
  const {state,view}=context(classId),before=JSON.stringify(view),beforeState=JSON.stringify(state);
  const action=makeBotApi(view,createRng(88)).maison(),api=makeBotApi(view,createRng(88)),trace=[],reports=[];
  api.flowTrace=step=>trace.push(step);api.flowInspect=report=>reports.push(report);
  const result=compileBot(flowToCode(makeFlow()))(view,api);
  expect(result).toEqual(action);expect(validateAction(state,result).ok).toBe(true);
  expect(reports[0].selected).toEqual(result);expect(trace[0].node).toBe('start');
  for(const candidate of reports[0].candidates){expect(Number.isFinite(candidate.score)).toBe(true);expect(validateAction(state,candidate.action).ok).toBe(true);}
  expect(JSON.stringify(view)).toBe(before);expect(JSON.stringify(state)).toBe(beforeState);
});
test('the prudent graph takes Yes when injured and falls through when healing is impossible',()=>{
  const {state}=context('IOP');state.fighters.A.hp=Math.floor(state.fighters.A.maxHp*.2);
  const view=getView(state,'A'),api=makeBotApi(view,createRng(1)),steps=[];api.flowTrace=s=>steps.push(s);
  const action=compileBot(flowToCode(makeFlow('prudent')))(view,api);
  expect(steps.find(s=>s.node==='health')).toMatchObject({port:'yes'});
  expect(steps.find(s=>s.node==='heal')).toMatchObject({port:'fallback',action:{type:'PASS'}});
  expect(steps.some(s=>s.node==='brain')).toBe(true);expect(validateAction(state,action).ok).toBe(true);
});
test('a healing block applies a real legal heal immediately',()=>{
  const {state}=context('ENIRIPSA');state.fighters.A.hp=Math.floor(state.fighters.A.maxHp*.2);
  const view=getView(state,'A'),api=makeBotApi(view,createRng(1)),steps=[];api.flowTrace=s=>steps.push(s);
  const action=compileBot(flowToCode(makeFlow('prudent')))(view,api),result=applyAction(state,action);
  expect(steps.find(s=>s.node==='heal').port).toBe('action');expect(action.type).toBe('CAST');expect(result.ok).toBe(true);
  expect(result.state.fighters.A.hp).toBeGreaterThan(state.fighters.A.hp);
});
test('an exhausted spell falls through without movement or illegal actions',()=>{
  const {state}=context();state.fighters.A.pa=0;
  const v=getView(state,'A'),api=makeBotApi(v,createRng(1));
  expect(api.plan({kind:'damage',base:'maison',weights:{}})).toEqual({type:'PASS'});
  expect(api.plan({kind:'spell',base:'maison',weights:{},spellKey:'not-in-this-spellbook'})).toEqual({type:'PASS'});
});
test('move blocks never target invisible positions',()=>{
  const {view}=context();view.enemies.forEach(e=>{e.hidden=true;});view.enemy.hidden=true;
  const api=makeBotApi(view,createRng(1));
  expect(api.plan({kind:'advance'})).toEqual({type:'PASS'});expect(api.plan({kind:'retreat'})).toEqual({type:'PASS'});
});
test.each(['maison','prudent','aggressive'])('visual export/import preserves %s source and ignores supplied JavaScript',template=>{
  const g=makeFlow(template),pkg=visualBotPackage('Mon IA',g);pkg.code='throw new Error("untrusted code")';
  const imported=parseVisualBot(JSON.stringify(pkg));expect(imported.code).toBeUndefined();expect(flowToCode(imported.graph)).toBe(flowToCode(g));
});
test('invalid branches, cycles, settings and oversized files are rejected before compilation',()=>{
  const g=makeFlow('prudent');g.nodes.find(n=>n.id==='brain').links.fallback='health';expect(flowErrors(g).join()).toMatch(/Boucle/);expect(()=>flowToCode(g)).toThrow(/Boucle/);
  const broken=makeFlow();broken.nodes[0].links.next='missing';expect(flowErrors(broken).join()).toMatch(/reliez/);
  const power=makeFlow();power.nodes[1].config.weights={damage:500};expect(()=>flowToCode(power)).toThrow(/valeur invalide/);
  power.nodes[1].config.weights={notAWeight:1};expect(()=>flowToCode(power)).toThrow();
  expect(()=>parseVisualBot(' '.repeat(250001))).toThrow(/volumineux/);
});
test('disconnected nodes are reported and never run',()=>{
  const g=makeFlow();g.nodes.push({id:'unused',type:'plan',x:600,y:400,config:{kind:'heal',base:'maison',weights:{}},links:{fallback:'end'}});
  expect(flowErrors(g)).toEqual([]);expect(disconnectedNodes(g)).toEqual(['unused']);
  const {view}=context(),api=makeBotApi(view,createRng(1)),steps=[];api.flowTrace=s=>steps.push(s);compileBot(flowToCode(g))(view,api);
  expect(steps.some(s=>s.node==='unused')).toBe(false);
});
test('generated comments cannot inject code through a block label',()=>{
  const g=makeFlow();g.nodes[1].label='name\nreturn api.endTurn();\u2028throw "bad"';
  const {view}=context(),a=compileBot(flowToCode(g))(view,makeBotApi(view,createRng(1))),b=makeBotApi(view,createRng(1)).maison();expect(a).toEqual(b);
});
test('laboratory records a reproducible real match with no errors',async()=>{
  const config={code:flowToCode(makeFlow()),opponentCode:'function decide(v,a){return a.endTurn();}',mine:{classId:'IOP',name:'Moi'},opponent:{classId:'IOP',name:'Cible'},seed:123,count:1,mapId:'arene'};
  const a=await runFlowLab(config,{yieldControl:()=>Promise.resolve()}),b=await runFlowLab(config,{yieldControl:()=>Promise.resolve()});
  expect(a[0].outcome).toBe('win');expect(a[0].stats.errors).toBe(0);expect(a[0].stats.invalid).toBe(0);
  expect(a[0].entries.map(e=>e.action)).toEqual(b[0].entries.map(e=>e.action));expect(a[0].turns).toBe(b[0].turns);
  expect(a[0].entries.every(e=>e.steps.length&&e.plans.length)).toBe(true);
});
test('laboratory honors cancellation before beginning a combat',async()=>{
  const ctrl=new AbortController();ctrl.abort();await expect(runFlowLab({seed:1,count:6},{signal:ctrl.signal})).rejects.toMatchObject({name:'AbortError'});
});
