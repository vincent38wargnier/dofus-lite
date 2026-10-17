import { equipmentItem } from '../engine/customEquipment';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Backpack, Check, Settings2 } from 'lucide-react';
import { CLASSES } from '../engine/classes';
import { EQUIPMENT_SLOTS, resolveLoadout } from '../engine/equipment';
import EquipmentIcon from './EquipmentIcon';
import { useLoadoutLibrary } from './LoadoutsContext';
import { applySavedEquipment, sameEquipment } from './loadoutStore';
import { useWorlds, WorldFilter } from './WorldsContext';

const fold = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const newId = () => window.crypto?.randomUUID?.() || `stuff-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const snapshot = value => JSON.parse(JSON.stringify(value));

export default function LoadoutLibrary({ side, classId, draftKey, loadout, update, saveError, compact = false, expanded, onExpandedChange }) {
  const { library, commit, libraryError } = useLoadoutLibrary();
  const worlds = useWorlds();
  const [localOpen, setLocalOpen] = useState(false);
  const open = expanded ?? localOpen;
  const setOpen = onExpandedChange || setLocalOpen;
  const [query, setQuery] = useState('');
  const [form, setForm] = useState(null);
  const [notice, setNotice] = useState(null);
  const input = useRef(null);
  const editingName = !!form;
  const key = draftKey || `${side}:${classId}`;
  const active = library.builds.find(b => b.id === library.active[key]);
  const dirty = active && !sameEquipment(active.loadout, loadout);
  const worldBuilds = useMemo(() => library.builds.filter(build => {
    if (!worlds || worlds.selected === 'all') return true;
    const ids = Object.values(build.loadout.slots).filter(Boolean);
    return ids.length ? ids.some(id => worlds.matches('equipment', id, worlds.selected)) : worlds.selected === 'personal';
  }), [library.builds, worlds]);
  const builds = useMemo(() => worldBuilds
    .filter(b => fold(b.name).includes(fold(query)))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .map(b => ({ ...b, summary: resolveLoadout(classId, applySavedEquipment(loadout, b.loadout)),
      minimumLevel: Math.max(1, ...Object.values(b.loadout.slots).map(id => equipmentItem(id, b.loadout)?.level || 1)) })), [worldBuilds, classId, loadout, query]);
  useEffect(() => { setForm(null); setNotice(null); }, [key]);
  useEffect(() => { if (editingName) { input.current?.focus(); input.current?.select(); } }, [editingName]);

  const save = (name, replace = false) => {
    const id = replace ? active.id : newId();
    const result = commit({ type: 'save', id, replace, name, loadout, key, now: Date.now() });
    if (result) {
      setForm(null);
      setNotice({ text: `« ${result.builds.find(b => b.id === id).name} » enregistré.` });
    }
  };
  const load = build => {
    if (!build) return;
    const previous = snapshot(loadout);
    if (!commit({ type: 'activate', key, id: build.id })) return;
    update(side, current => applySavedEquipment(current, build.loadout), classId);
    setForm(null);
    setNotice({ text: `« ${build.name} » équipé sur ${side === 'A' ? 'votre' : 'le'} ${CLASSES[classId].name}${side === 'B' ? ' adverse' : ''}.`, undo: () => {
      if (!commit(active ? { type: 'activate', key, id: active.id } : { type: 'clear-active', key })) return;
      update(side, previous, classId);
      setNotice({ text: 'Préparation précédente rétablie.' });
    } });
  };
  const remove = build => {
    const savedBuild = library.builds.find(b => b.id === build.id);
    const active = Object.fromEntries(Object.entries(library.active).filter(([, id]) => id === build.id));
    if (commit({ type: 'delete', id: build.id })) setNotice({ text: `« ${build.name} » supprimé.`, undo: () => {
      if (commit({ type: 'restore', build: savedBuild, active })) setNotice({ text: 'Stuff restauré dans la bibliothèque.' });
    } });
  };

  return <div className={`stuff-library${compact ? ' stuff-library-compact' : ''}`}>
    <div className="stuff-savebar">
      <div className="stuff-current">
        <h3>Mes stuffs <span className="collection-count">{library.builds.length}</span></h3>
        <p>{saveError ? 'Préparation non sauvegardée' : active ? `${active.name}${dirty ? ' · modifié' : ' · équipé'}` : 'Un clic pour équiper un ensemble.'}</p>
      </div>
      <div className="stuff-save-actions">
        {active ? <button type="button" className="btn primary" disabled={!dirty} onClick={() => save(active.name, true)}>Mettre à jour</button> : null}
        <button type="button" className={`btn${active ? '' : ' primary'}`} onClick={() => setForm({ type: 'save', name: active ? `${active.name} — variante` : 'Mon stuff' })}>
          {active ? 'Enregistrer sous…' : 'Enregistrer ce stuff'}
        </button>
        <button type="button" className={`btn stuff-library-toggle${open ? ' selected' : ''}`} aria-expanded={open} onClick={() => setOpen(!open)}>
          <Settings2 size={14} /> Gérer
        </button>
      </div>
    </div>
    {library.builds.length > 0 && <WorldFilter />}
    {worldBuilds.length > 0 ? <div className="stuff-shortcuts" role="group" aria-label="Mes stuffs enregistrés">
      {worldBuilds.map(build => {
        const items = EQUIPMENT_SLOTS.map(slot => equipmentItem(build.loadout.slots[slot.id], build.loadout)).filter(Boolean);
        const current = active?.id === build.id;
        return <button type="button" key={build.id} className={`stuff-shortcut${current ? ' selected' : ''}`} data-stuff-id={build.id}
          aria-label={`Équiper le stuff ${build.name}`} aria-pressed={current} title={`${build.name} · ${items.length} objets`} onClick={() => load(build)}>
          <span className="stuff-shortcut-art" aria-hidden="true">{items.length ? items.slice(0, 3).map((item, i) => <EquipmentIcon key={i} item={item} />) : <Backpack size={32} />}
            {current && <span className="stuff-shortcut-check"><Check size={12} /></span>}</span>
          <strong>{build.name}</strong>
        </button>;
      })}
    </div> : library.builds.length > 0 ? <p className="muted small">Aucun stuff ne contient d’objet de ce monde. Choisissez « Tous mes mondes » pour retrouver vos ensembles.</p> : null}
    {form ? <form className="stuff-name-form" onSubmit={e => {
      e.preventDefault();
      if (form.type === 'save') save(form.name);
      else if (commit({ type: 'rename', id: form.id, name: form.name, now: Date.now() })) { setForm(null); setNotice({ text: 'Stuff renommé.' }); }
    }}>
      <label>{form.type === 'save' ? 'Nom du nouveau stuff' : 'Nouveau nom'}<input ref={input} aria-label="Nom du stuff" maxLength={80} required value={form.name}
        onChange={e => setForm({ ...form, name: e.target.value })} onKeyDown={e => { if (e.key === 'Escape') setForm(null); }} /></label>
      <button type="submit" className="btn primary" disabled={!form.name.trim()}>{form.type === 'save' ? 'Sauvegarder' : 'Renommer'}</button>
      <button type="button" className="btn" onClick={() => setForm(null)}>Annuler</button>
    </form> : null}
    {libraryError ? <p className="stuff-storage-error penalty" role="alert">{libraryError}</p> : null}
    {notice ? <div className="stuff-notice" role="status"><span>{notice.text}</span>{notice.undo ? <button type="button" className="btn" onClick={notice.undo}>Annuler l’action</button> : null}
      <button type="button" className="stuff-dismiss" aria-label="Fermer la notification" onClick={() => setNotice(null)}>×</button></div> : null}
    {open ? <section className="stuff-library-panel" aria-label="Bibliothèque de stuffs">
      <div className="stuff-library-heading"><div><h3>Mes stuffs</h3><p>Vos équipements pour toutes les classes. Les PV, PA et PM ci-dessous sont calculés pour votre personnage actuel.</p></div>
        <button type="button" className="btn" onClick={() => setOpen(false)} aria-label="Fermer la bibliothèque">Fermer</button></div>
      <div className="stuff-library-filters"><input type="search" aria-label="Rechercher un stuff" placeholder="Rechercher un stuff…" value={query} onChange={e => setQuery(e.target.value)} />
        <span>{builds.length} stuff{builds.length > 1 ? 's' : ''}</span></div>
      <div className="stuff-card-grid">{builds.map(build => <article className={`stuff-card${active?.id === build.id ? ' active' : ''}`} key={build.id} data-build-id={build.id}>
        <div className="stuff-card-heading"><span className="stuff-card-symbol" aria-hidden="true"><Backpack size={24} /></span>
          <div><h4>{build.name}</h4><p>Niv. minimum {build.minimumLevel}{active?.id === build.id ? ' · En préparation' : ''}</p></div></div>
        <div className="stuff-card-items" aria-label="Objets enregistrés">{EQUIPMENT_SLOTS.map(slot => equipmentItem(build.loadout.slots[slot.id], build.loadout)).filter(Boolean).slice(0, 10).map((item, index) => <span title={item.name} key={index}><EquipmentIcon item={item} /></span>)}</div>
        <div className="stuff-card-totals"><span>{build.summary.hp} PV</span><span>{build.summary.pa} PA</span><span>{build.summary.pm} PM</span><span>{build.summary.items.length} objets</span></div>
        {!build.summary.valid ? <p className="penalty small">Prérequis à vérifier pour votre personnage</p> : null}
        <button type="button" className="btn primary stuff-load" onClick={() => load(build)}>Charger ce stuff</button>
        <div className="stuff-card-actions"><button type="button" onClick={() => setForm({ type: 'rename', id: build.id, name: build.name })}>Renommer</button>
          <button type="button" onClick={() => {
            if (commit({ type: 'save', id: newId(), name: `${build.name} — copie`, loadout: build.loadout, now: Date.now() })) setNotice({ text: 'Copie ajoutée à la bibliothèque.' });
          }}>Dupliquer</button>
          <button type="button" className="penalty" onClick={() => remove(build)}>Supprimer</button></div>
      </article>)}</div>
      {!builds.length ? <div className="stuff-library-empty"><strong>{library.builds.length ? 'Aucun stuff pour ces filtres' : 'Votre première collection commence ici'}</strong>
        <p>{library.builds.length ? 'Essayez un autre nom ou un autre monde.' : 'Équipez votre personnage, puis cliquez sur « Enregistrer ce stuff ». Vous pourrez garder autant de variantes que nécessaire.'}</p></div> : null}
      <p className="stuff-library-note">Sauvegarde locale dans ce navigateur · disponible dans Jouer et Arène.</p>
    </section> : null}
  </div>;
}
