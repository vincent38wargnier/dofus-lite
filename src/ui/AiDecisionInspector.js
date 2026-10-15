import React from 'react';
import { ChevronLeft, ChevronRight, Route, Target } from 'lucide-react';
import { actionLabel } from '../bots/flowLab';
import { flowTitle, portLabel } from '../bots/visualGraph';

function ViewMap({entry}) {
  const v=entry.view,w=v.board.width,h=v.board.height,cell=18,pad=13;
  const obstacles=new Map(v.board.obstacles.map(o=>[`${o.x},${o.y}`,o]));
  const fs=[v.you,...v.allies,...v.enemies].filter(f=>f.hp>0&&!f.hidden&&!f.carriedBy);
  const target=entry.action?.target||entry.action?.to;
  return <svg className="ai-trace-map" viewBox={`0 0 ${w*cell+pad*2} ${h*cell+pad*2}`} role="img" aria-label="Vue connue de l’IA avant la décision">
    {Array.from({length:w*h},(_,i)=>{const x=i%w,y=Math.floor(i/w),o=obstacles.get(`${x},${y}`);return <rect key={i} x={pad+x*cell} y={pad+y*cell} width={cell-1} height={cell-1} fill={o?.blocksLos?'#475263':o?.blocksMove?'#737b82':'#e1e7e6'}/>;})}
    {target&&<path d={`M ${pad+(v.you.pos.x+.5)*cell} ${pad+(v.you.pos.y+.5)*cell} L ${pad+(target.x+.5)*cell} ${pad+(target.y+.5)*cell}`} stroke="#a66fea" strokeWidth="2" strokeDasharray="3 2"/>}
    {fs.map((f,i)=><g key={f.id}><title>{f.name} · {f.hp} PV</title><circle cx={pad+(f.pos.x+.5)*cell} cy={pad+(f.pos.y+.5)*cell} r={cell*.39} fill={f.team===v.you.team?'#398bb5':'#bd6062'} stroke={f.id===v.you.id?'#fbcf6a':'none'} strokeWidth="2"/><text x={pad+(f.pos.x+.5)*cell} y={pad+(f.pos.y+.5)*cell+3} textAnchor="middle" fontSize="9" fill="white">{i+1}</text></g>)}
    {target&&<rect x={pad+target.x*cell} y={pad+target.y*cell} width={cell-1} height={cell-1} rx="2" fill="none" stroke="#9d54d4" strokeWidth="2"/>}
  </svg>;
}
export default function AiDecisionInspector({entry,graph,step,onStep,onClose}) {
  if(!entry)return <aside className="ai-inspector"><header><Route/><h3>Voir pourquoi l’IA joue</h3><p>Lancez un combat dans le laboratoire puis choisissez une décision.</p></header></aside>;
  const selectedPlanIndex=entry.steps.slice(0,step<0?entry.steps.length:step+1).filter(s=>graph?.nodes.some(n=>n.id===s.node&&(n.type==='plan'||(n.type==='maison-stage'&&n.config.stage==='profile')))).length-1;
  const plan=entry.plans[Math.max(0,selectedPlanIndex)];
  const stage=entry.steps[step]?.stage;
  return <aside className="ai-inspector ai-decision-inspector"><header><span className="ai-eyebrow">DÉCISION RÉELLEMENT JOUÉE · TOUR {entry.turn}</span><h3>{actionLabel(entry.action,entry.view)}</h3><p>{entry.view.you.hp} PV · {entry.view.you.pa} PA · {entry.view.you.pm} PM avant l’action</p><button type="button" className="ai-button" onClick={onClose}>Revenir aux réglages</button></header>
    <ViewMap entry={entry}/><small className="ai-inherit-note">État connu de l’IA. Les positions invisibles ne sont pas révélées.</small>
    {!!entry.steps.length&&<><div className="ai-trace-controls"><button type="button" className="ai-icon-button" aria-label="Étape précédente" disabled={step<=0} onClick={()=>onStep(step-1)}><ChevronLeft size={17}/></button><span>{step<0?'Chemin complet':`Étape ${step+1} / ${entry.steps.length}`}</span><button type="button" className="ai-icon-button" aria-label="Étape suivante" disabled={step>=entry.steps.length-1} onClick={()=>onStep(step<0?0:step+1)}><ChevronRight size={17}/></button></div>
      <ol className="ai-trace-steps">{entry.steps.map((s,i)=><li key={i}><button type="button" className={i===step?'selected':''} onClick={()=>onStep(i)}><span>{i+1}</span><div><strong>{flowTitle(graph?.nodes.find(n=>n.id===s.node)||{label:s.node})}</strong><small>{s.port==='action'?'Action retenue':portLabel(s.port)}{s.value!==undefined?` · valeur observée : ${Number.isFinite(s.value)?Number(s.value.toFixed(1)):'aucune cible'}`:''}</small></div></button></li>)}</ol></>}
    {stage&&<section className="ai-stage-result"><span className="ai-eyebrow">RÉSULTAT DE CETTE ÉTAPE</span><p>{stage.summary}</p>{stage.bestCast?.action&&<p>Lancer retenu : <b>{actionLabel(stage.bestCast.action,entry.view)}</b> · {stage.bestCast.score.toFixed(3)}</p>}{stage.bestMove?.action&&<p>Placement retenu : <b>{actionLabel(stage.bestMove.action,entry.view)}</b> · {stage.bestMove.score.toFixed(3)}</p>}{stage.weights&&<details><summary>Priorités réellement utilisées</summary><table><thead><tr><th>Priorité</th><th>Valeur</th></tr></thead><tbody>{Object.entries(stage.weights).map(([k,v])=><tr key={k}><td>{k}</td><td>{v.toFixed(3)}</td></tr>)}</tbody></table></details>}</section>}
    {!entry.steps.length&&<p>Cette IA utilise du code libre. Le résultat est visible ; son code n’est pas converti automatiquement en blocs.</p>}
    {entry.error&&<p className="ai-error" role="alert">{entry.error}</p>}
    {plan&&<section className="ai-candidate-list"><h4><Target size={15}/> Ce que le moteur a comparé</h4>{plan.target&&<p>Cible prioritaire : <b>{plan.target.name||plan.target.id}</b>{plan.target.dependents?` · ${plan.target.dependents} invocation(s) dépendante(s)`:''}</p>}
      {!!plan.candidates?.length&&<table><thead><tr><th>Option</th><th>Score</th><th>Suite¹</th></tr></thead><tbody>{plan.candidates.map((c,i)=><tr key={i} className={JSON.stringify(c.action)===JSON.stringify(plan.selected)?'chosen':''}><td>{c.name}<small>{c.action.target?`${c.action.target.x}, ${c.action.target.y}`:c.action.to?`${c.action.to.x}, ${c.action.to.y}`:''} · {c.cost} {c.action.type==='MOVE'?'PM':'PA'}</small></td><td>{c.score.toFixed(2)}</td><td>{(c.continuation||0).toFixed(2)}</td></tr>)}</tbody></table>}
      <p className="ai-score-note">{plan.explanation}</p>{!!plan.candidates?.length&&<small>¹ Part du score liée aux actions suivantes estimées. Maximum 12 options affichées ; ce n’est pas une liste exhaustive de tous les coups légaux.</small>}
    </section>}
  </aside>;
}
