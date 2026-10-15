import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Code2, Copy, X } from 'lucide-react';
import SOURCE from '../bots/maisonSource.json';
import { MAISON_STAGES } from '../bots/maisonStages';

export default function AiMaisonSource({stage,onClose}) {
  const dialog=useRef(null),[selected,setSelected]=useState(stage),[copied,setCopied]=useState(false);
  useEffect(()=>{const previous=document.activeElement;if(dialog.current?.showModal)dialog.current.showModal();else dialog.current?.setAttribute('open','');return()=>previous?.focus?.();},[]);
  const chunks=SOURCE.stages[selected]?.chunks||[];
  const copy=async()=>{try{await navigator.clipboard.writeText(chunks.map(c=>`// ${c.file}:${c.line}\n${c.code}`).join('\n\n'));setCopied(true);}catch{setCopied(false);}};
  return createPortal(<dialog ref={dialog} className="ai-source-dialog" aria-label="Code interne de Maison" onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===dialog.current)onClose();}}>
    <div className="ai-source-window"><header><div><span>LE CODE DU PLANIFICATEUR</span><h2><Code2 size={22}/> Dans le cerveau de Maison</h2></div><button type="button" aria-label="Fermer le code interne" onClick={onClose}><X size={22}/></button></header>
      <p>Extraits du code exécuté par ces blocs, actualisés à chaque compilation du jeu. Les étapes partagent les variables calculées en amont.</p>
      <div className="ai-source-tools"><label>Étape<select aria-label="Étape du code Maison" value={selected} onChange={e=>{setSelected(e.target.value);setCopied(false);}}>{MAISON_STAGES.map((s,i)=><option key={s.id} value={s.id}>{i+1}. {s.title}</option>)}<option value="helpers">Fonctions de calcul partagées</option></select></label><button type="button" onClick={copy}><Copy size={16}/>{copied?'Copié':'Copier le code'}</button></div>
      <div className="ai-source-list">{chunks.map((c,i)=><section key={i}><h3>{c.file} · ligne {c.line}</h3><pre tabIndex={0}><code>{c.code}</code></pre></section>)}</div>
      <footer>Lecture du moteur · Modifiez les règles dans le graphe ou créez une IA JavaScript pour écrire une autre stratégie.</footer>
    </div>
  </dialog>,document.body);
}
