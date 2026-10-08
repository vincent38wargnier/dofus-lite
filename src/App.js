import React, { useState } from 'react';
import ArenaScreen from './ui/ArenaScreen';
import PlayScreen from './ui/PlayScreen';
import EditorScreen from './ui/EditorScreen';
import TournamentScreen from './ui/TournamentScreen';
import DocsScreen from './ui/DocsScreen';
import { useCustomBots, listAllBots } from './ui/botsStore';

const TABS = [
  { id: 'arena', label: '⚔️ Arène' },
  { id: 'play', label: '🎮 Jouer' },
  { id: 'editor', label: '🤖 Éditeur de bot' },
  { id: 'tournament', label: '🏆 Tournoi' },
  { id: 'docs', label: '📜 Règles & API' },
];

export default function App() {
  const [tab, setTab] = useState('arena');
  const { customBots, addBot, updateBot, deleteBot } = useCustomBots();
  const [replay, setReplay] = useState(null);
  const allBots = listAllBots(customBots);

  const requestReplay = (cfg) => {
    setReplay(cfg);
    setTab('arena');
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">
          Dofus Koliséum
          <span className="sub">l'arène des bots — que le meilleur code gagne</span>
        </h1>
        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`tab${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {/* Tous les écrans restent montés pour conserver replays et brouillons. */}
      <div style={{ display: tab === 'arena' ? 'block' : 'none' }}>
        <ArenaScreen
          allBots={allBots}
          replay={replay}
          onReplayConsumed={() => setReplay(null)}
        />
      </div>
      <div style={{ display: tab === 'play' ? 'block' : 'none' }}>
        <PlayScreen allBots={allBots} />
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
    </div>
  );
}
