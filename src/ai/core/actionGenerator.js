import { findPath } from '../../utils/pathfinding';
import { BOARD_SIZE, CELL_TYPES } from '../../utils/constants';

export function generateActions(gameState, playerId) {
    const actions = [];
    const currentPlayer = gameState.players[playerId];
    const board = gameState.board;

    // Generate move actions
    if (currentPlayer.pm > 0) {
        for (let x = 0; x < BOARD_SIZE; x++) {
            for (let y = 0; y < BOARD_SIZE; y++) {
                // Check if cell is empty and within PM range
                if (board[y][x].type === CELL_TYPES.EMPTY) {
                    const path = findPath(
                        currentPlayer.position,
                        { x, y },
                        board,
                        currentPlayer.pm
                    );
                    if (path) {
                        actions.push({
                            type: 'move',
                            x, y,
                            pmCost: path.length - 1,
                            path
                        });
                    }
                }
            }
        }
    }

    // Generate spell actions
    if (currentPlayer.pa > 0) {
        for (const spell of currentPlayer.spells) {
            // Skip if spell is on cooldown or no uses left
            if (spell.cooldownLeft > 0 || spell.usesLeft <= 0 || spell.pa > currentPlayer.pa) {
                continue;
            }

            for (let x = 0; x < BOARD_SIZE; x++) {
                for (let y = 0; y < BOARD_SIZE; y++) {
                    const distance = Math.abs(x - currentPlayer.position.x) + 
                                   Math.abs(y - currentPlayer.position.y);
                    
                    if (distance <= spell.range) {
                        // For healing spells, only target self
                        if (spell.type === 'heal') {
                            if (x === currentPlayer.position.x && y === currentPlayer.position.y) {
                                actions.push({
                                    type: 'cast',
                                    spell: spell.id,
                                    x, y
                                });
                            }
                        }
                        // For attack spells, only target enemies
                        else if (spell.type === 'hit') {
                            const targetPlayer = gameState.players.find(p => 
                                p.position.x === x && p.position.y === y && p.id !== playerId
                            );
                            if (targetPlayer) {
                                actions.push({
                                    type: 'cast',
                                    spell: spell.id,
                                    x, y
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    // Always add end turn
    actions.push({ type: 'end_turn' });

    return actions;
}