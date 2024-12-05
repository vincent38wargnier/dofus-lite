class PlayerController {
    constructor(player, board) {
        this.player = player;
        this.board = board;
    }

    // Movement interface
    async move(targetX, targetY) {
        const position = this.board.getPlayerPosition(this.player.id);
        if (!position) return false;

        const path = this.board.getPathTo(
            position.x, 
            position.y, 
            targetX, 
            targetY, 
            this.player.pm
        );

        if (!path) return false;

        const distance = path.length - 1;
        if (!this.player.canMove(distance)) return false;

        // Execute move
        if (this.player.move(distance)) {
            return this.board.setPlayerPosition(this.player.id, targetX, targetY);
        }

        return false;
    }

    // Spell casting interface
    async castSpell(spell, targetX, targetY) {
        if (!this.player.canCastSpell(spell)) return false;

        const position = this.board.getPlayerPosition(this.player.id);
        if (!position) return false;

        // Calculate distance to target
        const dx = Math.abs(targetX - position.x);
        const dy = Math.abs(targetY - position.y);
        const distance = dx + dy;

        if (distance > spell.range) return false;

        // Get target cell information
        const targetCell = this.board.getCell(targetX, targetY);
        if (!targetCell) return false;

        // Execute spell
        return this.player.castSpell(spell);
    }

    // State management
    endTurn() {
        this.player.resetTurnResources();
        this.player.updateBuffs();
    }

    // Information getters
    getPosition() {
        return this.board.getPlayerPosition(this.player.id);
    }

    getStats() {
        return {
            hp: this.player.hp,
            pa: this.player.pa,
            pm: this.player.pm
        };
    }

    getSpells() {
        return this.player.spells;
    }

    getBuffs() {
        return this.player.activeBuffs;
    }

    // Validation methods
    canReachPosition(x, y) {
        const position = this.getPosition();
        if (!position) return false;

        const path = this.board.getPathTo(
            position.x,
            position.y,
            x,
            y,
            this.player.pm
        );

        return path !== null && this.player.canMove(path.length - 1);
    }

    isSpellInRange(spell, targetX, targetY) {
        const position = this.getPosition();
        if (!position) return false;

        const distance = Math.abs(targetX - position.x) + Math.abs(targetY - position.y);
        return distance <= spell.range;
    }
}

export default PlayerController;