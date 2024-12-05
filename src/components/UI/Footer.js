import React from 'react';
import { useGame } from '../../context/GameContext';
import './Footer.css';

const Footer = () => {
  const { state } = useGame();
  
  return (
    <footer className="footer">
      <div className="footer-content">
        {state.gameStatus === 'active' && (
          <span className="turn-info">
            Turn {state.turnNumber}
          </span>
        )}
        {state.gameStatus === 'ended' && state.winner && (
          <span className="winner-info">
            Winner: {state.winner.name}
          </span>
        )}
      </div>
    </footer>
  );
};

export default Footer;
