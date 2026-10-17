import { RatingSummary } from './WorldRating';
import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Download, Heart, ImagePlus, MessageCircle, Play, Upload, X } from 'lucide-react';
import { prepareCover } from './libraryCover';
import { readLibrary, withLibraryCover, LOCAL_LIBRARY_LIMITS } from './libraryFormat';
import { DemoBadge } from './Community';
import { libraryContentLabels } from './libraryContents';
import { canPlayLibrary } from './playNavigation';

export function useCoverUrl(bytes) {
  const [url,setUrl] = useState(null);
  useEffect(()=>{if(!bytes){setUrl(null);return;}const next=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));setUrl(next);return()=>URL.revokeObjectURL(next);},[bytes]);
  return url;
}
export function WorldCover({url,bytes,small=false,fallback}) {
  const local=useCoverUrl(bytes),source=local||url,[failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[source]);
  return source&&!failed?<div className={'af-world-cover'+(small?' small':'')}><img src={source} alt="" loading="lazy" decoding="async" onError={()=>setFailed(true)}/></div>:fallback;
}
export function CoverPicker({value,onChange,disabled=false,onReading}) {
  const ref=useRef(null),serial=useRef(0),url=useCoverUrl(value),[error,setError]=useState(''),[reading,setReading]=useState(false);
  async function choose(file){if(!file||disabled)return;const version=++serial.current;setError('');setReading(true);onReading?.(true);try{const next=await prepareCover(file);if(version===serial.current)onChange(next);}catch(e){if(version===serial.current)setError(e.message);}finally{if(version===serial.current){setReading(false);onReading?.(false);}}}
  return <section className="af-cover-picker" aria-label="Image de couverture"><input ref={ref} type="file" aria-label="Choisir une image de couverture" accept="image/png,image/jpeg,image/webp" hidden disabled={disabled||reading} onChange={e=>{choose(e.target.files?.[0]);e.target.value='';}}/>
    <button type="button" className={'af-cover-drop'+(url?' has-cover':'')} disabled={disabled||reading} onClick={()=>ref.current.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();choose(e.dataTransfer.files?.[0]);}}>
      {url?<img src={url} alt="Aperçu de votre couverture"/>:<ImagePlus size={32}/>}
      <span><Upload size={16}/>{reading?'Préparation de l’image…':url?'Changer l’image':'Ajouter une couverture'}</span>
    </button><div className="af-cover-help"><span>PNG, JPEG ou WebP · Format paysage conseillé · Glissez une image ici</span>{value&&<button type="button" className="af-link" disabled={disabled||reading} onClick={()=>onChange(null)}><X size={13}/>Retirer</button>}</div>
    {error&&<p className="af-form-error" role="alert">{error}</p>}
  </section>;
}
export function LibraryExportForm({types,busy,onSubmit}) {
  const [cover,setCover]=useState(null),[preparing,setPreparing]=useState(false);
  return <form className="af-form" onSubmit={e=>{e.preventDefault();onSubmit(Object.fromEntries(new FormData(e.currentTarget)),cover);}}>
    <p>Vos créations, leurs images et votre couverture dans un seul ZIP.</p>
    <CoverPicker value={cover} onChange={setCover} onReading={setPreparing} disabled={busy}/>
    <label>Nom<input name="name" required minLength={2} maxLength={100} placeholder="Mon premier univers"/></label>
    <label>Description<textarea name="description" rows={3} maxLength={5000}/></label>
    <div className="af-two"><label>Type<select name="kind">{Object.entries(types).filter(([k])=>k!=='catalogue').map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label>Version<input name="release" defaultValue="1.0.0" pattern="[0-9]+\.[0-9]+\.[0-9]+" required/></label></div>
    <button className="af-button primary" disabled={busy||preparing}><Download size={17}/>Télécharger le ZIP</button>
  </form>;
}
export function LibraryPublishForm({busy,onSubmit}) {
  const [zip,setZip]=useState(null),[cover,setCover]=useState(null),[preparing,setPreparing]=useState(false),[name,setName]=useState(''),[reading,setReading]=useState(false),[error,setError]=useState('');
  const serial=useRef(0);
  const select=async file=>{const version=++serial.current;setZip(null);setError('');setCover(null);setName('');setReading(false);if(!file)return;setReading(true);try{if(file.size>LOCAL_LIBRARY_LIMITS.zipBytes)throw Error('Bibliothèque : 512 Mio maximum.');const bytes=new Uint8Array(await file.arrayBuffer()),parsed=await readLibrary(bytes,undefined,LOCAL_LIBRARY_LIMITS);if(serial.current!==version)return;setZip({file,bytes,original:parsed.metadata.cover?parsed.files.get(parsed.metadata.cover):null});setCover(parsed.metadata.cover?parsed.files.get(parsed.metadata.cover):null);setName(parsed.metadata.name);}catch(e){if(serial.current===version)setError(e.message);}finally{if(serial.current===version)setReading(false);}};
  return <form className="af-form" onSubmit={e=>{e.preventDefault();if(!zip)return;onSubmit(async()=>{const bytes=cover!==zip.original?await withLibraryCover(zip.bytes,cover):zip.bytes;return new File([bytes],zip.file.name,{type:'application/zip'});});}}>
    <p>Choisissez votre ZIP, puis l’image qui donnera envie de découvrir votre monde.</p>
    <label>Bibliothèque ZIP<input name="zip" type="file" accept=".zip,application/zip" required disabled={busy} onChange={e=>select(e.target.files?.[0])}/></label>
    {reading&&<p role="status">Lecture du ZIP…</p>}{name&&<strong className="af-package-name">{name}</strong>}
    <CoverPicker value={cover} onChange={setCover} onReading={setPreparing} disabled={busy||reading||!zip}/>
    <p className="af-caption">La couverture est incluse dans le ZIP publié. Vous pourrez changer l’image de la page plus tard.</p>
    {error&&<p role="alert" className="af-form-error">{error}</p>}
    <label className="af-checkbox"><input type="checkbox" required/>Je suis autorisé à partager les textes, images et autres éléments de cette bibliothèque.</label>
    <button className="af-button primary" disabled={busy||reading||preparing||!zip}>Publier la bibliothèque<ArrowRight size={17}/></button>
  </form>;
}
export function CoverEditForm({busy,onSubmit}) {
  const [cover,setCover]=useState(null),[preparing,setPreparing]=useState(false);
  return <form className="af-form" onSubmit={e=>{e.preventDefault();onSubmit(cover);}}><p>Cette image change la présentation du monde. Le contenu de la version publiée reste conservé.</p><CoverPicker value={cover} onChange={setCover} onReading={setPreparing} disabled={busy}/><button className="af-button primary" disabled={busy||preparing||!cover}>Enregistrer la couverture</button></form>;
}
const number=n=>Number(n||0).toLocaleString('fr-FR');
export function LibraryActivity({library,simulation=false,onDiscussions,compact=false}) {
  const simulated=!!(simulation&&library.isDemo&&library.demoActivity),values=simulated?library.demoActivity:library;
  return <section className={'af-library-activity'+(simulated?' simulated':'')+(compact?' compact':'')} aria-label={simulated?'Activité simulée':'Activité réelle'}>
    <div className="af-activity-label">{simulated?'Activité simulée':'Activité réelle'}</div>
    <div className="af-activity-values"><span><Heart size={15}/><strong>{number(values.likes)}</strong><small>j’aime{simulated?' simulés':''}</small></span><span><Download size={15}/><strong>{number(values.downloads)}</strong><small>téléchargements{simulated?' simulés':''}</small></span><button onClick={onDiscussions}><MessageCircle size={15}/><strong>{number(library.messageCount)}</strong><small>messages{library.isDemo?' · exemples':''}</small></button></div>
    {simulated&&<p className="af-real-counts">Réel : {number(library.likes)} j’aime · {number(library.downloads)} téléchargements</p>}
  </section>;
}
export function LibraryCard({library,kind,category='all',simulation,go,fallback,onPlay,installed=false,busy=false}) {
  const l=library;
  return <article className="af-library-card af-illustrated-card"><button className="af-library-open" aria-label={'Ouvrir '+l.name} onClick={()=>go('library/'+l.id)}><WorldCover url={l.coverUrl} small fallback={fallback}/><div className="af-library-copy"><span className="af-tag">{kind}</span>{!!l.isDemo&&<DemoBadge/>}<h3>{l.name}</h3><p>{l.isDemo?l.description.split('\n\n')[0]:l.description}</p><div className="af-content-chips" aria-label="Contenu inclus">{libraryContentLabels(l,category).slice(0,3).map(({key,text,selected})=><span key={key} className={selected?'selected':''}>{text}</span>)}</div></div></button>
    <div className="af-library-footer"><div className="af-card-metadata"><RatingSummary rating={l.rating} compact/><button className="af-card-author" onClick={()=>go('player/'+l.owner)}>par {l.author}{!!l.isDemo&&<span className="af-fictional-author"> · profil fictif</span>}</button></div>
      {onPlay&&<><div className="af-card-play-actions"><button className="af-button primary" disabled={busy} onClick={()=>onPlay(l)} aria-label={(canPlayLibrary(l)?'Jouer à ':'Installer ')+l.name}>{canPlayLibrary(l)?<Play size={15}/>:<Download size={15}/>}{canPlayLibrary(l)?'Jouer':'Ajouter au jeu'}</button><button className="af-link" onClick={()=>go('library/'+l.id)}>En savoir plus<ArrowRight size={15}/></button></div><span className="af-card-install-state">{installed?'Déjà installé sur cet appareil':canPlayLibrary(l)?'Installation au premier lancement':'Contenu pour vos personnages et créations'}</span></>}
      <details className="af-card-community"><summary><MessageCircle size={14}/>{l.discussionCount||0} discussions · activité</summary><LibraryActivity library={l} simulation={simulation} compact onDiscussions={()=>go('library/'+l.id+'/discussions')}/>
      <button className="af-discussion-preview" onClick={()=>go('library/'+l.id+'/discussions')}><MessageCircle size={16}/><span><strong>Lire les discussions</strong><small>{l.latestDiscussion?.title||'Lancer la première discussion'}</small></span><ArrowRight size={15}/></button></details>
    </div>
  </article>;
}
