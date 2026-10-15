import React, { useRef, useState } from 'react';
import { BookOpen, BrainCircuit, ChevronDown, Hammer, SlidersHorizontal, Swords, UserRound } from 'lucide-react';
import ArenaScreen from './ui/ArenaScreen';
import PlayScreen from './ui/PlayScreen';
import EditorScreen from './ui/EditorScreen';
import TournamentScreen from './ui/TournamentScreen';
import DocsScreen from './ui/DocsScreen';
import { useCustomBots, listAllBots } from './ui/botsStore';
import { RetroStatus, useSoundScene } from './ui/RetroAssets';
import RetroLibraryScreen from './ui/RetroLibraryScreen';
import SpellbookScreen from './ui/SpellbookScreen';
import { LoadoutsProvider } from './ui/LoadoutPicker';
import { CreationsProvider } from './ui/CreationsContext';
import WorkshopScreen from './ui/WorkshopScreen';
import { CustomEquipmentProvider } from './ui/CustomEquipmentContext';
import { ProfilesProvider } from './ui/ProfilesContext';
import { newCreationId } from './ui/creationsStore';
import './styles/playerSetup.css';
import './styles/combatLayout.css';
import './styles/profiles.css';

const TABS = [
  { id: 'characters', label: 'Personnages' },
  { id: 'tournament', label: 'Tournoi' },
  { id: 'docs', label: 'Règles & API' },
];

