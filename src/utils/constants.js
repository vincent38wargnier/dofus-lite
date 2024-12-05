export const BOARD_SIZE = 10;

export const CELL_TYPES = {
    EMPTY: 'empty',
    TREE: 'tree',
    ROCK: 'rock'
};

export const OBSTACLE_CHANCE = 0.2;

export const INITIAL_STATS = {
    hp: 100,
    pa: 6,
    pm: 3
};

export const TURN_DURATION = 60;

export const OBSTACLE_ICONS = {
    TREE: '🌳',
    ROCK: '🪨'
};

export const PLAYER_ICONS = {
    PLAYER_1: '⚔️',
    PLAYER_2: '🏹'
};

export const SPELLS = {
    SWORD_SLASH: {
        id: 'sword_slash',
        name: 'Sword Slash',
        type: 'hit',
        damage: 20,
        pa: 4,
        range: 1,
        cooldown: 0,
        usesPerTurn: 999
    },
    HEAL: {
        id: 'heal',
        name: 'Heal',
        type: 'heal',
        healing: 15,
        pa: 3,
        range: 0,
        cooldown: 3,
        usesPerTurn: 1
    },
    ARROW_SHOT: {
        id: 'arrow_shot',
        name: 'Arrow Shot',
        type: 'hit',
        damage: 15,
        pa: 3,
        range: 4,
        cooldown: 0,
        usesPerTurn: 999
    }
};

export const CHARACTER_CLASSES = {
    SWORD: {
        name: 'Sword Master',
        spells: [SPELLS.SWORD_SLASH, SPELLS.HEAL]
    },
    ARCHER: {
        name: 'Archer',
        spells: [SPELLS.ARROW_SHOT, SPELLS.HEAL]
    }
};