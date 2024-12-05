import React from 'react';
import { useGame } from './context/GameContext';
import GameSetup from './components/GameSetup/GameSetup';
import BoardRenderer from './components/Board/BoardRenderer';
import GameStatus from './components/GameStatus/GameStatus';
import ActionBar from './components/ActionBar/ActionBar';
import Header from './components/UI/Header';
import Footer from './components/UI/Footer';
import './styles/global.css';

function App() {
  const { state } = useGame();
  const { status } = state;

  const renderGame = () => (
    <>
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
    </>
  );

  return (
    <div className="app">
      {status === 'WAITING' ? <GameSetup /> : renderGame()}
    </div>
  );
}

export default App;
