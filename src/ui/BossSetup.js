import React, { useState } from 'react';
import { Search, Check } from 'lucide-react';
import { UNAVAILABLE_BOSSES, getMonster, monsterGrades } from '../engine/monsters';
import { DUNGEONS, DUNGEON_BOSSES, UNAVAILABLE_DUNGEONS, dungeonForBoss, dungeonRoster, unavailableDungeonForBoss } from '../engine/dungeons';
import { MAPS } from '../engine/maps';
import { RetroPortrait, RetroSpellIcon, useRetroAssets } from './RetroAssets';
import { MapPreview } from './MapPicker';

const normalize = value => value.toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’']/g, '');
const number = value => value.toLocaleString('fr-FR');
const ELEMENTS = [['neutre', 'Neutre'], ['terre', 'Terre'], ['feu', 'Feu'], ['eau', 'Eau'], ['air', 'Air']];

export default function BossSetup({ bossId, grade, onBossChange, onGradeChange, seed }) {
  const assets = useRetroAssets();
  const [query, setQuery] = useState('');
  const matches = DUNGEON_BOSSES.filter(boss => normalize(`${boss.name} ${dungeonForBoss(boss.id).name}`).includes(normalize(query)));
  const unavailableMatches = UNAVAILABLE_DUNGEONS.filter(boss => normalize(boss.name).includes(normalize(query)));
  const monster = getMonster(bossId, grade);
  const grades = monsterGrades(bossId);
  const room = dungeonForBoss(bossId);
  const unavailable = unavailableDungeonForBoss(bossId);
  const suggested = DUNGEON_BOSSES.find(boss => boss.id === unavailable?.suggestedBossId);
  const map = room && MAPS[room.combatMapId];
  const roster = room ? dungeonRoster(bossId, grade, Number(seed) || 1) : [];
  const partial = Object.values(monster.spells).filter(spell => spell.unsupportedEffects.length || spell.missingSummons.length);
  return <div className="boss-setup">
    {!room && <div className="boss-selection-notice" role="status">
      <strong>{monster.name} · Ancienne sélection</strong>
      <p>{unavailable?.reason || 'Aucune salle de donjon jouable n’est associée à ce monstre.'}</p>
      {suggested ? <button type="button" className="btn" onClick={() => onBossChange(suggested.id)}>Choisir {suggested.name}</button>
        : <p>Choisissez une salle dans la liste ci-dessous.</p>}
    </div>}
    <div className="boss-catalogue-heading"><h3>Les salles finales <span className="count-badge">{DUNGEONS.length} groupes</span></h3>
      <label className="boss-search"><Search size={16} /><input type="search" aria-label="Rechercher un boss" placeholder="Bouftou, Dragon Cochon, Ougah…"
        value={query} onChange={event => setQuery(event.target.value)} /></label>
    </div>
    <div className="boss-cards" aria-label="Boss disponibles">
      {matches.map(boss => {
        const variants = monsterGrades(boss.id);
        const min = Math.min(...variants.map(g => g.level)), max = Math.max(...variants.map(g => g.level));
        const encounter = dungeonForBoss(boss.id);
        const count = encounter.members.reduce((sum, member) => sum + member.count, 0);
        return <button type="button" key={boss.id} className="boss-card" aria-pressed={boss.id === bossId}
          data-boss-id={boss.id}
          aria-label={`Choisir ${boss.name} (${min}${max !== min ? `–${max}` : ''})`} onClick={() => onBossChange(boss.id)}>
          <RetroPortrait monsterId={boss.id} fallback={boss.emoji} />
          <span><strong>{boss.name}</strong><small>{encounter.name}</small><small>Niv. {min}{max !== min ? `–${max}` : ''} · {count} monstre{count > 1 ? 's' : ''}</small></span>
          {boss.id === bossId && <Check size={15} />}
        </button>;
      })}
    </div>
    {!matches.length && <p className="boss-empty" role="status">Aucun boss ne correspond à cette recherche.</p>}
    <p className="boss-count" aria-live="polite">{matches.length} boss</p>
    {!!unavailableMatches.length && <details className="boss-unavailable" key={query} open={query.trim() ? true : undefined}>
      <summary>Hors des salles de donjon ({unavailableMatches.length})</summary>
      <ul>{unavailableMatches.map(boss => <li key={boss.bossId}><strong>{boss.name}</strong><span>{boss.reason}</span></li>)}</ul>
    </details>}
    {room ? <section className="dungeon-roster" aria-label="Monstres de la dernière salle">
      <div className="dungeon-roster-heading"><div><h3>{room.name}</h3><p>Tous ces monstres seront présents dès le début du combat.</p></div><span className="count-badge">{roster.length} monstre{roster.length > 1 ? 's' : ''}</span></div>
      <table><thead><tr><th>Monstre</th><th>Nombre</th><th>Niveau</th></tr></thead>
        <tbody>{room.members.map(member => {
          const fighters = roster.filter(f => f.monsterId === member.monsterId).map(f => getMonster(f.monsterId, f.monsterGrade));
          const min = Math.min(...fighters.map(f => f.level)), max = Math.max(...fighters.map(f => f.level));
          return <tr key={member.monsterId}><td><RetroPortrait monsterId={member.monsterId} fallback={fighters[0].emoji} /><span>{fighters[0].name}</span></td><td>×{member.count}</td><td>{min}{min !== max ? `–${max}` : ''}</td></tr>;
        })}</tbody></table>
      <p className="opponent-description">La victoire demande de vaincre tout le groupe. Les invocations apparaissent ensuite au fil du combat.</p>
    </section> : null}
    {room && <div className="match-options boss-details">
      <section className="setup-opponent" aria-label="Boss sélectionné">
        <div className="opponent-preview"><RetroPortrait monsterId={bossId} fallback={monster.emoji} />
          <div><h2>{monster.name}</h2><p>Niveau {monster.level}</p><span>{number(monster.baseHp)} PV · {Math.max(0, monster.basePa)} PA · {Math.max(0, monster.basePm)} PM</span></div>
        </div>
        <label className="field">Niveau du boss<select aria-label="Niveau du boss" value={grade} onChange={event => onGradeChange(Number(event.target.value))}>
          {grades.map(g => <option key={g.grade} value={g.grade}>Niveau {g.level} · {number(g.baseHp)} PV · grade {g.grade}</option>)}
        </select></label>
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
    {room && <div className="boss-simulation-note"><strong>Mécaniques de combat simplifiées</strong>
      <p>Les monstres, le décor et les cases de placement sont importés du client Retro. L’IA et les mécanismes particuliers des boss restent ceux du simulateur.</p>
      {monster.statsSource === 'unavailable-zero-default' && <p>Les caractéristiques élémentaires de ce boss sont absentes des données disponibles : ses dégâts utilisent les jets de base.</p>}
      {!!partial.length && <p>Effets partiellement pris en charge : {partial.map(spell => spell.name).join(', ')}.</p>}
      {!!monster.missingSpells.length && <p>{monster.missingSpells.length} sort(s) sans définition disponible.</p>}
      <details><summary>Entrées anciennes ou incomplètes ({UNAVAILABLE_BOSSES.length})</summary>
        <p>Ces variantes restent indisponibles : leurs caractéristiques de combat sont absentes du client.</p>
        <p>{UNAVAILABLE_BOSSES.map(boss => `${boss.name} (#${boss.id})`).join(', ')}.</p>
      </details>
    </div>}
  </div>;
}
