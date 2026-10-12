import React, { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, Bot, Castle, Check, Gamepad2, Play, Settings2, Swords, Target, X } from 'lucide-react';
import { defaultMonsterGrade } from '../engine/monsters';
import { isAutomaticTeam } from '../engine/allyTeam';
import BossSetup from './BossSetup';
import DuelComposer from './DuelComposer';
import CombatMapGallery from './CombatMapGallery';
import CombatPreview from './CombatPreview';
import '../styles/combatChoice.css';

const MODES = [
  { id: 'duel', title: 'Duel', description: 'Inventez votre rencontre', Icon: Swords },
  { id: 'boss', title: 'Donjon', description: 'Défiez une salle entière', Icon: Castle },
  { id: 'kanojedo', title: 'Entraînement', description: 'Testez vos combos', Icon: Target },
];
const PANELS = {
  overview: ['Choisir un combat', 'Votre équipe, votre terrain. À vous de jouer.'],
  allies: ['Mon équipe', 'Ajoutez vos compagnons et choisissez qui les contrôle.'],
  opponents: ['Mes adversaires', 'Un profil, un monstre ou tout un groupe : composez votre défi.'],
  dungeons: ['Choisir un donjon', 'Salles de Dofus et créations personnelles, au même endroit.'],
  map: ['Choisir une carte', 'Un décor, ses obstacles et un nouveau terrain de jeu.'],
  settings: ['Réglages du combat', 'Choisissez les IA et les tirages aléatoires.'],
};

