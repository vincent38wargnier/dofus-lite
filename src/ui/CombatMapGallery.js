import React, { useMemo, useState } from 'react';
import { ArrowRight, Check, Search } from 'lucide-react';
import { MAPS } from '../engine/maps';
import { fold } from './creationCatalogue';
import { MapPreview } from './MapPicker';
import { useRetroAssets } from './RetroAssets';

export const combatMapName = map => map?.name.replace(/^🗺\s*/, '') || 'Choisissez une carte';
const kind = map => map.kind === 'dungeon' ? 'Donjon' : map.sourceId ? 'Dofus' : 'Arène';
const order = { Dofus: 0, Donjon: 1, Arène: 2 };
const maps = Object.values(MAPS).sort((a, b) => order[kind(a)] - order[kind(b)] || a.name.localeCompare(b.name, 'fr', { numeric: true }));

export default function CombatMapGallery({ mapId, onChoose }) {
  const assets = useRetroAssets();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('Tous');
  const matches = useMemo(() => maps.filter(map => (filter === 'Tous' || kind(map) === filter)
    && fold(`${combatMapName(map)} ${map.area || ''} ${map.coordinate || ''}`).replace(/[;\s]/g, '').includes(fold(query).replace(/[;\s]/g, ''))), [query, filter]);
  return <section className="duel-map-browser" aria-label="Choisir le terrain">
    <div className="duel-catalogue-tools"><div className="duel-source-tabs" role="group" aria-label="Types de cartes">
      {['Tous', 'Dofus', 'Donjon', 'Arène'].map(value => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === 'Donjon' ? 'Donjons' : value === 'Arène' ? 'Arènes' : value}</button>)}
    </div><label className="duel-search"><Search size={17} /><input type="search" aria-label="Rechercher une carte" placeholder="Nom, lieu ou coordonnées…" value={query} onChange={event => setQuery(event.target.value)} /></label></div>
    <div className="duel-map-grid">{matches.map(map => <button type="button" key={map.id} className="duel-map-card" data-map-id={map.id} aria-pressed={mapId === map.id} onClick={() => onChoose(map.id)}>
      <MapPreview map={map} artwork={assets?.imagesReady && assets.maps[map.id]} />
      <span className="duel-map-card-info"><span><strong>{combatMapName(map)}</strong><small>{kind(map)} · {map.walkableCells || map.width * map.height - Object.values(map.obstacles).filter(obstacle => obstacle.blocksMove).length} cases libres</small></span>{mapId === map.id ? <Check size={18} /> : <ArrowRight size={16} />}</span>
    </button>)}</div>
    {!matches.length && <p className="duel-catalogue-empty">Aucune carte ne correspond à votre recherche.</p>}
  </section>;
}
