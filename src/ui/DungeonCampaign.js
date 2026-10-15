import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy, LockKeyhole, Plus, Trash2 } from 'lucide-react';
import { dungeonRoom, dungeonRooms, isCampaign, MAX_DUNGEON_ROOMS, roomSnapshot, roomVictory, withDungeonRooms } from '../engine/dungeonCampaign';
import { newCreationId, cloneCreation } from './creationsStore';
import useDungeonProgress, { saveDungeonVictory } from './dungeonProgress';
import { CharacterDialog } from './CharacterDialog';
import '../styles/dungeonCampaign.css';
import WorkshopHelp from './WorkshopHelp';

export function DungeonRoomEditor({ dungeon, onChange, children }) {
  const [index, setIndex] = useState(0);
  const rooms = dungeonRooms(dungeon), selected = Math.min(index, rooms.length - 1);
  const room = dungeonRoom(dungeon, selected);
  const change = next => {
    if (!dungeon.rooms) onChange({ ...next, name: dungeon.name });
    else onChange(withDungeonRooms({ ...dungeon, adventure: next.adventure }, rooms.map((r, i) => i === selected ? { ...roomSnapshot(next), id: r.id } : r)));
  };
  const all = () => dungeon.rooms || [roomSnapshot({ ...dungeon, id: newCreationId(), name: 'Salle 1' })];
  const add = duplicate => {
    const list = all(), source = list[selected];
    const next = duplicate ? { ...cloneCreation(source), id: newCreationId(), name: `${source.name} — copie` }
      : { id: newCreationId(), name: `Salle ${list.length + 1}`, mapId: source.mapId, ...(source.battlefield ? { battlefield: cloneCreation(source.battlefield) } : {}), members: [], intro: '', outro: '' };
    onChange(withDungeonRooms(dungeon, [...list, next])); setIndex(list.length);
  };
  const move = direction => {
    const list = [...all()], to = selected + direction;
    [list[selected], list[to]] = [list[to], list[selected]]; onChange(withDungeonRooms(dungeon, list)); setIndex(to);
  };
  return <>
    <section className="dungeon-room-editor" aria-label="Salles du donjon">
      <div className="dungeon-room-heading"><strong>{rooms.length} salle{rooms.length > 1 ? 's' : ''}</strong><span>Une victoire débloque la suivante</span>
        <button type="button" className="btn" disabled={rooms.length >= MAX_DUNGEON_ROOMS} onClick={() => add(false)}><Plus size={15} />Ajouter une salle</button></div>
      <nav className="dungeon-room-list" aria-label="Ordre des salles">{rooms.map((r, i) => <button key={r.id || i} type="button" aria-pressed={selected === i} onClick={() => setIndex(i)}><b>{i + 1}</b>{dungeon.rooms ? r.name || 'Sans nom' : 'Première salle'}</button>)}</nav>
      {dungeon.rooms && <div className="dungeon-room-actions">
        <label className="field">Nom de la salle<input type="text" value={room.name} maxLength={200} onChange={e => change({ ...room, name: e.target.value })} /></label>
        <button type="button" className="btn" aria-label="Déplacer la salle avant" disabled={!selected} onClick={() => move(-1)}><ArrowLeft size={15} /></button>
        <button type="button" className="btn" aria-label="Déplacer la salle après" disabled={selected === rooms.length - 1} onClick={() => move(1)}><ArrowRight size={15} /></button>
        <button type="button" className="btn" aria-label="Dupliquer la salle" disabled={rooms.length >= MAX_DUNGEON_ROOMS} onClick={() => add(true)}><Copy size={15} /></button>
        <button type="button" className="btn" aria-label="Supprimer la salle" disabled={rooms.length === 1} onClick={() => { onChange(withDungeonRooms(dungeon, all().filter((_, i) => i !== selected))); setIndex(Math.max(0, selected - 1)); }}><Trash2 size={15} /></button>
      </div>}
      <details className="dungeon-room-story"><summary>Histoire de la salle</summary>
        <label className="field">Avant le combat<textarea maxLength={3000} value={room.intro || ''} placeholder="L’arrivée des héros, leur mission…" onChange={e => change({ ...room, intro: e.target.value })} /></label>
        <label className="field">Après la victoire<textarea maxLength={3000} value={room.outro || ''} placeholder="La suite de l’histoire…" onChange={e => change({ ...room, outro: e.target.value })} /></label>
        <WorkshopHelp title="Écrire cette étape de l’histoire" manual="Écrivez directement dans les deux champs. Pour être aidé, ce prompt demande seulement le texte de cette salle, à relire puis coller ici."
          prompt={`Écris une brève scène jouable pour « ${dungeon.name} », salle ${selected + 1} sur ${rooms.length} : « ${room.name} ».\nTerrain : ${room.battlefield?.name || room.mapId}.\nAdversaires : ${room.members.map(m => `${m.count} × ${m.character?.name || m.customMonster?.name || 'monstre'}`).join(', ')}.\nDébut actuel : ${room.intro || '(à écrire)'}.\nRetourne deux textes français, chacun inférieur à 3000 caractères : AVANT LE COMBAT (arrivée, enjeu clair, une astuce liée aux sorts réellement présents), APRÈS LA VICTOIRE (conséquence et transition). N’invente pas de quête, objet interactif, récompense ou condition de victoire que le jeu ne réalise pas. Éliminer les ennemis débloque la salle suivante. Les héros récupèrent leur vie entre les salles. Je copierai manuellement les deux textes dans l’éditeur.`} filename="prompt-histoire-salle.txt" />
      </details>
    </section>
    {children(room, change, selected)}
  </>;
}

