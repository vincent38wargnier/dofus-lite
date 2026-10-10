import React, { useRef, useState } from 'react';
import { BookOpen, Bot, ChevronDown, Hammer, SlidersHorizontal, Swords, UserRound } from 'lucide-react';
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
import './styles/playerSetup.css';
import './styles/combatLayout.css';

const TABS = [
  { id: 'characters', label: 'Personnages' },
  { id: 'editor', label: 'Éditeur de bot' },
  { id: 'tournament', label: 'Tournoi' },
  { id: 'docs', label: 'Règles & API' },
];

export default function App() {
  const [tab, setTab] = useState('play');
  const [fighting, setFighting] = useState(false);
  const toolsMenu = useRef(null);
  useSoundScene(tab);
  const { customBots, addBot, updateBot, deleteBot } = useCustomBots();
  const [replay, setReplay] = useState(null);
  const [customLaunch, setCustomLaunch] = useState(null);
  const [workshopError, setWorkshopError] = useState('');
  const allBots = listAllBots(customBots);

  const requestReplay = (cfg) => {
    setReplay(cfg);
    setTab('arena');
  };

  return (
    <LoadoutsProvider><CreationsProvider><div className={`app${tab === 'play' && fighting ? ' in-combat' : ''}`}>
      <header className="app-header">
        <button className="app-brand" onClick={() => setTab('play')} aria-label="Dofus Koliséum — Jouer"><span className="brand-mark"><Swords size={23} /></span><span className="app-title">Dofus <strong>Koliséum</strong><span className="sub">VOTRE ARÈNE, VOS RÈGLES</span></span></button>
        <nav className="tabs" aria-label="Navigation principale">
          <button className={`tab${tab === 'play' ? ' active' : ''}`} aria-current={tab === 'play' ? 'page' : undefined} onClick={() => setTab('play')}><UserRound size={17} /> Jouer</button>
          <button className={`tab${tab === 'arena' ? ' active' : ''}`} aria-current={tab === 'arena' ? 'page' : undefined} onClick={() => setTab('arena')}><Bot size={17} /> IA contre IA</button>
          <button className={`tab${tab === 'workshop' ? ' active' : ''}`} aria-current={tab === 'workshop' ? 'page' : undefined} onClick={() => setTab('workshop')}><Hammer size={17} /> Atelier</button>
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
        onLaunch={request => { setWorkshopError(''); setCustomLaunch(request); setTab('play'); }} />

      {/* Tous les écrans restent montés pour conserver replays et brouillons. */}
      <div style={{ display: tab === 'arena' ? 'block' : 'none' }}>
        <ArenaScreen
          active={tab === 'arena'}
          allBots={allBots}
          replay={replay}
          onReplayConsumed={() => setReplay(null)}
        />
      </div>
      <div className="play-route" style={{ display: tab === 'play' ? 'block' : 'none' }}>
        <PlayScreen allBots={allBots} active={tab === 'play'} onFightChange={setFighting}
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
        />
      </div>
      <div style={{ display: tab === 'tournament' ? 'block' : 'none' }}>
        <TournamentScreen allBots={allBots} onReplay={requestReplay} />
      </div>
      <div style={{ display: tab === 'docs' ? 'block' : 'none' }}>
        <DocsScreen />
      </div>
    </div></CreationsProvider></LoadoutsProvider>
  );
}
