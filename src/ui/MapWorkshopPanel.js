import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Download, Undo2 } from 'lucide-react';
import { customMapErrors } from '../engine/customMaps';
import { useCharacterArtwork } from './characterArtwork';
import { OriginalMapProp } from './OriginalSpellEffect';
import WorkshopHelp, { downloadWorkshopFile, WorkshopStepIntro } from './WorkshopHelp';
import { MAP_PALETTES, MAP_BRUSHES, newWorkshopMap, paintMapCell, mapPoint, mapDiamond, workshopMapGuide, mapBackgroundPrompt, mapPropsPrompt, saveWorkshopMap, verifyMapGround, verifyMapProps } from './workshopMapModel';

export default function MapWorkshop({ initial, onSave, onCancel }) {
  const [map, setMap] = useState(() => initial || newWorkshopMap());
  const [palette, setPalette] = useState(initial ? null : 'meadow');
  const [brush, setBrush] = useState('barricade'), [tactical, setTactical] = useState(false);
  const [history, setHistory] = useState([]), [ground, setGround] = useState(null), [groundUrl, setGroundUrl] = useState(null);
  const [props, setProps] = useState(null), [propsUrl, setPropsUrl] = useState(null), [zoom,setZoom] = useState(1);
  const [panning,setPanning] = useState(false), viewport = useRef(null), pan = useRef(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [cursor, setCursor] = useState({ x: 0, y: 0 });
  const drawing = useRef(false), latest = useRef(map); latest.current = map;
  const { artwork } = useCharacterArtwork(map.background.artworkId === 'new-map' ? null : map.background.artworkId);
  useEffect(() => { const stop = () => { drawing.current = false;pan.current=null; }; window.addEventListener('pointerup',stop); window.addEventListener('pointercancel',stop); return () => { window.removeEventListener('pointerup',stop); window.removeEventListener('pointercancel',stop); }; }, []);
  useEffect(() => { if (!ground) { setGroundUrl(null); return; } const url = URL.createObjectURL(ground); setGroundUrl(url); return () => URL.revokeObjectURL(url); }, [ground]);
  useEffect(() => { if (!props) { setPropsUrl(null); return; } const url = URL.createObjectURL(props); setPropsUrl(url); return () => URL.revokeObjectURL(url); }, [props]);
  const errors = customMapErrors(map), b = map.background, color = MAP_PALETTES[palette || 'meadow'];
  const markHistory = () => setHistory(old => [...old.slice(-29), { map: latest.current, palette, ground, props }]);
  const paint = (x, y) => setMap(previous => paintMapCell(previous, { x, y }, brush));
  const pointerPaint = e => {
    if(pan.current) { viewport.current.scrollLeft=pan.current.left+pan.current.x-e.clientX;viewport.current.scrollTop=pan.current.top+pan.current.y-e.clientY;return; }
    if(!drawing.current) return;
    const svg=e.currentTarget, matrix=svg.getScreenCTM();if(!matrix)return;
    const point=svg.createSVGPoint();point.x=e.clientX;point.y=e.clientY;
    const world=point.matrixTransform(matrix.inverse()), a=world.x/b.hw-b.originX, sum=(world.y-b.top)/(b.hw/2)-1;
    paint(Math.round((a+sum)/2),Math.round((sum-a)/2));
  };
  const save = async () => { setBusy(true); setError(''); try { const value = await saveWorkshopMap(map, { ground, palette, props }); onSave(value); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  const L = { hw: b.hw, ground: p => mapPoint(map,p.x,p.y) };
  const bgImage = groundUrl || (!palette && artwork?.images[b.file]);
  return <section className="workshop-map-editor" aria-label="Dessiner mon terrain">
    <button type="button" className="btn" onClick={onCancel} disabled={busy}><ArrowLeft size={15} />Retour aux terrains</button>
    <WorkshopStepIntro number="1" title="Dessinez votre terrain">Peignez les obstacles et les départs. Le décor et les collisions utilisent ces mêmes cases. Une petite carte donne un premier combat plus rapide.</WorkshopStepIntro>
    <div className="workshop-map-settings"><label className="field">Nom du terrain<input type="text" value={map.name} maxLength={120} onChange={e => setMap({ ...map, name: e.target.value })} /></label>
      <label className="field">Nouveau format<select aria-label="Taille du terrain" value={map.width === map.height ? map.width : ''} onChange={e => { markHistory(); setMap(newWorkshopMap(Number(e.target.value), map.id)); setGround(null);setProps(null); setPalette('meadow'); setCursor({ x:0,y:0 }); }}>
        {![8,12,18,24,32,40].includes(map.width) || map.width !== map.height ? <option value={map.width === map.height ? map.width : ''}>{map.width} × {map.height} · actuel</option> : null}
        {[8,12,18,24,32,40].map(size => <option key={size} value={size}>{size} × {size}{size === 12 ? ' · conseillé' : size >= 24 ? ' · armée' : ''}</option>)}</select><small>Changer le format crée un terrain vide. Annuler reste possible.</small></label>
      <label className="field">Sol sans image<select aria-label="Ambiance du terrain" value={palette || ''} onChange={e => { setPalette(e.target.value || null); setGround(null); }}>
        {initial && <option value="">Image actuelle</option>}{Object.entries(MAP_PALETTES).map(([id,p]) => <option key={id} value={id}>{p.name}</option>)}</select></label></div>
    <div className="workshop-map-tools" role="group" aria-label="Pinceaux du terrain">{MAP_BRUSHES.map(tool => <button className={`btn brush-${tool.id}`} type="button" key={tool.id} aria-pressed={!panning && brush === tool.id} onClick={() => {setBrush(tool.id);setPanning(false);}}>{tool.label}</button>)}</div>
    <div className="workshop-map-status"><span>{panning ? 'Glissez pour déplacer la vue, puis reprenez un pinceau.' : `${MAP_BRUSHES.find(tool => tool.id === brush).hint} Cliquez ou glissez sur les cases.`}</span><button type="button" className="btn" onClick={() => setTactical(!tactical)} aria-pressed={tactical}>{tactical ? 'Voir les décors' : 'Voir les collisions'}</button>
      <button type="button" className="btn" disabled={!history.length || busy} onClick={() => { const last=history.at(-1); setMap(last.map);setPalette(last.palette);setGround(last.ground);setProps(last.props);setHistory(history.slice(0,-1)); }}><Undo2 size={15} />Annuler</button>
      <button type="button" className="btn" aria-label="Réduire l’aperçu du terrain" disabled={zoom===1} onClick={()=>{setZoom(z=>z-.5);if(zoom===1.5)setPanning(false);}}>−</button><span className="workshop-edit-zoom">{Math.round(zoom*100)} %</span><button type="button" className="btn" aria-label="Agrandir l’aperçu du terrain" disabled={zoom===3} onClick={()=>setZoom(z=>z+.5)}>+</button>
      {zoom>1&&<button type="button" className="btn" aria-pressed={panning} onClick={()=>setPanning(!panning)}>{panning?'Reprendre le pinceau':'Déplacer la vue'}</button>}</div>
    <div className="workshop-map-viewport" ref={viewport}><svg className="workshop-map-canvas" style={zoom>1?{width:`${zoom*100}%`,maxHeight:'none',cursor:panning?'grab':undefined}:undefined} viewBox={`0 0 ${b.width} ${b.height}`} role="group" aria-label="Cases du terrain" onContextMenu={e => e.preventDefault()} onPointerDownCapture={e=>{if(!panning||e.button!==0)return;e.preventDefault();pan.current={x:e.clientX,y:e.clientY,left:viewport.current.scrollLeft,top:viewport.current.scrollTop};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={pointerPaint} onPointerUp={()=>{drawing.current=false;pan.current=null;}} onPointerCancel={()=>{drawing.current=false;pan.current=null;}}>
      <rect width={b.width} height={b.height} fill="#25323a" />
      {!tactical && bgImage && <image href={bgImage} width={b.width} height={b.height} />}
      {Array.from({length:map.width*map.height},(_,i) => {
        const x=i%map.width,y=Math.floor(i/map.width), obstacle=map.obstacles.find(o => o.x===x&&o.y===y), camp=map.startingCells.findIndex(list => list.some(p=>p.x===x&&p.y===y));
        const fill = tactical ? obstacle ? '#525e68' : '#c7d0d0' : bgImage ? 'transparent' : (x*17+y*29)%7 === 0 ? color.detail : color.ground;
        return <polygon key={i} points={mapDiamond(map,x,y)} fill={camp===0?'#469bcc':camp===1?'#bd615b':fill} fillOpacity={camp>=0 && !tactical ? .65 : 1} stroke={tactical?'#728086':'#ffffff26'} strokeWidth="1" />;
      })}
      {!tactical && <foreignObject width={b.width} height={b.height} pointerEvents="none"><div style={{ position:'relative',width:b.width,height:b.height }}>{map.obstacles.filter(o=>o.prop).map(o => <OriginalMapProp key={`${o.x},${o.y}`} obstacle={o} L={L} artwork={propsUrl?{images:{[b.propsFile]:propsUrl}}:artwork} background={b} />)}</div></foreignObject>}
      {Array.from({length:map.width*map.height},(_,i) => {
        const x=i%map.width,y=Math.floor(i/map.width);
        return <polygon key={i} role="button" aria-label={`Case ${x+1}, ${y+1}`} tabIndex={cursor.x===x&&cursor.y===y?0:-1} data-map-cell={`${x},${y}`} points={mapDiamond(map,x,y)} fill="transparent" className="workshop-paint-cell"
          onPointerDown={e => { if(e.button!==0 || panning) return; e.preventDefault(); markHistory(); drawing.current=true; e.currentTarget.parentElement.setPointerCapture?.(e.pointerId); paint(x,y); setCursor({x,y}); }}
          onKeyDown={e => { if(['Enter',' '].includes(e.key)){ e.preventDefault();markHistory();paint(x,y); } else if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const nx=Math.max(0,Math.min(map.width-1,x+({ArrowRight:1,ArrowLeft:-1}[e.key]||0))), ny=Math.max(0,Math.min(map.height-1,y+({ArrowDown:1,ArrowUp:-1}[e.key]||0)));setCursor({x:nx,y:ny});e.currentTarget.parentElement.querySelector(`[data-map-cell="${nx},${ny}"]`)?.focus();} }} />;
      })}
    </svg></div>
    <p className="workshop-map-counts">{map.width * map.height} cases · {map.obstacles.length} obstacles · {map.startingCells[0].length} départs alliés · {map.startingCells[1].length} départs ennemis. Au clavier : flèches et Espace.</p>
    <details className="workshop-ground-art"><summary>Personnaliser l’image du sol</summary>
      <label className="field">Thème du terrain<textarea rows={2} value={map.description} maxLength={800} onChange={e=>setMap({...map,description:e.target.value})} placeholder="Une cour enneigée, la lumière de l’aube…" /></label>
      <WorkshopHelp title="Générer le sol de cette carte" manual="Le sol proposé suffit pour jouer. Vous pouvez aussi dessiner sur le gabarit ou le joindre à une IA. Les obstacles sont ajoutés par le jeu : ne les peignez pas dans le fond." prompt={mapBackgroundPrompt(map)} filename="prompt-sol.txt" />
      <div className="workshop-help-actions"><button type="button" className="btn" onClick={()=>downloadWorkshopFile('terrain-guide.svg',workshopMapGuide(map),'image/svg+xml')}><Download size={15}/>Gabarit de cette carte</button>
        <label className="btn workshop-file-button">Importer le sol<input type="file" aria-label="Importer le sol" accept="image/png,.png" disabled={busy} onChange={async e => { const file=e.target.files[0];e.target.value='';if(!file)return;setBusy(true);setError('');try{await verifyMapGround(file,map);setGround(file);setPalette(null);}catch(problem){setError(problem.message);}finally{setBusy(false);} }} /></label></div>
      <small>PNG {b.width} × {b.height} · 8 Mio maximum. L’image sera incluse dans votre export ZIP.</small>
      <WorkshopHelp title="Créer les piliers, braseros et barricades" manual="Les trois décors dessinés par le jeu suffisent. Pour changer leur style, dessinez ou générez cette planche transparente, puis importez-la ici. Vérifiez les points d’appui avec la vue des collisions." prompt={mapPropsPrompt(map)} filename="prompt-decors.txt" />
      <label className="btn workshop-file-button">Importer les trois décors<input type="file" aria-label="Importer les trois décors" accept="image/png,.png" disabled={busy} onChange={async e=>{
        const file=e.target.files[0];e.target.value='';if(!file)return;setBusy(true);setError('');try{await verifyMapProps(file);setProps(file);setMap(previous=>({...previous,background:{...previous.background,propsFile:previous.background.propsFile || (previous.background.file==='props.png'?'scenery.png':'props.png')}}));}catch(problem){setError(problem.message);}finally{setBusy(false);}
      }}/></label><small> PNG transparent · 768 × 256 · pilier, brasero, barricade</small>
    </details>
    {!!errors.length && <div className="creator-warning" role="alert">{errors.map(e=><p key={e}>{e}</p>)}</div>}{error&&<p className="creator-warning" role="alert">{error}</p>}
    <div className="workshop-step-footer"><small>Les deux camps doivent pouvoir se rejoindre.</small><button type="button" className="btn primary" disabled={busy||!!errors.length} onClick={save}><Check size={16}/>{busy?'Enregistrement…':'Utiliser ce terrain'}</button></div>
  </section>;
}
