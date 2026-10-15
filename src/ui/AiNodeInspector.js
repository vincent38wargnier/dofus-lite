import React, { useState } from 'react';
import { Trash2, RotateCcw, SlidersHorizontal, GitBranch, BrainCircuit, Code2, UnfoldVertical, FoldVertical } from 'lucide-react';
import { FLOW_METRICS, FLOW_OPERATORS, FLOW_WEIGHTS, PLAN_KINDS, flowTitle, flowPorts, portLabel } from '../bots/visualGraph';
import { DEFAULT_WEIGHTS } from '../bots/utilityBrain';
import TUNED from '../bots/cortexWeights.json';
import { maisonWeightsFor } from '../bots/maison';
import { MAISON_STAGES, MAISON_CONTROLS } from '../bots/maisonStages';
import AiMaisonSource from './AiMaisonSource';

export const FLOW_BLOCKS=[
  {type:'condition',label:'Condition',detail:'PV, PA, distance, tour…',icon:GitBranch},
  ...['auto','damage','heal','buff','control','summon','weapon','spell','advance','retreat'].map(kind=>({type:'plan',kind,label:PLAN_KINDS[kind],detail:kind==='auto'?'Le cerveau Maison, réglable':'Sinon, essayer le bloc suivant',icon:BrainCircuit})),
];
export default function AiNodeInspector({graph,node,onChange,onDelete,onConnect,readOnly,adding,onAdd,spells=[],myClass='IOP',opponentClass='CRA',onExpand,onCollapse}) {
  const [source,setSource]=useState(null);
  if(adding)return <aside className="ai-inspector"><header><span className="ai-eyebrow">BOÎTE À OUTILS</span><h3>Une idée, un bloc</h3><p>Le nouveau bloc s’insère après votre sélection. Vous pouvez ensuite changer ses connexions.</p></header>
    <div className="ai-block-palette">{FLOW_BLOCKS.map(b=><button type="button" key={b.kind||b.type} onClick={()=>onAdd(b)}><b.icon size={19}/><span><strong>{b.label}</strong><small>{b.detail}</small></span></button>)}</div></aside>;
  if(!node)return <aside className="ai-inspector"><header><SlidersHorizontal size={24}/><h3>Votre logique, bloc par bloc</h3><p>Sélectionnez un bloc pour voir son rôle et modifier ses règles.</p></header></aside>;
  const stage=node.type==='maison-stage'?MAISON_STAGES.find(s=>s.id===node.config.stage):null;
  const config=node.config||{}, update=patch=>onChange({...node,...patch}), configure=patch=>update({config:{...config,...patch}});
  const weights={...DEFAULT_WEIGHTS,...TUNED,...(config.base==='cortex'?{}:maisonWeightsFor(myClass,opponentClass)),...config.weights};
  return <aside className="ai-inspector"><header><span className="ai-eyebrow">{readOnly?'RÉFÉRENCE · LECTURE':'RÉGLAGES DU BLOC'}</span><h3>{flowTitle(node)}</h3></header>
    {stage&&<div className="ai-stage-intro"><span className="ai-stage-number">ÉTAPE {MAISON_STAGES.indexOf(stage)+1} / 7 · EXÉCUTABLE</span><p>{stage.description}</p><dl><dt>Entrée</dt><dd>{stage.input}</dd><dt>Résultat</dt><dd>{stage.output}</dd></dl><button type="button" className="ai-button" onClick={()=>setSource(stage.id)}><Code2 size={15}/> Code de cette étape</button></div>}
    {node.type==='plan'&&!['advance','retreat'].includes(config.kind)&&<button type="button" className="ai-button ai-expand-maison" onClick={()=>onExpand(node.id)}><UnfoldVertical size={16}/> Déplier le cerveau</button>}
    <fieldset disabled={readOnly}>
      <label className="ai-field">Nom du bloc<input value={node.label||''} maxLength={80} placeholder={flowTitle(node)} onChange={e=>update({label:e.target.value})}/></label>
      {node.type==='condition'&&<>
        <label className="ai-field">Observer<select value={config.metric} onChange={e=>configure({metric:e.target.value,value:Math.min(config.value,FLOW_METRICS[e.target.value].max)})}>{Object.entries(FLOW_METRICS).map(([k,m])=><option key={k} value={k}>{m.label}</option>)}</select></label>
        <div className="ai-field-row"><label className="ai-field">Condition<select value={config.operator} onChange={e=>configure({operator:e.target.value})}>{Object.entries(FLOW_OPERATORS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label className="ai-field">Seuil<input type="number" min="0" max={FLOW_METRICS[config.metric]?.max} value={config.value} onChange={e=>configure({value:e.target.value===''?0:Number(e.target.value)})}/></label></div>
        <p>La branche <b>Oui</b> est suivie si la condition est vraie. Les valeurs sont relues après chaque action.</p>
      </>}
      {(node.type==='plan'||stage?.id==='profile')&&<>
        <label className="ai-field">Action recherchée<select value={config.kind} onChange={e=>configure({kind:e.target.value})}>{Object.entries(PLAN_KINDS).filter(([k])=>!stage||!['advance','retreat'].includes(k)).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
        {config.kind==='spell'&&<label className="ai-field">Identifiant du sort<input list="ai-spell-keys" value={config.spellKey||''} onChange={e=>configure({spellKey:e.target.value})} placeholder="Ex. epee_de_iop"/><datalist id="ai-spell-keys">{spells.map(s=><option key={s.key} value={s.key}>{s.name}</option>)}</datalist><small>Le sort doit exister dans le grimoire joué. Sinon, la branche « Impossible » est suivie.</small></label>}
        {!['advance','retreat'].includes(config.kind)&&<>
          <label className="ai-field">Base de calcul<select value={config.base} onChange={e=>configure({base:e.target.value})}><option value="maison">IA Maison · adaptée aux classes</option><option value="cortex">Cortex · mêmes priorités pour tous</option></select></label>
          <p>Le moteur choisit une action légale : PA, portée, obstacles et relances restent appliqués. Les sorts mixtes peuvent appartenir à plusieurs catégories.</p>
          <div className="ai-weight-intro"><SlidersHorizontal size={16}/><strong>Vos priorités</strong><button type="button" className="ai-icon-button" title="Reprendre les réglages de base" aria-label="Réinitialiser les priorités" onClick={()=>configure({weights:{}})}><RotateCcw size={14}/></button></div>
          <small className="ai-inherit-note">Sans modification : valeurs héritées du combattant testé, face à son adversaire.</small>
          {[...new Set(FLOW_WEIGHTS.map(w=>w.group))].map((group,i)=><details key={group} className="ai-weight-group" open={i===0?true:undefined}><summary>{group}</summary>{FLOW_WEIGHTS.filter(w=>w.group===group).map(w=><label className="ai-weight" key={w.key}><span>{w.label}<b>{Number(weights[w.key]||0).toFixed(2)}{Object.hasOwn(config.weights||{},w.key)?' •':''}</b></span><input type="range" min="0" max={w.max} step="0.05" aria-label={w.label} value={Math.min(w.max,weights[w.key]||0)} onChange={e=>configure({weights:{...config.weights,[w.key]:Number(e.target.value)}})}/><small>{w.hint}</small></label>)}</details>)}
        </>}
        {!stage&&<div className="ai-rule-note">Une action trouvée est jouée immédiatement. Sinon, le graphe suit <b>Impossible</b>. {config.kind==='auto'?'Ce bloc compare les sorts, les enchaînements et les placements.':config.kind==='advance'||config.kind==='retreat'?'Ce bloc suit une règle de distance simple ; « Meilleure action » évalue aussi le danger.':'Ce bloc lance un sort depuis la case actuelle ; il ne déplace pas le combattant.'}</div>}
      </>}
      {stage&&MAISON_CONTROLS.filter(c=>c.stage===stage.id).map(c=>{
        const value=config.settings?.[c.key]??c.default,set=value=>configure({settings:{...config.settings,[c.key]:value}});
        return <label className={`ai-field ai-stage-control${typeof c.default==='boolean'?' is-toggle':''}`} key={c.key}><span>{c.label}</span>
          {c.choices?<select aria-label={c.label} value={value} onChange={e=>set(e.target.value)}>{Object.entries(c.choices).map(([k,label])=><option key={k} value={k}>{label}</option>)}</select>
            :typeof c.default==='boolean'?<input aria-label={c.label} type="checkbox" checked={value} onChange={e=>set(e.target.checked)}/>
            :<input aria-label={c.label} type="number" value={value} min={c.min} max={c.max} step={c.step} onChange={e=>set(e.target.value===''?c.min:Number(e.target.value))}/>}
          <small>{c.hint} <b>Maison : {typeof c.default==='boolean'?(c.default?'activé':'désactivé'):c.choices?.[c.default]||c.default}.</b></small>
        </label>;
      })}
      {stage&&stage.id!=='profile'&&MAISON_CONTROLS.some(c=>c.stage===stage.id)&&<button type="button" className="ai-button" onClick={()=>configure({settings:{}})}><RotateCcw size={14}/> Réglages Maison</button>}
      {node.type==='start'&&<p>Le graphe démarre ici à chaque décision. Une attaque, un soin ou un déplacement termine cet appel. Le prochain appel utilise les nouvelles valeurs du combat.</p>}
      {node.type==='end'&&<p>Le combattant passe son tour. Ses PA et PM restants ne sont plus utilisés.</p>}
      {flowPorts(node).length>0&&(!stage||stage.id==='choose')&&<div className="ai-node-connections"><h4>Connexions</h4>{flowPorts(node).map(p=><label className="ai-field" key={p}>{portLabel(p)}<select aria-label={`Destination ${portLabel(p)}`} value={node.links[p]||''} onChange={e=>onConnect(node.id,p,e.target.value)}><option value="">À relier…</option>{graph.nodes.filter(n=>n.id!==node.id&&n.type!=='start'&&(n.type!=='maison-stage'||n.config.stage==='profile')).map(n=><option key={n.id} value={n.id}>{flowTitle(n)}</option>)}</select></label>)}</div>}
      {!['start','end','maison-stage'].includes(node.type)&&<button type="button" className="ai-button ai-delete" onClick={()=>onDelete(node.id)}><Trash2 size={15}/> Retirer ce bloc</button>}
    </fieldset>
    {stage&&<div className="ai-rule-note">L’ordre des sept étapes conserve leurs dépendances. Ajoutez vos conditions avant ce pipeline ou vos alternatives après sa sortie « Impossible ».<button type="button" className="ai-button" onClick={()=>onCollapse(config.group)}><FoldVertical size={14}/> Replier le cerveau</button></div>}
    {source&&<AiMaisonSource stage={source} onClose={()=>setSource(null)}/>}
  </aside>;
}