export default function CombatChoiceDialog({ playerClass, playerName, botId, allBots,
  profiles, customCharacters, opponents, onOpponentsChange, onSelectOpponent, opponentSaveError, onCreateProfile,
  allies = [], onAlliesChange, onSelectAlly, allySaveError, initialPanel = 'overview', includePlayer = true, setIncludePlayer,
  controller, setController, playerBotId, setPlayerBotId, onAutomaticStart, onResumeAutomatic,
  customDungeons, customDungeonId, setCustomDungeonId, onOpenCreator, onEditEquipment,
  mapId, setMapId, mode, setMode, monsterGrade, setMonsterGrade, bossId, setBossId, bossGrade, setBossGrade,
  seed, setSeed, equipment, canPlay, validation, selectionLabel, error, settingsError, onStart, onClose, embedded = false }) {
  const id = useId();
  const ref = useRef(null);
  const backdropDown = useRef(false);
  const returnPanel = useRef(null);
  const firstPanel = useRef(true);
  const [panel, setPanel] = useState(initialPanel);
  const automatic = isAutomaticTeam(controller, allies, includePlayer);
  const teamCount = allies.length + Number(includePlayer);
  const overview = panel === 'overview';
  const leader = includePlayer ? { kind: 'character', classId: playerClass, name: playerName, loadout: equipment.loadouts.A, controller, botId: playerBotId } : null;
  const customDungeon = customDungeons?.find(entry => entry.id === customDungeonId);
  const changePanel = next => { if (next !== 'overview') returnPanel.current = next; setPanel(next); };
  const closeOrBack = () => overview ? onClose() : changePanel('overview');

  useEffect(() => {
    if (embedded) return;
    const dialog = ref.current;
    const previousFocus = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal ? dialog.showModal() : dialog.setAttribute('open', '');
    return () => {
      if (dialog.open) dialog.close?.();
      document.body.style.overflow = overflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [embedded]);
  useEffect(() => {
    // An inline tab must keep focus on its navigation button when first opened.
    if (firstPanel.current) {
      firstPanel.current = false;
      if (embedded) return;
    }
    const dialog = ref.current;
    dialog.querySelector('.combat-choice-body').scrollTop = 0;
    const trigger = overview && returnPanel.current && dialog.querySelector(`[data-panel-trigger="${returnPanel.current}"]`);
    (trigger || dialog.querySelector(overview ? '.combat-choice-modes [aria-pressed="true"]' : '.combat-choice-back'))?.focus();
  }, [panel, overview, embedded]);

  const automateTeam = () => {
    if (includePlayer) setController('ai');
    onAlliesChange(allies.map(entry => ({ ...entry, controller: 'ai' })));
  };
  const playFirstMember = () => {
    if (includePlayer) setController('player');
    else onAlliesChange(allies.map((entry, index) => index === 0 ? { ...entry, controller: 'player' } : entry));
  };
  const removeLeader = () => setIncludePlayer(false);
  const removeAlly = index => onAlliesChange(allies.filter((_, i) => i !== index));
  const removeOpponent = index => onOpponentsChange(opponents.filter((_, i) => i !== index));
  const editOpponent = index => { onSelectOpponent(index); onClose(); onEditEquipment('B'); };
  const editAlly = index => { onSelectAlly(index); onClose(); onEditEquipment('B'); };
  const openCreator = (kind, entryId) => { onClose(); onOpenCreator(kind, entryId); };
  const launch = () => { if (automatic && onAutomaticStart) onAutomaticStart(); else onStart(); };
  const keepFocus = event => {
    if (event.key !== 'Tab') return;
    const controls = [...ref.current.querySelectorAll('button, input, select, textarea, a[href], [tabindex]')]
      .filter(element => !element.disabled && element.tabIndex >= 0 && element.getClientRects().length > 0);
    const first = controls[0], last = controls[controls.length - 1];
    if (first && ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last))) {
      event.preventDefault(); (event.shiftKey ? last : first).focus();
    }
  };
  const Container = embedded ? 'section' : 'dialog';
  return <Container ref={ref} className={`combat-choice combat-lobby${embedded ? ' combat-inline' : ''}${overview ? '' : ' editing'}`} data-combat-panel={panel} aria-label="Choisir un combat" aria-describedby={`${id}-description`}
    onKeyDown={embedded ? event => {
      if (event.key === 'Escape' && !overview && !event.defaultPrevented) { event.preventDefault(); changePanel('overview'); }
    } : keepFocus}
    onCancel={embedded ? undefined : event => { if (event.target === event.currentTarget) { event.preventDefault(); closeOrBack(); } }}
    onMouseDown={embedded ? undefined : event => { backdropDown.current = event.target === event.currentTarget; }}
    onClick={embedded ? undefined : event => { if (event.target === event.currentTarget && backdropDown.current) onClose(); }}>
    <div className="combat-choice-layout">
      <header className="combat-choice-heading">
        <div className="combat-heading-copy">{!overview && <button type="button" className="combat-choice-back" onClick={() => changePanel('overview')}><ArrowLeft size={16} />Retour au combat</button>}
          <h2>{PANELS[panel][0]}</h2><p id={`${id}-description`}>{PANELS[panel][1]}</p></div>
        {!embedded && <button type="button" className="btn combat-choice-close" aria-label="Fermer le choix du combat" onClick={onClose}><X size={21} /></button>}
      </header>
      <div className="combat-choice-body">
        {overview ? <>
          {onResumeAutomatic && <div className="combat-resume"><span>Votre dernière simulation est disponible.</span>
            <button type="button" className="btn" onClick={() => { onClose(); onResumeAutomatic(); }}><Play size={15} />Reprendre le combat</button></div>}
          <div className="combat-choice-modes" role="group" aria-label="Type de combat">{MODES.map(({ id: key, title, description, Icon }) => <button type="button" key={key} data-mode={key}
            aria-pressed={mode === key} onClick={() => setMode(key)}><span className="combat-mode-icon"><Icon size={24} /></span><span><strong>{title}</strong><small>{description}</small></span><Check className="combat-mode-check" size={17} /></button>)}</div>
          <CombatPreview {...{ mode, leader, allies, opponents, automatic, bossId, bossGrade, setBossGrade, customDungeon, monsterGrade, setMonsterGrade, mapId, seed }}
            onRemoveLeader={removeLeader} onRemoveAlly={removeAlly} onRemoveOpponent={removeOpponent} onOpen={changePanel} />
          {onAutomaticStart && teamCount > 0 && <div className="combat-play-style">
            <div className="combat-control-toggle" role="group" aria-label="Raccourcis de contrôle">
              <button type="button" aria-pressed={(leader || allies[0])?.controller === 'player'} onClick={playFirstMember}><Gamepad2 size={18} />Je joue</button>
              <button type="button" aria-pressed={automatic} onClick={automateTeam}><Bot size={18} />Tout en IA</button>
            </div><p role="status">{automatic ? <><strong>IA contre IA</strong> · Chaque combattant utilise son IA.</>
              : [leader, ...allies].some(entry => entry?.controller === 'ai') ? <><strong>Équipe mixte</strong> · Vous jouez les personnages manuels, chacun à son tour.</>
                : 'Vous jouez chaque membre de votre équipe à son tour.'}</p>
          </div>}
        </> : panel === 'allies' || panel === 'opponents' ? <DuelComposer key={panel} hideTerrain allied={panel === 'allies'} automatic={automatic} leader={panel === 'allies' ? leader : undefined}
          onLeaderControllerChange={setController} onLeaderBotChange={setPlayerBotId} onRemoveLeader={removeLeader}
          {...{ profiles, customCharacters, mapId, allBots, onCreateProfile, botId }} opponents={panel === 'allies' ? allies : opponents}
          onChange={panel === 'allies' ? onAlliesChange : onOpponentsChange} onEditOpponent={panel === 'allies' ? editAlly : editOpponent} />
          : panel === 'map' ? <CombatMapGallery mapId={mapId} onChoose={next => { setMapId(next); changePanel('overview'); }} />
          : panel === 'dungeons' ? <BossSetup compact bossId={bossId} grade={bossGrade} customDungeons={customDungeons} customDungeonId={customDungeonId}
            onCustomChange={setCustomDungeonId} onCreate={onOpenCreator ? () => openCreator('dungeons') : undefined}
            onEdit={onOpenCreator ? entry => openCreator('dungeons', entry.id) : undefined}
            onBossChange={next => { setCustomDungeonId?.(null); setBossId(next); setBossGrade(defaultMonsterGrade(next)); }} onGradeChange={setBossGrade} seed={seed} />
          : <section className="combat-settings" aria-label="Réglages du combat">
            {onAutomaticStart && includePlayer && <label className="field">IA de votre personnage<select aria-label="IA de votre personnage" value={playerBotId} onChange={event => setPlayerBotId(event.target.value)}>
              {allBots.map(entry => <option key={entry.id} value={entry.id}>{entry.name}{entry.custom ? ' (perso)' : ''}</option>)}</select><small>Utilisée quand votre personnage est contrôlé par une IA dans « Mon équipe ».</small></label>}
            <label className="field">Graine du combat<input aria-label="Graine du combat" type="number" value={seed} onChange={event => setSeed(event.target.value)} /><small>La même graine et les mêmes actions reproduisent les mêmes tirages.</small></label>
            <p>Les IA se choisissent individuellement dans « Mon équipe » et « Mes adversaires ».</p>
          </section>}
      </div>
      <footer className="combat-choice-footer">
        {(validation || error) && <p className="loadout-errors" role="alert">{error || validation}</p>}
        {opponentSaveError && <p className="loadout-errors" role="alert">{opponentSaveError}</p>}
        {allySaveError && <p className="loadout-errors" role="alert">{allySaveError}</p>}
        {settingsError && <p className="loadout-errors" role="alert">Impossible de mémoriser ce choix dans ce navigateur.</p>}
        <div className="combat-choice-confirm"><div className="combat-choice-recap"><strong>{teamCount} {teamCount > 1 ? 'alliés' : 'héros'} · {selectionLabel}</strong><small><Check size={13} />Choix mémorisés automatiquement</small></div>
          <div className="combat-choice-actions">{overview ? <><button type="button" className="btn combat-settings-button" data-panel-trigger="settings" onClick={() => changePanel('settings')}><Settings2 size={17} />Réglages</button>
            <button type="button" className="btn primary combat-choice-launch" disabled={!canPlay} onClick={launch}><Swords size={18} />Lancer le combat</button></>
            : <button type="button" className="btn primary combat-choice-done" onClick={() => changePanel('overview')}><Check size={18} />C’est prêt</button>}
          </div>
        </div>
      </footer>
    </div>
  </Container>;
}
