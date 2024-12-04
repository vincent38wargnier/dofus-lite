import { findPath } from './pathfinding';
import { generateMovementOptions, generateSpellTargets } from './moveGenerator';

export function generatePossibleActions(node, isMaximizing, playerId) {
    const actions = [];
    const state = node.state;
    const player = isMaximizing ? 
        state.players[playerId] : 
        state.players[1 - playerId];

    try {
        // Only generate actions if we have resources left
        if (node.remainingPa > 0 || node.remainingPm > 0) {
            // 1. Generate movement options if PM available
            if (node.remainingPm > 0) {
                const movementOptions = generateMovementOptions(player.position, node.remainingPm, state.board);
                for (const movePos of movementOptions) {
                    const path = findPath(player.position, movePos, state.board, node.remainingPm);
                    if (path && path.length > 1) {  // Only add if path exists and is not current position
                        actions.push({
                            type: 'move',
                            path: path
                        });
                    }
                }
            }

            // 2. Generate spell casts if PA available
            if (node.remainingPa > 0) {
                for (const spell of player.spells) {
                    if (spell.cooldownLeft === 0 && spell.usesLeft > 0 && node.remainingPa >= spell.pa) {
                        const targets = generateSpellTargets(spell, player.position, state, playerId);
                        for (const target of targets) {
                            actions.push({
                                type: 'cast',
                                spell: spell,
                                target: target
                            });
                        }
                    }
                }
            }
        }

        // Always include end turn option
        actions.push({ type: 'end_turn' });

        console.log('Generated actions:', actions);
        return actions;

    } catch (error) {
        console.error('Error generating actions:', error);
        return [{ type: 'end_turn' }];
    }
}