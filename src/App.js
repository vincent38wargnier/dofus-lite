import React from 'react';
import { GameProvider } from './context/GameContext';
import { Game } from './components/Game/Game';

function App() {
  return (
    <GameProvider>
      <div className="min-h-screen bg-gray-50">
        <Game />
      </div>
    </GameProvider>
  );
}

export default App;
