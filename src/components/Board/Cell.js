import React from 'react';
import { useGame } from '../../context/GameContext';
import Tooltip from '../Common/Tooltip';
import './Cell.css';

const Cell = ({ 
  x, 
  y, 
  cell, 
  isHighlighted, 
  isSelected,
  isInPath,
  isInRange,
  pathStep,
  onMouseEnter,
  onMouseLeave,
  onClick 
}) => {
  const { state } = useGame();
  const { currentPlayer } = state;

  const getClassNames = () => {
    let classNames = ['cell'];

    if (isHighlighted) classNames.push('cell-highlighted');
    if (isSelected) classNames.push('cell-selected');
    if (isInPath) classNames.push('cell-path');
    if (isInRange) classNames.push('cell-in-range');
    if (cell.occupant) classNames.push('cell-occupied');

    return classNames.join(' ');
  };

  const renderOccupant = () => {
    if (!cell.occupant) return null;

    const isCurrentPlayer = cell.occupant === currentPlayer;
    const hpPercentage = (cell.occupant.getHP() / cell.occupant.maxHp) * 100;
    
    return (
      <Tooltip content={getOccupantTooltip(cell.occupant)}>
        <div 
          className={`
            cell-occupant 
            occupant-${cell.occupant.class.toLowerCase()}
            ${isCurrentPlayer ? 'active-player' : ''}
          `}
        >
          <div className="hp-bar-mini">
            <div 
              className="hp-fill-mini" 
              style={{ width: `${hpPercentage}%` }} 
            />
          </div>
        </div>
      </Tooltip>
    );
  };

  const getOccupantTooltip = (occupant) => (
    <div className="tooltip-content">
      <div>{occupant.name}</div>
      <div>Class: {occupant.class}</div>
      <div>HP: {occupant.getHP()}/{occupant.maxHp}</div>
      <div>PA: {occupant.getPA()}</div>
      <div>PM: {occupant.getPM()}</div>
      {occupant.getStatusEffects().map((effect, index) => (
        <div key={index}>
          {effect.name} ({effect.duration} turns)
        </div>
      ))}
    </div>
  );

  const handleMouseEnter = () => {
    if (onMouseEnter) onMouseEnter(x, y);
  };

  const handleMouseLeave = () => {
    if (onMouseLeave) onMouseLeave(x, y);
  };

  const handleClick = () => {
    if (onClick) onClick(x, y);
  };

  return (
    <div 
      className={getClassNames()}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      data-x={x}
      data-y={y}
    >
      {renderOccupant()}
    </div>
  );
};

export default React.memo(Cell);