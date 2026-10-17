import React, { useRef, useState } from 'react';
import { Download, Upload, Check, PackageOpen, Play, Search, UserRound, Castle, Hammer } from 'lucide-react';
import { CharacterDialog } from './CharacterDialog';
import { RetroPortrait, useRetroAssets } from './RetroAssets';
import EquipmentIcon from './EquipmentIcon';
import { MapPreview } from './MapPicker';
import { dungeonMap } from '../engine/customMaps';
import { customEquipmentItem } from '../engine/customEquipment';
import { useCreations } from './CreationsContext';
import { useCustomEquipment } from './CustomEquipmentContext';
import { fold } from './creationCatalogue';
import { atelierCount, atelierCounts, buildAtelierArchive, downloadAtelierArchive, importWorkshopFile } from './atelierArchive';
import '../styles/atelierTransfer.css';

const GROUPS = [
  { key: 'characters', name: 'Classes', icon: UserRound },
  { key: 'dungeons', name: 'Donjons', icon: Castle },
  { key: 'equipment', name: 'Équipements', icon: Hammer },
];
const entryKey = (type, entry) => `${type}:${entry.id}`;

export function AtelierExportButton({ selection, name, label = 'Exporter', iconOnly = false }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const run = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      const archive = await buildAtelierArchive(selection);
      await downloadAtelierArchive(archive.bytes, name);
      setMessage('ZIP prêt.');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  return <span className="atelier-single-export"><button type="button" className={`btn${iconOnly ? ' studio-icon-button' : ''}`}
    disabled={busy} title={label} aria-label={label} onClick={run}><Download size={17} />{!iconOnly && (busy ? 'Préparation…' : label)}</button>
    {error && <span className="atelier-transfer-error" role="alert">{error}</span>}
    {message && <span className="sr-only" role="status">{message}</span>}
  </span>;
}

function Thumbnail({ type, entry }) {
  const assets = useRetroAssets();
  if (type === 'characters') return <RetroPortrait classId={entry.classId} artworkId={entry.loadout.artworkId} appearance={entry.loadout.profile?.sex === 1 ? 'female' : 'male'} />;
  if (type === 'dungeons') return <MapPreview map={dungeonMap(entry)} artwork={assets?.imagesReady && assets.maps[entry.mapId]} />;
  return <EquipmentIcon item={customEquipmentItem(entry)} />;
}
const detail = (type, entry) => type === 'characters' ? `${entry.loadout.spells?.custom?.length || 0} sorts · niveau ${entry.loadout.level || 200}`
  : type === 'dungeons' ? entry.rooms?.length > 1 ? `${entry.rooms.length} salles · Progression` : `${entry.members.reduce((n, m) => n + m.count, 0)} combattants` : `Niveau ${entry.level}`;

