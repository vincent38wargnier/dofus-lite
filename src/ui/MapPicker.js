import React, { useEffect, useId, useRef, useState } from 'react';
import { MAPS, MAP_IDS } from '../engine/maps';
import { RETRO_BASE, useRetroAssets } from './RetroAssets';
import { placementDescription } from './PlacementPanel';
import { useCharacterArtwork } from './characterArtwork';
import { useWorlds, WorldFilter } from './WorldsContext';

function TacticalThumbnail({ map }) {
  const hw = 9, hh = 4.5, top = 6;
  return <svg className="map-tactical-thumbnail" viewBox={`0 0 ${(map.width + map.height) * hw} ${(map.width + map.height) * hh + top * 2}`} aria-hidden="true">
    {Array.from({ length: map.width * map.height }, (_, index) => {
      const x = index % map.width, y = Math.floor(index / map.width), obstacle = map.obstacles[`${x},${y}`];
      if (obstacle?.type === 'VOID') return null;
      const px = (x - y + map.height) * hw, py = (x + y) * hh + top;
      const spawn = map.spawns.findIndex(pos => pos.x === x && pos.y === y);
      return <path key={index} d={`M${px},${py}l${hw},${hh}l${-hw},${hh}l${-hw},${-hh}Z`}
        fill={spawn === 0 ? '#80b5cc' : spawn === 1 ? '#c48b77' : obstacle?.blocksLos ? '#64715f' : obstacle?.blocksMove ? '#b2bb9f' : '#d4dfbd'} stroke="#97a68d" strokeWidth=".45" />;
    })}
  </svg>;
}

export function MapPreview({ map, artwork }) {
  const custom = useCharacterArtwork(map?.background?.artworkId).artwork;
  const image = custom?.images[map.background.file], dimensions = map?.background || artwork;
  return <span className="map-preview" style={{ aspectRatio: dimensions ? `${dimensions.width}/${dimensions.height}` : '1.6' }}>
    {image ? <img src={image} alt="" /> : artwork ? artwork.layers.map(layer => <img key={layer.name} loading="lazy" src={RETRO_BASE + layer.image} alt="" />)
      : map ? <TacticalThumbnail map={map} /> : null}
  </span>;
}

export default function MapPicker({ value, onChange, preview = false, mapIds = MAP_IDS }) {
  const assets = useRetroAssets();
  const worlds = useWorlds();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const dialog = useRef(null);
  const titleId = useId();
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);
  const selected = MAPS[value];
  const normalize = text => text.toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/;/g, ',').replace(/[\s[\]()]/g, '');
  const worldMaps = mapIds.filter(id => !worlds || worlds.matches('maps', id, worlds.selected));
  const matches = worldMaps.filter(id => normalize(MAPS[id].name).includes(normalize(query)));
  return <div className="map-picker">
    <WorldFilter />
    {preview ? <button className="selected-map-preview" type="button" onClick={() => setOpen(true)} aria-label="Choisir une autre carte">
      <MapPreview map={selected} artwork={assets?.imagesReady && assets.maps[value]} /><span>Changer de terrain</span></button> : null}
    <label className="field">Carte
      <select aria-label="Carte de combat" value={value} onChange={e => onChange(e.target.value)}>
        {!worldMaps.includes(value) && <option value={value}>{selected.name} · carte actuelle</option>}
        {worldMaps.map(id => <option key={id} value={id}>{MAPS[id].name}</option>)}
      </select>
    </label>
    <span className="map-placement-note">{placementDescription(selected)}</span>
    <button type="button" className="map-open" onClick={() => setOpen(!open)} aria-expanded={open}>Voir les {worldMaps.length} cartes</button>
    <dialog ref={dialog} className="map-gallery panel" aria-labelledby={titleId} onCancel={() => setOpen(false)} onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
      {open && <><div className="map-gallery-heading"><h3 id={titleId}>Choisir le terrain</h3><button className="btn" type="button" onClick={() => setOpen(false)}>Fermer</button></div>
      <WorldFilter />
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
