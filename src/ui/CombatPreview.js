import React, { useMemo } from 'react';
import { Bot, Castle, ChevronRight, Gamepad2, MapPin, Plus, Shield, Swords, Target, Users, X } from 'lucide-react';
import { MAPS } from '../engine/maps';
import { dungeonMap } from '../engine/customMaps';
import { KANOJEDO_MAP_ID, POUTCH_ID, POUTCH_GRADES, getMonster, monsterGrades } from '../engine/monsters';
import { dungeonForBoss, dungeonRoster } from '../engine/dungeons';
import { opponentSummary } from '../engine/opponentTeam';
import { customDungeonMemberPreview } from '../engine/customDungeons';
import { RetroPortrait, useRetroAssets } from './RetroAssets';
import { MapPreview } from './MapPicker';
import { combatMapName } from './CombatMapGallery';

function Member({ entry, control, onRemove, removeLabel }) {
  const summary = opponentSummary(entry);
  return <li className="combat-member" title={`${summary.name} · Niveau ${summary.level}`}>
    <span className="combat-member-art"><RetroPortrait classId={entry.classId} monsterId={entry.monsterId} artworkId={entry.loadout?.artworkId || entry.artworkId}
      appearance={entry.loadout?.profile?.sex === 1 ? 'female' : 'male'} fallback="🐾" />
      {onRemove && <button type="button" className="combat-member-remove" aria-label={removeLabel} title="Retirer du combat" onClick={onRemove}><X size={14} /></button>}</span>
    <strong>{entry.name || summary.name}</strong>
    <small>{control ? <>{control === 'player' ? <Gamepad2 size={12} /> : <Bot size={12} />}{control === 'player' ? 'Vous' : 'IA'}</> : `Niv. ${summary.level}`}</small>
  </li>;
}

