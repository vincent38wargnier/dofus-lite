import React, { useState, useEffect, useCallback, useRef } from 'react';
import GameBoard from './GameBoard';
import PlayerInfo from '../ui/PlayerInfo';
import TurnTimer from '../ui/TurnTimer';
import VictoryScreen from '../ui/VictoryScreen';
import LogPanel from '../ui/LogPanel';
import useGameState from '../../hooks/useGameState';
import { SwordMasterAI } from '../../ai/SwordMasterAI';

const AI_THINKING_DELAY = 1000;
const AI_ACTION_DELAY = 500;

const Game = () => {
  const {
    gameState,
    movePlayer,
    castSpell,
    selectSpell,
    endTurn,
    setHoveredCell,
  } = useGameState();

  // Store AI instances in refs to maintain them across renders
  const aiInstances = useRef({});

  const [aiControl, setAiControl] = useState({
    0: false,
    1: false
  });

  const [aiThinking, setAiThinking] = useState(false);
  const [isExecutingAIAction, setIsExecutingAIAction] = useState(false);
  const [logs, setLogs] = useState([]);

  const addLog = useCallback((message, type = 'info') => {
    setLogs(prevLogs => [...prevLogs, { message, type, timestamp: Date.now() }]);
  }, []);

  // Execute a single AI action with proper delays
  const executeAIAction = useCallback(async (action) => {
    if (!action) return;

    setIsExecutingAIAction(true);
    
    try {
      switch (action.type) {
        case 'move':
          if (action.path && action.path.length > 0) {
            addLog(`AI moving to position (${action.path[action.path.length-1].x}, ${action.path[action.path.length-1].y})`, 'ai');
            await new Promise(resolve => setTimeout(resolve, AI_ACTION_DELAY));
            movePlayer(action.path);
          }
          break;

        case 'cast':
          if (action.spell && action.target) {
            addLog(`AI casting ${action.spell.name} at (${action.target.x}, ${action.target.y})`, 'ai');
            selectSpell(action.spell);
            await new Promise(resolve => setTimeout(resolve, AI_ACTION_DELAY));
            castSpell(action.target.x, action.target.y);
          }
          break;

        case 'end_turn':
          addLog('AI ending turn', 'ai');
          await new Promise(resolve => setTimeout(resolve, AI_ACTION_DELAY));
          endTurn();
          break;
      }
    } catch (error) {
      addLog(`Error executing AI action: ${error.message}`, 'error');
    } finally {
      setIsExecutingAIAction(false);
    }
  }, [movePlayer, castSpell, selectSpell, endTurn, addLog]);

  // Handle AI turn
  const handleAITurn = useCallback(async () => {
    const currentPlayerId = gameState.currentPlayer;

    // Only proceed if current player is AI-controlled
    if (!aiControl[currentPlayerId] || !aiInstances.current[currentPlayerId]) {
      return;
    }

    // Additional checks
    if (gameState.winner !== null || isExecutingAIAction || gameState.moving) {
      return;
    }

    addLog(`AI player ${currentPlayerId + 1} starting turn`, 'ai');
    setAiThinking(true);

    try {
      // Get the AI instance for current player
      const ai = aiInstances.current[currentPlayerId];
      ai.initialize(gameState, currentPlayerId);

      addLog('AI analyzing game state...', 'ai');
      await new Promise(resolve => setTimeout(resolve, AI_THINKING_DELAY));

      const decision = await ai.makeDecision();
      addLog(`AI decided: ${decision.type}`, 'ai');

      await executeAIAction(decision);

    } catch (error) {
      addLog(`AI Error: ${error.message}`, 'error');
      await new Promise(resolve => setTimeout(resolve, AI_ACTION_DELAY));
      endTurn();
    } finally {
      setAiThinking(false);
    }
  }, [
    gameState,
    aiControl,
    isExecutingAIAction,
    executeAIAction,
    endTurn,
    addLog
  ]);

  // Monitor for AI turns
  useEffect(() => {
    // Only proceed if current player is AI-controlled
    if (aiControl[gameState.currentPlayer] && !isExecutingAIAction && !gameState.moving) {
      const timer = setTimeout(() => {
        handleAITurn();
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [
    gameState.currentPlayer,
    handleAITurn,
    aiControl,
    isExecutingAIAction,
    gameState.moving
  ]);

  // Handle AI toggle
  const handleAIToggle = (playerId) => {
    const newValue = !aiControl[playerId];
    addLog(`${newValue ? 'Enabling' : 'Disabling'} AI for player ${playerId + 1}`);
    
    // Create or destroy AI instance based on toggle
    if (newValue) {
      // Create new AI instance for this player
      aiInstances.current[playerId] = new SwordMasterAI();
      aiInstances.current[playerId].initialize(gameState, playerId);
    } else {
      // Remove AI instance when disabled
      delete aiInstances.current[playerId];
    }

    setAiControl(prev => ({
      ...prev,
      [playerId]: newValue
    }));
  };

  // Handle cell clicks (for human players)
  const handleCellClick = useCallback((x, y) => {
    if (aiControl[gameState.currentPlayer]) {
      addLog('Manual control disabled - AI is in control');
      return;
    }

    if (gameState.selectedSpell) {
      addLog(`Player casting spell at (${x}, ${y})`);
      castSpell(x, y);
    } else if (gameState.path.length > 0 && !gameState.moving) {
      addLog(`Player moving to (${x}, ${y})`);
      movePlayer(gameState.path);
    }
  }, [
    aiControl,
    gameState.currentPlayer,
    gameState.selectedSpell,
    gameState.path,
    gameState.moving,
    movePlayer,
    castSpell,
    addLog
  ]);

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="flex gap-8 items-start relative">
        {/* Left Player */}
        <div className="relative">
          <PlayerInfo
            player={gameState.players[0]}
            isActive={gameState.currentPlayer === 0 && !gameState.winner}
            onSpellSelect={selectSpell}
            onEndTurn={endTurn}
            disabled={gameState.winner !== null || (aiControl[0] && gameState.currentPlayer === 0)}
            isAIControlled={aiControl[0]}
            onAIToggle={() => handleAIToggle(0)}
          />
          {aiThinking && gameState.currentPlayer === 0 && aiControl[0] && (
            <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-6
                          bg-blue-500 text-white px-3 py-1 rounded-full text-sm">
              AI Thinking...
            </div>
          )}
        </div>
        
        {/* Center Content */}
        <div className="flex flex-col items-center">
          <GameBoard
            board={gameState.board}
            players={gameState.players}
            currentPlayer={gameState.currentPlayer}
            selectedSpell={gameState.selectedSpell}
            path={gameState.path}
            onCellClick={handleCellClick}
            onCellHover={(x, y) => !aiControl[gameState.currentPlayer] && setHoveredCell({ x, y })}
            onCellLeave={() => setHoveredCell(null)}
            damageAnimation={gameState.damageAnimation}
          />
          
          {!gameState.winner && (
            <div className="mt-4 w-full max-w-md">
              <TurnTimer timeLeft={gameState.timeLeft} />
            </div>
          )}
        </div>
        
        {/* Right Player */}
        <div className="relative">
          <PlayerInfo
            player={gameState.players[1]}
            isActive={gameState.currentPlayer === 1 && !gameState.winner}
            onSpellSelect={selectSpell}
            onEndTurn={endTurn}
            disabled={gameState.winner !== null || (aiControl[1] && gameState.currentPlayer === 1)}
            isAIControlled={aiControl[1]}
            onAIToggle={() => handleAIToggle(1)}
          />
          {aiThinking && gameState.currentPlayer === 1 && aiControl[1] && (
            <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-6
                          bg-blue-500 text-white px-3 py-1 rounded-full text-sm">
              AI Thinking...
            </div>
          )}
        </div>

        {/* Log Panel */}
        <div className="absolute right-0 top-0 transform translate-x-full ml-4">
          <LogPanel logs={logs} />
        </div>

        {gameState.winner !== null && (
          <VictoryScreen winner={gameState.players[gameState.winner]} />
        )}
      </div>
    </div>
  );
};

export default Game;