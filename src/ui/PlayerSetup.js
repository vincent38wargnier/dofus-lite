import React, { useEffect, useId, useState } from 'react';
import { ArrowLeft, Backpack, BookOpen, ChartNoAxesColumnIncreasing, Check, ChevronRight, Footprints, Heart, MapPin, Shield, Swords, Zap } from 'lucide-react';
import { CLASSES } from '../engine/classes';
import { CHARACTERISTICS, STAT_LABELS, emptyLoadout, equipSet } from '../engine/equipment';
import { MAPS } from '../engine/maps';
import { KANOJEDO_MAP_ID, POUTCH_ID, DEFAULT_BOSS_ID, defaultMonsterGrade, getMonster } from '../engine/monsters';
import CombatChoiceDialog from './CombatChoiceDialog';
import { useWorlds } from './WorldsContext';
import { dungeonForBoss } from '../engine/dungeons';
import LoadoutPicker from './LoadoutPicker';
import LoadoutLibrary from './LoadoutLibrary';
import { AppearanceSelect } from './RetroAssets';
import CharacterSwitcher from './CharacterSwitcher';
import { CharacterSettingsDialog, NewCharacterDialog } from './CharacterDialog';
import { customDungeonErrors } from '../engine/customDungeons';
import { opponentTeamErrors, opponentSummary } from '../engine/opponentTeam';
import { allyTeamErrors, isAutomaticTeam } from '../engine/allyTeam';
import { encounterCapacity } from '../engine/encounters';

const ROLES = {
  FECA: 'Protection', OSAMODAS: 'Invocations', ENUTROF: 'Entrave', SRAM: 'Pièges',
  XELOR: 'Contrôle des PA', ECAFLIP: 'Coups critiques', ENIRIPSA: 'Soins', IOP: 'Corps à corps',
  CRA: 'À distance', SADIDA: 'Ronces & poupées', SACRIEUR: 'Placement', PANDAWA: 'Placement & soutien',
};
const SECTIONS = [
  { id: 'equipment', label: 'Équipement', Icon: Backpack },
  { id: 'stats', label: 'Caractéristiques', shortLabel: 'Caracs.', Icon: ChartNoAxesColumnIncreasing },
  { id: 'spells', label: 'Sorts', Icon: BookOpen },
  { id: 'match', label: 'Combat', Icon: Swords },
];

