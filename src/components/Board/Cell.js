import React from 'react';
import { useGame } from '../../context/GameContext';
import { CELL_TYPES } from '../../utils/constants';

const Cell = ({ x, y, type = CELL_TYPES.NORMAL, occupant, obstacle, isHighlighted, onClick }) => {
  const { state } = useGame();
  
  const getCellClassName = () => {
    let className = 'cell';
    
    // Add type-specific class
    className += ` cell-${type.toLowerCase()}`;
    
    // Add highlighted class if applicable
    if (isHighlighted) {
      className += ' cell-highlighted';
    }
    
    // Add occupied class if there's a player
    if (occupant) {
      className += ' cell-occupied';
    }
    
    // Add obstacle class if there's an obstacle
    if (obstacle) {
      className += ' cell-obstacle';
    }
    
    return className;
  };

  const handleClick = () => {
    if (onClick) {
      onClick({ x, y, type, occupant, obstacle });
    }
  };

  return (
    <div 
      className={getCellClassName()}
      onClick={handleClick}
      data-x={x}
      data-y={y}
    >
      {occupant && (
        <div className={`player player-${occupant.class.toLowerCase()}`}>
          {/* Display player icon/avatar */}
        </div>
      )}
      {obstacle && (
        <div className={`obstacle obstacle-${obstacle.type.toLowerCase()}`}>
          {/* Display obstacle */}
        </div>
      )}
    </div>
  );
};

export default Cell;
