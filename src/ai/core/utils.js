export function isValidPosition(x, y) {
    return x >= 0 && x < 10 && y >= 0 && y < 10;
}

export function calculateDistance(pos1, pos2) {
    return Math.abs(pos1.x - pos2.x) + Math.abs(pos1.y - pos2.y);
}

export function isGameOver(state) {
    return state.players.some(p => p.hp <= 0);
}

export function countNearbyCover(pos, board) {
    let cover = 0;
    const directions = [{x: 0, y: 1}, {x: 0, y: -1}, {x: 1, y: 0}, {x: -1, y: 0}];

    for (const dir of directions) {
        const x = pos.x + dir.x;
        const y = pos.y + dir.y;
        if (isValidPosition(x, y) && board[y][x].obstacle) {
            cover++;
        }
    }

    return cover;
}

export function evaluateMobilityOptions(pos, board) {
    let mobility = 0;
    const directions = [{x: 0, y: 1}, {x: 0, y: -1}, {x: 1, y: 0}, {x: -1, y: 0}];

    for (const dir of directions) {
        const x = pos.x + dir.x;
        const y = pos.y + dir.y;
        if (isValidPosition(x, y) && !board[y][x].obstacle) {
            mobility++;
        }
    }

    return mobility * 2;  // Multiply by 2 to give it more weight
}