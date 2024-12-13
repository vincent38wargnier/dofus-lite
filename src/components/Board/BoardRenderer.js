import React, { useState, useEffect } from 'react';
import { useGame } from '../../context/GameContext';
import { LineOfSight } from '../../utils/lineOfSight';
import BoardGrid from './components/BoardGrid';
import useBoardInteraction from './hooks/useBoardInteraction';
import './Board.css';
import FloatingCombatManager from '../UI/FloatingCombatManager';

const BoardRenderer = () => {
  const { state, actions } = useGame();
  const { board, currentPlayer, selectedAction } = state;
  const [rangedCells, setRangedCells] = useState(new Set());
  const [patternCells, setPatternCells] = useState(new Set());

  // Effect to update ranged cells when a spell is selected
  useEffect(() => {
    if (selectedAction?.type === 'CAST_SORT') {
      const playerPos = board.findPlayerPosition(currentPlayer);
      const inRangeCells = LineOfSight.getVisibleCells(
        playerPos,
        selectedAction.sort,
        board
      );
      setRangedCells(inRangeCells);
    } else {
      setRangedCells(new Set());
      setPatternCells(new Set());
    }
  }, [selectedAction, currentPlayer, board]);

  // Use the custom hook for board interactions
  const {
    currentPath,
    isMoving,
    movingCharacterClass,
    animationStyle,
    handleCellHover: baseHandleCellHover,
    handleCellLeave: baseHandleCellLeave,
    handleCellClick
  } = useBoardInteraction(board, currentPlayer, selectedAction, actions, rangedCells);

  // Combine movement and spell pattern previews
  const handleCellHover = (x, y) => {
    baseHandleCellHover(x, y);
    
    if (selectedAction?.type === 'CAST_SORT' && selectedAction.sort.pattern) {
      const playerPos = board.findPlayerPosition(currentPlayer);
      const distance = LineOfSight.calculateDistance(playerPos, {x, y});
      const maxRange = selectedAction.sort.range;
      const minRange = selectedAction.sort.min_range || 0;

      if (distance >= minRange && distance <= maxRange) {
        const newPatternCells = LineOfSight.getPatternCells(
          {x, y},
          selectedAction.sort.pattern,
          selectedAction.sort.pattern_size || 0
        );
        setPatternCells(newPatternCells);
      }
    }
  };

  const handleCellLeave = () => {
    baseHandleCellLeave();
    setPatternCells(new Set());
  };

  return (
    <div className="relative">
      <div className="board-container">
        <BoardGrid
          board={board}
          currentPath={currentPath}
          selectedAction={selectedAction}
          rangedCells={rangedCells}
          patternCells={patternCells}
          movingCharacterClass={movingCharacterClass}
          animationStyle={animationStyle}
          onCellHover={handleCellHover}
          onCellLeave={handleCellLeave}
          onCellClick={handleCellClick}
        />
      </div>
      <FloatingCombatManager />
    </div>
  );
};

export default BoardRenderer;