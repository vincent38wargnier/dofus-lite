import React from 'react';
import { PLAYER_ICONS, OBSTACLE_ICONS } from '../../utils/constants';

const GameCell = ({
  x,
  y,
  type,
  playerId,
  isHighlighted,
  highlightType = 'spell',
  isInPath,
  damageAnimation,
  currentPlayer,
  onClick,
  onHover,
  onLeave,
}) => {
  const isCurrentPlayer = playerId === currentPlayer;
  const shouldShowDamageAnimation = damageAnimation && 
    damageAnimation.position.x === x && 
    damageAnimation.position.y === y;

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
      'transition-colors duration-200',
      'relative'
    ];

    if (type === 'tree' || type === 'rock') {
      baseClasses.push('bg-gray-100 hover:bg-gray-200');
    } else if (isHighlighted) {
      if (highlightType === 'spell') {
        baseClasses.push('bg-blue-200 hover:bg-blue-300');
      } else {
        baseClasses.push('bg-green-200 hover:bg-green-300');
      }
    } else if (isInPath) {
      baseClasses.push('bg-green-200 hover:bg-green-300');
    } else {
      baseClasses.push('bg-white hover:bg-gray-100');
    }

    return baseClasses.join(' ');
  };

  const handleClick = () => {
    if (onClick) onClick(x, y);
  };

  const handleMouseEnter = () => {
    if (onHover) onHover(x, y);
  };

  const handleMouseLeave = () => {
    if (onLeave) onLeave(x, y);
  };

  return (
    <div
      className={getCellStyles()}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      data-testid={`cell-${x}-${y}`}
    >
      <div className="relative">
        {/* Current player indicator */}
        {isCurrentPlayer && (
          <div className="absolute inset-[-4px] bg-blue-400/30 rounded-full" />
        )}
        
        {/* Cell content */}
        <div className="relative z-10">
          {getCellContent()}
        </div>

        {/* Damage Animation */}
        {shouldShowDamageAnimation && (
          <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 text-2xl font-bold animate-damage-popup">
            <div className={
              damageAnimation.type === 'damage' 
                ? 'text-red-600' 
                : damageAnimation.type === 'heal' 
                  ? 'text-green-600' 
                  : 'text-blue-600'
            }>
              {damageAnimation.type === 'damage' 
                ? `-${damageAnimation.value}`
                : `+${damageAnimation.value}`
              }
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(GameCell);