import React from 'react';
import GameContext from './context/GameContext';
import Board from './components/Board/BoardRenderer';
import Header from './components/UI/Header';
import Footer from './components/UI/Footer';
import HUD from './components/UI/HUD';

function App() {
  return (
    <GameContext>
      <div className="app">
        <Header />
        <div className="game-container">
          <Board />
          <HUD />
        </div>
        <Footer />
      </div>
    </GameContext>
  );
}

export default App;