export default function PlayerSetup({ playerClass, setPlayerClass, botClass, botId, allBots,
  active = true, controller = 'player', setController, playerBotId, setPlayerBotId, onAutomaticStart, onResumeAutomatic,
  opponents = [], onOpponentsChange, onSelectOpponent, opponentSaveError, editingOpponentIndex,
  allies = [], onAlliesChange, onSelectAlly, allySaveError, editingTeam = 'opponents', includePlayer = true, setIncludePlayer,
  customCharacters = [], customCharacter, selectCustomCharacter,
  profiles, onOpenCreator, onCreateTeamProfile, onSaveTeamCharacter, selectionRequest, customDungeons = [], customDungeonId, setCustomDungeonId,
  mapId, setMapId, battlefield, encounter, onCustomizeEncounter, mode = 'duel', setMode, monsterGrade = 5, setMonsterGrade,
  bossId = DEFAULT_BOSS_ID, setBossId, bossGrade = defaultMonsterGrade(bossId), setBossGrade,
  seed, setSeed, equipment, onStart, onFriends, error, settingsError }) {
  const id = useId();
  const worlds = useWorlds();
  const mapName = mapId => (worlds?.maps.find(map => map.id === mapId) || MAPS[mapId])?.name.replace(/^🗺\s*/, '') || 'Salle indisponible';
  const [section, setSection] = useState('equipment');
  const [view, setView] = useState('equipment');
  const [editingSide, setEditingSide] = useState('A');
  const [choosingClass, setChoosingClass] = useState(false);
  const [newCharacterTarget, setNewCharacterTarget] = useState('main');
  const [matchOpen, setMatchOpen] = useState(false);
  const [combatPanel, setCombatPanel] = useState('overview');
  const [editingIdentity, setEditingIdentity] = useState(false);
  useEffect(() => { if (!active) { setMatchOpen(false); setChoosingClass(false); setEditingIdentity(false); } }, [active]);
  useEffect(() => {
    if (!selectionRequest) return;
    setSection(['dungeons', 'combat'].includes(selectionRequest.tab) ? 'match' : 'equipment');
    setMatchOpen(!!selectionRequest.openDialog);
    setCombatPanel(selectionRequest.initialPanel || 'overview');
    setChoosingClass(false); setEditingSide('A'); setView('equipment');
    if (selectionRequest.newCharacter) setChoosingClass(true);
  }, [selectionRequest]);
  const { loadouts, update, summaries, saveError } = equipment;
  const player = CLASSES[playerClass];
  const playerName = profiles?.active.name || customCharacter?.name || player.name;
  const playerKey = profiles?.activeId || (customCharacter ? `custom:${customCharacter.id}` : playerClass);
  const summary = summaries.A;
  const loadout = loadouts.A;
  const bot = allBots.find(b => b.id === botId);
  const training = mode === 'kanojedo';
  const dungeonMode = mode === 'boss';
  const fightingMonster = mode !== 'duel';
  const monster = getMonster(training ? POUTCH_ID : bossId, training ? monsterGrade : bossGrade);
  const customDungeon = customDungeons.find(entry => entry.id === customDungeonId);
  const dungeon = customDungeon || dungeonForBoss(bossId);
  const monsterCount = dungeon?.members.reduce((sum, member) => sum + member.count, 0);
  const missingGroup = dungeonMode && (!dungeon || (customDungeon && customDungeonErrors(customDungeon).length > 0));
  const missingName = includePlayer && customCharacter && !customCharacter.name.trim();
  const opponentErrors = fightingMonster ? [] : opponentTeamErrors(opponents, encounter);
  const allyErrors = allyTeamErrors(allies, includePlayer);
  const opponentLabel = opponents.length === 1 ? opponentSummary(opponents[0]).name : `${opponents.length} adversaires`;
  const canPlay = (!includePlayer || summary.valid) && !missingName && !missingGroup && !opponentErrors.length && !allyErrors.length;
  const validation = missingName ? 'Donnez un nom à votre classe dans l’Atelier.'
    : includePlayer && !summary.valid ? 'Vérifiez l’équipement, les caractéristiques et les sorts de votre personnage.'
    : missingGroup ? 'Choisissez une salle disponible ou terminez votre donjon dans l’Atelier.'
    : [...allyErrors, ...opponentErrors].join(' ');
  const selectionLabel = `${isAutomaticTeam(controller, allies, includePlayer) ? 'IA contre IA · ' : ''}${training ? `Kanojedo · niveau ${monster.level}`
    : dungeonMode ? customDungeon?.name || dungeon?.name || 'Choisissez un donjon' : `Contre ${opponentLabel}`}`;
  const classes = { A: playerClass, B: botClass };
  const navigate = next => {
    setSection(next); setMatchOpen(false);
    if (next === 'match') setEditingSide('A');
    if (['equipment', 'stats', 'spells'].includes(next)) setView(next);
  };
  const editStuff = (side = 'A', nextView = 'equipment') => {
    setMatchOpen(false); setCombatPanel('overview');
    setEditingSide(side); setView(nextView); setSection(nextView === 'forge' ? 'equipment' : nextView);
  };
  const newCharacter = target => { setNewCharacterTarget(['allies', 'opponents'].includes(target) ? target : 'main'); setMatchOpen(false); setChoosingClass(true); };
  const browseCharacters = onOpenCreator ? () => { setMatchOpen(false); onOpenCreator('profiles'); } : undefined;
  const returnToCombat = () => { setEditingSide('A'); setSection('match'); setCombatPanel('overview'); setMatchOpen(true); };
  const switchCharacter = () => setEditingSide('A');
  const chooseCharacter = (classId, template, name) => {
    setChoosingClass(false); setCombatPanel('overview');
    if (newCharacterTarget !== 'main' && onCreateTeamProfile) {
      const isAlly = newCharacterTarget === 'allies', team = isAlly ? allies : opponents;
      if (team.length >= (isAlly ? (includePlayer ? 7 : 8) : encounterCapacity(encounter))) { returnToCombat(); return; }
      const entry = onCreateTeamProfile({ kind: 'character', classId, name: name || template?.name || CLASSES[classId].name,
        className: template?.className || template?.name || CLASSES[classId].name, sourceId: template?.id,
        loadout: template?.loadout || equipSet(emptyLoadout(classId), 1), controller: isAlly ? 'player' : 'ai', botId: 'maison' });
      (isAlly ? onAlliesChange : onOpponentsChange)([...team, entry]);
      (isAlly ? onSelectAlly : onSelectOpponent)(team.length); editStuff('B');
    } else {
      if (template) selectCustomCharacter(template); else setPlayerClass(classId, name);
      switchCharacter(); navigate('equipment');
    }
  };
  const editedMember = (editingTeam === 'allies' ? allies : opponents)[editingOpponentIndex];
  const savedTeamCharacter = profiles?.profiles.find(entry => entry.id === editedMember?.editableProfileId);
  const preparationSection = ['equipment', 'stats', 'spells'].includes(section) ? section : 'equipment';
  const combatProps = { playerClass, playerName, botId, allBots, initialPanel: combatPanel,
    controller, setController, playerBotId, setPlayerBotId, customDungeons, customDungeonId, setCustomDungeonId,
    onOpenCreator, mapId, setMapId, battlefield, encounter, onCustomizeEncounter, mode, setMode, monsterGrade, setMonsterGrade, bossId, setBossId, bossGrade, setBossGrade,
    seed, setSeed, equipment, canPlay, validation, selectionLabel, error, settingsError, onStart,
    opponents, onOpponentsChange, onSelectOpponent, opponentSaveError, customCharacters,
    allies, onAlliesChange, onSelectAlly, allySaveError, includePlayer, setIncludePlayer, profiles: profiles?.profiles,
    onCreateProfile: newCharacter,
    onCreateTeamProfile, onBrowseCharacters: browseCharacters,
    onFriends: onFriends ? () => { setMatchOpen(false); setSection('match'); onFriends(); } : undefined,
    onAutomaticStart: onAutomaticStart ? () => { if (onAutomaticStart()) setMatchOpen(false); } : undefined,
    onEditEquipment: editStuff, onClose: () => setMatchOpen(false), onResumeAutomatic };

  return <div className="player-setup" data-setup-section={section}>
    <div className="setup-heading"><div><p className="eyebrow">PRÉPARATION DU COMBAT</p><h1>À vous de jouer.</h1><p>Préparez votre personnage, composez vos équipes et jouez.</p></div>
      <span className="local-badge"><span /> Solo ou avec des amis</span></div>
    <div className="setup-layout">
      <aside className="player-summary" aria-label="Résumé du personnage">
        <CharacterSwitcher profiles={profiles} playerClass={playerClass} name={playerName} loadout={loadout} level={summary.level}
          role={customCharacter ? 'Classe personnalisée' : ROLES[playerClass]} onNew={newCharacter} onSwitch={switchCharacter}
          onBrowse={browseCharacters} onUpdate={change => update('A', change)} />
        <div className="summary-vitals">
          <span><Heart size={15} /><strong>{summary.hp}</strong><small>PV</small></span>
          <span><Zap size={15} /><strong>{summary.pa}</strong><small>PA</small></span>
          <span><Footprints size={15} /><strong>{summary.pm}</strong><small>PM</small></span>
        </div>
        <div className="setup-launch">
          {canPlay ? <p className="ready-status"><Check size={13} /> Prêt pour le combat</p> : <button className="setup-validation" onClick={() => missingName ? onOpenCreator?.('characters', customCharacter?.customCharacterId || customCharacter?.id) : missingGroup || opponentErrors.length || allyErrors.length ? navigate('match') : editStuff('A')}>
            {missingName ? 'Nommez votre classe dans l’Atelier' : missingGroup ? 'Choisissez une salle disponible' : allyErrors.length ? 'Votre équipe est à corriger' : summary.valid ? 'Choisissez vos adversaires' : 'Votre préparation est à corriger'} <ChevronRight size={13} /></button>}
          <button type="button" className="btn primary setup-play" aria-haspopup="dialog" onClick={() => setMatchOpen(true)}><Swords size={19} />Jouer<ChevronRight size={17} /></button>
          <span>Choisir un combat · dernier choix mémorisé</span>
        </div>
        <dl className="summary-stats">{CHARACTERISTICS.map(stat => <React.Fragment key={stat}>
          <dt><i className={`stat-dot ${stat}`} />{STAT_LABELS[stat]}</dt><dd data-summary-stat={stat}>{summary.stats[stat]}</dd>
        </React.Fragment>)}</dl>
        <button className="summary-link" onClick={() => editStuff('A', 'stats')}>Toutes les caractéristiques <ChevronRight size={14} /></button>
        <div className="summary-match">
          <button onClick={() => navigate('match')}><MapPin size={15} /><span>{(dungeonMode && customDungeon?.battlefield?.name) || mapName(training ? KANOJEDO_MAP_ID : dungeonMode ? customDungeon?.mapId || dungeon?.combatMapId : mapId)}</span><ChevronRight size={14} /></button>
          <button onClick={() => navigate('match')}><Swords size={15} /><span>Contre {dungeonMode && customDungeon ? customDungeon.name : fightingMonster ? monster.name : opponentLabel}{fightingMonster ? ` · ${dungeonMode && monsterCount ? `${monsterCount} ${customDungeon ? 'combattants' : 'monstres'}` : `niv. ${monster.level}`}` : ''}</span><ChevronRight size={14} /></button>
        </div>

      </aside>

      <main className="setup-main">
        {section !== 'match' && <header className="setup-editor-heading">
          <div><span className="eyebrow">PERSONNALISER MON PERSONNAGE</span><h2>{editingSide === 'A' ? playerName : editedMember?.name || CLASSES[botClass].name}</h2>
            <p role="status">{saveError || profiles?.error ? 'Modifications non sauvegardées : vérifiez le stockage du navigateur.' : editingSide === 'A' || savedTeamCharacter
              ? <><Check size={14} />Enregistré dans Mes personnages · sauvegarde automatique</> : 'Copie pour ce combat. Le personnage d’origine est conservé.'}</p></div>
          <div className="setup-editor-actions">
            {editingSide === 'A' ? <button type="button" className="btn" onClick={() => setEditingIdentity(true)}>Nom, niveau et apparence</button>
              : !savedTeamCharacter && onSaveTeamCharacter && <button type="button" className="btn" onClick={onSaveTeamCharacter}>Garder dans Mes personnages</button>}
            <button type="button" className="btn primary" onClick={returnToCombat}><ArrowLeft size={16} />Retour au combat</button>
          </div>
        </header>}
        <nav className="setup-navigation" role="tablist" aria-label="Préparer mon personnage">
          {SECTIONS.map(({ id: sectionId, label, shortLabel, Icon }, index) => <button key={sectionId} type="button" role="tab" aria-label={label}
            id={`${id}-${sectionId}-tab`} aria-controls={`${id}-${sectionId}`} aria-selected={section === sectionId}
            tabIndex={section === sectionId ? 0 : -1} className={section === sectionId ? 'selected' : ''}
            onClick={() => navigate(sectionId)} onKeyDown={event => {
              const direction = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
              if (direction || ['Home', 'End'].includes(event.key)) {
                event.preventDefault();
                const next = SECTIONS[event.key === 'Home' ? 0 : event.key === 'End' ? SECTIONS.length - 1 : (index + direction + SECTIONS.length) % SECTIONS.length].id;
                navigate(next); document.getElementById(`${id}-${next}-tab`)?.focus();
              }
            }}><Icon size={18} /><span className={shortLabel ? 'setup-tab-long' : undefined}>{label}</span>{shortLabel && <span className="setup-tab-short" aria-hidden="true">{shortLabel}</span>}</button>)}
        </nav>
        <div className={`setup-content${section === 'match' ? ' setup-combat-content' : ''}`}>
          {error && section !== 'match' ? <p className="loadout-errors" role="alert">{error}</p> : null}
          {missingName && section !== 'match' ? <p className="loadout-errors" role="alert">Donnez un nom à cette classe dans l’Atelier avant de jouer.</p> : null}
          {(settingsError && section !== 'match') || saveError ? <p className="loadout-errors" role="alert">La préparation ne peut pas être conservée dans ce navigateur. Vérifiez l’espace de stockage disponible.</p> : null}
          {editingSide === 'B' ? <div className="opponent-edit-banner"><Shield size={18} /><span>Vous équipez {editingTeam === 'allies' ? 'l’allié' : 'l’adversaire'} : <strong>{(editingTeam === 'allies' ? allies : opponents)[editingOpponentIndex]?.name || CLASSES[botClass].name}</strong></span>
            <AppearanceSelect side="B" value={loadouts.B.profile?.sex === 1 ? 'female' : 'male'} onChange={value => update('B', current => ({ ...current, profile: { ...current.profile, sex: value === 'female' ? 1 : 0 } }))} />
            <button className="btn" onClick={() => editStuff('A')}>Mon personnage principal</button></div> : null}

          <section id={`${id}-${preparationSection}`} role="tabpanel" aria-labelledby={`${id}-${preparationSection}-tab`} hidden={!['equipment', 'stats', 'spells'].includes(section)}>
            <LoadoutPicker key={editingSide === 'A' ? playerKey : `${editingTeam}:${editingOpponentIndex}:${botClass}`} embedded hideNavigation fixedSide={editingSide} activeView={view}
              inventoryKey={editingSide === 'A' ? playerKey : `${editingTeam}:${editingOpponentIndex}:${botClass}`}
              onViewChange={next => { setView(next); setSection(next === 'forge' ? 'equipment' : next); }} classes={classes}
              names={{ A: playerName, B: (editingTeam === 'allies' ? allies : opponents)[editingOpponentIndex]?.name || bot?.name || 'Adversaire' }} {...equipment}
              equipmentLibrary={<LoadoutLibrary key={editingSide === 'A' ? playerKey : botClass} compact side={editingSide} classId={classes[editingSide]}
                draftKey={editingSide === 'A' ? `A:${playerKey}` : undefined} loadout={loadouts[editingSide]} update={update} saveError={saveError} />} />
          </section>

          <section id={`${id}-match`} role="tabpanel" aria-labelledby={`${id}-match-tab`} hidden={section !== 'match' || matchOpen}>
            {section === 'match' && !matchOpen && <CombatChoiceDialog {...combatProps} embedded />}
          </section>
        </div>
      </main>
    </div>
    {choosingClass && <NewCharacterDialog customCharacters={customCharacters} roles={ROLES} onClose={() => setChoosingClass(false)}
      onChooseClass={(classId, name) => chooseCharacter(classId, null, name)}
      onChooseCustom={character => chooseCharacter(character.classId, character)}
      onCreateClass={onOpenCreator ? () => { setChoosingClass(false); onOpenCreator('characters'); } : undefined} />}
    {editingIdentity && <CharacterSettingsDialog {...{ profiles, playerClass, loadout }} name={playerName} onUpdate={change => update('A', change)} onClose={() => setEditingIdentity(false)} />}
    {matchOpen && <CombatChoiceDialog {...combatProps} />}
  </div>;
}
