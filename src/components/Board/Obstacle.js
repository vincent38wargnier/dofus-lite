import React from 'react';
import { OBSTACLE_TYPES } from '../../constants/game/board';
import './Obstacle.css';

const OBSTACLE_EMOJIS = {
  WALL: '🧱',
  BUSH: '🌳',
  ROCK: '🪨',
  ICE_WALL: '🧊'
};

const Obstacle = ({ type }) => {
  const obstacleData = OBSTACLE_TYPES[type];
  if (!obstacleData) return null;

  const className = `obstacle obstacle-${type.toLowerCase()}`;
  const emoji = OBSTACLE_EMOJIS[type] || '⬜';
  
  return (
    <div className={className} title={obstacleData.name}>
      <div className="obstacle-content">
        {emoji}
      </div>
    </div>
  );
};

export default Obstacle; 