export default function App() {
  const [tab, setTab] = useState('play');
  const [fighting, setFighting] = useState(false);
  const [arenaFighting, setArenaFighting] = useState(false);
  const [automaticSession, setAutomaticSession] = useState(false);
  const [automaticReturn, setAutomaticReturn] = useState('play');
  const toolsMenu = useRef(null);
  useSoundScene(tab);
  const { customBots, addBot, updateBot, deleteBot } = useCustomBots();
  const [replay, setReplay] = useState(null);
  const [customLaunch, setCustomLaunch] = useState(null);
  const [arenaLaunch, setArenaLaunch] = useState(null);
  const [matchLaunch, setMatchLaunch] = useState(null);
  const [editorRequest, setEditorRequest] = useState(null);
  const [selectionRequest, setSelectionRequest] = useState(null);
  const [workshopError, setWorkshopError] = useState('');
  const allBots = listAllBots(customBots);

  const requestReplay = (cfg) => {
    setReplay(cfg);
    setAutomaticReturn('tournament');
    setTab('arena');
  };
  const openCombat = () => {
    setSelectionRequest({ id: newCreationId(), tab: 'combat', returnTo: 'play' });
    setTab('play'); window.scrollTo(0, 0);
  };
  const openPlay = () => tab === 'arena' ? openCombat() : setTab('play');
  const leaveAutomatic = () => {
    if (automaticReturn === 'play') openCombat();
    else { setTab(automaticReturn); window.scrollTo(0, 0); }
  };
  const playActive = tab === 'play' || tab === 'arena';
  const openCreator = (returnTo, kind, entryId) => {
    setWorkshopError('');
    setEditorRequest({ id: newCreationId(), tab: kind, entryId, returnTo });
    setTab('workshop'); window.scrollTo(0, 0);
  };
  const leaveCreator = (kind, entry) => {
    const returnTo = editorRequest?.returnTo || 'play';
    setSelectionRequest({ id: newCreationId(), tab: kind, entry, returnTo });
    setEditorRequest(null); setTab(returnTo); window.scrollTo(0, 0);
  };

  return (
    <CustomEquipmentProvider><LoadoutsProvider><CreationsProvider><ProfilesProvider><div className={`app${(tab === 'play' && fighting) || (tab === 'arena' && arenaFighting) ? ' in-combat' : ''}`}>
      <header className="app-header">
        <button className="app-brand" onClick={openPlay} aria-label="Dofus Koliséum — Jouer"><span className="brand-mark"><Swords size={23} /></span><span className="app-title">Dofus <strong>Koliséum</strong><span className="sub">VOTRE ARÈNE, VOS RÈGLES</span></span></button>
        <nav className="tabs" aria-label="Navigation principale">
          <button className={`tab${playActive ? ' active' : ''}`} aria-current={playActive ? 'page' : undefined} onClick={openPlay}><UserRound size={17} /> Jouer</button>
          <button className={`tab${tab === 'workshop' ? ' active' : ''}`} aria-current={tab === 'workshop' ? 'page' : undefined} onClick={() => setTab('workshop')}><Hammer size={17} /> Atelier</button>
          <button className={`tab${tab === 'editor' ? ' active' : ''}`} aria-current={tab === 'editor' ? 'page' : undefined} onClick={() => setTab('editor')}><BrainCircuit size={17} /> Studio IA</button>
          <button className={`tab${tab === 'spells' ? ' active' : ''}`} aria-current={tab === 'spells' ? 'page' : undefined} onClick={() => setTab('spells')}><BookOpen size={17} /> Grimoire</button>
          <details className="tools-menu" ref={toolsMenu} onKeyDown={e => { if (e.key === 'Escape') { toolsMenu.current.open = false; toolsMenu.current.querySelector('summary').focus(); } }}>
            <summary className={`tab${TABS.some(t => t.id === tab) ? ' active' : ''}`}><SlidersHorizontal size={16} />{TABS.find(t => t.id === tab)?.label || 'Outils'}<ChevronDown size={14} /></summary>
            <div className="tools-dropdown">{TABS.map((t) => (
            <button
              key={t.id}
              className={`tab${tab === t.id ? ' active' : ''}`}
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => { setTab(t.id); toolsMenu.current.open = false; toolsMenu.current.querySelector('summary').focus(); }}
            >
              {t.label}
            </button>
          ))}</div></details>
        </nav>
        <RetroStatus compact />
      </header>
      {tab === 'characters' ? <RetroLibraryScreen /> : null}
      {tab === 'spells' ? <SpellbookScreen /> : null}
      <WorkshopScreen active={tab === 'workshop'} allBots={allBots} error={workshopError}
        editorRequest={editorRequest} onDone={leaveCreator}
        onTestDungeon={dungeon => {
          setWorkshopError(''); setEditorRequest(null);
          setSelectionRequest({ id: newCreationId(), tab: 'dungeons', entry: dungeon, returnTo: 'play', openDialog: true });
          setTab('play'); window.scrollTo(0, 0);
        }}
        onLaunch={request => { setWorkshopError('');
          if (request.automatic) { setAutomaticReturn('workshop'); setArenaLaunch(request); setTab('arena'); }
          else { setCustomLaunch(request); setTab('play'); }
        }} />

      {/* Tous les écrans restent montés pour conserver replays et brouillons. */}
      <div className="arena-route" style={{ display: tab === 'arena' ? 'block' : 'none' }}>
        <ArenaScreen
          active={tab === 'arena'}
          onFightChange={setArenaFighting}
          onSessionChange={setAutomaticSession}
          onExit={leaveAutomatic}
          exitLabel={automaticReturn === 'editor' ? 'Retour au Studio IA' : automaticReturn === 'tournament' ? 'Retour au tournoi' : automaticReturn === 'workshop' ? 'Retour à l’Atelier' : 'Retour à Combat'}
          allBots={allBots}
          replay={replay}
          onReplayConsumed={() => setReplay(null)}
          customLaunch={arenaLaunch} onCustomConsumed={() => setArenaLaunch(null)}
          matchLaunch={matchLaunch} onMatchConsumed={() => setMatchLaunch(null)}
          selectionRequest={selectionRequest?.returnTo === 'arena' ? selectionRequest : null}
          onOpenCreator={(kind, entryId) => openCreator('arena', kind, entryId)}
        />
      </div>
      <div className="play-route" style={{ display: tab === 'play' ? 'block' : 'none' }}>
        <PlayScreen allBots={allBots} active={tab === 'play'} onFightChange={setFighting}
          onOpenPeer={() => setTab('play')}
          onAutomaticLaunch={request => { setAutomaticReturn('play'); setMatchLaunch(request); setTab('arena'); window.scrollTo(0, 0); }}
          onResumeAutomatic={automaticSession ? () => { setTab('arena'); window.scrollTo(0, 0); } : undefined}
          selectionRequest={selectionRequest?.returnTo === 'play' ? selectionRequest : null}
          onOpenCreator={(kind, entryId) => openCreator('play', kind, entryId)}
          customLaunch={customLaunch} onCustomConsumed={() => setCustomLaunch(null)}
          onCustomExit={error => { setWorkshopError(typeof error === 'string' ? error : ''); setTab('workshop'); }} />
      </div>
      <div style={{ display: tab === 'editor' ? 'block' : 'none' }}>
        <EditorScreen
          allBots={allBots}
          customBots={customBots}
          addBot={addBot}
          updateBot={updateBot}
          deleteBot={deleteBot}
          onWatch={config => { setReplay(config); setAutomaticReturn('editor'); setTab('arena'); window.scrollTo(0, 0); }}
          onTournament={() => { setTab('tournament'); window.scrollTo(0, 0); }}
        />
      </div>
      <div style={{ display: tab === 'tournament' ? 'block' : 'none' }}>
        <TournamentScreen allBots={allBots} onReplay={requestReplay} />
      </div>
      <div style={{ display: tab === 'docs' ? 'block' : 'none' }}>
        <DocsScreen />
      </div>
    </div></ProfilesProvider></CreationsProvider></LoadoutsProvider></CustomEquipmentProvider>
  );
}