export default function CombatPreview({ mode, leader, allies, opponents, automatic, bossId, bossGrade, setBossGrade,
  customDungeon, monsterGrade, setMonsterGrade, mapId, seed, onOpen, onRemoveLeader, onRemoveAlly, onRemoveOpponent }) {
  const teamCount = allies.length + Number(!!leader);
  const assets = useRetroAssets();
  const room = mode === 'boss' ? dungeonForBoss(bossId) : null;
  const monster = getMonster(mode === 'kanojedo' ? POUTCH_ID : bossId, mode === 'kanojedo' ? monsterGrade : bossGrade);
  const arena = mode === 'boss' && customDungeon ? dungeonMap(customDungeon) : MAPS[mode === 'kanojedo' ? KANOJEDO_MAP_ID : mode === 'boss' ? room?.combatMapId : mapId];
  const foes = useMemo(() => {
    if (mode === 'duel') return opponents;
    if (mode === 'kanojedo') return [{ kind: 'monster', monsterId: POUTCH_ID, grade: monsterGrade }];
    if (customDungeon) return customDungeon.members.flatMap(member => Array.from({ length: member.count }, () => customDungeonMemberPreview(member)));
    return room ? dungeonRoster(bossId, bossGrade, Number(seed) || 1).map(f => ({ kind: 'monster', monsterId: f.monsterId, grade: f.monsterGrade })) : [];
  }, [mode, opponents, monsterGrade, customDungeon, room, bossId, bossGrade, seed]);
  const dungeonName = customDungeon?.name || room?.name || 'Choisissez votre donjon';
  const edit = (panel, label) => <button type="button" className="combat-edit-link" data-panel-trigger={panel} aria-label={label} onClick={() => onOpen(panel)}>Modifier<ChevronRight size={15} /></button>;
  return <div className="combat-preview">
    <div className="combat-versus">
      <section className="combat-team-preview friends" aria-label="Aperçu de mon équipe">
        <header><h3><Shield size={18} />Mon équipe <span>{teamCount}/8</span></h3>{edit('allies', 'Modifier mon équipe')}</header>
        <ul className="combat-members">{leader && <Member entry={leader} control={leader.controller || 'player'} onRemove={onRemoveLeader} removeLabel={`Retirer ${leader.name} de mon équipe`} />}
          {allies.map((entry, i) => <Member key={i} entry={entry} control={entry.controller} onRemove={() => onRemoveAlly(i)} removeLabel={`Retirer ${opponentSummary(entry).name} de mon équipe (${i + 1})`} />)}
          {teamCount < 8 && <li className="combat-add-member"><button type="button" data-panel-trigger="allies" aria-label="Ajouter un allié" onClick={() => onOpen('allies')}><Plus size={23} /><span>{teamCount ? 'Un allié' : 'Choisir mon équipe'}</span></button></li>}
        </ul>
        <p className="combat-team-caption"><Users size={13} />{automatic ? 'Toute l’équipe joue automatiquement' : 'Seul ou à plusieurs, à vous de choisir'}</p>
      </section>
      <div className="combat-versus-medal" aria-hidden="true"><Swords size={21} /><span>VS</span></div>
      <section className={`combat-team-preview enemies ${mode}`} aria-label="Aperçu des adversaires">
        <header><h3>{mode === 'duel' ? <Swords size={18} /> : mode === 'boss' ? <Castle size={18} /> : <Target size={18} />}{mode === 'duel' ? 'Adversaires' : mode === 'boss' ? 'Le donjon' : 'Le Poutch'}<span>{foes.length}{mode === 'duel' ? '/8' : ''}</span></h3>
          {mode !== 'kanojedo' && edit(mode === 'duel' ? 'opponents' : 'dungeons', mode === 'duel' ? 'Modifier les adversaires' : 'Choisir un donjon')}</header>
        {mode === 'boss' && <button type="button" className="combat-dungeon-title" data-panel-trigger="dungeons" onClick={() => onOpen('dungeons')}>{dungeonName}<ChevronRight size={16} /></button>}
        <ul className={`combat-members${mode === 'boss' ? ' dungeon-members' : ''}`}>{foes.map((entry, i) => <Member key={i} entry={entry}
          onRemove={mode === 'duel' ? () => onRemoveOpponent(i) : undefined} removeLabel={`Retirer ${opponentSummary(entry).name} des adversaires (${i + 1})`} />)}
          {mode === 'duel' && foes.length < 8 && <li className="combat-add-member"><button type="button" data-panel-trigger="opponents" aria-label="Ajouter un adversaire" onClick={() => onOpen('opponents')}><Plus size={23} /><span>Un adversaire</span></button></li>}
        </ul>
        {mode === 'boss' && !customDungeon && room && <label className="combat-grade">Niveau du boss<select aria-label="Niveau du boss" value={bossGrade} onChange={event => setBossGrade(Number(event.target.value))}>
          {monsterGrades(bossId).map(g => <option key={g.grade} value={g.grade}>Niv. {g.level} · {g.baseHp.toLocaleString('fr-FR')} PV</option>)}</select></label>}
        {mode === 'kanojedo' && <><label className="combat-grade">Niveau du Poutch<select aria-label="Niveau du Poutch" value={monsterGrade} onChange={event => setMonsterGrade(Number(event.target.value))}>
          {POUTCH_GRADES.map(g => <option key={g.grade} value={g.grade}>Niv. {g.level} · {g.baseHp.toLocaleString('fr-FR')} PV</option>)}</select></label><p className="combat-team-caption">Il reste immobile. Testez vos enchaînements !</p></>}
        {mode === 'duel' && <p className="combat-team-caption"><Bot size={13} />Personnages et monstres, à votre guise</p>}
        {mode === 'boss' && !room && !customDungeon && <p className="combat-team-caption">{monster.name} n’a pas de salle jouable.</p>}
      </section>
    </div>
    <div className={`combat-terrain${mode === 'duel' ? ' editable' : ''}`}>
      {arena && <MapPreview map={arena} artwork={assets?.imagesReady && assets.maps[arena.id]} />}
      <div className="combat-terrain-name"><small><MapPin size={13} />LE TERRAIN</small><strong>{combatMapName(arena)}</strong><span>{mode === 'duel' ? 'La scène de votre prochain affrontement' : 'La carte et les placements de cette salle'}</span></div>
      {mode === 'duel' && <button type="button" className="btn" data-panel-trigger="map" onClick={() => onOpen('map')}>Changer de carte<ChevronRight size={16} /></button>}
    </div>
  </div>;
}
