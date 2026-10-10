import React, { useId, useState } from 'react';
import { Backpack, Check, ChevronRight, Footprints, Heart, MapPin, Shield, Swords, UserRound, Zap } from 'lucide-react';
import { CLASSES, CLASS_IDS } from '../engine/classes';
import { CHARACTERISTICS, STAT_LABELS } from '../engine/equipment';
import { MAPS } from '../engine/maps';
import LoadoutPicker from './LoadoutPicker';
import LoadoutLibrary from './LoadoutLibrary';
import MapPicker from './MapPicker';
import { AppearanceSelect, RetroPortrait } from './RetroAssets';
import { loadoutAtLevel } from './playerSetupState';
import CharacteristicAllocator from './CharacteristicAllocator';

const ROLES = {
  FECA: 'Protection', OSAMODAS: 'Invocations', ENUTROF: 'Entrave', SRAM: 'Pièges',
  XELOR: 'Contrôle des PA', ECAFLIP: 'Coups critiques', ENIRIPSA: 'Soins', IOP: 'Corps à corps',
  CRA: 'À distance', SADIDA: 'Ronces & poupées', SACRIEUR: 'Placement', PANDAWA: 'Placement & soutien',
};
const SECTIONS = [
  { id: 'character', label: 'Personnage', Icon: UserRound },
  { id: 'equipment', label: 'Stuff et sorts', Icon: Backpack },
  { id: 'match', label: 'Combat', Icon: Swords },
];
const mapName = id => MAPS[id].name.replace(/^🗺\s*/, '');

