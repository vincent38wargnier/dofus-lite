import React, { useEffect, useRef } from 'react';
import { useGame } from '../../context/GameContext';
import Tooltip from '../Common/Tooltip';
import Obstacle from './Obstacle';
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
  const cellRef = useRef(null);

  // Update player screen position when cell position or content changes
  useEffect(() => {
    if (cell.occupant && cellRef.current) {
      const rect = cellRef.current.getBoundingClientRect();
      const centerX = rect.left + (rect.width / 2);
      const characterTop = rect.top + (rect.height * 0.2);
      cell.occupant.updatePosition(x, y, centerX, characterTop);
    }
  }, [x, y, cell.occupant]);

  const getClassNames = () => {
    let classNames = ['cell'];

    if (isHighlighted) classNames.push('cell-highlighted');
    if (isSelected) classNames.push('cell-selected');
    if (isInPath) classNames.push('cell-path');
    if (isInRange) classNames.push('cell-in-range');
    if (cell.occupant) classNames.push('cell-occupied');
    if (cell.obstacle) classNames.push('cell-obstacle');

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

  const renderObstacle = () => {
    if (!cell.obstacle) return null;
    return <Obstacle type={cell.obstacle.type} />;
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

  return (
    <div 
      ref={cellRef}
      className={getClassNames()}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      data-x={x}
      data-y={y}
    >
      <div className="cell-coordinates">{x},{y}</div>
      {renderObstacle()}
      {renderOccupant()}
      {isInPath && pathStep !== null && (
        <div className="path-step">{pathStep + 1}</div>
      )}
    </div>
  );
};

export default Cell;