import React from 'react';
import { useGame } from '../../context/GameContext';
import './Header.css';

const Header = () => {
  const { state } = useGame();
  
  return (
    <header className="header">
      <div className="header-content">
        <h1 className="game-title">Dofus Lite</h1>
        <div className="game-status">
          <span className="turn-counter">Turn: {state.turnNumber}</span>
          <span className="current-player">
            {state.currentPlayer ? `Current Player: ${state.currentPlayer.name}` : 'Game not started'}
          </span>
        </div>
      </div>
    </header>
  );
};

export default Header;
