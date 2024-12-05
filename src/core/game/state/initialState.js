import { BOARD_SIZE, INITIAL_STATS, OBSTACLE_CHANCE, CELL_TYPES } from '../../../utils/constants';
import { CLASSES } from '../../../utils/classes';

export const createInitialState = () => ({
  board: Array(BOARD_SIZE).fill().map(() =>
    Array(BOARD_SIZE).fill().map(() => ({
      type: Math.random() < OBSTACLE_CHANCE ? 
        (Math.random() < 0.5 ? CELL_TYPES.TREE : CELL_TYPES.ROCK) 
        : CELL_TYPES.EMPTY
    }))
  ),
  players: [
    { 
      id: 0,
      class: 'SWORD', 
      position: { x: 0, y: 0 }, 
      hp: INITIAL_STATS.hp, 
      pa: INITIAL_STATS.pa, 
      pm: INITIAL_STATS.pm,
      spells: CLASSES.SWORD.spells.map(spell => ({
        ...spell,
        usesLeft: spell.usesPerTurn,
        cooldownLeft: 0,
      })),
      activeBuffs: []
    },
    { 
      id: 1,
      class: 'ARCHER', 
      position: { x: 9, y: 9 }, 
      hp: INITIAL_STATS.hp, 
      pa: INITIAL_STATS.pa, 
      pm: INITIAL_STATS.pm,
      spells: CLASSES.ARCHER.spells.map(spell => ({
        ...spell,
        usesLeft: spell.usesPerTurn,
        cooldownLeft: 0,
      })),
      activeBuffs: []
    }
  ],
  currentPlayer: 0,
  selectedSpell: null,
  timeLeft: 60,
  winner: null,
  moving: false,
  path: [],
  hoveredCell: null,
  damageAnimation: null
});

// Initialize state and clear starting positions
const initialState = createInitialState();
initialState.board[0][0].type = CELL_TYPES.EMPTY;
initialState.board[9][9].type = CELL_TYPES.EMPTY;

export default initialState;