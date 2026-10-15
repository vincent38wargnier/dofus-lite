import React, { useMemo, useState } from 'react';
import { Backpack, Bot, Check, Gamepad2, LockKeyhole, PackageCheck, Plus, Search, ShieldCheck, Swords, Trash2 } from 'lucide-react';
import { CLASSES, resolveSpellLoadout } from '../engine/classes';
import { resolveLoadout } from '../engine/equipment';
import { equipmentItem } from '../engine/customEquipment';
import { dungeonMap } from '../engine/customMaps';
import { getMonster } from '../engine/monsters';
import { newAdventure, addAdventureHero, adventureErrors, MAX_ADVENTURE_HEROES } from '../engine/adventures';
import { RetroPortrait, useRetroAssets } from './RetroAssets';
import { MapPreview } from './MapPicker';
import EquipmentIcon from './EquipmentIcon';
import { useProfiles } from './ProfilesContext';
import { useCreations } from './CreationsContext';
import { newCreationId } from './creationsStore';
import { fold } from './creationCatalogue';
import { AtelierExportButton } from './AtelierTransfer';
import '../styles/adventure.css';

export function AdventureHero({ character, selected, onChoose, onRemove, action }) {
  const summary = useMemo(() => resolveLoadout(character.classId, character.loadout), [character]);
  const spells = useMemo(() => Object.values(resolveSpellLoadout(character.classId, character.loadout).spells), [character]);
  return <article className={`adventure-hero${selected ? ' selected' : ''}`} data-adventure-hero={character.name}>
    <div className="adventure-hero-heading"><RetroPortrait classId={character.classId} artworkId={character.loadout.artworkId}
      appearance={character.loadout.profile?.sex === 1 ? 'female' : 'male'} fallback={CLASSES[character.classId].emoji} />
      <div><strong>{character.name}</strong><small>{character.className || CLASSES[character.classId].name} · Niv. {summary.level}</small></div>
      {onRemove && <button type="button" className="btn studio-icon-button" onClick={onRemove} aria-label={`Retirer le héros ${character.name}`}><Trash2 size={16} /></button>}</div>
    <div className="adventure-hero-stats"><span>{summary.hp.toLocaleString('fr-FR')} PV</span><span>{summary.pa} PA</span><span>{summary.pm} PM</span></div>
    <details className="adventure-kit"><summary><Backpack size={14} />{summary.items.length} objets · {spells.length} sorts inclus</summary>
      <div className="adventure-kit-items">{summary.items.map(({ id, slot }) => <span key={slot}><EquipmentIcon item={equipmentItem(id, character.loadout)} />{equipmentItem(id, character.loadout).name}{character.loadout.forgedItems?.[slot] && <b>FM</b>}</span>)}</div>
      <div className="adventure-kit-spells">{spells.map(spell => <span key={spell.key}>{spell.name}</span>)}</div>
    </details>
    {!summary.valid && <p className="creator-warning">{summary.errors[0]}</p>}
    {onChoose && <button type="button" className="btn adventure-hero-choose" aria-pressed={selected} onClick={onChoose}>{selected ? <Check size={16} /> : <Plus size={16} />}{action || (selected ? 'Sélectionné' : 'Choisir ce héros')}</button>}
  </article>;
}

