import React, { useState, useEffect } from 'react';
import { useGame } from '../../context/GameContext';
import { LineOfSight } from '../../utils/lineOfSight';
import BoardGrid from './components/BoardGrid';
import useBoardInteraction from './hooks/useBoardInteraction';
import './Board.css';

const BoardRenderer = () => {
  const { state, actions } = useGame();
  const { board, currentPlayer, selectedAction } = state;
  const [rangedCells, setRangedCells] = useState(new Set());

  // Effect to update ranged cells when a spell is selected
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
      setRangedCells(new Set());
    }
  }, [selectedAction, currentPlayer, board]);

  // Use the custom hook for board interactions
  const {
    currentPath,
    isMoving,
    movingCharacterClass,
    animationStyle,
    handleCellHover,
    handleCellLeave,
    handleCellClick
  } = useBoardInteraction(board, currentPlayer, selectedAction, actions, rangedCells);

  return (
    <div className="board-container">
      <BoardGrid
        board={board}
        currentPath={currentPath}
        selectedAction={selectedAction}
        rangedCells={rangedCells}
        movingCharacterClass={movingCharacterClass}
        animationStyle={animationStyle}
        onCellHover={handleCellHover}
        onCellLeave={handleCellLeave}
        onCellClick={handleCellClick}
      />
    </div>
  );
};

export default BoardRenderer;