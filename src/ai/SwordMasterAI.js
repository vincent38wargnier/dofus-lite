export class SwordMasterAI {
    constructor() {
        this.initialized = false;
        this.gameState = null;
        this.myId = null;
    }

    initialize(gameState, playerId) {
        console.log('AI initialized for player', playerId, 'with state:', gameState);
        this.gameState = gameState;
        this.myId = playerId;
        this.initialized = true;
    }

    // Get the enemy player
    getEnemy() {
        return this.gameState.players.find(p => p.id !== this.myId);
    }

    // Get my player
    getMyPlayer() {
        return this.gameState.players.find(p => p.id === this.myId);
    }

    // Calculate Manhattan distance between two positions
    calculateDistance(pos1, pos2) {
        return Math.abs(pos1.x - pos2.x) + Math.abs(pos1.y - pos2.y);
    }

    // Check if a position is within attack range
    isWithinAttackRange(myPos, targetPos, range) {
        return this.calculateDistance(myPos, targetPos) <= range;
    }

    // Main decision-making function
    async makeDecision() {
        console.log('AI making decision...');
        if (!this.initialized) {
            throw new Error('AI not initialized');
        }

        const myPlayer = this.getMyPlayer();
        const enemy = this.getEnemy();

        console.log('My player:', myPlayer);
        console.log('Enemy:', enemy);

        // Simple test action: if we have any spell, try to use it
        if (myPlayer.spells && myPlayer.spells.length > 0) {
            const attackSpell = myPlayer.spells.find(s => s.type === 'hit');
            if (attackSpell) {
                console.log('AI decided to attack');
                return {
                    type: 'cast',
                    spell: attackSpell,
                    target: enemy.position
                };
            }
        }

        // If no spell available, end turn
        console.log('AI ending turn');
        return {
            type: 'end_turn'
        };
    }
}