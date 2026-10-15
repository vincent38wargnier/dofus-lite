import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BrainCircuit, Plus, Save, Copy, Code2, Workflow, Undo2, Redo2, Upload, Download, Swords, X, Check, Trash2, ArrowRight, ArrowLeft, Trophy, UserRound } from 'lucide-react';
import { createGame, getView } from '../engine/engine';
import { createRng } from '../engine/rng';
import { makeBotApi } from '../bots/api';
import { compileBot } from '../bots/compile';
import { inspectAiSource, checkAiAction } from '../bots/aiCodeTesting';
import { makeFlow, makeMaisonFlow, expandMaison, collapseMaison, flowToCode, flowErrors, flowPorts, disconnectedNodes, parseVisualBot, visualBotPackage, FLOW_LIMIT } from '../bots/visualGraph';
import AiFlowCanvas from './AiFlowCanvas';
import AiNodeInspector from './AiNodeInspector';
import AiDecisionInspector from './AiDecisionInspector';
import AiLab from './AiLab';
import { useProfiles } from './ProfilesContext';
import { useCreations } from './CreationsContext';
import { aiFighterChoices, aiFighterSnapshot } from '../bots/aiAuthoring';
import { AiFighterStep, AiStrategyStep, AiPromptDialog } from './AiGuidedSetup';
import AiCodeDialog from './AiCodeDialog';
import '../styles/aiStudio.css';
import '../styles/aiStudioGuide.css';

