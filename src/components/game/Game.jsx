import React, { useState, useCallback, useEffect } from 'react';
import GameBoard from './GameBoard';
import PlayerInfo from '../ui/PlayerInfo';
import TurnTimer from '../ui/TurnTimer';
import VictoryScreen from '../ui/VictoryScreen';
import LogPanel from '../ui/LogPanel';
import ErrorBoundary from '../shared/ErrorBoundary';
import useGameState from '../../hooks/useGameState';
import { useTurnManagement } from '../../hooks/useTurnManagement';

const Game = () => {
    const { 
        gameState, 
        setGameState,
        movePlayer, 
        setHoveredCell, 
        castSpell, 
        selectSpell
    } = useGameState();

    const [logs, setLogs] = useState([]);
    const [aiControl, setAiControl] = useState({
        0: false,
        1: false
    });

    const addLog = useCallback((message, type = 'info') => {
        setLogs(prev => [...prev, { 
            message, 
            type, 
            timestamp: Date.now()
        }]);
    }, []);

    const handlePlayerAction = useCallback((playerId, action) => {
        if (action.type === 'move' && action.path) {
            movePlayer(action.path);
            if (!aiControl[playerId]) {  // Only log manual moves
                addLog(`Player ${playerId + 1} moves to (${action.x}, ${action.y})`);
            }
        } else if (action.type === 'cast' && action.spell) {
            castSpell(action.x, action.y);
            if (!aiControl[playerId]) {  // Only log manual spells
                addLog(`Player ${playerId + 1} casts a spell at (${action.x}, ${action.y})`);
            }
        }
    }, [movePlayer, castSpell, aiControl, addLog]);

    const { handleEndTurn, triggerAIMove } = useTurnManagement(
        gameState,
        setGameState,
        aiControl,
        handlePlayerAction,
        addLog  // Pass addLog to useTurnManagement
    );

    // Effect to trigger AI move when it's AI's turn
    useEffect(() => {
        const currentPlayerId = gameState.currentPlayer;
        if (aiControl[currentPlayerId]) {
            triggerAIMove(currentPlayerId);
        }
    }, [gameState.currentPlayer, aiControl, triggerAIMove]);

    const handleAIToggle = useCallback((playerId) => {
        setAiControl(prev => {
            const newAiControl = {
                ...prev,
                [playerId]: !prev[playerId]
            };
            return newAiControl;
        });
        const isEnabling = !aiControl[playerId];
        addLog(
            `${isEnabling ? 'Enabled' : 'Disabled'} AI for player ${playerId + 1}`,
            'ai'
        );
    }, [aiControl, addLog]);

    const handleCellClick = useCallback((x, y) => {
        const currentPlayer = gameState.currentPlayer;
        
        if (aiControl[currentPlayer]) {
            addLog('Manual control disabled - AI is in control', 'error');
            return;
        }

        if (gameState.selectedSpell) {
            castSpell(x, y);
        } else {
            movePlayer(gameState.path);
        }
    }, [gameState.selectedSpell, gameState.path, gameState.currentPlayer, aiControl, castSpell, movePlayer, addLog]);

    const handleCellHover = useCallback((x, y) => {
        if (!aiControl[gameState.currentPlayer]) {
            setHoveredCell({ x, y });
        }
    }, [setHoveredCell, aiControl, gameState.currentPlayer]);

    const handleCellLeave = useCallback(() => {
        if (!aiControl[gameState.currentPlayer]) {
            setHoveredCell(null);
        }
    }, [setHoveredCell, aiControl, gameState.currentPlayer]);

    const handleSpellSelect = useCallback((spell) => {
        selectSpell(spell);
    }, [selectSpell]);

    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
            <ErrorBoundary>
                <div className="flex gap-8 items-start relative">
                    <ErrorBoundary>
                        <div className="relative">
                            <PlayerInfo
                                player={gameState.players[0]}
                                isActive={gameState.currentPlayer === 0 && !gameState.winner}
                                onSpellSelect={handleSpellSelect}
                                onEndTurn={handleEndTurn}
                                disabled={gameState.winner !== null}
                                isAIControlled={aiControl[0]}
                                onAIToggle={handleAIToggle}
                            />
                        </div>
                    </ErrorBoundary>
                    
                    <ErrorBoundary>
                        <div className="flex flex-col items-center">
                            <GameBoard
                                board={gameState.board}
                                players={gameState.players}
                                currentPlayer={gameState.currentPlayer}
                                selectedSpell={gameState.selectedSpell}
                                path={gameState.path}
                                onCellClick={handleCellClick}
                                onCellHover={handleCellHover}
                                onCellLeave={handleCellLeave}
                                damageAnimation={gameState.damageAnimation}
                            />
                            
                            {!gameState.winner && (
                                <div className="mt-4 w-full max-w-md">
                                    <TurnTimer timeLeft={gameState.timeLeft} />
                                </div>
                            )}
                        </div>
                    </ErrorBoundary>
                    
                    <ErrorBoundary>
                        <div className="relative">
                            <PlayerInfo
                                player={gameState.players[1]}
                                isActive={gameState.currentPlayer === 1 && !gameState.winner}
                                onSpellSelect={handleSpellSelect}
                                onEndTurn={handleEndTurn}
                                disabled={gameState.winner !== null}
                                isAIControlled={aiControl[1]}
                                onAIToggle={handleAIToggle}
                            />
                        </div>
                    </ErrorBoundary>

                    <ErrorBoundary>
                        <div className="absolute right-0 top-0 transform translate-x-full ml-4">
                            <LogPanel logs={logs} />
                        </div>
                    </ErrorBoundary>

                    {gameState.winner !== null && (
                        <VictoryScreen winner={gameState.players[gameState.winner]} />
                    )}
                </div>
            </ErrorBoundary>
        </div>
    );
};

export default Game;