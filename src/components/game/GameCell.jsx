import React from 'react';
import { PLAYER_ICONS, OBSTACLE_ICONS } from '../../utils/constants';

const GameCell = ({
  x,
  y,
  type,
  playerId,
  isHighlighted,
  isInPath,
  damageAnimation,
  onClick,
  onHover,
  onLeave,
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
    const baseClasses = [
      'w-12 h-12',
      'border border-gray-200',
      'flex items-center justify-center',
      'text-2xl cursor-pointer',
      'transition-all duration-200',
      'relative'
    ];

    if (type === 'tree' || type === 'rock') {
      baseClasses.push('bg-gray-100 hover:bg-gray-200');
    } else if (isHighlighted) {
      baseClasses.push('bg-blue-200 hover:bg-blue-300');
    } else if (isInPath) {
      baseClasses.push('bg-green-200 hover:bg-green-300');
    } else {
      baseClasses.push('bg-white hover:bg-gray-100');
    }

    return baseClasses.join(' ');
  };

  // Check if this cell should show damage animation
  const showAnimation = damageAnimation && 
    damageAnimation.position && 
    damageAnimation.position.x === x && 
    damageAnimation.position.y === y;

  return (
    <div
      className={getCellStyles()}
      onClick={() => onClick(x, y)}
      onMouseEnter={() => onHover(x, y)}
      onMouseLeave={() => onLeave(x, y)}
      data-testid={`cell-${x}-${y}`}
    >
      <div className="relative">
        {getCellContent()}
        
        {showAnimation && (
          <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 text-2xl font-bold animate-bounce pointer-events-none" style={{ textShadow: '0 0 3px white' }}>
            <span className={
              damageAnimation.type === 'damage' 
                ? 'text-red-600' 
                : damageAnimation.type === 'heal' 
                  ? 'text-green-600' 
                  : 'text-blue-600'
            }>
              {damageAnimation.type === 'damage' 
                ? `-${damageAnimation.value}` 
                : damageAnimation.type === 'heal' 
                  ? `+${damageAnimation.value}` 
                  : 'Boost!'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(GameCell);