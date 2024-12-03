// Game Board Configuration
export const BOARD_SIZE = 10;
export const OBSTACLE_CHANCE = 0.1;

// Player Stats
export const INITIAL_STATS = {
  hp: 100,
  pa: 6,
  pm: 3,
};

// Game Settings
export const TURN_DURATION = 60; // seconds

// Spells
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

// Cell Types
export const CELL_TYPES = {
  EMPTY: 'empty',
  TREE: 'tree',
  ROCK: 'rock',
};

// Player Icons
export const PLAYER_ICONS = {
  PLAYER_1: '🗡️',
  PLAYER_2: '🏹',
};

// Obstacle Icons
export const OBSTACLE_ICONS = {
  TREE: '🌳',
  ROCK: '🪨',
};