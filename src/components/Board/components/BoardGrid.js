import React from 'react';
import Cell from '../Cell';
import MovingCharacter from './MovingCharacter';

const BoardGrid = ({ 
  board,
  currentPath,
  selectedAction,
  rangedCells,
  movingCharacterClass,
  animationStyle,
  onCellHover,
  onCellLeave,
  onCellClick 
}) => {
  const isCellInPath = (x, y) => {
    return currentPath.some(pos => pos.x === x && pos.y === y);
  };

  const getPathStep = (x, y) => {
    return currentPath.findIndex(pos => pos.x === x && pos.y === y);
  };

  const isCellInRange = (x, y) => {
    return rangedCells.has(`${x},${y}`);
  };

  if (!board) return null;

  return (
    <div 
      className="board-grid"
      style={{
        gridTemplateColumns: `repeat(${board.width}, 1fr)`,
        gridTemplateRows: `repeat(${board.height}, 1fr)`
      }}
    >
      {Array.from({ length: board.height }, (_, y) => (
        Array.from({ length: board.width }, (_, x) => {
          const cell = board.getCell(x, y);
          const isInPath = isCellInPath(x, y);
          const pathStep = isInPath ? getPathStep(x, y) : null;
          const isInSpellRange = selectedAction?.type === 'CAST_SORT' && isCellInRange(x, y);

          return (
            <Cell
              key={`${x}-${y}`}
              x={x}
              y={y}
              cell={cell}
              isHighlighted={isInPath}
              pathStep={pathStep}
              isInRange={isInSpellRange}
              onMouseEnter={() => onCellHover(x, y)}
              onMouseLeave={onCellLeave}
              onClick={() => onCellClick(x, y)}
            />
          );
        })
      )).flat()}
      <MovingCharacter 
        characterClass={movingCharacterClass}
        animationStyle={animationStyle}
      />
    </div>
  );
};

export default BoardGrid;