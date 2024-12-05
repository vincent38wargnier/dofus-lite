import React, { useEffect, useState } from 'react';
import { useGame } from '../../context/GameContext';
import Cell from './Cell';
import { findPath } from '../../utils/movement';
import { LineOfSight } from '../../utils/lineOfSight';
import './Board.css';

const MOVEMENT_ANIMATION_DURATION = 500;

const BoardRenderer = () => {
  const { state, actions } = useGame();
  const { board, currentPlayer, selectedAction } = state;

  const [currentPath, setCurrentPath] = useState([]);
  const [rangedCells, setRangedCells] = useState([]);
  const [isMoving, setIsMoving] = useState(false);
  const [movingCharacterPos, setMovingCharacterPos] = useState(null);
  const [movingCharacterClass, setMovingCharacterClass] = useState(null);

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
    if (!currentPlayer || selectedAction || isMoving) return;

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
    if (!isMoving) {
      setCurrentPath([]);
    }
  };

  const handleCellClick = async (x, y) => {
    if (!currentPlayer || isMoving || selectedAction?.type === 'CAST_SORT') return;

    const path = currentPath;
    if (path && path.length > 0) {
      const cost = path.length - 1;
      if (cost <= currentPlayer.getPM()) {
        setIsMoving(true);
        
        // Start position
        const startPos = board.findPlayerPosition(currentPlayer);
        const playerClass = currentPlayer.class.toLowerCase();
        
        // Remove player from start cell
        board.setCell(startPos.x, startPos.y, { occupant: null });
        
        // Set up moving character
        setMovingCharacterClass(playerClass);
        setMovingCharacterPos({
          x: startPos.x * 60,
          y: startPos.y * 60
        });

        // Wait a frame to ensure the initial position is set
        await new Promise(resolve => requestAnimationFrame(resolve));

        // Start the animation to final position
        const endPos = path[path.length - 1];
        setMovingCharacterPos({
          x: endPos.x * 60,
          y: endPos.y * 60
        });

        // Wait for animation to complete
        await new Promise(resolve => setTimeout(resolve, MOVEMENT_ANIMATION_DURATION));

        // Clean up and place player in final position
        setMovingCharacterPos(null);
        setMovingCharacterClass(null);
        board.setCell(endPos.x, endPos.y, { occupant: currentPlayer });
        
        currentPlayer.reducePM(cost);
        setIsMoving(false);
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

  const renderMovingCharacter = () => {
    if (!movingCharacterPos || !movingCharacterClass) return null;

    return (
      <div
        className={`moving-character occupant-${movingCharacterClass}`}
        style={{
          transform: `translate(${movingCharacterPos.x}px, ${movingCharacterPos.y}px)`
        }}
      />
    );
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
        {renderMovingCharacter()}
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