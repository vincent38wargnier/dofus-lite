export function evaluateAction(action, gameState, playerId) {
    const currentPlayer = gameState.players[playerId];
    const opponent = gameState.players.find(p => p.id !== playerId);

    switch (action.type) {
        case 'move': {
            // Evaluate movement based on:
            // 1. Distance to opponent (prefer being at optimal spell range)
            // 2. PM efficiency (prefer using all PM)
            const distanceToOpponent = Math.abs(action.x - opponent.position.x) + 
                                     Math.abs(action.y - opponent.position.y);
            
            const optimalRange = currentPlayer.spells.reduce((acc, spell) => 
                spell.type === 'hit' ? Math.max(acc, spell.range) : acc, 0);
            
            const positionScore = 1 - Math.abs(distanceToOpponent - optimalRange) / 10;
            const pmEfficiencyScore = action.pmCost / currentPlayer.pm;

            return positionScore * 0.7 + pmEfficiencyScore * 0.3;
        }

        case 'cast': {
            // Evaluate spell cast based on:
            // 1. For attacks: damage and target HP ratio
            // 2. For heals: healing efficiency (don't overheal)
            const spell = currentPlayer.spells.find(s => s.id === action.spell);
            
            if (spell.type === 'hit') {
                const damageScore = spell.damage / opponent.hp;
                return 0.5 + damageScore; // Prioritize damage over movement
            }
            
            if (spell.type === 'heal') {
                const missingHealth = 100 - currentPlayer.hp;
                const healingEfficiency = Math.min(spell.healing, missingHealth) / spell.healing;
                return 0.3 + healingEfficiency; // Lower priority than damage
            }

            return 0.1; // Other spell types
        }

        case 'end_turn': {
            // Only end turn if no other good actions
            return 0.01;
        }

        default:
            return 0;
    }
}