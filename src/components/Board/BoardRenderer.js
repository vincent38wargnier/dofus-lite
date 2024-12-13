import React, { useState, useEffect } from 'react';
import { useGame } from '../../context/GameContext';
import { LineOfSight } from '../../utils/lineOfSight';
import BoardGrid from './components/BoardGrid';
import useBoardInteraction from './hooks/useBoardInteraction';
import FloatingCombatManager from '../UI/FloatingCombatManager';
import AIEngine from '../../ai/AIEngine';
import './Board.css';

const BoardRenderer = () => {
  const { state, actions } = useGame();
  const { board, currentPlayer, selectedAction } = state;
  const [rangedCells, setRangedCells] = useState(new Set());
  const [patternCells, setPatternCells] = useState(new Set());
  const [isAIThinking, setIsAIThinking] = useState(false);

  // Initialize AI Engine
  const aiEngine = React.useMemo(() => new AIEngine(), []);

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

  // Expose the handlers through actions
  React.useEffect(() => {
    actions.handleCellHover = handleCellHover;
    actions.handleCellLeave = handleCellLeave;
    actions.handleCellClick = handleCellClick;
  }, [actions, handleCellHover, handleCellLeave, handleCellClick]);

  const handleAITurn = async () => {
    if (isAIThinking || !currentPlayer) return;
    
    setIsAIThinking(true);
    try {
      aiEngine.initialize(state, actions);
      await aiEngine.playTurn();
    } catch (error) {
      console.error('AI Error:', error);
    }
    setIsAIThinking(false);
  };

  return (
    <div className="relative flex flex-col items-center">
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
      
      {/* AI Control Button */}
      <button
        className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
        onClick={handleAITurn}
        disabled={isAIThinking || !currentPlayer}
      >
        {isAIThinking ? 'AI Thinking...' : 'Trigger AI Turn'}
      </button>
    </div>
  );
};

export default BoardRenderer;