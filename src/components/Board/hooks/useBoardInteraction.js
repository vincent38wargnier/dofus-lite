import { useState } from 'react';
import { findPath } from '../../../utils/movement';
import { createKeyframeAnimation, getAnimationStyle } from '../utils/movementUtils';

const CELL_SIZE = 60;
const MOVEMENT_SPEED = 150;

export const useBoardInteraction = (board, currentPlayer, selectedAction, actions, rangedCells) => {
  const [currentPath, setCurrentPath] = useState([]);
  const [isMoving, setIsMoving] = useState(false);
  const [movingCharacterClass, setMovingCharacterClass] = useState(null);
  const [animationStyle, setAnimationStyle] = useState(null);

  const handleCellHover = (x, y) => {
    if (!currentPlayer || isMoving || selectedAction?.type === 'CAST_SORT') return;

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

  const animateAlongPath = async (path) => {
    if (path.length < 2) return;

    const startPos = path[0];
    const playerClass = currentPlayer.class.toLowerCase();

    board.setCell(startPos.x, startPos.y, { occupant: null });

    const keyframes = createKeyframeAnimation(path, CELL_SIZE);
    const animationName = `move-${Date.now()}`;
    const styleSheet = document.createElement('style');
    styleSheet.textContent = `
      @keyframes ${animationName} {
        ${keyframes}
      }
    `;
    document.head.appendChild(styleSheet);

    setMovingCharacterClass(playerClass);
    setAnimationStyle(getAnimationStyle(animationName, MOVEMENT_SPEED, path.length));

    await new Promise(resolve => setTimeout(resolve, MOVEMENT_SPEED * (path.length - 1)));

    document.head.removeChild(styleSheet);
    setAnimationStyle(null);
    setMovingCharacterClass(null);

    const finalPos = path[path.length - 1];
    board.setCell(finalPos.x, finalPos.y, { occupant: currentPlayer });
  };

  const isCellInRange = (x, y) => {
    return rangedCells.has(`${x},${y}`);
  };

  const handleCellClick = async (x, y) => {
    if (!currentPlayer || isMoving) return;

    const targetCell = board.getCell(x, y);

    // Handle spell casting (either from direct click or AI keyboard)
    if (selectedAction?.type === 'CAST_SORT') {
      if (!isCellInRange(x, y)) {
        actions.selectAction(null);
        return;
      }

      const targetPos = { x, y };
      
      if (selectedAction.sort.type === 'MOVEMENT') {
        const playerPos = board.findPlayerPosition(currentPlayer);
        const startCell = board.getCell(playerPos.x, playerPos.y);
        board.setCell(playerPos.x, playerPos.y, { ...startCell, occupant: null });
        board.setCell(x, y, { ...targetCell, occupant: currentPlayer });
        
        const targetElement = document.querySelector(`[data-x="${x}"][data-y="${y}"]`);
        if (targetElement) {
          const rect = targetElement.getBoundingClientRect();
          const centerX = rect.left + (rect.width / 2);
          const characterTop = rect.top + (rect.height * 0.2);
          currentPlayer.updatePosition(x, y, centerX, characterTop);
        }
      }
      
      await actions.castSort(selectedAction.sort, targetCell.occupant, targetPos);
      actions.selectAction(null);
      return;
    }

    // Handle movement
    if (targetCell.occupant === currentPlayer) {
      // If clicking on current player, start showing movement options
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
      return;
    }

    // Execute movement if there's a valid path
    const path = currentPath;
    if (path && path.length > 0) {
      const cost = path.length - 1;
      if (cost <= currentPlayer.getPM()) {
        setIsMoving(true);
        await animateAlongPath(path);
        
        const finalPos = path[path.length - 1];
        const finalElement = document.querySelector(`[data-x="${finalPos.x}"][data-y="${finalPos.y}"]`);
        if (finalElement) {
          const rect = finalElement.getBoundingClientRect();
          const centerX = rect.left + (rect.width / 2);
          const characterTop = rect.top + (rect.height * 0.2);
          currentPlayer.updatePosition(finalPos.x, finalPos.y, centerX, characterTop);
        }
        
        currentPlayer.reducePM(cost);
        setIsMoving(false);
        setCurrentPath([]);
      }
    }
  };

  return {
    currentPath,
    isMoving,
    movingCharacterClass,
    animationStyle,
    handleCellHover,
    handleCellLeave,
    handleCellClick
  };
};

export default useBoardInteraction;