export function CampaignLobby({ dungeon }) {
  const progress = useDungeonProgress(dungeon);
  if (!isCampaign(dungeon)) return null;
  const room = dungeonRoom(dungeon, progress.roomIndex);
  return <section className="campaign-lobby" aria-label="Progression du donjon">
    <div className="dungeon-room-heading"><strong>{progress.complete ? 'Donjon terminé' : `Salle ${progress.roomIndex + 1} / ${progress.count}`}</strong><span>{progress.cleared} salle{progress.cleared > 1 ? 's' : ''} vaincue{progress.cleared > 1 ? 's' : ''} · Progression sauvegardée</span></div>
    <nav className="dungeon-room-list" aria-label="Choisir une salle">{dungeonRooms(dungeon).map((r, i) => <button key={r.id} type="button" aria-pressed={i === progress.roomIndex} disabled={i > progress.unlocked} onClick={() => progress.select(i)}>
      <b>{i < progress.cleared ? <Check size={15} /> : i > progress.unlocked ? <LockKeyhole size={13} /> : i + 1}</b>{r.name}</button>)}</nav>
    <h3>{room.name}</h3>{room.intro && <details className="campaign-story-details"><summary>Lire l’histoire et les conseils</summary><p className="campaign-story">{room.intro}</p></details>}
    <small>L’équipe retrouve tous ses PV, PA et PM à chaque salle. Les effets et relances sont réinitialisés.</small>
    {progress.error && <p role="alert">{progress.error}</p>}
  </section>;
}

export function CampaignResult({ dungeon, roomIndex, state, onNext, onRetry, onExit }) {
  const [error, setError] = useState('');
  const won = roomVictory(state), rooms = dungeonRooms(dungeon), room = rooms[roomIndex], last = roomIndex === rooms.length - 1;
  useEffect(() => {
    if (!won) return;
    try { saveDungeonVictory(dungeon, roomIndex, state); setError(''); }
    catch (_) { setError('La progression n’a pas pu être sauvegardée dans ce navigateur.'); }
  }, [dungeon, roomIndex, state, won]);
  return <section className="campaign-result" aria-label="Résultat de la salle">
    <div className="campaign-result-card"><small>{dungeon.name} · Salle {roomIndex + 1} / {rooms.length}</small>
      <h2>{won ? last ? 'L’aventure est terminée' : 'Salle vaincue !' : 'La salle reste à conquérir'}</h2>
      <h3>{room.name}</h3><p className="campaign-story">{won ? room.outro || 'Votre équipe peut continuer son aventure.' : 'Votre progression est conservée. Réessayez avec une équipe remise en état.'}</p>
      {error && <p role="alert">{error}</p>}
      <div className="campaign-result-actions"><button type="button" className="btn" onClick={onExit}>Retour aux donjons</button>
        {won && !last ? <button type="button" className="btn primary" onClick={onNext}>Salle suivante <ArrowRight size={16} /></button>
          : <button type="button" className="btn primary" onClick={onRetry}>{won ? 'Rejouer cette salle' : 'Réessayer'}</button>}</div>
    </div>
  </section>;
}

export function CampaignBrief({ dungeon, roomIndex = 0, meta, onClose }) {
  const room = meta || dungeonRoom(dungeon, roomIndex);
  return <CharacterDialog title={room.name} description={`${meta?.title || dungeon.name} · Salle ${(meta?.roomIndex ?? roomIndex) + 1} / ${meta?.count || dungeonRooms(dungeon).length}`} onClose={onClose} className="campaign-brief">
    <p className="campaign-story">{room.intro || 'Battez les adversaires de cette salle pour ouvrir la suivante.'}</p>
    <p className="muted">Votre équipe commence chaque salle avec tous ses PV et ses capacités disponibles.</p>
    <button type="button" className="btn primary" onClick={onClose}>Entrer dans la salle <ArrowRight size={16} /></button>
  </CharacterDialog>;
}

export function PeerCampaignResult({ room, onExit }) {
  const meta = room.settings.campaign, won = roomVictory(room.match.state), host = room.role === 'host';
  const [error, setError] = useState('');
  const last = meta.roomIndex === meta.count - 1;
  useEffect(() => {
    if (host && won) try { saveDungeonVictory(room.campaign.dungeon, meta.roomIndex, room.match.state); }
    catch (_) { setError('La progression n’a pas pu être sauvegardée.'); }
  }, [room, host, won, meta.roomIndex]);
  const proceed = () => room.nextCampaignRoom(!won || last).catch(e => setError(e.message));
  return <section className="campaign-result" aria-label="Résultat de la salle"><div className="campaign-result-card">
    <small>{meta.title} · Salle {meta.roomIndex + 1} / {meta.count}</small>
    <h2>{won ? last ? 'L’aventure est terminée' : 'Salle vaincue !' : 'La salle reste à conquérir'}</h2>
    <p className="campaign-story">{won ? meta.outro : 'Votre équipe peut réessayer cette salle en pleine santé.'}</p>
    {!host && <p>L’hôte prépare la suite. Vous gardez vos personnages attribués.</p>}{error && <p role="alert">{error}</p>}
    <div className="campaign-result-actions"><button type="button" className="btn" onClick={onExit}>Quitter le salon</button>
      {host && <button type="button" className="btn primary" disabled={room.inFlight || room.updating || !!room.fault} onClick={proceed}>{won && !last ? 'Préparer la salle suivante' : 'Réessayer la salle'}</button>}</div>
  </div></section>;
}
