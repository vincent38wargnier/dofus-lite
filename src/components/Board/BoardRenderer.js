import React, { useEffect, useState } from 'react';
import { useGame } from '../../context/GameContext';
import Cell from './Cell';
import { findPath } from '../../utils/movement';
import { LineOfSight } from '../../utils/lineOfSight';
import './Board.css';

const BoardRenderer = () => {
  const { state, actions } = useGame();
  const { board, currentPlayer, selectedAction } = state;

  const [currentPath, setCurrentPath] = useState([]);
  const [rangedCells, setRangedCells] = useState([]);

  // Calculate range cells for spells
  useEffect(() => {
    if (selectedAction?.type === 'CAST_SORT') {
      const playerPos = board.findPlayerPosition(currentPlayer);
      const inRangeCells = LineOfSight.getVisibleCells(
        playerPos,
        selectedAction.sort.range,
        board
      );
      setRangedCells(inRangeCells);
    } else {
      setRangedCells([]);
    }
  }, [selectedAction, currentPlayer, board]);

  const handleCellHover = (x, y) => {
    if (!currentPlayer || selectedAction) return;

    const playerPos = board.findPlayerPosition(currentPlayer);
    const path = findPath(
      board,
      playerPos.x,
      playerPos.y,
      x,
      y,
      currentPlayer.getPM()
    );

    setCurrentPath(path || []);
  };

  const handleCellLeave = () => {
    setCurrentPath([]);
  };

  const handleCellClick = (x, y) => {
    if (!currentPlayer) return;

    // If a spell is selected, handle spell casting
    if (selectedAction?.type === 'CAST_SORT') {
      // Handle spell casting
      return;
    }

    // Handle movement
    const path = currentPath;
    if (path && path.length > 0) {
      // Execute movement
      const cost = path.length - 1;
      if (cost <= currentPlayer.getPM()) {
        // Move player
        const lastPosition = path[path.length - 1];
        board.movePlayer(
          board.findPlayerPosition(currentPlayer).x,
          board.findPlayerPosition(currentPlayer).y,
          lastPosition.x,
          lastPosition.y
        );
        currentPlayer.reducePM(cost);
        setCurrentPath([]);
      }
    }
  };

  const isCellInPath = (x, y) => {
    return currentPath.some(pos => pos.x === x && pos.y === y);
  };

  const getPathStep = (x, y) => {
    return currentPath.findIndex(pos => pos.x === x && pos.y === y);
  };

  const isCellInRange = (x, y) => {
    return rangedCells.some(cell => cell.x === x && cell.y === y);
  };

  const renderBoard = () => {
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

            return (
              <Cell
                key={`${x}-${y}`}
                x={x}
                y={y}
                cell={cell}
                isHighlighted={isInPath}
                pathStep={pathStep}
                isInRange={selectedAction && isCellInRange(x, y)}
                onMouseEnter={() => handleCellHover(x, y)}
                onMouseLeave={handleCellLeave}
                onClick={() => handleCellClick(x, y)}
              />
            );
          })
        )).flat()}
      </div>
    );
  };

  return (
    <div className="board-container">
      {renderBoard()}
    </div>
  );
};

export default BoardRenderer;