const KEY='koliseum.ai-studio.v1';
const newId=()=>`node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
const jsTemplate='// Une action par appel. Le combat est relu après chaque action.\nfunction decide(view, api) {\n  return api.maison();\n}';
function baseDraft(bot, saved) {
  let graph=bot.flow||null;
  if(!graph&&bot.id==='maison')graph=makeMaisonFlow();
  if(!graph&&['cortex'].includes(bot.id))graph={...makeFlow(),nodes:makeFlow().nodes.map(n=>n.type==='plan'?{...n,label:bot.name,config:{...n.config,base:bot.id==='cortex'?'cortex':'maison'}}:n)};
  return {id:bot.id,name:bot.name,graph,code:bot.code,fighterId:bot.fighterId||bot.classId||'IOP',starter:bot.starter||null,promptBriefs:saved?.promptBriefs};
}
function readWorkspace() {try {const v=JSON.parse(localStorage.getItem(KEY));return v&&typeof v==='object'&&v.drafts&&typeof v.drafts==='object'?v:{drafts:{},active:null};}catch{return {drafts:{},active:null};}}
function usableDraft(d) {return d&&typeof d.id==='string'&&typeof d.name==='string'&&typeof d.code==='string'&&(!d.graph||flowErrors(d.graph).every(e=>/reliez la sortie|choisissez un sort|condition invalide|valeur invalide/.test(e)));}
function download(name,text,type='application/json') {const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}

export default function AiStudio({customBots,allBots,addBot,updateBot,deleteBot,onWatch,onTournament}) {
  const [initial]=useState(readWorkspace),workspace=useRef(initial),fileInput=useRef(null),lab=useRef(null);
  const profiles=useProfiles(),creations=useCreations();
  const choices=useMemo(()=>aiFighterChoices(profiles?.profiles,creations?.characters),[profiles?.profiles,creations?.characters]);
  const initialBot=allBots.find(b=>b.id===initial.active)||allBots.find(b=>b.id==='maison')||allBots[0];
  const [draft,setDraft]=useState(()=>!initial.active?{id:`draft-${newId()}`,name:'Mon IA',graph:makeFlow(),code:jsTemplate,starter:'maison',fighterId:profiles?.activeId?`profile:${profiles.activeId}`:'IOP'}:(initialBot.custom||!allBots.some(b=>b.id===initial.active))&&usableDraft(initial.drafts[initial.active])?initial.drafts[initial.active]:baseDraft(initialBot,initial.drafts[initial.active]));
  const [selected,setSelected]=useState('brain'),[mode,setMode]=useState(draft.graph?'flow':'code'),[adding,setAdding]=useState(false),[notice,setNotice]=useState(null);
  const [history,setHistory]=useState([]),[future,setFuture]=useState([]),[reset,setReset]=useState(0),[revision,setRevision]=useState(0);
  const [entry,setEntry]=useState(null),[traceGraph,setTraceGraph]=useState(null),[step,setStep]=useState(-1);
  const [page,setPage]=useState(initial.active?1:0),[assistant,setAssistant]=useState(false),[codeFiles,setCodeFiles]=useState(false),[report,setReport]=useState(null),[session,setSession]=useState(0),[opponent,setOpponent]=useState({classId:'IOP'});
  const mine=choices.find(c=>c.id===draft.fighterId)||choices.find(c=>c.id==='IOP');
  const context={mine,opponent};
  const resolved=useMemo(()=>{try{return {snapshot:aiFighterSnapshot(mine),error:''};}catch(e){return {snapshot:null,error:e.message};}},[mine]);
  const bot=allBots.find(b=>b.id===draft.id),builtin=!!bot&&!bot.custom;
  const errors=draft.graph?flowErrors(draft.graph):[],code=draft.graph?errors.length?'':flowToCode(draft.graph):draft.code;
  const changed=bot?.custom&&(draft.name!==bot.name||code!==bot.code||JSON.stringify(draft.graph)!==JSON.stringify(bot.flow||null));
  const inspected=!!entry,visibleGraph=inspected?traceGraph:draft.graph,readOnly=builtin||inspected;
  useEffect(()=>{
    workspace.current={...workspace.current,active:draft.id,drafts:{...workspace.current.drafts,[draft.id]:draft}};
    try{localStorage.setItem(KEY,JSON.stringify(workspace.current));}
    catch{setNotice({ok:false,text:'Le brouillon reste ouvert, mais le navigateur ne peut pas le sauvegarder. Exportez votre travail.'});}
  },[draft]);
  const update=next=>{setHistory(h=>[...h.slice(-29),draft]);setFuture([]);setDraft(next);setRevision(r=>r+1);setNotice(null);setEntry(null);setTraceGraph(null);};
  const changeGraph=graph=>update({...draft,graph,starter:null});
  const resetUi=next=>{setDraft(next);setHistory([]);setFuture([]);setSelected(next.graph?.nodes.find(n=>n.type==='plan'||(n.type==='maison-stage'&&n.config.stage==='profile'))?.id||'start');setMode(next.graph?'flow':'code');setAdding(false);setEntry(null);setTraceGraph(null);setNotice(null);setReset(r=>r+1);setRevision(r=>r+1);setSession(s=>s+1);setReport(null);};
  const select=b=>resetUi(b.custom&&usableDraft(workspace.current.drafts[b.id])?workspace.current.drafts[b.id]:baseDraft(b,workspace.current.drafts[b.id]));
  const fresh=(template='maison')=>{resetUi({id:`draft-${newId()}`,name:template==='prudent'?'Sentinelle':template==='aggressive'?'Avant-garde':'Mon IA',graph:template==='code'?null:makeFlow(template),code:jsTemplate,starter:template==='code'?null:template,fighterId:mine.id});setPage(template==='code'?'advanced':0);};
  const duplicate=()=>resetUi({...draft,id:`draft-${newId()}`,name:`${draft.name} · copie`,graph:draft.graph?JSON.parse(JSON.stringify(draft.graph)):null});
  const verify=()=>{
    if(errors.length){setNotice({ok:false,text:errors[0]});return false;}
    let view;
    try {const {state}=createGame({mapId:'arene',seed:1,fighters:[{id:'A',...mine},{id:'B',classId:'CRA'}].map((f,i)=>({...f,id:i?'B':'A'}))});view=getView(state,'A');}
    catch(e){setNotice({ok:false,text:e.message});return false;}
    try {
      const syntax=inspectAiSource(code);if(!syntax.ok)throw new Error(syntax.error);
      const input=JSON.parse(JSON.stringify(view));
      const action=compileBot(code)(input,makeBotApi(input,createRng(1)));
      const result=checkAiAction(view,action);if(!result.ok)throw new Error(result.error);
    }catch(e){setNotice({ok:false,text:e.message});return false;}return true;
  };
  const save=()=>{
    if(builtin||!verify())return;
    if(!draft.name.trim()){setNotice({ok:false,text:'Donnez un nom à votre IA.'});return;}
    try{
      const record={name:draft.name.trim(),code,flow:draft.graph||null,classId:context.mine.classId||'IOP',fighterId:mine.id,starter:draft.starter||null,emoji:'🧠'};
      if(bot?.custom)updateBot(bot.id,record);
      else{const id=addBot(record);delete workspace.current.drafts[draft.id];setDraft({...draft,id,name:record.name});}
      setNotice({ok:true,text:'IA enregistrée. Elle est disponible pour chaque combattant dans Combat et dans le Tournoi.'});
    }catch(e){setNotice({ok:false,text:`Enregistrement impossible : ${e.message}`});}
  };
  const connect=(id,port,target)=>{
    if(readOnly)return;
    const graph={...draft.graph,nodes:draft.graph.nodes.map(n=>n.id===id?{...n,links:{...n.links,[port]:target}}:n)};
    const problem=flowErrors(graph).find(e=>/Boucle|revenir au départ|Maison|connexion externe/.test(e));
    if(problem){setNotice({ok:false,text:problem});return;}changeGraph(graph);
  };
  const addBlock=b=>{
    if(readOnly||draft.graph.nodes.length>=FLOW_LIMIT)return;
    let source=draft.graph.nodes.find(n=>n.id===selected)||draft.graph.nodes.find(n=>n.type==='start');
    if(source.type==='maison-stage')source=draft.graph.nodes.find(n=>n.type==='maison-stage'&&n.config.group===source.config.group&&n.config.stage==='choose');
    const port=source.type==='condition'?'no':flowPorts(source)[0];
    const end=draft.graph.nodes.find(n=>n.type==='end').id,target=source.links?.[port]||end,id=newId();
    const n={id,type:b.type,label:b.label,x:Math.min(11680,source.x+310),y:Math.min(11800,source.y+205),
      config:b.type==='condition'?{metric:'hp',operator:'<',value:40}:{kind:b.kind,base:'maison',weights:{}},
      links:b.type==='condition'?{yes:target,no:target}:{fallback:target}};
    changeGraph({...draft.graph,nodes:[...draft.graph.nodes.map(s=>port?s.id===source.id?{...s,links:{...s.links,[port]:id}}:s
      :{...s,links:Object.fromEntries(Object.entries(s.links).map(([p,t])=>[p,t===source.id?id:t]))}),n]});
    setSelected(id);setAdding(false);setReset(r=>r+1);
  };
  const remove=id=>{
    const n=draft.graph.nodes.find(n=>n.id===id);if(!n||n.type==='maison-stage')return;const fallback=n.links.fallback||n.links.no||draft.graph.nodes.find(n=>n.type==='end').id;
    changeGraph({...draft.graph,nodes:draft.graph.nodes.filter(n=>n.id!==id).map(n=>({...n,links:Object.fromEntries(Object.entries(n.links).map(([p,t])=>[p,t===id?fallback:t]))}))});setSelected('start');
  };
  const toggleMaison=(id,expand)=>{try{
    const graph=expand?expandMaison(draft.graph,id):collapseMaison(draft.graph,id);
    changeGraph(graph);setSelected(id);setReset(r=>r+1);
  }catch(e){setNotice({ok:false,text:e.message});}};
  const undo=()=>{if(!history.length||readOnly)return;setFuture(f=>[draft,...f]);setDraft({...history.at(-1),id:draft.id});setHistory(history.slice(0,-1));setRevision(r=>r+1);};
  const redo=()=>{if(!future.length||readOnly)return;setHistory(h=>[...h,draft]);setDraft({...future[0],id:draft.id});setFuture(future.slice(1));setRevision(r=>r+1);};
  const exportFile=()=>{try{if(draft.graph)download(`${draft.name.replace(/[^a-z0-9_-]/gi,'-')||'mon-ia'}.json`,JSON.stringify(visualBotPackage(draft.name,draft.graph),null,2));else download('mon-ia.js',code,'text/javascript');}catch(e){setNotice({ok:false,text:e.message});}};
  const importFile=async e=>{
    const f=e.target.files[0];e.target.value='';if(!f)return;
    try{if(f.size>250000)throw new Error('Fichier limité à 250 Ko.');const text=await f.text();
      if(/\.js$/i.test(f.name)){
        const result=inspectAiSource(text);if(!result.ok)throw new Error(result.error);
        resetUi({id:`draft-${newId()}`,name:f.name.replace(/\.js$/i,'').slice(0,80)||'Mon IA',graph:null,code:text,fighterId:mine.id,promptBriefs:draft.promptBriefs});
        setPage('advanced');setCodeFiles(false);setNotice({ok:true,text:'Code importé dans une nouvelle copie. Syntaxe valide ; testez ses actions puis enregistrez-la pour Combat.'});
      }else{const data=parseVisualBot(text);importStrategy(data);}}
    catch(e){setNotice({ok:false,text:`Import refusé : ${e.message}`});}
  };
  const importStrategy=data=>{resetUi({id:`draft-${newId()}`,name:data.name,graph:data.graph,code:'',fighterId:mine.id,promptBriefs:draft.promptBriefs});setAssistant(false);setPage(1);window.requestAnimationFrame(()=>document.querySelector('[aria-label="Nom de l’IA"]')?.focus());setNotice({ok:true,text:'Stratégie vérifiée. Votre nouvelle IA est prête à tester ; enregistrez-la pour la retrouver dans Combat.'});};
  const inspect=(e,g)=>{setEntry(e);setTraceGraph(g);setStep(-1);setAdding(false);if(e){setPage('advanced');if(g)setMode('flow');window.requestAnimationFrame(()=>document.querySelector('.ai-workbench')?.scrollIntoView?.({behavior:'smooth',block:'start'}));}};
  const stopInspect=()=>{setEntry(null);setTraceGraph(null);setReset(r=>r+1);};
  const sampleSpells=resolved.snapshot?.spells||[];
  const go=next=>{stopInspect();setPage(next);window.requestAnimationFrame(()=>document.querySelector('.ai-journey')?.scrollIntoView?.({behavior:'smooth',block:'start'}));};
  const drafts=Object.values({...workspace.current.drafts,[draft.id]:draft}).filter(d=>d.id?.startsWith('draft-')&&usableDraft(d));
  return <section className="ai-studio ai-guided-studio" aria-label="Studio IA">
    <header className="ai-studio-heading">
      <div className="ai-studio-title"><span><BrainCircuit size={29}/></span><div><span className="ai-eyebrow">L’ARÈNE DES STRATÈGES</span><h1>Studio IA</h1><p>Votre personnage. Votre intelligence de combat.</p></div></div>
      <div className="ai-heading-actions"><button type="button" className="ai-button" onClick={()=>setCodeFiles(true)}><Code2 size={15}/> Code & fichiers</button><button type="button" className="ai-button" onClick={()=>fileInput.current.click()}><Upload size={15}/> Importer une IA</button><button type="button" className="ai-button" onClick={exportFile}><Download size={15}/> Partager mon IA</button><input type="file" accept="application/json,.json,text/javascript,.js" ref={fileInput} aria-label="Importer une IA visuelle ou JavaScript" hidden onChange={importFile}/></div>
    </header>
    <div className={`ai-mission${page!==0?' compact':''}`}><div><span className="ai-eyebrow"><Trophy size={15}/> LE DÉFI</span><h2>Et si la meilleure IA,<br/>{' '}c’était la vôtre ?</h2><p>Donnez-lui une stratégie, faites-la combattre et améliorez ce qui fait la différence. Aucun code requis pour commencer.</p></div><div className="ai-mission-loop" aria-hidden="true"><span><BrainCircuit size={25}/><b>Imaginer</b></span><ArrowRight/><span><Swords size={25}/><b>Affronter</b></span><ArrowRight/><span><Trophy size={25}/><b>Progresser</b></span></div></div>
    <nav className="ai-collection" aria-label="Ma bibliothèque d’IA"><div className="ai-collection-title"><strong>Mes IA</strong><button type="button" className="ai-button" onClick={()=>fresh()}><Plus size={15}/> Créer mon IA</button></div>
      <div className="ai-collection-list">{customBots.map(b=><button type="button" key={b.id} className={`ai-library-entry${draft.id===b.id?' selected':''}`} onClick={()=>{select(b);go(1);}}>{b.flow?<Workflow size={18}/>:<Code2 size={18}/>}<span><strong>{b.name}</strong><small>{b.flow?'Graphe visuel':'JavaScript'}</small></span></button>)}
      {drafts.map(d=><button type="button" key={d.id} className={`ai-library-entry${draft.id===d.id?' selected':''}`} onClick={()=>{resetUi(d);go(1);}}><BrainCircuit size={18}/><span><strong>{d.name}</strong><small>Brouillon · à enregistrer</small></span></button>)}</div>
      <details className="ai-reference-menu"><summary>Explorer les IA du jeu</summary><div>{[...allBots.filter(b=>!b.custom)].sort((a,b)=>(a.id==='maison'?-1:b.id==='maison'?1:0)).map(b=><button type="button" key={b.id} className={`ai-library-entry${draft.id===b.id?' selected':''}`} onClick={e=>{select(b);go('advanced');e.currentTarget.closest('details').open=false;}}><span className="ai-bot-emoji">{b.emoji}</span><span><strong>{b.name}</strong><small>{['maison','cortex'].includes(b.id)?'Cerveau inspectable':'Code de référence'}</small></span></button>)}</div></details>
    </nav>
    <nav className="ai-journey" aria-label="Étapes de création">{[{name:'Mon combattant',detail:mine.name,icon:UserRound},{name:'Ma stratégie',detail:builtin?'Explorer et créer une version':draft.name,icon:BrainCircuit},{name:'Le défi',detail:'Tester, comprendre, améliorer',icon:Swords}].map((s,i)=><button type="button" key={s.name} aria-current={page===i?'step':undefined} onClick={()=>go(i)}><span className="ai-step-number">{i+1}</span><span><strong>{s.name}</strong><small>{s.detail}</small></span><s.icon size={20}/></button>)}</nav>
    <main className="ai-workbench">
      {page!==0&&<div className="ai-document-bar"><div><label className="ai-name-label">Nom de l’IA<input aria-label="Nom de l’IA" value={draft.name} maxLength={80} disabled={builtin||inspected} onChange={e=>update({...draft,name:e.target.value})}/></label><span className={`ai-document-status ${builtin?'reference':''}`}>{builtin?'Référence protégée':!bot?'Brouillon sauvegardé sur cet appareil':changed?'Modifications à enregistrer pour Combat':'Enregistrée · disponible dans Combat'}</span></div>
        <div className="ai-document-actions"><button type="button" className="ai-icon-button" aria-label="Annuler la modification" disabled={readOnly||!history.length} onClick={undo}><Undo2 size={17}/></button><button type="button" className="ai-icon-button" aria-label="Rétablir la modification" disabled={readOnly||!future.length} onClick={redo}><Redo2 size={17}/></button>{((builtin&&page!==1)||page==='advanced')&&<button type="button" className={`ai-button${builtin?' accent':''}`} onClick={duplicate}><Copy size={15}/>{builtin?'Créer ma version':'Dupliquer'}</button>}{!builtin&&<button type="button" className="ai-button accent" disabled={!!errors.length||inspected||!resolved.snapshot} onClick={save}><Save size={15}/> Enregistrer</button>}</div>
      </div>}
      {notice&&<div className={`ai-notice ${notice.ok?'ok':'error'}`} role={notice.ok?'status':'alert'}>{notice.ok?<Check size={17}/>:null}<span>{notice.text}</span><button type="button" className="ai-icon-button" aria-label="Fermer le message" onClick={()=>setNotice(null)}><X size={15}/></button></div>}
      {page===0&&<AiFighterStep choices={choices} fighter={mine} {...resolved} onChoose={id=>update({...draft,fighterId:id})} onNext={()=>go(1)}/>}
      {page===1&&<AiStrategyStep draft={draft} builtin={builtin} fighter={mine} opponent={opponent} onPreset={id=>update({...draft,graph:makeFlow(id),starter:id})} onGraph={graph=>update({...draft,graph})} onDuplicate={duplicate} onAssistant={()=>setAssistant(true)} onAdvanced={()=>go('advanced')} onNext={()=>go(2)}/>}
      {page==='advanced'&&<><div className="ai-advanced-heading"><button type="button" className="ai-text-button" onClick={()=>go(1)}><ArrowLeft size={16}/> Revenir à la stratégie simple</button><button type="button" className="ai-text-button" onClick={()=>fresh('code')}><Plus size={15}/> Nouvelle IA JavaScript</button></div>
        <div className="ai-view-tabs"><div role="group" aria-label="Vue de l’IA"><button type="button" className={mode==='flow'?'selected':''} disabled={!visibleGraph} onClick={()=>setMode('flow')}><Workflow size={16}/> Logique visuelle</button><button type="button" className={mode==='code'?'selected':''} onClick={()=>setMode('code')}><Code2 size={16}/>{draft.graph?'Code généré':'Code JavaScript'}</button></div><button type="button" className="ai-button" onClick={()=>go(2)}><Swords size={15}/> Tester mon IA</button></div>
        {inspected&&<div className="ai-inspection-banner">Lecture d’une décision enregistrée · version testée<button type="button" onClick={stopInspect}>Revenir à mon IA <X size={14}/></button></div>}
        {mode==='flow'&&visibleGraph?<div className="ai-flow-layout">
          <AiFlowCanvas graph={visibleGraph} selected={selected} onSelect={id=>{setSelected(id);setAdding(false);}} onChange={changeGraph} onConnect={connect} readOnly={readOnly} trace={entry?.steps||[]} activeStep={step} resetKey={`${draft.id}:${reset}:${!!inspected}`} onAdd={()=>setAdding(true)}/>
          {inspected?<AiDecisionInspector entry={entry} graph={traceGraph} step={step} onStep={setStep} onClose={stopInspect}/>
            :<AiNodeInspector graph={draft.graph} node={draft.graph.nodes.find(n=>n.id===selected)} onChange={n=>changeGraph({...draft.graph,nodes:draft.graph.nodes.map(old=>old.id===n.id?n:old)})} onDelete={remove} onConnect={connect} readOnly={readOnly} adding={adding} onAdd={addBlock} onExpand={id=>toggleMaison(id,true)} onCollapse={id=>toggleMaison(id,false)} spells={sampleSpells} myClass={context.mine.classId} opponentClass={context.opponent.classId}/>}</div>
          :<div className={`ai-code-layout${inspected?' with-inspector':''}`}><div><div className="ai-code-note">{draft.graph?'Ce code est généré par les blocs et utilisé en combat. Pour écrire librement, créez une copie JavaScript.':'Code libre : une fonction decide(view, api), une action retournée par appel. La conversion automatique d’un script en graphe n’est pas proposée.'}</div>
            <textarea className="ai-source" aria-label="Code de l’IA" spellCheck={false} readOnly={builtin||!!draft.graph||inspected} value={inspected&&traceGraph?flowToCode(traceGraph):code} onChange={e=>update({...draft,code:e.target.value})}/>
            <div className="ai-code-actions"><button type="button" className="ai-button" onClick={()=>{if(verify())setNotice({ok:true,text:'Le code compile et retourne une action légale sur le scénario de contrôle. Le défi teste le combat complet.'});}}><Check size={15}/> Vérifier</button>{draft.graph&&<button type="button" className="ai-button" disabled={!!errors.length} onClick={()=>resetUi({...draft,id:`draft-${newId()}`,name:`${draft.name} · code`,graph:null,code,starter:null})}><Code2 size={15}/> Créer une copie JavaScript</button>}</div></div>{inspected&&<AiDecisionInspector entry={entry} graph={null} step={step} onStep={setStep} onClose={stopInspect}/>}</div>}
        {!!errors.length&&<div className="ai-errors" role="alert"><b>À compléter avant de jouer</b><ul>{errors.slice(0,6).map(e=><li key={e}>{e}</li>)}</ul></div>}
        {draft.graph&&!errors.length&&disconnectedNodes(draft.graph).length>0&&<p className="ai-warning">{disconnectedNodes(draft.graph).length} bloc(s) non relié(s) au départ : ils ne seront jamais exécutés.</p>}
        <details className="ai-maison-guide"><summary>Comprendre le cerveau de Maison</summary><div>{[
          ['1 · Observer','Positions connues, PV, PA/PM, protections, relances et zones. Les positions invisibles restent cachées.'],
          ['2 · Prioriser','Estime le danger des ennemis, y compris leurs invocations. Éliminer leur maître peut retirer plusieurs menaces.'],
          ['3 · Noter','Évalue dégâts, soins, boosts, retraits et risques. Les poids règlent leur importance, pas les dégâts réels.'],
          ['4 · Anticiper','Compare les enchaînements de PA et les attaques débloquées par un déplacement. La recherche est limitée pour rester rapide.'],
          ['5 · Jouer, puis relire','Retient une action légale et recalcule après son application. Le tour entier n’est pas fixé à l’avance.'],
        ].map(([title,text])=><article key={title}><strong>{title}</strong><p>{text}</p></article>)}</div><p>Dépliez Maison pour lire et régler ses sept étapes exécutables. Elles utilisent le même code que la référence. Le laboratoire enregistre leur parcours et leurs résultats pendant le combat.</p></details>
      </>}
      <div ref={lab} hidden={page!==2}><AiLab key={session} code={code} name={draft.name} allBots={allBots} disabled={!!errors.length||!resolved.snapshot} onDecision={inspect} onOpponent={setOpponent} graph={draft.graph} revision={revision} choices={choices} mine={mine} onReport={setReport} onImprove={()=>setAssistant(true)} onEdit={()=>go(1)} onWatch={onWatch&&!changed&&bot?config=>onWatch({...config,botA:bot.id}):null} onTournament={onTournament} published={!!bot&&!changed}/></div>
      {page==='advanced'&&!builtin&&<details className="ai-delete-zone"><summary>Gérer cette IA</summary><button type="button" className="ai-button ai-delete" onClick={()=>{try{if(bot?.custom)deleteBot(bot.id);delete workspace.current.drafts[draft.id];resetUi(baseDraft(allBots.find(b=>b.id==='maison')));}catch(e){setNotice({ok:false,text:e.message});}}}><Trash2 size={14}/>{bot?'Supprimer cette IA':'Supprimer ce brouillon'}</button></details>}
    </main>
    {assistant&&<AiPromptDialog fighter={mine} snapshot={resolved.snapshot} draft={draft} report={report} onGoal={goal=>setDraft(current=>({...current,promptBriefs:{...current.promptBriefs,[mine.id]:goal}}))} onImport={importStrategy} onClose={()=>setAssistant(false)}/>}
    {codeFiles&&<AiCodeDialog draft={draft} code={code} fighter={mine} snapshot={resolved.snapshot} onGoal={goal=>setDraft(current=>({...current,promptBriefs:{...current.promptBriefs,[mine.id]:goal}}))} onClose={()=>setCodeFiles(false)} onImport={()=>{setCodeFiles(false);fileInput.current.click();}}/>}
  </section>;
}
