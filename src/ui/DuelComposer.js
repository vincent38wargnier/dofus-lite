import { PLATFORM } from '../platform/config';
import React, { useMemo, useRef, useState } from 'react';
import { ArrowLeft, Bot, ChevronRight, GripVertical, Heart, MapPin, Plus, Search, Settings2, Shield, Swords, Trash2, Users, X } from 'lucide-react';
import { CLASSES, CLASS_IDS } from '../engine/classes';
import { emptyLoadout, equipSet } from '../engine/equipment';
import { MAPS } from '../engine/maps';
import { monsterGrades } from '../engine/monsters';
import { MAX_OPPONENTS, opponentSummary } from '../engine/opponentTeam';
import { MONSTER_CATALOGUE, fold } from './creationCatalogue';
import { cloneCreation } from './creationsStore';
import { OPPONENT_DRAG_TYPE } from './opponentTeamStore';
import { RetroPortrait, useRetroAssets } from './RetroAssets';
import { MapPreview } from './MapPicker';
import { useWorlds, WorldFilter } from './WorldsContext';
import CombatMapGallery from './CombatMapGallery';
import '../styles/duelComposer.css';

const title = map => map.name.replace(/^🗺\s*/, '');
const mapKind = map => map.kind === 'dungeon' ? 'Donjon' : map.sourceId ? (PLATFORM ? 'Bibliothèque' : 'Dofus') : 'Arène';
const mapOrder = { Dofus: 0, Bibliothèque: 0, Donjon: 1, Arène: 2 };
const allMaps = Object.values(MAPS).sort((a, b) => mapOrder[mapKind(a)] - mapOrder[mapKind(b)] || a.name.localeCompare(b.name, 'fr', { numeric: true }));
const number = value => value.toLocaleString('fr-FR');

function Portrait({ entry }) {
  return <RetroPortrait classId={entry.classId} monsterId={entry.customMonster?.reference?.monsterId || entry.monsterId} artworkId={entry.loadout?.artworkId || entry.customMonster?.artworkId}
    appearance={entry.loadout?.profile?.sex === 1 ? 'female' : 'male'} fallback={CLASSES[entry.classId]?.emoji || '🐾'} />;
}

