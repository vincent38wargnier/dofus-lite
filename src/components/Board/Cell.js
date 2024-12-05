import React from 'react';
import Tooltip from '../Common/Tooltip';
import './Cell.css';

const Cell = ({ 
  x, 
  y, 
  cell, 
  isHighlighted, 
  isSelected, 
  onClick 
}) => {
  const getClassNames = () => {
    let classNames = ['cell', `cell-${cell.type.toLowerCase()}`];

    if (isHighlighted) classNames.push('cell-highlighted');
    if (isSelected) classNames.push('cell-selected');
    if (cell.occupant) classNames.push('cell-occupied');
    if (cell.obstacle) classNames.push('cell-obstacle');

    return classNames.join(' ');
  };

  const renderOccupant = () => {
    if (!cell.occupant) return null;

    return (
      <Tooltip content={getOccupantTooltip(cell.occupant)}>
        <div className={`cell-occupant occupant-${cell.occupant.class.toLowerCase()}`}>
          {/* You can add player icons/avatars here */}
        </div>
      </Tooltip>
    );
  };

  const renderObstacle = () => {
    if (!cell.obstacle) return null;

    return (
      <Tooltip content={getObstacleTooltip(cell.obstacle)}>
        <div className={`cell-obstacle-content obstacle-${cell.obstacle.type.toLowerCase()}`}>
          {/* You can add obstacle icons here */}
        </div>
      </Tooltip>
    );
  };

  const getOccupantTooltip = (occupant) => (
    <div className="tooltip-content">
      <div>{occupant.name}</div>
      <div>HP: {occupant.getHP()}/{occupant.maxHp}</div>
      <div>PA: {occupant.getPA()}</div>
      <div>PM: {occupant.getPM()}</div>
    </div>
  );

  const getObstacleTooltip = (obstacle) => (
    <div className="tooltip-content">
      <div>{obstacle.name}</div>
      <div>{obstacle.blocksMovement ? 'Blocks movement' : ''}</div>
      <div>{obstacle.blocksLOS ? 'Blocks line of sight' : ''}</div>
    </div>
  );

  const handleClick = () => {
    if (onClick) onClick(x, y);
  };

  return (
    <div 
      className={getClassNames()}
      onClick={handleClick}
      data-x={x}
      data-y={y}
    >
      {renderObstacle()}
      {renderOccupant()}
    </div>
  );
};

export default React.memo(Cell);
