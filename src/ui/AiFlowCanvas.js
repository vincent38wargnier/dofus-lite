import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BrainCircuit, GitBranch, Play, Square, Plus, Minus, Maximize, MousePointer2, SlidersHorizontal, ScanEye, Target, Wand2, Layers, Route, Check } from 'lucide-react';
import { flowPorts, flowTitle, flowSummary, portLabel, FLOW_LIMIT } from '../bots/visualGraph';
import { MAISON_STAGES } from '../bots/maisonStages';

const W=234, H=146;
const output=(n,p)=>({x:n.x+W,y:n.y+66+flowPorts(n).indexOf(p)*31});
const input=n=>({x:n.x,y:n.y+66});
const curve=(a,b)=>{if(b.x<a.x&&b.y-a.y>180){const y=b.y-96;return `M ${a.x} ${a.y} H ${a.x+28} Q ${a.x+40} ${a.y} ${a.x+40} ${a.y+12} V ${y-12} Q ${a.x+40} ${y} ${a.x+28} ${y} H ${b.x-28} Q ${b.x-40} ${y} ${b.x-40} ${y+12} V ${b.y-12} Q ${b.x-40} ${b.y} ${b.x-28} ${b.y} H ${b.x}`;}const d=Math.max(65,Math.abs(b.x-a.x)*.48);return `M ${a.x} ${a.y} C ${a.x+d} ${a.y}, ${b.x-d} ${b.y}, ${b.x} ${b.y}`;};
const stageIcons={profile:SlidersHorizontal,observe:ScanEye,target:Target,spells:Wand2,combos:Layers,movement:Route,choose:Check};
export default function AiFlowCanvas({graph,selected,onSelect,onChange,onConnect,readOnly,trace=[],activeStep=-1,resetKey,onAdd}) {
  const box=useRef(null), drag=useRef(null), viewRef=useRef(null), wireRef=useRef(null), fitRef=useRef(null);
  const [view,setView]=useState({x:35,y:45,zoom:.8}), [preview,setPreview]=useState(null), [wire,setWire]=useState(null),[pointer,setPointer]=useState(null);
  viewRef.current=view;wireRef.current=wire;
  const fit=(initial=false)=>{const r=box.current?.getBoundingClientRect();if(!r?.width)return;
    const minX=Math.min(...graph.nodes.map(n=>n.x)),minY=Math.min(...graph.nodes.map(n=>n.y));
    const width=Math.max(...graph.nodes.map(n=>n.x+W))-minX,height=Math.max(...graph.nodes.map(n=>n.y+H))-minY;
    const zoom=Math.max(.2,Math.min(1.15,(r.width-90)/width,(r.height-105)/height));
    // Keep the selected block readable on narrow screens or large graphs.
    // The explicit Fit control still shows the complete graph at any scale.
    if(initial===true&&zoom<.65){const n=graph.nodes.find(n=>n.id===selected)||graph.nodes[0],z=.8;
      setView({x:r.width/2-(n.x+W/2)*z,y:r.height/2-(n.y+H/2)*z,zoom:z});return;}
    setView({x:(r.width-width*zoom)/2-minX*zoom,y:(r.height-height*zoom)/2-minY*zoom,zoom});};
  fitRef.current=fit;
  useEffect(()=>{if(typeof ResizeObserver==='undefined')return;let width=0;const observer=new ResizeObserver(entries=>{const next=entries[0].contentRect.width;if(next>0&&next!==width){width=next;fitRef.current(true);}});observer.observe(box.current);return()=>observer.disconnect();},[]);
  useLayoutEffect(()=>{fit(true);setWire(null);setPreview(null);},[resetKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{const el=box.current;const wheel=e=>{e.preventDefault();const v=viewRef.current;
    if(e.ctrlKey||e.metaKey){const r=el.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top,z=Math.max(.2,Math.min(1.8,v.zoom*Math.exp(-e.deltaY*.005)));setView({zoom:z,x:x-(x-v.x)*z/v.zoom,y:y-(y-v.y)*z/v.zoom});}
    else setView({...v,x:v.x-e.deltaX,y:v.y-e.deltaY});};el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel);},[]);
  const zoomBy=delta=>{const r=box.current.getBoundingClientRect(),v=viewRef.current,z=Math.max(.2,Math.min(1.8,v.zoom+delta));setView({zoom:z,x:r.width/2-(r.width/2-v.x)*z/v.zoom,y:r.height/2-(r.height/2-v.y)*z/v.zoom});};
  const world=e=>{const r=box.current.getBoundingClientRect(),v=viewRef.current;return {x:(e.clientX-r.left-v.x)/v.zoom,y:(e.clientY-r.top-v.y)/v.zoom};};
  const nodes=graph.nodes.map(n=>preview?.id===n.id?{...n,x:preview.x,y:preview.y}:n);
  const connect=target=>{if(wireRef.current){onConnect(wireRef.current.id,wireRef.current.port,target);setWire(null);}};
  const visited=new Set(trace.slice(0,activeStep<0?trace.length:activeStep+1).map(t=>t.node));
  const active=trace[activeStep]?.node;
  const edgeVisited=(id,p)=>trace.slice(0,activeStep<0?trace.length:activeStep+1).some(t=>t.node===id&&t.port===p);
  return <div className="ai-canvas-shell">
    <div className="ai-canvas-toolbar"><span><i/> FLUX DE DÉCISION · {graph.nodes.length}/{FLOW_LIMIT}</span><button type="button" className="ai-button" disabled={readOnly||graph.nodes.length>=FLOW_LIMIT} onClick={onAdd}><Plus size={15}/> Ajouter un bloc</button></div>
    <div ref={box} className={`ai-canvas${graph.nodes.some(n=>n.type==='maison-stage')?' has-maison':''}${wire?' connecting':''}`} role="region" aria-label="Graphe de décision" tabIndex={0}
      onKeyDown={e=>{if(e.key==='Escape'){setWire(null);drag.current=null;setPreview(null);}if(e.target!==box.current)return;
        if(e.key==='+'||e.key==='='){e.preventDefault();zoomBy(.1);}if(e.key==='-'){e.preventDefault();zoomBy(-.1);}}}
      onPointerDown={e=>{if(e.button!==0||e.target.closest('.ai-flow-node'))return;setWire(null);drag.current={kind:'pan',x:e.clientX,y:e.clientY,view};e.currentTarget.setPointerCapture(e.pointerId);}}
      onPointerMove={e=>{if(wireRef.current)setPointer(world(e));const d=drag.current;if(!d)return;
        if(d.kind==='pan')setView({...d.view,x:d.view.x+e.clientX-d.x,y:d.view.y+e.clientY-d.y});
        else setPreview({id:d.id,x:Math.max(0,Math.min(12000,d.node.x+(e.clientX-d.x)/view.zoom)),y:Math.max(0,Math.min(12000,d.node.y+(e.clientY-d.y)/view.zoom))});}}
      onPointerUp={e=>{const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-flow-input]')?.dataset.flowInput;
        if(wireRef.current&&target)connect(target);if(drag.current?.kind==='node'&&preview)onChange({...graph,nodes:graph.nodes.map(n=>n.id===preview.id?{...n,x:Math.round(preview.x),y:Math.round(preview.y)}:n)});
        drag.current=null;setPreview(null);}}
      onPointerCancel={()=>{drag.current=null;setPreview(null);setWire(null);}}>
      <div className="ai-flow-world" style={{transform:`translate(${view.x}px, ${view.y}px) scale(${view.zoom})`}}>
        <svg className="ai-flow-lines" width="1" height="1" aria-hidden="true">{nodes.flatMap(n=>flowPorts(n).map(p=>{
          const target=nodes.find(t=>t.id===n.links?.[p]);if(!target)return null;
          return <path key={`${n.id}:${p}`} d={curve(output(n,p),input(target))} className={`${edgeVisited(n.id,p)?'visited':''} edge-${p}`}/>;
        }))}{wire&&pointer&&nodes.some(n=>n.id===wire.id)&&<path className="pending" d={curve(output(nodes.find(n=>n.id===wire.id),wire.port),pointer)}/>}</svg>
        {nodes.map(n=>{const Icon=n.type==='maison-stage'?stageIcons[n.config.stage]||BrainCircuit:n.type==='start'?Play:n.type==='end'?Square:n.type==='condition'?GitBranch:BrainCircuit;
          return <article key={n.id} data-flow-node={n.id} className={`ai-flow-node type-${n.type}${selected===n.id?' selected':''}${visited.has(n.id)?' visited':''}${active===n.id?' active-trace':''}`} style={{left:n.x,top:n.y,width:W,height:H}}>
            {n.type==='maison-stage'&&<span className="ai-stage-badge">{MAISON_STAGES.findIndex(s=>s.id===n.config.stage)+1} / 7</span>}
            {n.type!=='start'&&<button type="button" className="ai-port ai-input" data-flow-input={n.id} aria-label={`Relier vers ${flowTitle(n)}`} disabled={readOnly||(n.type==='maison-stage'&&n.config.stage!=='profile')} onClick={e=>{e.stopPropagation();connect(n.id);}}/>}
            <button type="button" className="ai-node-content" aria-label={`Configurer ${flowTitle(n)}`} onClick={()=>onSelect(n.id)}
              onPointerDown={e=>{onSelect(n.id);if(readOnly||wireRef.current||e.button!==0)return;drag.current={kind:'node',id:n.id,node:n,x:e.clientX,y:e.clientY};e.currentTarget.setPointerCapture(e.pointerId);}}
              onKeyDown={e=>{if(readOnly||!e.shiftKey)return;const d={ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]}[e.key];if(!d)return;e.preventDefault();onChange({...graph,nodes:graph.nodes.map(v=>v.id===n.id?{...v,x:Math.max(0,Math.min(12000,v.x+d[0])),y:Math.max(0,Math.min(12000,v.y+d[1]))}:v)});}}>
              <span className="ai-node-icon"><Icon size={21}/></span><span className="ai-node-label">{flowTitle(n)}</span><small>{flowSummary(n)}</small>
            </button>
            {flowPorts(n).map((p,i)=><button type="button" key={p} className={`ai-port ai-output port-${p}${wire?.id===n.id&&wire.port===p?' pending':''}`} style={{top:57+i*31}}
              aria-label={`${flowTitle(n)} : sortie ${portLabel(p)}`} disabled={readOnly||(n.type==='maison-stage'&&n.config.stage!=='choose')}
              onPointerDown={e=>{e.stopPropagation();setWire({id:n.id,port:p});setPointer(output(n,p));e.currentTarget.setPointerCapture(e.pointerId);}}
              onClick={e=>{e.stopPropagation();if(e.detail===0){setWire({id:n.id,port:p});setPointer(output(n,p));}}}><span>{portLabel(p)}</span></button>)}
          </article>;
        })}
      </div>
      {!graph.nodes.length&&<p>Ajoutez un premier bloc.</p>}
    </div>
    <div className="ai-canvas-bottom"><span><MousePointer2 size={14}/>{wire?'Choisissez l’entrée d’un bloc · Échap pour annuler':'Déplacez les blocs · Reliez une sortie à une entrée'}</span>
      <div><button type="button" className="ai-icon-button" aria-label="Dézoomer le graphe" onClick={()=>zoomBy(-.15)}><Minus size={16}/></button><span>{Math.round(view.zoom*100)} %</span><button type="button" className="ai-icon-button" aria-label="Zoomer le graphe" onClick={()=>zoomBy(.15)}><Plus size={16}/></button><button type="button" className="ai-icon-button" aria-label="Ajuster le graphe" onClick={fit}><Maximize size={16}/></button></div>
    </div>
  </div>;
}
