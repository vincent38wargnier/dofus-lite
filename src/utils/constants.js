export const BOARD_SIZE = 10;
export const OBSTACLE_CHANCE = 0.1;

export const INITIAL_STATS = {
  HP: 100,
  PA: 6,
  PM: 3,
};

export const TURN_DURATION = 60;

export const SPELLS = {
  ATTACK: {
    id: 'attack',
    name: '⚔️ Attack',
    pa: 4,
    damage: 20,
    range: 3,
    emoji: '⚔️',
  },
  HEAL: {
    id: 'heal',
    name: '💚 Heal',
    pa: 3,
    healing: 15,
    range: 1,
    emoji: '💚',
  },
};

export const CELL_TYPES = {
  EMPTY: 'empty',
  TREE: 'tree',
  ROCK: 'rock',
};

export const PLAYER_ICONS = {
  PLAYER_1: '🗡️',
  PLAYER_2: '🏹',
};