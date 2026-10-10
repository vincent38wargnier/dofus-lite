import React, { useEffect, useId, useRef, useState } from 'react';
import { MAPS, MAP_IDS } from '../engine/maps';
import { RETRO_BASE, useRetroAssets } from './RetroAssets';
import { placementDescription } from './PlacementPanel';

export function MapPreview({ map, artwork }) {
  return <span className="map-preview" style={{ aspectRatio: artwork ? `${artwork.width}/${artwork.height}` : '1.6' }}>
    {artwork ? artwork.layers.map(layer => <img key={layer.name} loading="lazy" src={RETRO_BASE + layer.image} alt="" />)
      : <span className="map-placeholder">{map.id === 'canyon' ? '🏜️' : map.id === 'muraille' ? '🏰' : '⚔️'}</span>}
  </span>;
}

export default function MapPicker({ value, onChange, preview = false, mapIds = MAP_IDS }) {
  const assets = useRetroAssets();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const dialog = useRef(null);
  const titleId = useId();
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);
  const selected = MAPS[value];
  const normalize = text => text.toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/;/g, ',').replace(/[\s[\]()]/g, '');
  const matches = mapIds.filter(id => normalize(MAPS[id].name).includes(normalize(query)));
  return <div className="map-picker">
    {preview ? <button className="selected-map-preview" type="button" onClick={() => setOpen(true)} aria-label="Choisir une autre carte">
      <MapPreview map={selected} artwork={assets?.imagesReady && assets.maps[value]} /><span>Changer de terrain</span></button> : null}
    <label className="field">Carte
      <select aria-label="Carte de combat" value={value} onChange={e => onChange(e.target.value)}>
        {mapIds.map(id => <option key={id} value={id}>{MAPS[id].name}</option>)}
      </select>
    </label>
    <span className="map-placement-note">{placementDescription(selected)}</span>
    <button type="button" className="map-open" onClick={() => setOpen(!open)} aria-expanded={open}>Voir les {mapIds.length} cartes</button>
    <dialog ref={dialog} className="map-gallery panel" aria-labelledby={titleId} onCancel={() => setOpen(false)} onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
      {open && <><div className="map-gallery-heading"><h3 id={titleId}>Choisir le terrain</h3><button className="btn" type="button" onClick={() => setOpen(false)}>Fermer</button></div>
      <input type="text" aria-label="Rechercher une carte" placeholder="Astrub, Amakna, 5;-23…" value={query} onChange={e => setQuery(e.target.value)} />
      <div className="map-cards">{matches.map(id => {
        const map = MAPS[id];
        return <button type="button" key={id} className={`map-card${id === value ? ' selected' : ''}`}
          aria-pressed={id === value} onClick={() => { onChange(id); setOpen(false); }}>
          <MapPreview map={map} artwork={assets?.imagesReady && assets.maps[id]} />
          <strong>{map.name.replace('🗺 ', '')}</strong>
          <span>{map.walkableCells || map.width * map.height - Object.keys(map.obstacles).length} cases · {map.startingCells.map(cells => cells.length).join(' / ')} départs</span>
          <span className="map-placement-note">{placementDescription(map)}</span>
        </button>;
      })}</div>
      {!matches.length && <p>Aucune carte ne correspond à cette recherche.</p>}
      <p className="muted small">Sélection : {selected.name}. Le terrain choisi s’applique au prochain combat.</p>
    </>}
    </dialog>
  </div>;
}
