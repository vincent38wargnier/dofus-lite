import React from 'react';
import { useGame } from '../../context/GameContext';
import Badge from '../Common/Badge';
import './GameStatus.css';

const GameStatus = () => {
  const { state } = useGame();
  const { currentPlayer, turnNumber, status } = state;

  const getStatusColor = () => {
    switch (status) {
      case 'ACTIVE':
        return 'success';
      case 'WAITING':
        return 'warning';
      case 'PAUSED':
        return 'info';
      case 'ENDED':
        return 'danger';
      default:
        return 'default';
    }
  };

  if (!currentPlayer) return null;

  return (
    <div className="game-status">
      <div className="status-header">
        <Badge variant={getStatusColor()}>
          {status}
        </Badge>
        <span className="turn-counter">Turn {turnNumber}</span>
      </div>
      
      <div className="current-player">
        <h3>Current Player</h3>
        <div className="player-info">
          <div className={`player-avatar ${currentPlayer.class.toLowerCase()}`} />
          <div className="player-details">
            <span className="player-name">{currentPlayer.name}</span>
            <span className="player-class">{currentPlayer.class}</span>
          </div>
        </div>
      </div>

      <div className="player-stats">
        <div className="stat">
          <span className="stat-label">HP</span>
          <div className="stat-bar">
            <div 
              className="stat-fill health"
              style={{ width: `${(currentPlayer.getHP() / currentPlayer.maxHp) * 100}%` }}
            />
            <span className="stat-value">
              {currentPlayer.getHP()}/{currentPlayer.maxHp}
            </span>
          </div>
        </div>

        <div className="stat">
          <span className="stat-label">PA</span>
          <div className="stat-bar">
            <div 
              className="stat-fill action"
              style={{ width: `${(currentPlayer.getPA() / currentPlayer.maxPa) * 100}%` }}
            />
            <span className="stat-value">
              {currentPlayer.getPA()}/{currentPlayer.maxPa}
            </span>
          </div>
        </div>

        <div className="stat">
          <span className="stat-label">PM</span>
          <div className="stat-bar">
            <div 
              className="stat-fill movement"
              style={{ width: `${(currentPlayer.getPM() / currentPlayer.maxPm) * 100}%` }}
            />
            <span className="stat-value">
              {currentPlayer.getPM()}/{currentPlayer.maxPm}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GameStatus;
