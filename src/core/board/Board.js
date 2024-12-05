import { BOARD_SIZE, CELL_TYPES, OBSTACLE_CHANCE } from '../../utils/constants';

export default class Board {
    constructor() {
        // Initialize empty grid
        this.grid = Array(BOARD_SIZE).fill().map(() =>
            Array(BOARD_SIZE).fill().map(() => ({
                type: Math.random() < OBSTACLE_CHANCE ? 
                    (Math.random() < 0.5 ? CELL_TYPES.TREE : CELL_TYPES.ROCK) 
                    : CELL_TYPES.EMPTY,
                occupiedBy: null
            }))
        );
        this.players = new Map(); // Map of playerId -> position
    }

    registerPlayer(playerId, characterClass, spells, startPosition) {
        if (this.players.has(playerId)) {
            return { success: false, message: 'Player already registered' };
        }

        const {x, y} = startPosition;
        if (!this.isValidPosition(x, y)) {
            return { success: false, message: 'Invalid start position' };
        }

        // Clear cell for player
        this.grid[y][x] = {
            type: CELL_TYPES.EMPTY,
            occupiedBy: playerId
        };

        this.players.set(playerId, {
            position: startPosition,
            class: characterClass,
            spells: spells
        });

        return { success: true };
    }

    validateMove(playerId, targetX, targetY) {
        const player = this.players.get(playerId);
        if (!player) return { valid: false, message: 'Player not found' };

        if (!this.isValidPosition(targetX, targetY)) {
            return { valid: false, message: 'Invalid position' };
        }

        const targetCell = this.grid[targetY][targetX];
        if (targetCell.type !== CELL_TYPES.EMPTY || targetCell.occupiedBy) {
            return { valid: false, message: 'Cell is occupied' };
        }

        const path = this.findPath(player.position, {x: targetX, y: targetY});
        if (!path) {
            return { valid: false, message: 'No valid path' };
        }

        return { 
            valid: true, 
            path,
            pmCost: path.length - 1
        };
    }

    validateSpellCast(playerId, spellId, targetX, targetY) {
        const player = this.players.get(playerId);
        if (!player) return { valid: false, message: 'Player not found' };

        const spell = player.spells.find(s => s.id === spellId);
        if (!spell) return { valid: false, message: 'Spell not found' };

        if (!this.isValidPosition(targetX, targetY)) {
            return { valid: false, message: 'Invalid target position' };
        }

        const distance = Math.abs(targetX - player.position.x) + 
                        Math.abs(targetY - player.position.y);
        if (distance > spell.range) {
            return { valid: false, message: 'Target out of range' };
        }

        return { 
            valid: true,
            spell
        };
    }

    executeMove(playerId, targetX, targetY) {
        const validation = this.validateMove(playerId, targetX, targetY);
        if (!validation.valid) return validation;

        const player = this.players.get(playerId);
        const oldPos = player.position;

        // Clear old position
        this.grid[oldPos.y][oldPos.x].occupiedBy = null;

        // Set new position
        this.grid[targetY][targetX].occupiedBy = playerId;
        player.position = {x: targetX, y: targetY};

        return { success: true, path: validation.path };
    }

    executeSpell(playerId, spellId, targetX, targetY) {
        const validation = this.validateSpellCast(playerId, spellId, targetX, targetY);
        if (!validation.valid) return validation;

        // Spell effects would be handled here
        return { success: true };
    }

    isValidPosition(x, y) {
        return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE;
    }

    findPath(start, end) {
        const queue = [{pos: start, path: [start]}];
        const visited = new Set();

        while (queue.length > 0) {
            const {pos, path} = queue.shift();
            const key = `${pos.x},${pos.y}`;

            if (visited.has(key)) continue;
            visited.add(key);

            if (pos.x === end.x && pos.y === end.y) {
                return path;
            }

            // Check adjacent cells
            const directions = [{x: 0, y: 1}, {x: 0, y: -1}, {x: 1, y: 0}, {x: -1, y: 0}];
            for (const dir of directions) {
                const newX = pos.x + dir.x;
                const newY = pos.y + dir.y;

                if (this.isValidPosition(newX, newY) && 
                    this.grid[newY][newX].type === CELL_TYPES.EMPTY &&
                    !this.grid[newY][newX].occupiedBy) {
                    queue.push({
                        pos: {x: newX, y: newY},
                        path: [...path, {x: newX, y: newY}]
                    });
                }
            }
        }

        return null;
    }

    getGameState(playerId) {
        const player = this.players.get(playerId);
        if (!player) return null;

        return {
            board: this.grid.map(row => row.map(cell => ({...cell}))),
            player: {
                position: {...player.position},
                class: player.class,
                spells: player.spells.map(s => ({...s}))
            },
            opponents: Array.from(this.players.entries())
                .filter(([id]) => id !== playerId)
                .map(([id, p]) => ({
                    id,
                    position: {...p.position}
                }))
        };
    }
}