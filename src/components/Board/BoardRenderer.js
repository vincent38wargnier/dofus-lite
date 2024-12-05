import React, { useEffect, useState, useRef } from 'react';
import { useGame } from '../../context/GameContext';
import Cell from './Cell';
import { findPath } from '../../utils/movement';
import { LineOfSight } from '../../utils/lineOfSight';
import './Board.css';

const CELL_SIZE = 60;
const MOVEMENT_SPEED = 150; // ms per cell

const BoardRenderer = () => {
  const { state, actions } = useGame();
  const { board, currentPlayer, selectedAction } = state;

  const [currentPath, setCurrentPath] = useState([]);
  const [rangedCells, setRangedCells] = useState([]);
  const [isMoving, setIsMoving] = useState(false);
  const [movingCharacterClass, setMovingCharacterClass] = useState(null);
  const [animationStyle, setAnimationStyle] = useState(null);
  const characterRef = useRef(null);

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

  const createKeyframeAnimation = (path) => {
    const totalSteps = path.length - 1;
    if (totalSteps === 0) return '';

    let keyframes = '';
    path.forEach((pos, index) => {
      const percentage = (index * 100) / totalSteps;
      keyframes += `
        ${percentage}% {
          transform: translate(${pos.x * CELL_SIZE}px, ${pos.y * CELL_SIZE}px);
        }
      `;
    });

    // Ensure we end at the final position
    keyframes += `
      100% {
        transform: translate(${path[path.length - 1].x * CELL_SIZE}px, ${path[path.length - 1].y * CELL_SIZE}px);
      }
    `;

    return keyframes;
  };

  const animateAlongPath = async (path) => {
    if (path.length < 2) return;

    const startPos = path[0];
    const playerClass = currentPlayer.class.toLowerCase();

    // Remove player from start position
    board.setCell(startPos.x, startPos.y, { occupant: null });

    // Create and inject the keyframe animation
    const keyframes = createKeyframeAnimation(path);
    const animationName = `move-${Date.now()}`;
    const styleSheet = document.createElement('style');
    styleSheet.textContent = `
      @keyframes ${animationName} {
        ${keyframes}
      }
    `;
    document.head.appendChild(styleSheet);

    // Set up the animation
    setMovingCharacterClass(playerClass);
    setAnimationStyle({
      animation: `${animationName} ${MOVEMENT_SPEED * (path.length - 1)}ms linear forwards`
    });

    // Wait for animation to complete
    await new Promise(resolve => setTimeout(resolve, MOVEMENT_SPEED * (path.length - 1)));

    // Clean up
    document.head.removeChild(styleSheet);
    setAnimationStyle(null);
    setMovingCharacterClass(null);

    // Place player in final position
    const finalPos = path[path.length - 1];
    board.setCell(finalPos.x, finalPos.y, { occupant: currentPlayer });
  };

  const handleCellClick = async (x, y) => {
    if (!currentPlayer || isMoving || selectedAction?.type === 'CAST_SORT') return;

    const path = currentPath;
    if (path && path.length > 0) {
      const cost = path.length - 1;
      if (cost <= currentPlayer.getPM()) {
        setIsMoving(true);
        await animateAlongPath(path);
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
    if (!movingCharacterClass || !animationStyle) return null;

    return (
      <div
        ref={characterRef}
        className={`moving-character occupant-${movingCharacterClass} animating`}
        style={animationStyle}
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