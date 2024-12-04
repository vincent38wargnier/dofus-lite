import React, { useState, useEffect, useCallback } from 'react';
import GameBoard from './GameBoard';
import PlayerInfo from '../ui/PlayerInfo';
import TurnTimer from '../ui/TurnTimer';
import VictoryScreen from '../ui/VictoryScreen';
import useGameState from '../../hooks/useGameState';
import { SwordMasterAI } from '../../ai/SwordMasterAI';

const AI_THINKING_DELAY = 2000; // 2 seconds
const AI_ACTION_DELAY = 1000;   // 1 second

const Game = () => {
  const {
    gameState,
    movePlayer,
    castSpell,
    selectSpell,
    endTurn,
    setHoveredCell,
  } = useGameState();

  const [aiControl, setAiControl] = useState({
    0: false,
    1: false
  });

  const [aiThinking, setAiThinking] = useState(false);

  // Initialize AIs
  const [ais] = useState({
    0: new SwordMasterAI(),
    1: new SwordMasterAI()
  });

  const handleAITurn = useCallback(async () => {
    const currentPlayerId = gameState.currentPlayer;
    console.log('Checking AI turn for player', currentPlayerId);
    console.log('AI Control status:', aiControl);

    if (!aiControl[currentPlayerId]) {
      console.log('AI not enabled for current player');
      return;
    }

    if (gameState.moving || gameState.winner) {
      console.log('Game state not ready for AI move');
      return;
    }

    console.log('Starting AI turn...');
    setAiThinking(true);

    try {
      const ai = ais[currentPlayerId];
      ai.initialize(gameState, currentPlayerId);

      await new Promise(resolve => setTimeout(resolve, AI_THINKING_DELAY));
      
      const decision = await ai.makeDecision();
      console.log('AI Decision:', decision);

      if (decision.type === 'cast') {
        console.log('AI casting spell');
        selectSpell(decision.spell);
        await new Promise(resolve => setTimeout(resolve, AI_ACTION_DELAY));
        castSpell(decision.target.x, decision.target.y);
      } else if (decision.type === 'end_turn') {
        console.log('AI ending turn');
        await new Promise(resolve => setTimeout(resolve, AI_ACTION_DELAY));
        endTurn();
      }
    } catch (error) {
      console.error('AI Error:', error);
      await new Promise(resolve => setTimeout(resolve, AI_ACTION_DELAY));
      endTurn();
    } finally {
      setAiThinking(false);
    }
  }, [gameState, aiControl, ais, selectSpell, castSpell, endTurn]);

  // Monitor for AI turns
  useEffect(() => {
    const timer = setTimeout(() => {
      handleAITurn();
    }, 500); // Small delay to ensure state is stable

    return () => clearTimeout(timer);
  }, [gameState.currentPlayer, handleAITurn]);

  const handleAIToggle = (playerId) => {
    console.log('Toggling AI for player', playerId);
    setAiControl(prev => ({
      ...prev,
      [playerId]: !prev[playerId]
    }));
  };

  const handleCellClick = useCallback((x, y) => {
    if (aiControl[gameState.currentPlayer]) {
      console.log('Manual control disabled - AI is in control');
      return;
    }

    if (gameState.selectedSpell) {
      castSpell(x, y);
    } else if (gameState.path.length > 0 && !gameState.moving) {
      movePlayer(gameState.path);
    }
  }, [aiControl, gameState.currentPlayer, gameState.selectedSpell, gameState.path, gameState.moving, movePlayer, castSpell]);

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="flex gap-8 items-center relative">
        {/* Left Player */}
        <div className="relative">
          <PlayerInfo
            player={gameState.players[0]}
            isActive={gameState.currentPlayer === 0 && !gameState.winner}
            onSpellSelect={selectSpell}
            onEndTurn={endTurn}
            disabled={gameState.winner !== null || (aiControl[0] && gameState.currentPlayer === 0)}
            isAIControlled={aiControl[0]}
            onAIToggle={handleAIToggle}
          />
          {aiThinking && gameState.currentPlayer === 0 && aiControl[0] && (
            <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-6
                          bg-blue-500 text-white px-3 py-1 rounded-full text-sm">
              AI Thinking...
            </div>
          )}
        </div>
        
        {/* Center Board and Timer */}
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
            onAIToggle={handleAIToggle}
          />
          {aiThinking && gameState.currentPlayer === 1 && aiControl[1] && (
            <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-6
                          bg-blue-500 text-white px-3 py-1 rounded-full text-sm">
              AI Thinking...
            </div>
          )}
        </div>

        {gameState.winner !== null && (
          <VictoryScreen winner={gameState.players[gameState.winner]} />
        )}
      </div>
    </div>
  );
};

export default Game;