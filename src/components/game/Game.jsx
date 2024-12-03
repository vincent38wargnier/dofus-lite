import React from 'react';
import GameBoard from './GameBoard';
import PlayerInfo from '../ui/PlayerInfo';
import TurnTimer from '../ui/TurnTimer';
import useGameState from '../../hooks/useGameState';
import { CLASSES } from '../../utils/classes';

const VictoryScreen = ({ winner }) => (
  <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
    <div className="bg-white p-8 rounded-lg shadow-xl text-center">
      <div className="text-6xl mb-4">
        {winner.class === 'SWORD' ? '🗡️' : '🏹'}
      </div>
      <h2 className="text-3xl font-bold mb-2">
        {CLASSES[winner.class].name} Wins!
      </h2>
      <p className="text-gray-600 mb-4">
        Victory achieved through superior tactics!
      </p>
      <button 
        onClick={() => window.location.reload()}
        className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600 transition-colors"
      >
        Play Again
      </button>
    </div>
  </div>
);

const Game = () => {
  const {
    gameState,
    movePlayer,
    castSpell,
    selectSpell,
    endTurn,
    setHoveredCell,
  } = useGameState();

  const handleCellClick = (x, y) => {
    if (gameState.winner) return;
    
    if (gameState.selectedSpell) {
      castSpell(x, y);
    } else if (gameState.path.length > 0 && !gameState.moving) {
      movePlayer(gameState.path);
    }
  };

  const winningPlayer = gameState.winner !== null 
    ? gameState.players[gameState.winner]
    : null;

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="flex gap-8 items-center relative">
        {/* Left Player */}
        <PlayerInfo
          player={gameState.players[0]}
          isActive={gameState.currentPlayer === 0 && !gameState.winner}
          onSpellSelect={selectSpell}
          onEndTurn={endTurn}
          disabled={gameState.winner !== null}
        />
        
        {/* Center Board and Timer */}
        <div className="flex flex-col items-center">
          <GameBoard
            board={gameState.board}
            players={gameState.players}
            currentPlayer={gameState.currentPlayer}
            selectedSpell={gameState.selectedSpell}
            path={gameState.path}
            onCellClick={handleCellClick}
            onCellHover={(x, y) => !gameState.winner && setHoveredCell({ x, y })}
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
        <PlayerInfo
          player={gameState.players[1]}
          isActive={gameState.currentPlayer === 1 && !gameState.winner}
          onSpellSelect={selectSpell}
          onEndTurn={endTurn}
          disabled={gameState.winner !== null}
        />

        {winningPlayer && <VictoryScreen winner={winningPlayer} />}
      </div>
    </div>
  );
};

export default Game;