export function AtelierExportDialog({ onClose }) {
  const creations = useCreations(), library = useCustomEquipment();
  const collections = { characters: creations.characters, dungeons: creations.dungeons, equipment: library?.items || [] };
  const all = GROUPS.flatMap(({ key }) => collections[key].map(entry => entryKey(key, entry)));
  const [selected, setSelected] = useState(() => new Set(all)), [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [done, setDone] = useState('');
  const selection = Object.fromEntries(GROUPS.map(({ key }) => [key, collections[key].filter(entry => selected.has(entryKey(key, entry)))]));
  const count = atelierCount(selection);
  const toggle = keys => { setDone(''); setSelected(previous => {
    const next = new Set(previous), remove = keys.every(key => next.has(key));
    keys.forEach(key => remove ? next.delete(key) : next.add(key)); return next;
  }); };
  const run = async () => {
    setBusy(true); setError(''); setDone('');
    try {
      const result = await buildAtelierArchive(selection);
      const only = GROUPS.flatMap(({ key }) => selection[key])[0];
      await downloadAtelierArchive(result.bytes, count === 1 ? only.name : `atelier-${count}-creations`);
      setDone(`${atelierCounts(selection)} dans votre ZIP. Prêt à partager ou à réimporter.`);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  return <CharacterDialog title="Emportez vos créations" description="Une seule création ou toute votre collection, dans un ZIP." onClose={() => !busy && onClose()} className="atelier-transfer-dialog">
    <div className="character-dialog-body">
      <div className="atelier-transfer-toolbar"><label className="studio-library-search"><Search size={17} /><input type="search" aria-label="Rechercher les créations à exporter" placeholder="Retrouver une création…" value={query} onChange={e => setQuery(e.target.value)} /></label>
        <button type="button" className="btn subtle" disabled={busy || !all.length} onClick={() => toggle(all)}>{all.every(key => selected.has(key)) ? 'Tout désélectionner' : 'Tout sélectionner'}</button></div>
      <div className="atelier-transfer-included"><PackageOpen size={21} /><span><strong>Tout voyage ensemble</strong><small>Héros des aventures, personnages des donjons, règles, sorts, images, équipements et forgemagie inclus automatiquement.</small></span></div>
      {GROUPS.map(({ key, name, icon: Icon }) => {
        const entries = collections[key].filter(entry => fold(entry.name).includes(fold(query)));
        if (!entries.length) return null;
        const keys = entries.map(entry => entryKey(key, entry));
        return <section key={key} className={`atelier-export-group ${key}`}>
          <header><h3><Icon size={18} />{name}<span>{selection[key].length}/{collections[key].length}</span></h3>
            <button type="button" className="btn subtle" disabled={busy} onClick={() => toggle(keys)}>{keys.every(k => selected.has(k)) ? 'Désélectionner' : 'Sélectionner'}</button></header>
          <div className="atelier-export-cards">{entries.map(entry => {
            const id = entryKey(key, entry), checked = selected.has(id);
            return <label key={id} className={`atelier-export-card${checked ? ' selected' : ''}`}>
              <input type="checkbox" aria-label={`Exporter ${entry.name || 'Sans nom'}`} checked={checked} disabled={busy} onChange={() => toggle([id])} />
              <span className="atelier-export-art"><Thumbnail type={key} entry={entry} /></span>
              <span><strong>{entry.name || 'Sans nom'}</strong><small>{detail(key, entry)}</small></span>
            </label>;
          })}</div>
        </section>;
      })}
      {!all.length && <p className="studio-library-hint">Créez votre premier élément dans l’Atelier pour l’exporter.</p>}
      {!!all.length && !GROUPS.some(({ key }) => collections[key].some(entry => fold(entry.name).includes(fold(query)))) && <p className="studio-library-hint">Aucune création trouvée. La sélection précédente est conservée.</p>}
      {error && <p className="creator-warning" role="alert">{error}</p>}
      {done && <p className="atelier-transfer-success" role="status"><Check size={18} />{done}</p>}
    </div>
    <footer><div className="atelier-transfer-summary"><strong>{count} création{count > 1 ? 's' : ''} sélectionnée{count > 1 ? 's' : ''}</strong><small>Un ZIP · Images incluses</small></div>
      <button type="button" className="btn primary" disabled={busy || !count} onClick={run}><Download size={18} />{busy ? 'Préparation du ZIP…' : 'Télécharger le ZIP'}</button></footer>
  </CharacterDialog>;
}

export function AtelierImportDialog({ onClose, onImported, onPlay }) {
  const creations = useCreations(), library = useCustomEquipment(), input = useRef(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState(null), [over, setOver] = useState(false);
  const run = async file => {
    if (!file || busy) return;
    setBusy(true); setError(''); setResult(null); setOver(false);
    try { setResult(await importWorkshopFile(file, { commitCreations: creations.commit, importEquipment: library?.importItems })); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  return <CharacterDialog title="Importer des créations" description="Ajoutez un ZIP exporté de l’Atelier ou créé avec votre prompt IA." onClose={() => !busy && onClose()} className="atelier-transfer-dialog atelier-import-dialog">
    <div className="character-dialog-body">
      <input ref={input} type="file" accept=".zip,application/zip" aria-label="Importer un ZIP Atelier" hidden disabled={busy} onChange={e => { const file = e.target.files[0]; e.target.value = ''; run(file); }} />
      <button type="button" className={`atelier-import-drop${over ? ' over' : ''}`} disabled={busy} onClick={() => input.current?.click()}
        onDragOver={e => { e.preventDefault(); if (!busy) setOver(true); }} onDragLeave={() => setOver(false)} onDrop={e => { e.preventDefault(); run(e.dataTransfer.files[0]); }}>
        <span><Upload size={30} strokeWidth={1.5} /></span><strong>{busy ? 'Vérification et import…' : 'Déposez votre ZIP ici'}</strong><small>{busy ? 'Images et créations sont vérifiées avant la sauvegarde.' : 'ou cliquez pour choisir un fichier · 128 Mio maximum'}</small>
      </button>
      <p className="atelier-import-note">Les créations sont ajoutées comme des copies. Vos éléments actuels restent en place.</p>
      {error && <p className="creator-warning" role="alert">{error}</p>}
      {result && <section className="atelier-import-result" aria-label="Créations importées"><p className="atelier-transfer-success" role="status"><Check size={20} />Import terminé · {atelierCounts(result)}</p>
        {onPlay && result.dungeons.filter(d => d.adventure).map(dungeon => <div className="adventure-import-play" key={dungeon.id}><span><strong>{dungeon.name}</strong><small>Héros équipés, règles et terrain inclus. Tout est prêt.</small></span><button type="button" className="btn primary" onClick={() => onPlay(dungeon)}><Play size={17} />Jouer l’aventure</button></div>)}
        {GROUPS.map(({ key, name, icon: Icon }) => result[key].length > 0 && <button type="button" key={key} className="btn" onClick={() => onImported(key, result[key][0])}><Icon size={18} />Ouvrir {name.toLocaleLowerCase('fr')} ({result[key].length})</button>)}
        {result.warnings.length > 0 && <details><summary>{result.warnings.length} remarque{result.warnings.length > 1 ? 's' : ''} avant de jouer</summary><ul>{result.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>}
      </section>}
    </div><footer><button type="button" className="btn" disabled={busy} onClick={onClose}>Fermer</button></footer>
  </CharacterDialog>;
}
