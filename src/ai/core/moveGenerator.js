import { isValidPosition } from './utils';

export function generateMovementOptions(startPos, pm, board) {
    const options = new Set();
    const queue = [{pos: startPos, steps: 0}];
    const visited = new Set();

    while (queue.length > 0) {
        const {pos, steps} = queue.shift();
        const key = `${pos.x},${pos.y}`;

        if (visited.has(key)) continue;
        visited.add(key);
        options.add(pos);

        if (steps >= pm) continue;

        // Check adjacent cells
        const directions = [{x: 0, y: 1}, {x: 0, y: -1}, {x: 1, y: 0}, {x: -1, y: 0}];
        for (const dir of directions) {
            const newX = pos.x + dir.x;
            const newY = pos.y + dir.y;

            if (isValidPosition(newX, newY) && !board[newY][newX].obstacle) {
                queue.push({
                    pos: {x: newX, y: newY},
                    steps: steps + 1
                });
            }
        }
    }

    return Array.from(options);
}

export function generateSpellTargets(spell, position, state, playerId) {
    const targets = [];
    const range = spell.range;

    // For each cell within range
    for (let x = 0; x < 10; x++) {
        for (let y = 0; y < 10; y++) {
            const distance = Math.abs(x - position.x) + Math.abs(y - position.y);
            if (distance <= range) {
                // Check if target is valid based on spell type
                if (spell.type === 'hit') {
                    // Check if enemy is there
                    const enemyThere = state.players.some(p => 
                        p.id !== playerId && 
                        p.position.x === x && 
                        p.position.y === y
                    );
                    if (enemyThere) targets.push({x, y});
                } else {
                    // For non-attack spells, target self position
                    if (x === position.x && y === position.y) {
                        targets.push({x, y});
                    }
                }
            }
        }
    }

    return targets;
}