export function AdventureEditor({ dungeon, onChange, archiveDungeon = dungeon }) {
  const profiles = useProfiles(), creations = useCreations();
  const [query, setQuery] = useState(''), [source, setSource] = useState('profiles');
  const [adding, setAdding] = useState(true);
  const rules = dungeon.adventure;
  const update = next => onChange({ ...dungeon, adventure: next });
  const errors = adventureErrors(dungeon);
  const catalogue = (source === 'profiles' ? profiles?.profiles || [] : creations.characters)
    .filter(character => fold(`${character.name} ${CLASSES[character.classId].name}`).includes(fold(query)));
  return <section className="adventure-editor" aria-label="Aventure prête à jouer">
    <div className="adventure-intro"><span className="adventure-emblem"><PackageCheck size={30} /></span><div><h3>Votre donjon, prêt à jouer.</h3>
      <p>Fournissez les héros et leur équipement. Vos amis importent le ZIP et jouent avec vos règles.</p></div>
      <label className="adventure-switch"><input type="checkbox" checked={!!rules} onChange={e => update(e.target.checked ? newAdventure() : undefined)} /><span>Prêt à jouer</span></label></div>
    {!rules ? <p className="adventure-note">Option désactivée : chacun peut venir avec ses propres personnages.</p> : <>
      <div className="adventure-rule-grid"><div><h4>Qui part à l’aventure ?</h4><div className="adventure-options" role="group" aria-label="Choix des héros">
        <button type="button" aria-pressed={rules.mode === 'fixed'} onClick={() => update({ ...rules, mode: 'fixed' })}><ShieldCheck size={22} /><strong>Équipe imposée</strong><small>Tous les héros ci-dessous jouent ensemble.</small></button>
        <button type="button" aria-pressed={rules.mode === 'choice'} onClick={() => update({ ...rules, mode: 'choice' })}><Gamepad2 size={22} /><strong>Héros au choix</strong><small>Le joueur choisit dans votre sélection.</small></button></div>
        {rules.mode === 'choice' && <label className="field adventure-party-size">Héros dans l’équipe<select value={rules.partySize} onChange={e => update({ ...rules, partySize: Number(e.target.value) })}>{Array.from({ length: Math.max(1, rules.heroes.length) }, (_, n) => <option key={n} value={n + 1}>{n + 1}</option>)}</select></label>}
      </div><div className="adventure-author-notes"><label className="field">Le mot de l’auteur <small>Facultatif</small><textarea rows={3} maxLength={1200} value={rules.description} placeholder="L’histoire, le défi ou un conseil pour commencer…" onChange={e => update({ ...rules, description: e.target.value })} /></label>
        <label className="adventure-switch"><input type="checkbox" checked={rules.allowAI} onChange={e => update({ ...rules, allowAI: e.target.checked })} /><span>Autoriser le jeu automatique</span></label></div></div>
      <div className="adventure-section-heading"><h4>Héros fournis <span>{rules.heroes.length}/{MAX_ADVENTURE_HEROES}</span></h4><span><LockKeyhole size={14} />Niveau, équipement et sorts fixés</span></div>
      <div className="adventure-heroes">{rules.heroes.map(hero => <AdventureHero key={hero.id} character={hero.character} onRemove={() => update({ ...rules,
        partySize: Math.min(rules.partySize, Math.max(1, rules.heroes.length - 1)), heroes: rules.heroes.filter(h => h !== hero) })} />)}</div>
      {!rules.heroes.length && <p className="adventure-empty">Ajoutez vos premiers héros ci-dessous. Leur équipement, leurs sorts et leurs images seront inclus.</p>}
      <p className="adventure-note">Chaque héros est une copie indépendante. Préparez son stuff dans Jouer, puis ajoutez-le ici. Pour actualiser une copie, retirez-la et ajoutez la nouvelle version.</p>
      <details className="adventure-add" open={adding} onToggle={e => setAdding(e.currentTarget.open)}><summary><Plus size={17} />Ajouter un héros équipé</summary><div className="adventure-catalogue-controls">
        <div className="adventure-source" role="group" aria-label="Origine des héros"><button type="button" aria-pressed={source === 'profiles'} onClick={() => setSource('profiles')}>Mes personnages</button><button type="button" aria-pressed={source === 'classes'} onClick={() => setSource('classes')}>Mes classes</button></div>
        <label className="studio-library-search"><Search size={16} /><input type="search" aria-label="Rechercher un héros" value={query} placeholder="Trouver un héros…" onChange={e => setQuery(e.target.value)} /></label></div>
        <div className="adventure-heroes">{catalogue.map(character => <AdventureHero key={character.id} character={character} action="Ajouter ce héros" onChoose={rules.heroes.length < MAX_ADVENTURE_HEROES ? () => update(addAdventureHero(rules, character, newCreationId())) : undefined} />)}</div>
        {!catalogue.length && <p className="adventure-note">Aucun héros ici. Vos personnages de Jouer et vos classes de l’Atelier sont proposés dans ces deux listes.</p>}</details>
      <div className="adventure-share"><span><PackageCheck size={22} /><span><strong>Un ZIP, toute l’aventure</strong><small>Salles, terrains, ennemis, héros, sorts, objets, FM et images.</small></span></span><AtelierExportButton selection={{ dungeons: [archiveDungeon] }} name={archiveDungeon.name} label="Exporter l’aventure" /></div>
      {!!errors.length && <p className="creator-warning" role="status">Avant de jouer ou d’exporter : {errors.join(' ')}</p>}
    </>}
  </section>;
}

export function AdventureLobby({ dungeon, choice, onChange, onOtherDungeon }) {
  const assets = useRetroAssets(), rules = dungeon.adventure;
  const chosen = choice.heroIds;
  const toggle = id => {
    const ids = chosen.includes(id) ? chosen.filter(value => value !== id)
      : rules.partySize === 1 ? [id] : chosen.length < rules.partySize ? [...chosen, id] : [...chosen.slice(1), id];
    onChange({ ...choice, heroIds: ids });
  };
  return <section className="adventure-lobby" aria-label="Jouer l’aventure">
    <div className="adventure-cover"><MapPreview map={dungeonMap(dungeon)} artwork={assets?.imagesReady && assets.maps[dungeon.mapId]} />
      <div><span className="adventure-badge"><PackageCheck size={16} />PRÊT À JOUER</span><h3>{dungeon.name}</h3><p>{rules.description || 'Les héros sont équipés. Le défi vous attend.'}</p>
        <button type="button" className="btn subtle" onClick={onOtherDungeon}>Choisir un autre donjon</button></div></div>
    <div className="adventure-section-heading"><h3>{rules.mode === 'fixed' ? 'Votre équipe est prête' : `Choisissez ${rules.partySize === 1 ? 'votre héros' : `${rules.partySize} héros`}`}</h3>
      <span><LockKeyhole size={14} />Équipements et sorts de l’auteur</span></div>
    <div className="adventure-heroes">{rules.heroes.map(hero => <AdventureHero key={hero.id} character={hero.character} selected={chosen.includes(hero.id)}
      onChoose={rules.mode === 'choice' ? () => toggle(hero.id) : undefined} />)}</div>
    <div className="adventure-encounter"><Swords size={19} /><div><strong>Votre défi</strong><p>{dungeon.members.map(member => `${member.count > 1 ? `${member.count} × ` : ''}${member.character?.name || member.customMonster?.name || getMonster(member.monsterId, member.grade).name}`).join(' · ')}</p></div></div>
    {rules.allowAI && <div className="combat-control-toggle" role="group" aria-label="Contrôle de l’aventure"><button type="button" aria-pressed={!choice.automatic} onClick={() => onChange({ ...choice, automatic: false })}><Gamepad2 size={18} />Je joue</button><button type="button" aria-pressed={choice.automatic} onClick={() => onChange({ ...choice, automatic: true })}><Bot size={18} />Regarder l’IA</button></div>}
  </section>;
}