export default function PlayerSetup({ playerClass, setPlayerClass, botClass, setBotClass, botId, setBotId, allBots,
  mapId, setMapId, seed, setSeed, equipment, onStart, error, settingsError }) {
  const id = useId();
  const [section, setSection] = useState('character');
  const [view, setView] = useState('equipment');
  const [editingSide, setEditingSide] = useState('A');
  const [libraryOpen, setLibraryOpen] = useState(false);
  const { loadouts, update, summaries, saveError } = equipment;
  const player = CLASSES[playerClass];
  const summary = summaries.A;
  const loadout = loadouts.A;
  const bot = allBots.find(b => b.id === botId);
  const canPlay = summary.valid && summaries.B.valid;
  const classes = { A: playerClass, B: botClass };
  const changeClass = (side, next) => side === 'A' ? setPlayerClass(next) : setBotClass(next);
  const navigate = next => { setSection(next); setEditingSide('A'); setLibraryOpen(false); };
  const editStuff = (side = 'A', nextView = 'equipment') => {
    setEditingSide(side); setView(nextView); setSection('equipment'); setLibraryOpen(false);
  };
  const changeLevel = level => update('A', current => loadoutAtLevel(playerClass, current, level));

  return <div className="player-setup">
    <div className="setup-heading"><div><p className="eyebrow">PRÉPARATION DU COMBAT</p><h1>À vous de jouer.</h1><p>Un personnage, votre stuff, votre terrain.</p></div>
      <span className="local-badge"><span /> Jeu local · solo</span></div>
    <div className="setup-layout">
      <aside className="player-summary" aria-label="Résumé du personnage">
        <div className="summary-title"><span>MON PERSONNAGE</span><span className="level-badge">Niv. {summary.level}</span></div>
        <div className="summary-portrait"><RetroPortrait classId={playerClass} fallback={player.emoji} /></div>
        <h2>{player.name}</h2><p className="summary-role">{ROLES[playerClass]}</p>
        <div className="summary-vitals">
          <span><Heart size={15} /><strong>{summary.hp}</strong><small>PV</small></span>
          <span><Zap size={15} /><strong>{summary.pa}</strong><small>PA</small></span>
          <span><Footprints size={15} /><strong>{summary.pm}</strong><small>PM</small></span>
        </div>
        <div className="setup-launch">
          {canPlay ? <p className="ready-status"><Check size={13} /> Prêt pour le combat</p> : <button className="setup-validation" onClick={() => editStuff(summary.valid ? 'B' : 'A')}>
            {summary.valid ? 'Préparation adverse à corriger' : 'Votre préparation est à corriger'} <ChevronRight size={13} /></button>}
          <button type="button" className="btn primary setup-play" disabled={!canPlay} onClick={onStart}><Swords size={19} /> Jouer <ChevronRight size={17} /></button>
          <span>1 contre 1 · 30 secondes par tour</span>
        </div>
        <dl className="summary-stats">{CHARACTERISTICS.map(stat => <React.Fragment key={stat}>
          <dt><i className={`stat-dot ${stat}`} />{STAT_LABELS[stat]}</dt><dd data-summary-stat={stat}>{summary.stats[stat]}</dd>
        </React.Fragment>)}</dl>
        <button className="summary-link" onClick={() => editStuff('A', 'stats')}>Toutes les caractéristiques <ChevronRight size={14} /></button>
        <div className="summary-match">
          <button onClick={() => navigate('match')}><MapPin size={15} /><span>{mapName(mapId)}</span><ChevronRight size={14} /></button>
          <button onClick={() => navigate('match')}><Swords size={15} /><span>Contre {CLASSES[botClass].name} · niv. {summaries.B.level}</span><ChevronRight size={14} /></button>
        </div>

      </aside>

      <main className="setup-main">
        <nav className="setup-navigation" role="tablist" aria-label="Préparer mon personnage">
          {SECTIONS.map(({ id: sectionId, label, Icon }, index) => <button key={sectionId} type="button" role="tab"
            id={`${id}-${sectionId}-tab`} aria-controls={`${id}-${sectionId}`} aria-selected={section === sectionId && !libraryOpen}
            tabIndex={section === sectionId ? 0 : -1} className={section === sectionId && !libraryOpen ? 'selected' : ''}
            onClick={() => navigate(sectionId)} onKeyDown={event => {
              const direction = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
              if (direction || ['Home', 'End'].includes(event.key)) {
                event.preventDefault();
                const next = SECTIONS[event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + direction + 3) % 3].id;
                navigate(next); document.getElementById(`${id}-${next}-tab`)?.focus();
              }
            }}><Icon size={18} /><span>{label}</span><small>0{index + 1}</small></button>)}
        </nav>
        <div className="setup-content">
          {error ? <p className="loadout-errors" role="alert">{error}</p> : null}
          {settingsError || saveError ? <p className="loadout-errors" role="alert">La préparation ne peut pas être conservée dans ce navigateur. Vérifiez l’espace de stockage disponible.</p> : null}
          {editingSide === 'B' ? <div className="opponent-edit-banner"><Shield size={18} /><span>Vous équipez l’adversaire : <strong>{CLASSES[botClass].name}</strong></span><button className="btn" onClick={() => editStuff('A')}>Revenir à mon personnage</button></div> : null}
          <LoadoutLibrary compact side={editingSide} classId={classes[editingSide]} loadout={loadouts[editingSide]} update={update}
            saveError={saveError} onClassChange={changeClass} expanded={libraryOpen} onExpandedChange={setLibraryOpen} />

          <section id={`${id}-character`} role="tabpanel" aria-labelledby={`${id}-character-tab`} hidden={section !== 'character' || libraryOpen}>
            <div className="setup-section-heading"><div><h2>Choisissez votre classe</h2><p>Chaque classe garde sa propre préparation.</p></div><span className="count-badge">12 classes</span></div>
            <div className="setup-class-grid" aria-label="Classes disponibles">{CLASS_IDS.map(classId => <button type="button" key={classId}
              className={`setup-class${classId === playerClass ? ' selected' : ''}`} aria-label={`Choisir ${CLASSES[classId].name}`}
              aria-pressed={classId === playerClass} onClick={() => setPlayerClass(classId)}>
              <RetroPortrait classId={classId} fallback={CLASSES[classId].emoji} />
              <strong>{CLASSES[classId].name}</strong><small>{ROLES[classId]}</small>{classId === playerClass ? <Check className="class-check" size={13} /> : null}
            </button>)}</div>
            <div className="character-options">
              <div className="setup-level"><label className="field">Niveau du personnage<select aria-label="Niveau du personnage" value={summary.level} onChange={e => changeLevel(e.target.value)}>
                {Array.from({ length: 200 }, (_, i) => <option value={i + 1} key={i}>{i + 1}</option>)}
              </select></label><div className="level-shortcuts">{[100, 150, 200].map(level => <button key={level} className={summary.level === level ? 'selected' : ''} onClick={() => changeLevel(level)}>{level}</button>)}</div></div>
              <AppearanceSelect side="A" value={loadout.profile?.sex === 1 ? 'female' : 'male'} onChange={value => update('A', current => ({ ...current, profile: { ...current.profile, sex: value === 'female' ? 1 : 0 } }))} />
            </div>
            <CharacteristicAllocator key={playerClass} classId={playerClass} summary={summary} onChange={change => update('A', change)} />
            <div className="setup-next"><span>{summary.items.length} objets équipés · {summary.sets.map(set => set.name).join(', ') || 'Équipement personnalisé'}</span>
              <button className="btn" onClick={() => editStuff('A')}>Ajuster mon stuff <ChevronRight size={16} /></button></div>
          </section>

          <section id={`${id}-equipment`} role="tabpanel" aria-labelledby={`${id}-equipment-tab`} hidden={section !== 'equipment' || libraryOpen}>
            <LoadoutPicker embedded fixedSide={editingSide} activeView={view} onViewChange={setView} classes={classes}
              names={{ A: 'Vous', B: bot?.name || 'Adversaire' }} onClassChange={changeClass} {...equipment} />
          </section>

          <section id={`${id}-match`} role="tabpanel" aria-labelledby={`${id}-match-tab`} hidden={section !== 'match' || libraryOpen}>
            <div className="setup-section-heading"><div><h2>Choisissez votre combat</h2><p>Changez de terrain et choisissez qui affronter.</p></div><Swords size={23} /></div>
            <div className="match-options">
              <section className="setup-map"><h3>Le terrain</h3><MapPicker value={mapId} onChange={setMapId} preview /></section>
              <section className="setup-opponent"><h3>L’adversaire</h3>
                <div className="opponent-preview"><RetroPortrait classId={botClass} side="B" fallback={CLASSES[botClass].emoji} /><div><h2>{CLASSES[botClass].name}</h2><p>Niveau {summaries.B.level}</p><span>{summaries.B.hp} PV · {summaries.B.pa} PA · {summaries.B.pm} PM</span></div></div>
                <label className="field">Classe adverse<select aria-label="Classe adverse" value={botClass} onChange={e => setBotClass(e.target.value)}>{CLASS_IDS.map(classId => <option key={classId} value={classId}>{CLASSES[classId].name}</option>)}</select></label>
                <label className="field">Style de l’adversaire<select aria-label="Bot adverse" value={botId} onChange={e => setBotId(e.target.value)}>{allBots.map(b => <option key={b.id} value={b.id}>{b.name}{b.custom ? ' (perso)' : ''}</option>)}</select></label>
                <p className="opponent-description">{bot?.description}</p>
                <button className="btn edit-opponent" onClick={() => editStuff('B')}><Backpack size={15} /> Modifier son équipement</button>
              </section>
            </div>
            <details className="match-advanced"><summary>Options avancées</summary><div>
              <AppearanceSelect side="B" value={loadouts.B.profile?.sex === 1 ? 'female' : 'male'} onChange={value => update('B', current => ({ ...current, profile: { ...current.profile, sex: value === 'female' ? 1 : 0 } }))} />
              <label className="field">Graine du combat<input aria-label="Graine du combat" type="number" value={seed} onChange={e => setSeed(e.target.value)} /></label>
              <p>La même graine permet de rejouer les mêmes tirages aléatoires avec les mêmes actions.</p>
            </div></details>
          </section>
        </div>
      </main>
    </div>
  </div>;
}
