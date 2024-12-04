export function applyAction(node, action, isMaximizing, playerId) {
    const newState = cloneGameState(node.state);
    const player = isMaximizing ? 
        newState.players[playerId] : 
        newState.players[1 - playerId];

    let newPa = node.remainingPa;
    let newPm = node.remainingPm;

    switch (action.type) {
        case 'move': {
            const distance = action.path.length - 1;
            player.position = action.path[action.path.length - 1];
            newPm -= distance;
            break;
        }
        case 'cast': {
            player.pa -= action.spell.pa;
            newPa -= action.spell.pa;
            
            if (action.spell.type === 'hit') {
                const target = newState.players.find(p => 
                    p.id !== player.id &&
                    p.position.x === action.target.x &&
                    p.position.y === action.target.y
                );
                if (target) target.hp -= action.spell.damage;
            }
            
            // Update spell cooldown and uses
            const spell = player.spells.find(s => s.id === action.spell.id);
            spell.cooldownLeft = spell.cooldown;
            spell.usesLeft--;
            break;
        }
        case 'end_turn': {
            newPa = 6;  // Reset for next turn
            newPm = 3;  // Reset for next turn
            // Reset cooldowns
            player.spells.forEach(spell => {
                if (spell.cooldownLeft > 0) spell.cooldownLeft--;
                spell.usesLeft = spell.usesPerTurn;
            });
            break;
        }
    }

    return {
        state: newState,
        remainingPa: newPa,
        remainingPm: newPm,
        depth: node.depth + 1,
        parent: node,
        action: action
    };
}

export function cloneGameState(state) {
    return JSON.parse(JSON.stringify(state));
}