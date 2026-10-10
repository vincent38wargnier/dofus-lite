import React, { useId, useState } from 'react';
import { Backpack, Check, ChevronRight, Footprints, Heart, MapPin, Shield, Swords, UserRound, Zap } from 'lucide-react';
import { CLASSES, CLASS_IDS } from '../engine/classes';
import { CHARACTERISTICS, STAT_LABELS } from '../engine/equipment';
import { MAPS } from '../engine/maps';
import { KANOJEDO_MAP_ID, POUTCH_ID, DEFAULT_BOSS_ID, defaultMonsterGrade, getMonster } from '../engine/monsters';
import KanojedoSetup from './KanojedoSetup';
import BossSetup from './BossSetup';
import { dungeonForBoss } from '../engine/dungeons';
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
const mapName = id => MAPS[id]?.name.replace(/^🗺\s*/, '') || 'Salle indisponible';

export default function PlayerSetup({ playerClass, setPlayerClass, botClass, setBotClass, botId, setBotId, allBots,
  customCharacters = [], customCharacter, selectCustomCharacter,
  playerBotId = 'maison', setPlayerBotId,
  mapId, setMapId, mode = 'duel', setMode, monsterGrade = 5, setMonsterGrade,
  bossId = DEFAULT_BOSS_ID, setBossId, bossGrade = defaultMonsterGrade(bossId), setBossGrade,
  seed, setSeed, equipment, onStart, error, settingsError }) {
  const id = useId();
  const [section, setSection] = useState('character');
  const [view, setView] = useState('equipment');
  const [editingSide, setEditingSide] = useState('A');
  const [libraryOpen, setLibraryOpen] = useState(false);
  const { loadouts, update, summaries, saveError } = equipment;
  const player = CLASSES[playerClass];
  const playerName = customCharacter?.name || player.name;
  const playerKey = customCharacter ? `custom:${customCharacter.id}` : playerClass;
  const summary = summaries.A;
  const loadout = loadouts.A;
  const bot = allBots.find(b => b.id === botId);
  const training = mode === 'kanojedo';
  const automatic = mode === 'boss-auto';
  const dungeonMode = mode === 'boss' || automatic;
  const fightingMonster = mode !== 'duel';
  const monster = getMonster(training ? POUTCH_ID : bossId, training ? monsterGrade : bossGrade);
  const dungeon = dungeonForBoss(bossId);
  const monsterCount = dungeon?.members.reduce((sum, member) => sum + member.count, 0);
  const missingGroup = dungeonMode && !dungeon;
  const playerBot = allBots.find(b => b.id === playerBotId);
  const missingName = customCharacter && !customCharacter.name.trim();
  const canPlay = summary.valid && !missingName && !missingGroup && (!automatic || !!playerBot) && (fightingMonster || summaries.B.valid);
  const classes = { A: playerClass, B: botClass };
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
        <div className="summary-portrait"><RetroPortrait classId={playerClass} artworkId={loadout.artworkId} fallback={player.emoji} /></div>
        <h2>{playerName}</h2><p className="summary-role">{customCharacter ? 'Classe personnalisée' : ROLES[playerClass]}</p>
        <div className="summary-vitals">
          <span><Heart size={15} /><strong>{summary.hp}</strong><small>PV</small></span>
          <span><Zap size={15} /><strong>{summary.pa}</strong><small>PA</small></span>
          <span><Footprints size={15} /><strong>{summary.pm}</strong><small>PM</small></span>
        </div>
        <div className="setup-launch">
          {canPlay ? <p className="ready-status"><Check size={13} /> Prêt pour le combat</p> : <button className="setup-validation" onClick={() => missingName ? navigate('character') : missingGroup || (automatic && !playerBot) ? navigate('match') : editStuff(summary.valid ? 'B' : 'A')}>
            {missingName ? 'Nommez votre classe dans l’Atelier' : missingGroup ? 'Choisissez une salle disponible' : automatic && !playerBot ? 'Choisissez une IA' : summary.valid ? 'Préparation adverse à corriger' : 'Votre préparation est à corriger'} <ChevronRight size={13} /></button>}
          <button type="button" className="btn primary setup-play" disabled={!canPlay} onClick={onStart}><Swords size={19} />{automatic ? 'Simuler le donjon' : 'Jouer'}<ChevronRight size={17} /></button>
          <span>{automatic ? 'Votre personnage joué par l’IA · Salle finale' : `${training ? 'Entraînement' : dungeonMode ? 'Salle finale de donjon' : '1 contre 1'} · 30 secondes par tour`}</span>
        </div>
        <dl className="summary-stats">{CHARACTERISTICS.map(stat => <React.Fragment key={stat}>
          <dt><i className={`stat-dot ${stat}`} />{STAT_LABELS[stat]}</dt><dd data-summary-stat={stat}>{summary.stats[stat]}</dd>
        </React.Fragment>)}</dl>
        <button className="summary-link" onClick={() => editStuff('A', 'stats')}>Toutes les caractéristiques <ChevronRight size={14} /></button>
        <div className="summary-match">
          <button onClick={() => navigate('match')}><MapPin size={15} /><span>{mapName(training ? KANOJEDO_MAP_ID : dungeonMode ? dungeon?.combatMapId : mapId)}</span><ChevronRight size={14} /></button>
          <button onClick={() => navigate('match')}><Swords size={15} /><span>Contre {fightingMonster ? monster.name : CLASSES[botClass].name} · {dungeonMode && monsterCount ? `${monsterCount} monstre${monsterCount > 1 ? 's' : ''}` : `niv. ${fightingMonster ? monster.level : summaries.B.level}`}</span><ChevronRight size={14} /></button>
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
          {missingName ? <p className="loadout-errors" role="alert">Donnez un nom à cette classe dans l’Atelier avant de jouer.</p> : null}
          {settingsError || saveError ? <p className="loadout-errors" role="alert">La préparation ne peut pas être conservée dans ce navigateur. Vérifiez l’espace de stockage disponible.</p> : null}
          {editingSide === 'B' ? <div className="opponent-edit-banner"><Shield size={18} /><span>Vous équipez l’adversaire : <strong>{CLASSES[botClass].name}</strong></span><button className="btn" onClick={() => editStuff('A')}>Revenir à mon personnage</button></div> : null}
          <LoadoutLibrary key={editingSide === 'A' ? playerKey : botClass} compact side={editingSide} classId={classes[editingSide]}
            draftKey={editingSide === 'A' ? `A:${playerKey}` : undefined} loadout={loadouts[editingSide]} update={update}
            saveError={saveError} expanded={libraryOpen} onExpandedChange={setLibraryOpen} />

          <section id={`${id}-character`} role="tabpanel" aria-labelledby={`${id}-character-tab`} hidden={section !== 'character' || libraryOpen}>
            <div className="setup-section-heading"><div><h2>Choisissez votre classe</h2><p>Chaque classe garde sa propre préparation.{customCharacters.length > 0 ? ' Vos créations de l’Atelier sont incluses.' : ''}</p></div><span className="count-badge">{CLASS_IDS.length + customCharacters.length} classes</span></div>
            <div className="setup-class-grid" aria-label="Classes disponibles">{CLASS_IDS.map(classId => <button type="button" key={classId}
              className={`setup-class${!customCharacter && classId === playerClass ? ' selected' : ''}`} aria-label={`Choisir ${CLASSES[classId].name}`}
              aria-pressed={!customCharacter && classId === playerClass} onClick={() => setPlayerClass(classId)}>
              <RetroPortrait classId={classId} fallback={CLASSES[classId].emoji} />
              <strong>{CLASSES[classId].name}</strong><small>{ROLES[classId]}</small>{!customCharacter && classId === playerClass ? <Check className="class-check" size={13} /> : null}
            </button>)}{customCharacters.map(character => <button type="button" key={`custom:${character.id}`}
              data-custom-character-id={character.id} className={`setup-class${character.id === customCharacter?.id ? ' selected' : ''}`}
              aria-label={`Choisir ${character.name || 'Classe sans nom'} (personnalisée)`} aria-pressed={character.id === customCharacter?.id}
              onClick={() => selectCustomCharacter(character)}>
              <RetroPortrait classId={character.classId} artworkId={character.loadout.artworkId}
                appearance={character.loadout.profile?.sex === 1 ? 'female' : 'male'} fallback={CLASSES[character.classId].emoji} />
              <strong>{character.name || 'Classe sans nom'}</strong><small>Personnalisée · {character.loadout.spells?.custom?.length || 0} sorts</small>
              {character.id === customCharacter?.id ? <Check className="class-check" size={13} /> : null}
            </button>)}</div>
            <div className="character-options">
              <div className="setup-level"><label className="field">Niveau du personnage<select aria-label="Niveau du personnage" value={summary.level} onChange={e => changeLevel(e.target.value)}>
                {Array.from({ length: 200 }, (_, i) => <option value={i + 1} key={i}>{i + 1}</option>)}
              </select></label><div className="level-shortcuts">{[100, 150, 200].map(level => <button key={level} className={summary.level === level ? 'selected' : ''} onClick={() => changeLevel(level)}>{level}</button>)}</div></div>
              <AppearanceSelect side="A" value={loadout.profile?.sex === 1 ? 'female' : 'male'} onChange={value => update('A', current => ({ ...current, profile: { ...current.profile, sex: value === 'female' ? 1 : 0 } }))} />
            </div>
            <CharacteristicAllocator key={playerKey} classId={playerClass} summary={summary} onChange={change => update('A', change)} />
            <div className="setup-next"><span>{summary.items.length} objets équipés · {summary.sets.map(set => set.name).join(', ') || 'Équipement personnalisé'}</span>
              <button className="btn" onClick={() => editStuff('A')}>Ajuster mon stuff <ChevronRight size={16} /></button></div>
          </section>

          <section id={`${id}-equipment`} role="tabpanel" aria-labelledby={`${id}-equipment-tab`} hidden={section !== 'equipment' || libraryOpen}>
            <LoadoutPicker key={editingSide === 'A' ? playerKey : botClass} embedded fixedSide={editingSide} activeView={view} onViewChange={setView} classes={classes}
              names={{ A: customCharacter?.name || 'Vous', B: bot?.name || 'Adversaire' }} {...equipment} />
          </section>

          <section id={`${id}-match`} role="tabpanel" aria-labelledby={`${id}-match-tab`} hidden={section !== 'match' || libraryOpen}>
            <div className="setup-section-heading"><div><h2>Choisissez votre combat</h2><p>Changez de terrain et choisissez qui affronter.</p></div><Swords size={23} /></div>
            <div className="match-modes" role="group" aria-label="Type de combat">
              <button type="button" aria-pressed={mode === 'duel'} onClick={() => setMode('duel')}><strong>Duel</strong><span>Affronter un personnage</span></button>
              <button type="button" aria-pressed={training} onClick={() => setMode('kanojedo')}><strong>Monstres · Kanojedo</strong><span>S’entraîner sur un Poutch</span></button>
              <button type="button" aria-pressed={mode === 'boss'} onClick={() => setMode('boss')}><strong>Boss de donjon</strong><span>Affronter toute la dernière salle</span></button>
              <button type="button" aria-pressed={automatic} onClick={() => setMode('boss-auto')}><strong>Donjon automatique</strong><span>Votre personnage joue avec l’IA</span></button>
            </div>
            {automatic && <section className="auto-dungeon-setup" aria-label="Jeu automatique">
              <label className="field">IA de mon personnage<select aria-label="IA de mon personnage" value={playerBotId} onChange={event => setPlayerBotId(event.target.value)}>
                {allBots.map(entry => <option key={entry.id} value={entry.id}>{entry.name}{entry.custom ? ' (perso)' : ''}</option>)}
              </select></label>
              <p>Votre niveau, vos équipements et vos sorts sont utilisés. L’IA joue contre toute la salle finale, avec placement automatique. Regardez le combat ou consultez directement son résultat.</p>
            </section>}
            {training ? <KanojedoSetup grade={monsterGrade} onGradeChange={setMonsterGrade} />
              : dungeonMode ? <BossSetup bossId={bossId} grade={bossGrade} onBossChange={next => {
                setBossId(next); setBossGrade(defaultMonsterGrade(next));
              }} onGradeChange={setBossGrade} seed={seed} /> : <div className="match-options">
              <section className="setup-map"><h3>Le terrain</h3><MapPicker value={mapId} onChange={setMapId} preview /></section>
              <section className="setup-opponent"><h3>L’adversaire</h3>
                <div className="opponent-preview"><RetroPortrait classId={botClass} side="B" fallback={CLASSES[botClass].emoji} /><div><h2>{CLASSES[botClass].name}</h2><p>Niveau {summaries.B.level}</p><span>{summaries.B.hp} PV · {summaries.B.pa} PA · {summaries.B.pm} PM</span></div></div>
                <label className="field">Classe adverse<select aria-label="Classe adverse" value={botClass} onChange={e => setBotClass(e.target.value)}>{CLASS_IDS.map(classId => <option key={classId} value={classId}>{CLASSES[classId].name}</option>)}</select></label>
                <label className="field">Style de l’adversaire<select aria-label="Bot adverse" value={botId} onChange={e => setBotId(e.target.value)}>{allBots.map(b => <option key={b.id} value={b.id}>{b.name}{b.custom ? ' (perso)' : ''}</option>)}</select></label>
                <p className="opponent-description">{bot?.description}</p>
                <button className="btn edit-opponent" onClick={() => editStuff('B')}><Backpack size={15} /> Modifier son équipement</button>
              </section>
            </div>}
            <details className="match-advanced"><summary>Options avancées</summary><div>
              {!fightingMonster && <AppearanceSelect side="B" value={loadouts.B.profile?.sex === 1 ? 'female' : 'male'} onChange={value => update('B', current => ({ ...current, profile: { ...current.profile, sex: value === 'female' ? 1 : 0 } }))} />}
              <label className="field">Graine du combat<input aria-label="Graine du combat" type="number" value={seed} onChange={e => setSeed(e.target.value)} /></label>
              <p>La même graine permet de rejouer les mêmes tirages aléatoires avec les mêmes actions.</p>
            </div></details>
          </section>
        </div>
      </main>
    </div>
  </div>;
}
