import React from 'react';
import { useGame } from './context/GameContext';
import BoardRenderer from './components/Board/BoardRenderer';
import GameStatus from './components/GameStatus/GameStatus';
import ActionBar from './components/ActionBar/ActionBar';
import Header from './components/UI/Header';
import Footer from './components/UI/Footer';
import './styles/global.css';

function App() {
  const { state } = useGame();

  return (
    <div className="app">
      <Header />
      <div className="game-container">
        <div className="game-sidebar">
          <GameStatus />
          <ActionBar />
        </div>
        <div className="game-board">
          <BoardRenderer />
        </div>
      </div>
      <Footer />
    </div>
  );
}

export default App;
