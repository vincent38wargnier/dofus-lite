import React from 'react';
import { PLAYER_ICONS, OBSTACLE_ICONS } from '../../utils/constants';

const GameCell = ({
  x,
  y,
  type,
  playerId,
  isHighlighted,
  isInRange,
  onClick,
}) => {
  const getCellContent = () => {
    if (playerId !== null) {
      return playerId === 0 ? PLAYER_ICONS.PLAYER_1 : PLAYER_ICONS.PLAYER_2;
    }
    
    if (type === 'tree') return OBSTACLE_ICONS.TREE;
    if (type === 'rock') return OBSTACLE_ICONS.ROCK;
    return '';
  };

  const getCellStyles = () => {
    if (isHighlighted) return 'bg-blue-200';
    if (isInRange) return 'bg-green-200';
    return 'bg-white';
  };

  return (
    <div
      className={`
        w-12 h-12 
        border border-gray-200 
        flex items-center justify-center 
        text-2xl cursor-pointer
        transition-colors duration-200
        ${getCellStyles()}
        hover:bg-opacity-80
      `}
      onClick={() => onClick(x, y)}
      data-testid={`cell-${x}-${y}`}
    >
      {getCellContent()}
    </div>
  );
};

export default React.memo(GameCell);