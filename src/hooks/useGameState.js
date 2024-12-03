import { useReducer, useEffect } from 'react';
import { BOARD_SIZE, INITIAL_STATS, OBSTACLE_CHANCE } from '../utils/constants';

const initialState = {
  board: Array(BOARD_SIZE).fill().map(() =>
    Array(BOARD_SIZE).fill().map(() => ({
      type: Math.random() < OBSTACLE_CHANCE ? 'tree' : 'empty'
    }))
  ),
  players: [
    { id: 0, position: { x: 0, y: 0 }, ...INITIAL_STATS },
    { id: 1, position: { x: 9, y: 9 }, ...INITIAL_STATS }
  ],
  currentPlayer: 0,
  selectedSpell: null,
  timeLeft: 60
};

const reducer = (state, action) => {
  switch (action.type) {
    case 'MOVE_PLAYER':
    case 'CAST_SPELL':
    case 'SELECT_SPELL':
    case 'END_TURN':
    case 'TICK_TIMER':
      // Implementation here
      return state;
    default:
      return state;
  }
};

export default function useGameState() {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    const timer = setInterval(() => {
      dispatch({ type: 'TICK_TIMER' });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return {
    gameState: state,
    movePlayer: (x, y) => dispatch({ type: 'MOVE_PLAYER', payload: { x, y } }),
    castSpell: (x, y) => dispatch({ type: 'CAST_SPELL', payload: { x, y } }),
    selectSpell: (spell) => dispatch({ type: 'SELECT_SPELL', payload: spell }),
    endTurn: () => dispatch({ type: 'END_TURN' })
  };
}