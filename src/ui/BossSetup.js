import React, { useEffect, useState } from 'react';
import { Search, Check, Plus } from 'lucide-react';
import { UNAVAILABLE_BOSSES, getMonster, monsterGrades } from '../engine/monsters';
import { DUNGEONS, DUNGEON_BOSSES, UNAVAILABLE_DUNGEONS, dungeonForBoss, dungeonRoster, unavailableDungeonForBoss } from '../engine/dungeons';
import { MAPS } from '../engine/maps';
import { RetroPortrait, RetroSpellIcon, useRetroAssets } from './RetroAssets';
import { MapPreview } from './MapPicker';
import { customDungeonErrors, customDungeonMemberPreview } from '../engine/customDungeons';
import { opponentSummary } from '../engine/opponentTeam';

const normalize = value => value.toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’']/g, '');
const number = value => value.toLocaleString('fr-FR');
const ELEMENTS = [['neutre', 'Neutre'], ['terre', 'Terre'], ['feu', 'Feu'], ['eau', 'Eau'], ['air', 'Air']];

export default function BossSetup({ bossId, grade, onBossChange, onGradeChange, seed,
  customDungeons = [], customDungeonId, onCustomChange, onCreate, onEdit, compact = false }) {
  const assets = useRetroAssets();
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('all');
  useEffect(() => { if (customDungeonId) setSource(previous => previous === 'dofus' ? 'all' : previous); }, [customDungeonId]);
  const customDungeon = customDungeons.find(entry => entry.id === customDungeonId);
  const customMatches = source === 'dofus' ? [] : customDungeons.filter(entry => normalize(entry.name).includes(normalize(query)));
  const matches = source === 'custom' ? [] : DUNGEON_BOSSES.filter(boss => normalize(`${boss.name} ${dungeonForBoss(boss.id).name}`).includes(normalize(query)));
  const unavailableMatches = UNAVAILABLE_DUNGEONS.filter(boss => normalize(boss.name).includes(normalize(query)));
  const monster = getMonster(bossId, grade);
  const grades = monsterGrades(bossId);
  const room = dungeonForBoss(bossId);
  const unavailable = unavailableDungeonForBoss(bossId);
  const suggested = DUNGEON_BOSSES.find(boss => boss.id === unavailable?.suggestedBossId);
  const map = room && MAPS[room.combatMapId];
  const roster = room ? dungeonRoster(bossId, grade, Number(seed) || 1) : [];
  const partial = Object.values(monster.spells).filter(spell => spell.unsupportedEffects.length || spell.missingSummons.length);
  const gradePicker = <label className="field">Niveau du boss<select aria-label="Niveau du boss" value={grade} onChange={event => onGradeChange(Number(event.target.value))}>
    {grades.map(g => <option key={g.grade} value={g.grade}>Niveau {g.level} · {number(g.baseHp)} PV · grade {g.grade}</option>)}
  </select></label>;
  const Details = compact ? 'details' : 'div';
  return <div className="boss-setup">
    {!room && !customDungeon && <div className="boss-selection-notice" role="status">
      <strong>{monster.name} · Ancienne sélection</strong>
      <p>{unavailable?.reason || 'Aucune salle de donjon jouable n’est associée à ce monstre.'}</p>
      {suggested ? <button type="button" className="btn" onClick={() => onBossChange(suggested.id)}>Choisir {suggested.name}</button>
        : <p>Choisissez une salle dans la liste ci-dessous.</p>}
    </div>}
    <div className="boss-catalogue-heading"><div><h3>Les donjons <span className="count-badge">{DUNGEONS.length + customDungeons.length} salles</span></h3><p className="muted small">Choisissez une salle complète et son terrain.</p></div>
      {onCreate && <button className="btn primary" type="button" onClick={onCreate}><Plus size={16} />Créer un donjon</button>}
    </div>
    <div className="dungeon-filters">
      <div className="source-filters" role="group" aria-label="Origine des donjons">{[['all', 'Tous'], ['dofus', 'Dofus'], ['custom', 'Personnalisés']].map(([value, label]) => <button type="button" className="btn" key={value} aria-pressed={source === value} onClick={() => setSource(value)}>{label}</button>)}</div>
      <label className="boss-search"><Search size={16} /><input type="search" aria-label="Rechercher un boss" placeholder="Rechercher un donjon…"
        value={query} onChange={event => setQuery(event.target.value)} /></label>
    </div>
    <div className="boss-cards" aria-label="Boss disponibles">
      {customMatches.map(entry => {
        const member = entry.members[0], count = entry.members.reduce((sum, value) => sum + value.count, 0);
        const selected = entry.id === customDungeonId;
        const incomplete = customDungeonErrors(entry).length > 0;
        return <button type="button" key={`custom:${entry.id}`} className="boss-card" data-dungeon-id={entry.id} aria-pressed={selected} onClick={() => onCustomChange?.(entry.id)}>
          {member ? <RetroPortrait classId={member.character?.classId} monsterId={member.customMonster?.reference.monsterId || member.monsterId} artworkId={member.character?.loadout.artworkId || member.customMonster?.artworkId}
            appearance={member.character?.loadout.profile?.sex === 1 ? 'female' : 'male'} fallback="🐾" /> : <Plus size={25} />}
          <span><strong>{entry.name || 'Donjon sans nom'}</strong><small>Personnalisé · {count} combattant{count !== 1 ? 's' : ''}</small><small>{incomplete ? 'À compléter' : MAPS[entry.mapId]?.name.replace(/^🗺\s*/, '')}</small></span>
          {selected && <Check size={15} />}
        </button>;
      })}
      {matches.map(boss => {
        const variants = monsterGrades(boss.id);
        const min = Math.min(...variants.map(g => g.level)), max = Math.max(...variants.map(g => g.level));
        const encounter = dungeonForBoss(boss.id);
        const count = encounter.members.reduce((sum, member) => sum + member.count, 0);
        return <button type="button" key={boss.id} className="boss-card" aria-pressed={!customDungeon && boss.id === bossId}
          data-boss-id={boss.id}
          aria-label={`Choisir ${boss.name} (${min}${max !== min ? `–${max}` : ''})`} onClick={() => onBossChange(boss.id)}>
          <RetroPortrait monsterId={boss.id} fallback={boss.emoji} />
          <span><strong>{boss.name}</strong><small>{encounter.name}</small><small>Niv. {min}{max !== min ? `–${max}` : ''} · {count} monstre{count > 1 ? 's' : ''}</small></span>
          {!customDungeon && boss.id === bossId && <Check size={15} />}
        </button>;
      })}
    </div>
    {!matches.length && !customMatches.length && <p className="boss-empty" role="status">Aucun donjon ne correspond à cette recherche.{source === 'custom' ? ' Créez votre première salle avec le bouton ci-dessus.' : ''}</p>}
    <p className="boss-count" aria-live="polite">{matches.length + customMatches.length} donjon{matches.length + customMatches.length !== 1 ? 's' : ''}</p>
    {source !== 'custom' && !!unavailableMatches.length && <details className="boss-unavailable" key={query} open={query.trim() ? true : undefined}>
      <summary>Hors des salles de donjon ({unavailableMatches.length})</summary>
      <ul>{unavailableMatches.map(boss => <li key={boss.bossId}><strong>{boss.name}</strong><span>{boss.reason}</span></li>)}</ul>
    </details>}
    {compact && (customDungeon || room) && <div className="dungeon-compact-selection"><h3>{customDungeon?.name || monster.name}</h3>{!customDungeon && gradePicker}
      {customDungeon && onEdit && <button type="button" className="btn" onClick={() => onEdit(customDungeon)}>Modifier le donjon</button>}
    </div>}
    <Details className="dungeon-combat-details">
    {compact && <summary>Voir le groupe, la carte et les détails</summary>}
    {customDungeon && <section className="custom-dungeon-selection dungeon-roster" aria-label="Donjon personnalisé sélectionné">
      <div className="dungeon-roster-heading"><div><h3>{customDungeon.name || 'Donjon sans nom'}</h3><p>Votre groupe et votre carte seront utilisés pour ce combat.</p></div>
        {onEdit && !compact && <button type="button" className="btn" onClick={() => onEdit(customDungeon)}>Modifier le donjon</button>}</div>
      {customDungeonErrors(customDungeon).length > 0 && <p className="loadout-errors">{customDungeonErrors(customDungeon).join(' ')}</p>}
      <div className="match-options"><table><thead><tr><th>Combattant</th><th>Nombre</th><th>Niveau</th></tr></thead><tbody>{customDungeon.members.map((member, index) => {
        const preview = customDungeonMemberPreview(member), summary = opponentSummary(preview);
        return <tr key={index}><td>{preview.name || summary.name}</td><td>×{member.count}</td><td>{summary.level}</td></tr>;
      })}</tbody></table><div className="setup-map" data-custom-dungeon-map={customDungeon.mapId}><h3>{MAPS[customDungeon.mapId].name.replace(/^🗺\s*/, '')}</h3><MapPreview map={MAPS[customDungeon.mapId]} artwork={assets?.imagesReady && assets.maps[customDungeon.mapId]} /></div></div>
    </section>}
    {room && !customDungeon ? <section className="dungeon-roster" aria-label="Monstres de la dernière salle">
      <div className="dungeon-roster-heading"><div><h3>{room.name}</h3><p>Tous ces monstres seront présents dès le début du combat.</p></div><span className="count-badge">{roster.length} monstre{roster.length > 1 ? 's' : ''}</span></div>
      <table><thead><tr><th>Monstre</th><th>Nombre</th><th>Niveau</th></tr></thead>
        <tbody>{room.members.map(member => {
          const fighters = roster.filter(f => f.monsterId === member.monsterId).map(f => getMonster(f.monsterId, f.monsterGrade));
          const min = Math.min(...fighters.map(f => f.level)), max = Math.max(...fighters.map(f => f.level));
          return <tr key={member.monsterId}><td><RetroPortrait monsterId={member.monsterId} fallback={fighters[0].emoji} /><span>{fighters[0].name}</span></td><td>×{member.count}</td><td>{min}{min !== max ? `–${max}` : ''}</td></tr>;
        })}</tbody></table>
      <p className="opponent-description">La victoire demande de vaincre tout le groupe. Les invocations apparaissent ensuite au fil du combat.</p>
    </section> : null}
    {room && !customDungeon && <div className="match-options boss-details">
      <section className="setup-opponent" aria-label="Boss sélectionné">
        <div className="opponent-preview"><RetroPortrait monsterId={bossId} fallback={monster.emoji} />
          <div><h2>{monster.name}</h2><p>Niveau {monster.level}</p><span>{number(monster.baseHp)} PV · {Math.max(0, monster.basePa)} PA · {Math.max(0, monster.basePm)} PM</span></div>
        </div>
        {!compact && gradePicker}
        <table className="boss-resistances"><caption>Résistances</caption><thead><tr>{ELEMENTS.map(([id, label]) => <th key={id}>{label}</th>)}</tr></thead>
          <tbody><tr>{ELEMENTS.map(([id]) => <td key={id}>{monster.resistances[id]} %</td>)}</tr></tbody></table>
        <details className="boss-spells"><summary>{Object.keys(monster.spells).length} sorts du boss</summary>
          <ul>{Object.values(monster.spells).map(spell => <li key={spell.key}><RetroSpellIcon spell={spell} /><span>{spell.name}<small>{spell.pa} PA · grade {spell.grade}{spell.unsupportedEffects.length || spell.missingSummons.length ? ' · partiel' : ''}</small></span></li>)}</ul>
        </details>
      </section>
      {map && <section className="setup-map dungeon-map" aria-label="Carte de la salle finale" data-dungeon-map={map.sourceId}>
        <h3>{map.name.replace(/^🗺\s*/, '')}</h3>
        <MapPreview map={map} artwork={assets?.imagesReady && assets.maps[map.id]} />
        <p className="opponent-description">{room.locationNote || 'La salle finale est sélectionnée automatiquement avec ce donjon.'}</p>
        <p className="map-placement-note">Placements du client · {map.startingCells[0].length} cases pour votre camp · {map.startingCells[1].length} pour les monstres.</p>
      </section>}
    </div>}
    {room && !customDungeon && <div className="boss-simulation-note"><strong>Mécaniques de combat simplifiées</strong>
      <p>Les monstres, le décor et les cases de placement sont importés du client Retro. L’IA et les mécanismes particuliers des boss restent ceux du simulateur.</p>
      {monster.statsSource === 'unavailable-zero-default' && <p>Les caractéristiques élémentaires de ce boss sont absentes des données disponibles : ses dégâts utilisent les jets de base.</p>}
      {!!partial.length && <p>Effets partiellement pris en charge : {partial.map(spell => spell.name).join(', ')}.</p>}
      {!!monster.missingSpells.length && <p>{monster.missingSpells.length} sort(s) sans définition disponible.</p>}
      <details><summary>Entrées anciennes ou incomplètes ({UNAVAILABLE_BOSSES.length})</summary>
        <p>Ces variantes restent indisponibles : leurs caractéristiques de combat sont absentes du client.</p>
        <p>{UNAVAILABLE_BOSSES.map(boss => `${boss.name} (#${boss.id})`).join(', ')}.</p>
      </details>
    </div>}
    </Details>
  </div>;
}
