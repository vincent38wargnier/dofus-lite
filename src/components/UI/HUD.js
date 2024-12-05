import React from 'react';
import { useGame } from '../../context/GameContext';
import PlayerState from '../Player/PlayerState';
import SortList from '../Sorts/SortList';
import './HUD.css';

const HUD = () => {
  const { state, actions } = useGame();
  const { currentPlayer } = state;

  const handleSortSelect = (sort) => {
    // This will be implemented later with the action system
    console.log('Sort selected:', sort);
  };

  return (
    <div className="hud">
      <div className="hud-section">
        <PlayerState player={currentPlayer} />
      </div>
      
      {currentPlayer && (
        <div className="hud-section">
          <SortList 
            player={currentPlayer}
            onSortSelect={handleSortSelect}
          />
        </div>
      )}
      
      <div className="hud-section">
        <button 
          className="end-turn-button"
          onClick={() => actions.endTurn()}
          disabled={!currentPlayer}
        >
          End Turn
        </button>
      </div>
    </div>
  );
};

export default HUD;
