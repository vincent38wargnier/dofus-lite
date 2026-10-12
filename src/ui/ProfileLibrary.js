import React, { useState } from 'react';
import { Plus, Copy, Check, Trash2 } from 'lucide-react';
import { resolveLoadout } from '../engine/equipment';
import { RetroPortrait } from './RetroAssets';

export function ProfileIdentity({ profiles }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const active = profiles.active;
  return <div className="profile-identity">
    <div><span className="eyebrow">PERSONNAGE ACTIF</span>{editing ? <form onSubmit={event => {
      event.preventDefault(); if (!name.trim()) return; profiles.rename(name); setEditing(false);
    }}><label className="field">Nom du personnage<input autoFocus required maxLength={80} value={name} onChange={event => setName(event.target.value)} /></label>
      <button type="submit" className="btn primary">Enregistrer</button><button type="button" className="btn" onClick={() => setEditing(false)}>Annuler</button></form>
      : <h2>{active.name}<button type="button" className="btn subtle" onClick={() => { setName(active.name); setEditing(true); }}>Renommer</button></h2>}
      <p>{profiles.error || 'Toutes vos modifications sont enregistrées automatiquement.'}</p></div>
    <button type="button" className="btn" onClick={() => profiles.create(active.classId, { ...active, name: `${active.name} — copie` })}><Copy size={15} />Dupliquer</button>
  </div>;
}

export default function ProfileLibrary({ profiles, onNew, onConfigure }) {
  const [removed, setRemoved] = useState(null);
  return <section className="profile-library" aria-label="Mes personnages">
    <div className="setup-section-heading"><div><h2>Mes personnages</h2><p>Chacun garde son équipement, ses caractéristiques et ses sorts.</p></div>
      <button type="button" className="btn primary" onClick={onNew}><Plus size={16} />Nouveau personnage</button></div>
    {removed && <div className="profile-notice" role="status">« {removed.name} » supprimé.<button className="btn" onClick={() => { profiles.restore(removed); setRemoved(null); }}>Annuler</button></div>}
    <div className="profile-grid">{profiles.profiles.map(profile => {
      const stats = resolveLoadout(profile.classId, profile.loadout);
      const selected = profile.id === profiles.activeId;
      return <article className={`profile-card${selected ? ' selected' : ''}`} key={profile.id} data-profile-id={profile.id}>
        <button type="button" className="profile-select" aria-pressed={selected} aria-label={`Utiliser le personnage ${profile.name}`} onClick={() => profiles.select(profile.id)}>
          <RetroPortrait classId={profile.classId} artworkId={profile.loadout.artworkId} appearance={profile.loadout.profile?.sex === 1 ? 'female' : 'male'} />
          <span><strong>{profile.name}</strong><small>{profile.className} · niv. {stats.level}</small><small>{stats.hp} PV · {stats.pa} PA · {stats.pm} PM</small></span>
          {selected && <Check size={18} />}
        </button>
        <div className="profile-card-actions"><button type="button" className="btn subtle" onClick={() => { profiles.select(profile.id); onConfigure(); }}>Équiper</button>
          <button type="button" className="btn subtle" disabled={profiles.profiles.length <= 1} aria-label={`Supprimer le personnage ${profile.name}`} onClick={() => { setRemoved(profile); profiles.remove(profile.id); }}><Trash2 size={15} /></button></div>
      </article>;
    })}</div>
  </section>;
}