export default function DuelComposer({ profiles = [], customCharacters = [], opponents, onChange,
  mapId, setMapId, botId, allBots, onEditOpponent, onCreateProfile, onCreateTeamProfile, onEditLeader,
  allied = false, leader, onLeaderControllerChange, onLeaderBotChange, onRemoveLeader, automatic = false, allyCount = 1, hideTerrain = false,
  onAddCandidate, onCandidateDrag, catalogueFull = false, capacity = MAX_OPPONENTS }) {
  const assets = useRetroAssets();
  const worlds = useWorlds();
  const [catalogue, setCatalogue] = useState('profiles');
  const [query, setQuery] = useState('');
  const [roomId, setRoomId] = useState('');
  const [bossOnly, setBossOnly] = useState(false);
  const [grades, setGrades] = useState({});
  const [mapOpen, setMapOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dropOver, setDropOver] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const dragEntry = useRef(null);
  const teamList = useRef(null);
  const leaderCount = Number(allied && !!leader);
  const full = onAddCandidate ? catalogueFull : opponents.length >= capacity - leaderCount;
  const teamLabel = allied ? 'Mon équipe' : 'Camp adverse';
  const leaderSummary = leader ? opponentSummary(leader) : null;
  const selectedMap = worlds?.maps.find(map => map.id === mapId) || MAPS[mapId];
  const roster = useMemo(() => opponents.map(entry => ({ entry, summary: opponentSummary(entry) })), [opponents]);
  const characters = useMemo(() => [
    ...profiles.map(profile => ({ key: `profile:${profile.id}`, kind: 'character', source: 'profiles', sourceId: profile.customCharacterId || profile.id,
      className: profile.className, customCharacterId: profile.customCharacterId, name: profile.name, classId: profile.classId, loadout: profile.loadout })),
    ...(worlds?.characters || customCharacters).map(character => ({ key: `custom:${character.id}`, kind: 'character', source: 'classes', sourceId: character.id, name: character.name.trim() || 'Classe sans nom', classId: character.classId, loadout: character.loadout })),
    ...CLASS_IDS.map(classId => ({ key: `class:${classId}`, kind: 'character', source: 'classes', name: CLASSES[classId].name, classId, loadout: equipSet(emptyLoadout(classId), 1) })),
  ].map(entry => ({ ...entry, summary: opponentSummary(entry) })), [profiles, customCharacters, worlds?.characters]);
  const filteredCharacters = characters.filter(entry => entry.source === catalogue && (!worlds
    || (entry.key.startsWith('class:') ? worlds.matches('classes', entry.classId, worlds.selected)
      : worlds.matches('characters', entry.sourceId, worlds.selected)
        || (entry.source === 'profiles' && !entry.loadout.spells?.custom && worlds.matches('classes', entry.classId, worlds.selected))))
    && fold(`${entry.name} ${CLASSES[entry.classId].name}`).includes(fold(query)));
  const worldMonsters = useMemo(() => [...MONSTER_CATALOGUE, ...(worlds?.monsters || [])]
    .filter(monster => !worlds || worlds.matches(monster.customMonster ? 'customMonsters' : 'monsters', monster.id, worlds.selected))
    .map(monster => ({ ...monster, rooms: monster.rooms.filter(room => !worlds || worlds.matches('monsterRooms', room.id, worlds.selected)) })), [worlds]);
  const monsterRooms = useMemo(() => [...new Map(worldMonsters.flatMap(monster => monster.rooms).map(room => [room.id, room])).values()]
    .sort((a, b) => a.name.localeCompare(b.name, 'fr')), [worldMonsters]);
  const activeRoomId = monsterRooms.some(room => room.id === roomId) ? roomId : '';
  const monsters = worldMonsters.filter(monster => (!bossOnly || monster.boss)
    && (!activeRoomId || monster.rooms.some(room => room.id === activeRoomId))
    && fold(`${monster.name} ${monster.rooms.map(room => room.name).join(' ')}`).includes(fold(query)));
  const count = catalogue === 'monsters' ? monsters.length : filteredCharacters.length;
  const artwork = map => assets?.imagesReady && assets.maps[map.id];
  const add = candidate => {
    if (full) return;
    const { summary, key, source, ...snapshot } = candidate;
    const entry = source === 'classes' && onCreateTeamProfile && !onAddCandidate ? onCreateTeamProfile(snapshot) : snapshot;
    if (onAddCandidate) { onAddCandidate(cloneCreation(entry)); return; }
    onChange([...opponents, cloneCreation({ ...entry, ...(allied ? { controller: entry.kind === 'monster' ? 'ai' : 'player', botId: 'maison' }
      : entry.kind === 'character' ? { botId: botId || 'maison' } : {}) })]);
    setAnnouncement(`${entry.name || opponentSummary(entry).name} ajouté au camp.${entry.editableProfileId ? ' Enregistré dans Mes personnages.' : ''}`);
    requestAnimationFrame(() => { if (teamList.current) teamList.current.scrollTop = teamList.current.scrollHeight; });
  };
  const beginDrag = (event, entry) => {
    if (full || entry.summary?.valid === false || event.target.closest('button, select, input')) { event.preventDefault(); return; }
    dragEntry.current = entry; setDragging(true);
    onCandidateDrag?.(entry);
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData(OPPONENT_DRAG_TYPE, entry.key);
    event.dataTransfer.setData('text/plain', entry.name || entry.summary?.name || 'Adversaire');
  };
  const clearDrag = () => { dragEntry.current = null; onCandidateDrag?.(null); setDragging(false); setDropOver(false); };
  const drop = event => {
    if (!Array.from(event.dataTransfer.types || []).includes(OPPONENT_DRAG_TYPE)) return;
    event.preventDefault();
    if (dragEntry.current && event.dataTransfer.getData(OPPONENT_DRAG_TYPE) === dragEntry.current.key) add(dragEntry.current);
    clearDrag();
  };
  const changeCatalogue = next => { setCatalogue(next); setQuery(''); };
  const changeWorld = next => { setRoomId(''); worlds.select(next); };
  const chooseMap = map => { setMapId(map.id); setMapOpen(false); setAnnouncement(`Terrain choisi : ${title(map)}.`); };

  return <div className="duel-composer">
    {!allied && !hideTerrain && <div className="duel-terrain-bar">
      <button type="button" className="duel-terrain-choice" onClick={() => setMapOpen(value => !value)} aria-expanded={mapOpen} aria-controls="duel-map-gallery">
        <MapPreview map={selectedMap} artwork={artwork(selectedMap)} /><span><small><MapPin size={12} /> TERRAIN</small><strong>{title(selectedMap)}</strong><span>{mapKind(selectedMap)} · Changer de carte <ChevronRight size={14} /></span></span>
      </button>
      <div className="duel-match-count"><Swords size={21} /><strong>{allyCount} <span>contre</span> {opponents.length || '…'}</strong><small>Votre équipe contre le camp adverse</small></div>
    </div>}
    {mapOpen ? <section className="duel-map-browser" id="duel-map-gallery" aria-label="Choisir le terrain">
      <div className="duel-catalogue-heading"><div><h3>Un terrain pour votre combat</h3><p>Choisissez une carte pour en utiliser le décor et les obstacles.</p></div>
        <button type="button" className="btn" onClick={() => setMapOpen(false)}><ArrowLeft size={15} />Adversaires</button></div>
      <CombatMapGallery mapId={mapId} onChoose={id => chooseMap((worlds?.maps || allMaps).find(map => map.id === id))} />
    </section> : <div className="duel-composition">
      <section className="duel-catalogue" aria-label={allied ? 'Catalogue des alliés' : 'Catalogue des adversaires'}>
        <div className="duel-catalogue-heading"><div><h3>{allied ? 'Composez votre équipe' : 'Composez votre rencontre'}</h3><p>{allied ? 'Glissez vos alliés, puis choisissez qui les contrôle.' : 'Glissez un personnage ou un monstre dans le camp adverse.'}</p></div>
          {onCreateProfile && <button type="button" className="btn duel-new-profile" disabled={full} onClick={onCreateProfile}><Plus size={15} />Créer un personnage</button>}</div>
        <div className="duel-source-tabs" role="group" aria-label={allied ? 'Sources des alliés' : 'Catalogue des adversaires'}>{[['profiles', 'Mes personnages'], ['classes', 'Classes'], ['monsters', 'Monstres']].map(([value, label]) => <button type="button" key={value} aria-pressed={catalogue === value} onClick={() => changeCatalogue(value)}>{label}{value === 'profiles' && <span>{profiles.length}</span>}</button>)}</div>
        <div className="duel-catalogue-tools"><label className="duel-search"><Search size={16} /><input type="search" aria-label={allied ? 'Rechercher un allié' : 'Rechercher un adversaire'} placeholder={catalogue === 'monsters' ? 'Bouftou, Blop, Dragon Cochon…' : 'Nom du personnage ou de la classe…'} value={query} onChange={event => setQuery(event.target.value)} /></label><small>{count} résultat{count !== 1 ? 's' : ''}</small></div>
        <div className="duel-catalogue-filters" role="group" aria-label="Filtres du catalogue">
          <WorldFilter onChange={changeWorld} />
          {catalogue === 'monsters' && <>
            <label className="duel-dungeon-filter"><span>Donjon</span><select aria-label="Donjon d’origine" value={activeRoomId} onChange={event => setRoomId(event.target.value)}><option value="">Tous les donjons</option>{monsterRooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
            <label className="duel-boss-filter"><input type="checkbox" checked={bossOnly} onChange={event => setBossOnly(event.target.checked)} />Boss uniquement</label>
          </>}
        </div>
        <div className="duel-catalogue-grid">
          {catalogue !== 'monsters' ? filteredCharacters.map(entry => <article key={entry.key} className={`duel-candidate${!entry.summary.valid ? ' invalid' : ''}`} draggable={!full && entry.summary.valid} data-candidate-id={entry.key}
            onDragStart={event => beginDrag(event, entry)} onDragEnd={clearDrag}>
            <div className="duel-candidate-top"><span className="duel-candidate-origin">{entry.source === 'profiles' ? 'PERSONNAGE' : entry.loadout.spells?.custom ? 'CLASSE CUSTOM' : PLATFORM ? 'CLASSE INSTALLÉE' : 'CLASSE DOFUS'}</span><GripVertical size={16} /></div>
            <div className="duel-candidate-identity"><Portrait entry={entry} /><div><strong>{entry.name}</strong><small>{CLASSES[entry.classId].name} · niv. {entry.summary.level}</small></div></div>
            <div className="duel-candidate-stats"><span><Heart size={12} />{number(entry.summary.hp)}</span><span>{entry.summary.pa} PA</span><span>{entry.summary.pm} PM</span></div>
            {!entry.summary.valid && <p className="duel-candidate-error">Personnage à compléter</p>}
            <button type="button" className="btn duel-candidate-add" disabled={full || !entry.summary.valid} onClick={() => add(entry)} aria-label={`Ajouter ${entry.name}`}><Plus size={14} />{entry.source === 'classes' && onCreateTeamProfile && !onAddCandidate ? 'Créer et ajouter' : 'Ajouter au camp'}</button>
          </article>) : monsters.map(monster => {
            const customEntry = monster.customMonster && { key: monster.id, kind: 'monster', customMonster: monster.customMonster };
            const customStats = customEntry && opponentSummary(customEntry);
            const available = customStats ? [{ grade: 1, level: customStats.level, baseHp: customStats.hp }] : monsterGrades(monster.id);
            const grade = available.find(value => value.grade === grades[monster.id]) || available.at(-1);
            const entry = customEntry || { key: `monster:${monster.id}:${grade.grade}`, kind: 'monster', monsterId: monster.id, grade: grade.grade };
            return <article key={monster.id} className="duel-candidate monster" draggable={!full} data-candidate-id={`monster:${monster.id}`}
              onDragStart={event => beginDrag(event, entry)} onDragEnd={clearDrag}>
              <div className="duel-candidate-top"><span className="duel-candidate-origin">{monster.boss ? 'BOSS' : 'MONSTRE'}</span><GripVertical size={16} /></div>
              <div className="duel-candidate-identity"><Portrait entry={entry} /><div><strong>{monster.name}</strong><small>{monster.rooms[0]?.name || 'Bestiaire'}</small></div></div>
              {customEntry ? <small>Niv. {customStats.level} · {number(customStats.hp)} PV · {monster.customMonster.spells.length} sorts</small> : <select aria-label={`Niveau proposé pour ${monster.name}`} value={grade.grade} onChange={event => setGrades(previous => ({ ...previous, [monster.id]: Number(event.target.value) }))}>{available.map(value => <option key={value.grade} value={value.grade}>Niv. {value.level} · {number(value.baseHp)} PV</option>)}</select>}
              <button type="button" className="btn duel-candidate-add" disabled={full} onClick={() => add(entry)} aria-label={`Ajouter ${monster.name}`}><Plus size={14} />Ajouter au camp</button>
            </article>;
          })}
        </div>
        {!count && <div className="duel-catalogue-empty"><Users size={26} /><strong>{catalogue === 'profiles' && !query ? 'Vos personnages apparaîtront ici' : 'Aucun résultat'}</strong><p>{catalogue === 'profiles' && !query ? 'Créez un personnage ou choisissez une classe dans le catalogue.' : 'Essayez un autre nom ou modifiez les filtres.'}</p></div>}
      </section>
      {!onAddCandidate && <section className={`duel-team${dragging ? ' accepting' : ''}${dropOver ? ' drag-over' : ''}`} aria-label={teamLabel} data-opponent-drop={allied ? undefined : true} data-ally-drop={allied ? true : undefined}
        onDragOver={event => { if (!full && Array.from(event.dataTransfer.types || []).includes(OPPONENT_DRAG_TYPE)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setDropOver(true); } }}
        onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDropOver(false); }} onDrop={drop}>
        <div className="duel-team-heading"><div><Shield size={18} /><h3>{teamLabel}</h3><span>{opponents.length + leaderCount}/{capacity}</span></div><button type="button" className="duel-team-clear" disabled={!opponents.length && !leaderCount} onClick={() => { onChange([]); if (leaderCount) onRemoveLeader(); }} aria-label={allied ? 'Retirer tous les alliés' : 'Vider le camp adverse'}><Trash2 size={14} />Vider</button></div>
        <div className="duel-team-list" ref={teamList}>
          {allied && leader && <div className="duel-team-member team-leader"><Portrait entry={leader} /><div className="duel-team-member-info"><strong>{leader.name}</strong><small>Niv. {leaderSummary.level} · {number(leaderSummary.hp)} PV</small><span className="team-control-badge">Personnage principal</span>
            {onEditLeader && <button type="button" onClick={onEditLeader}><Settings2 size={12} />Personnaliser</button>}
            <div className="ally-controller">
              <label>Contrôle<select aria-label="Contrôle du personnage principal" value={leader.controller || 'player'} onChange={event => onLeaderControllerChange(event.target.value)}><option value="player">Manuel · Vous</option><option value="ai">Automatique · IA</option></select></label>
              {leader.controller === 'ai' && <label>IA<select aria-label="IA du personnage principal" value={leader.botId || 'maison'} onChange={event => onLeaderBotChange(event.target.value)}>
                {!allBots.some(bot => bot.id === (leader.botId || 'maison')) && <option value={leader.botId}>IA indisponible</option>}
                {allBots.map(bot => <option key={bot.id} value={bot.id}>{bot.name}</option>)}</select></label>}
            </div>
          </div><button type="button" className="duel-remove-member" aria-label={`Retirer ${leader.name} de mon équipe`} onClick={onRemoveLeader}><X size={15} /></button></div>}
          {roster.map(({ entry, summary }, index) => <div className="duel-team-member" key={index} data-opponent-index={allied ? undefined : index} data-ally-index={allied ? index : undefined}>
            <Portrait entry={entry} /><div className="duel-team-member-info"><strong>{summary.name}</strong><small>Niv. {summary.level} · {number(summary.hp)} PV</small>
              {entry.kind === 'monster' ? entry.customMonster ? <small>{entry.customMonster.spells.length} sorts propres à cette créature</small> : <select aria-label={`Niveau de ${summary.name} (${index + 1})`} value={entry.grade} onChange={event => onChange(opponents.map((value, i) => i === index ? { ...value, grade: Number(event.target.value) } : value))}>{monsterGrades(entry.monsterId).map(grade => <option key={grade.grade} value={grade.grade}>Niv. {grade.level}</option>)}</select>
                : <button type="button" onClick={() => onEditOpponent(index)}><Settings2 size={12} />Personnaliser</button>}
              {allied && <div className="ally-controller">
                <label>Contrôle<select aria-label={`Contrôle de ${summary.name} (${index + 1})`} value={entry.controller} onChange={event => onChange(opponents.map((value, i) => i === index ? { ...value, controller: event.target.value } : value))}><option value="player">Manuel · Vous</option><option value="ai">Automatique · IA</option></select></label>
                {entry.controller === 'ai' && (entry.kind === 'character' ? <label>IA<select aria-label={`IA de ${summary.name} (${index + 1})`} value={entry.botId || 'maison'} onChange={event => onChange(opponents.map((value, i) => i === index ? { ...value, botId: event.target.value } : value))}>
                  {!allBots.some(bot => bot.id === (entry.botId || 'maison')) && <option value={entry.botId}>IA indisponible</option>}
                  {allBots.map(bot => <option key={bot.id} value={bot.id}>{bot.name}</option>)}</select></label> : <small>IA du monstre</small>)}
              </div>}
              {!allied && <div className="ally-controller opponent-controller"><label>IA<select aria-label={`IA de ${summary.name} (${index + 1})`}
                value={entry.botId || (entry.kind === 'monster' ? '' : botId || 'maison')}
                onChange={event => onChange(opponents.map((value, i) => i === index ? { ...value, botId: event.target.value || null } : value))}>
                {entry.kind === 'monster' && <option value="">IA du monstre</option>}
                {entry.botId && !allBots.some(bot => bot.id === entry.botId) && <option value={entry.botId}>IA indisponible · À remplacer</option>}
                {allBots.map(bot => <option key={bot.id} value={bot.id}>{bot.name}{bot.custom ? ' (perso)' : ''}</option>)}</select></label></div>}
            </div>
            <button type="button" className="duel-remove-member" aria-label={`Retirer ${summary.name} (${index + 1})`} onClick={() => onChange(opponents.filter((_, i) => i !== index))}><X size={15} /></button>
          </div>)}
          {!full && <div className={`duel-team-drop-hint${!opponents.length && !allied ? ' empty' : ''}`}><Plus size={23} /><strong>{allied ? 'Ajouter un allié' : opponents.length ? 'Ajouter un adversaire' : 'Votre camp adverse commence ici'}</strong><span>Glissez une carte ici ou cliquez sur Ajouter.</span></div>}
        </div>
        <div className="duel-team-bottom"><div className="duel-team-total"><span>Vie totale</span><strong><Heart size={14} />{number(roster.reduce((sum, value) => sum + value.summary.hp, leaderSummary?.hp || 0))} PV</strong></div>
          {allied ? <p className="duel-monster-ai" role="status">{automatic ? 'IA contre IA · Toute l’équipe est automatique.' : 'Vous jouez chaque personnage manuel à son tour.'}</p>
            : <p className="duel-monster-ai"><Bot size={14} />Chaque adversaire joue avec l’IA choisie sur sa fiche.</p>}
          {full && <p className="duel-team-full">Camp complet · 8 {allied ? 'combattants' : 'adversaires'}</p>}
        </div>
      </section>}
    </div>}
    <p className="duel-save-notice" role="status" aria-live="polite">{announcement}</p>
  </div>;
}
