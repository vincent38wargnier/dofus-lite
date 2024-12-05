import React from 'react';
import { useGame } from '../../context/GameContext';
import { CLASSES } from '../../utils/constants';

const PlayerState = ({ player }) => {
  if (!player) return null;

  const renderHealthBar = () => {
    const percentage = (player.getHP() / player.maxHp) * 100;
    return (
      <div className="health-bar-container">
        <div 
          className="health-bar" 
          style={{ width: `${percentage}%`, backgroundColor: getHealthColor(percentage) }}
        />
        <span className="health-text">
          {player.getHP()} / {player.maxHp} HP
        </span>
      </div>
    );
  };

  const getHealthColor = (percentage) => {
    if (percentage > 60) return '#2ecc71';
    if (percentage > 30) return '#f1c40f';
    return '#e74c3c';
  };

  const renderActionPoints = () => (
    <div className="points-container">
      <span className="points pa">
        PA: {player.getPA()} / {CLASSES[player.class].basePA}
      </span>
      <span className="points pm">
        PM: {player.getPM()} / {CLASSES[player.class].basePM}
      </span>
    </div>
  );

  const renderStatusEffects = () => {
    const effects = player.getStatusEffects();
    if (!effects.length) return null;

    return (
      <div className="status-effects">
        {effects.map((effect, index) => (
          <div key={index} className={`status-effect ${effect.type.toLowerCase()}`}>
            {effect.name} ({effect.duration})
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className={`player-state ${player.class.toLowerCase()}`}>
      <h3 className="player-name">{player.name}</h3>
      <div className="player-class">{player.class}</div>
      {renderHealthBar()}
      {renderActionPoints()}
      {renderStatusEffects()}
    </div>
  );
};

export default PlayerState;
