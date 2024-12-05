import { useCallback } from 'react';
import { AIController } from '../ai/interface/AIController';

const MOVE_DELAY = 1000;  // 1 second delay between AI actions

export function useTurnManagement(gameState, setGameState, aiControl, handlePlayerAction, addLog) {
    const handleEndTurn = useCallback(() => {
        setGameState(prev => {
            const nextPlayer = prev.currentPlayer === 0 ? 1 : 0;
            
            // If next player is AI-controlled, trigger AI move after a delay
            if (aiControl[nextPlayer]) {
                setTimeout(() => {
                    const ai = new AIController(nextPlayer, prev);
                    ai.makeMove().then(action => {
                        if (action) {
                            handlePlayerAction(nextPlayer, action);
                            // Log AI action
                            addLog(`AI ${nextPlayer + 1} ${getActionDescription(action)}`, 'ai');
                        }
                    });
                }, MOVE_DELAY);
            }

            return {
                ...prev,
                currentPlayer: nextPlayer,
                selectedSpell: null,
                path: []
            };
        });
    }, [aiControl, handlePlayerAction, setGameState, addLog]);

    // Function to trigger AI move for current player
    const triggerAIMove = useCallback((playerId) => {
        if (aiControl[playerId]) {
            setTimeout(() => {
                const ai = new AIController(playerId, gameState);
                ai.makeMove().then(action => {
                    if (action) {
                        handlePlayerAction(playerId, action);
                        // Log AI action
                        addLog(`AI ${playerId + 1} ${getActionDescription(action)}`, 'ai');
                        
                        // If the action is not end_turn, trigger end turn after a delay
                        if (action.type !== 'end_turn') {
                            setTimeout(() => handleEndTurn(), MOVE_DELAY);
                        }
                    }
                });
            }, MOVE_DELAY);
        }
    }, [aiControl, gameState, handlePlayerAction, handleEndTurn, addLog]);

    return {
        handleEndTurn,
        triggerAIMove
    };
}

// Helper function to generate human-readable action descriptions
function getActionDescription(action) {
    switch (action.type) {
        case 'move':
            return `moves to position (${action.x}, ${action.y})`;
        case 'cast':
            return `casts spell at (${action.x}, ${action.y})`;
        case 'end_turn':
            return 'ends their turn';
        default:
            return 'performs an action';
    }
}