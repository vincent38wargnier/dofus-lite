import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import { CLASSES } from '../engine/classes';
import { RetroPortrait } from './RetroAssets';
import { CharacterSettingsDialog } from './CharacterDialog';

export default function CharacterSwitcher({ profiles, playerClass, name, loadout, role, level, onNew, onSwitch, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [removed, setRemoved] = useState(null);
  const count = profiles?.profiles.length || 1;
  const index = profiles ? profiles.profiles.findIndex(profile => profile.id === profiles.activeId) : 0;
  const cycle = direction => {
    if (!profiles || count < 2) return;
    onSwitch(); setEditing(false);
    profiles.select(profiles.profiles[(index + direction + count) % count].id);
  };
  const remove = () => {
    if (!profiles || count < 2) return;
    setRemoved(profiles.active); setEditing(false); onSwitch(); profiles.remove(profiles.activeId);
  };
  return <div className="summary-character" data-profile-id={profiles?.activeId}>
    <div className="summary-title"><span>MON PERSONNAGE</span><button type="button" className="level-badge" aria-label={`Modifier le niveau et l’apparence de ${name}`} onClick={() => setEditing(true)}>Niv. {level}</button></div>
    <div className="summary-carousel" role="group" aria-label="Choisir mon personnage">
      <button type="button" className="summary-arrow" aria-label="Personnage précédent" disabled={count < 2} onClick={() => cycle(-1)}><ChevronLeft size={20} /></button>
      <div className="summary-portrait"><RetroPortrait classId={playerClass} artworkId={loadout.artworkId} appearance={loadout.profile?.sex === 1 ? 'female' : 'male'} fallback={CLASSES[playerClass].emoji} /></div>
      <button type="button" className="summary-arrow" aria-label="Personnage suivant" disabled={count < 2} onClick={() => cycle(1)}><ChevronRight size={20} /></button>
    </div>
    <div className="summary-identity"><h2>{name}</h2><button type="button" className="summary-edit" aria-label="Modifier le personnage" title="Nom, niveau et apparence" onClick={() => setEditing(true)}><Pencil size={13} /></button></div>
    <p className="summary-role">{role}</p>
    <span className="summary-position" role="status" aria-label="Personnage sélectionné">{index + 1} / {count}<span className="sr-only"> · {name}</span></span>
    <div className="summary-character-actions" role="group" aria-label="Gérer mes personnages">
      <button type="button" className="summary-new" aria-label="Nouveau personnage" onClick={onNew}><Plus size={16} /><span>Nouveau</span></button>
      {profiles && <><button type="button" aria-label="Dupliquer" title="Dupliquer ce personnage" onClick={() => { onSwitch(); profiles.create(profiles.active.classId, { ...profiles.active, name: `${name} — copie` }); }}><Copy size={15} /></button>
        <button type="button" className="summary-delete" disabled={count < 2} aria-label={`Supprimer le personnage ${name}`} title={count < 2 ? 'Gardez au moins un personnage' : 'Supprimer ce personnage'} onClick={remove}><Trash2 size={15} /></button></>}
    </div>
    {removed && <div className="summary-notice" role="status"><span>« {removed.name} » supprimé.</span><button type="button" onClick={() => { onSwitch(); profiles.restore(removed); setRemoved(null); }}>Annuler</button></div>}
    {profiles?.error && <p className="summary-save-error" role="alert">{profiles.error}</p>}
    {editing && <CharacterSettingsDialog key={profiles?.activeId || playerClass} {...{ profiles, playerClass, name, loadout, onUpdate }} onClose={() => setEditing(false)} />}
  </div>;
}
