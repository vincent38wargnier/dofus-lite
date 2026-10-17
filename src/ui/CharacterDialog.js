import { PLATFORM } from '../platform/config';
import React, { useEffect, useId, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { CLASSES, CLASS_IDS } from '../engine/classes';
import { RetroPortrait } from './RetroAssets';
import { loadoutAtLevel } from './playerSetupState';
import { profileName } from './profileStore';
import { useWorlds, WorldFilter } from './WorldsContext';

export function CharacterDialog({ title, description, onClose, children, className = '' }) {
  const ref = useRef(null), close = useRef(onClose), id = useId();
  close.current = onClose;
  useEffect(() => {
    const dialog = ref.current, previousFocus = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal ? dialog.showModal() : dialog.setAttribute('open', '');
    dialog.querySelector('input:not([type="file"]), textarea, .setup-class, .character-dialog-close')?.focus();
    return () => {
      if (dialog.open) dialog.close?.();
      document.body.style.overflow = overflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);
  const keys = event => {
    if (event.key === 'Escape') { event.preventDefault(); close.current(); }
    if (event.key !== 'Tab') return;
    const controls = [...ref.current.querySelectorAll('button, input, select, textarea, a[href], [tabindex]')]
      .filter(e => !e.disabled && e.tabIndex >= 0 && e.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (first && ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last))) {
      event.preventDefault(); (event.shiftKey ? last : first).focus();
    }
  };
  return <dialog ref={ref} className={`character-dialog ${className}`} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
    onKeyDown={keys} onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><div><h2 id={`${id}-title`}>{title}</h2><p id={`${id}-description`}>{description}</p></div>
      <button type="button" className="character-dialog-close" aria-label="Fermer" onClick={onClose}><X size={20} /></button></header>
    {children}
  </dialog>;
}

export function NewCharacterDialog({ customCharacters = [], roles = {}, onChooseClass, onChooseCustom, onCreateClass, onClose, forClass = false }) {
  const worlds = useWorlds();
  const [name, setName] = useState('');
  const classes = CLASS_IDS.filter(id => !worlds || worlds.matches('classes', id, worlds.selected));
  const characters = (worlds?.characters || customCharacters).filter(c => !worlds || worlds.matches('characters', c.id, worlds.selected));
  return <CharacterDialog title={forClass ? 'Partir d’une classe existante' : 'Nouveau personnage'} description={forClass ? 'Créez une copie indépendante. Pour une classe du catalogue, choisissez ensuite jusqu’à dix sorts.' : 'Choisissez une classe : votre personnage sera enregistré dans Mes personnages, avec tous ses sorts.'} onClose={onClose} className="new-character-dialog">
    <div className="character-dialog-body new-profile-classes">
      {!forClass && <label className="field new-character-name">Nom du personnage <input maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder="Facultatif, vous pourrez le changer ensuite" /></label>}
      <WorldFilter hint />
      {!!classes.length && <><h3>{PLATFORM ? 'Classes installées' : 'Classes Dofus'}</h3>
      <div className="setup-class-grid" aria-label={PLATFORM ? 'Classes installées' : 'Classes Dofus'}>{classes.map(classId => <button type="button" key={classId} className="setup-class"
        aria-label={`Choisir ${CLASSES[classId].name}`} onClick={() => onChooseClass(classId, profileName(name))}>
        <RetroPortrait classId={classId} appearance="male" fallback={CLASSES[classId].emoji} />
        <strong>{CLASSES[classId].name}</strong><small>{roles[classId]}</small>
      </button>)}</div></>}
      <div className="character-custom-heading"><h3>Classes et héros personnalisés</h3>{onCreateClass && <button type="button" className="btn" onClick={onCreateClass}><Plus size={15} />Inventer une classe</button>}</div>
      {characters.length ? <div className="setup-class-grid" aria-label="Classes personnalisées">{characters.map(character => <button type="button" key={character.id}
        data-custom-character-id={character.id} className="setup-class" aria-label={`Choisir ${character.name || 'Classe sans nom'} (personnalisée)`} onClick={() => onChooseCustom(!forClass && profileName(name) ? { ...character, className: character.className || character.name, name: profileName(name) } : character)}>
        <RetroPortrait classId={character.classId} artworkId={character.loadout.artworkId} appearance={character.loadout.profile?.sex === 1 ? 'female' : 'male'} fallback={CLASSES[character.classId].emoji} />
        <strong>{character.name || 'Classe sans nom'}</strong><small>{character.loadout.spells?.custom?.length || 0} sorts</small>
      </button>)}</div> : <p className="character-dialog-hint">Vos classes créées dans l’Atelier apparaîtront ici.</p>}
    </div>
    <footer><button type="button" className="btn" onClick={onClose}>Annuler</button></footer>
  </CharacterDialog>;
}

export function CharacterSettingsDialog({ profiles, playerClass, name, loadout, onUpdate, onClose }) {
  const [draftName, setName] = useState(name);
  const [level, setLevel] = useState(loadout.level || 200);
  const [sex, setSex] = useState(loadout.profile?.sex || 0);
  const save = event => {
    event.preventDefault();
    if (!profileName(draftName)) return;
    const change = current => {
      const next = Number(current.level || 200) === level ? current : loadoutAtLevel(playerClass, current, level);
      return (current.profile?.sex || 0) === sex ? next : { ...next, profile: { ...next.profile, sex } };
    };
    if (profiles) profiles.update(current => ({ ...current, name: profileName(draftName), loadout: change(current.loadout) }));
    else onUpdate(change);
    onClose();
  };
  return <CharacterDialog title="Modifier le personnage" description="Son nom, son niveau et son apparence." onClose={onClose} className="character-settings-dialog">
    <form onSubmit={save}>
      <div className="character-dialog-body character-settings-fields">
        {profiles && <label className="field">Nom du personnage<input autoFocus required maxLength={80} value={draftName} onChange={event => setName(event.target.value)} /></label>}
        <div className="setup-level"><label className="field">Niveau du personnage<select aria-label="Niveau du personnage" value={level} onChange={event => setLevel(Number(event.target.value))}>
          {Array.from({ length: 200 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
        </select></label><div className="level-shortcuts">{[100, 150, 200].map(value => <button type="button" key={value} className={level === value ? 'selected' : ''} onClick={() => setLevel(value)}>{value}</button>)}</div></div>
        <label className="field">Apparence du joueur<select value={sex} onChange={event => setSex(Number(event.target.value))}><option value={0}>Masculine</option><option value={1}>Féminine</option></select></label>
      </div>
      <footer><button type="button" className="btn" onClick={onClose}>Annuler</button><button type="submit" className="btn primary" disabled={!profileName(draftName)}>Enregistrer</button></footer>
    </form>
  </CharacterDialog>;
}
