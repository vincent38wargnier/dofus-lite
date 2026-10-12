import React, { useMemo } from 'react';
import { Bot, GripVertical, Heart, Plus, X } from 'lucide-react';
import { CLASSES, resolveSpellLoadout } from '../engine/classes';
import { resolveLoadout } from '../engine/equipment';
import { equipmentItem } from '../engine/customEquipment';
import { RetroPortrait } from './RetroAssets';
import EquipmentIcon from './EquipmentIcon';
import { fold } from './creationCatalogue';
import '../styles/dungeonCharacters.css';

export const DUNGEON_CHARACTER_DRAG = 'application/x-dofus-dungeon-character';
const Portrait = ({ character }) => <RetroPortrait classId={character.classId} artworkId={character.loadout.artworkId}
  appearance={character.loadout.profile?.sex === 1 ? 'female' : 'male'} fallback={CLASSES[character.classId].emoji} />;
const Stats = ({ summary }) => <div className="dungeon-character-stats"><span><Heart size={13} />{summary.hp.toLocaleString('fr-FR')} PV</span><span>{summary.pa} PA</span><span>{summary.pm} PM</span></div>;

export function DungeonCharacterCatalogue({ entries, source, query, full, dragged, onAdd, onDrag, onDragEnd }) {
  const results = useMemo(() => entries.filter(entry => fold(`${entry.name} ${entry.className || ''} ${CLASSES[entry.classId].name}`).includes(fold(query)))
    .map(character => ({ character, summary: resolveLoadout(character.classId, character.loadout) })), [entries, query]);
  return <>
    <p className="dungeon-character-hint">Glissez un personnage dans la salle. Sa copie garde ses sorts et son équipement, et joue avec l’IA du donjon.</p>
    <div className="creator-monster-results dungeon-character-results">{results.map(({ character, summary }) => <article key={character.id}
      data-dungeon-character={character.id} className={`creator-monster-card dungeon-character-card${dragged === `${source}:${character.id}` ? ' dragging' : ''}`}
      draggable={!full} onDragStart={event => {
        if (full || event.target.closest('button, input, select')) { event.preventDefault(); return; }
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData(DUNGEON_CHARACTER_DRAG, JSON.stringify({ source, id: character.id }));
        event.dataTransfer.setData('text/plain', character.name);
        event.dataTransfer.setDragImage?.(event.currentTarget.querySelector('.creator-monster-heading'), 26, 30);
        onDrag(`${source}:${character.id}`);
      }} onDragEnd={onDragEnd}>
      <div className="creator-monster-heading"><Portrait character={character} /><div><strong>{character.name}</strong><small>{character.className || (character.loadout.spells?.custom ? 'Classe personnalisée' : CLASSES[character.classId].name)} · niv. {summary.level}</small></div><GripVertical size={17} className="creator-monster-grip" aria-hidden="true" /></div>
      <Stats summary={summary} />
      <small className="dungeon-character-included">Équipement, sorts et apparence inclus</small>
      {!summary.valid && <p className="creator-warning">À ajuster avant de combattre : {summary.errors[0]}</p>}
      <button type="button" className="btn" disabled={full} aria-label={`Ajouter ${character.name} au donjon`} onClick={() => onAdd(character)}><Plus size={15} />Ajouter au groupe</button>
    </article>)}</div>
    {!results.length && <p className="creator-empty">{entries.length ? 'Aucun personnage ne correspond à la recherche.' : source === 'profiles' ? 'Créez un personnage dans Jouer pour le retrouver ici.' : 'Vos classes créées dans l’Atelier apparaîtront ici.'}</p>}
  </>;
}

export function DungeonCharacterRow({ member, full, onQuantity, onRemove }) {
  const character = member.character;
  const summary = useMemo(() => resolveLoadout(character.classId, character.loadout), [character]);
  const spells = useMemo(() => Object.values(resolveSpellLoadout(character.classId, character.loadout).spells), [character]);
  return <div className="dungeon-character-row" data-room-character={character.name}>
    <div className="dungeon-character-heading"><Portrait character={character} /><div><strong>{character.name}</strong><small>Niv. {summary.level} · {summary.hp.toLocaleString('fr-FR')} PV</small></div>
      <button type="button" className="btn" aria-label={`Retirer ${character.name}`} onClick={onRemove}><X size={14} /></button></div>
    <div className="dungeon-character-controls"><span><Bot size={13} />Copie · IA du donjon</span><div className="creator-quantity">
      <button type="button" className="btn" disabled={member.count <= 1} aria-label={`Moins de ${character.name}`} onClick={() => onQuantity(member.count - 1)}>−</button><span>{member.count}</span>
      <button type="button" className="btn" disabled={full} aria-label={`Plus de ${character.name}`} onClick={() => onQuantity(member.count + 1)}>+</button></div></div>
    <details className="dungeon-character-details"><summary>Sorts & équipement inclus</summary><Stats summary={summary} />
      <strong>{spells.length} sorts</strong><div className="dungeon-character-spells">{spells.map(spell => <span key={spell.key}>{spell.name}</span>)}</div>
      <strong>{summary.items.length} objets équipés</strong><div className="dungeon-character-items">{summary.items.map(({ id, slot }, index) => {
        const item = equipmentItem(id, character.loadout);
        return <span key={`${slot}-${index}`}><EquipmentIcon item={item} />{item.name}{character.loadout.forgedItems?.[slot] && <small>FM</small>}</span>;
      })}</div>
      {!summary.valid && <p className="creator-warning">{summary.errors.join(' ')}</p>}
      <p>Cette copie reste inchangée si vous modifiez ou supprimez le personnage d’origine.</p>
    </details>
  </div>;
}
