import { useReducer, useEffect } from 'react';
import { BOARD_SIZE, INITIAL_STATS, OBSTACLE_CHANCE, CELL_TYPES } from '../utils/constants';

const initialState = {
  board: Array(BOARD_SIZE).fill().map(() =>
    Array(BOARD_SIZE).fill().map(() => ({
      type: Math.random() < OBSTACLE_CHANCE ? 
        (Math.random() < 0.5 ? CELL_TYPES.TREE : CELL_TYPES.ROCK) 
        : CELL_TYPES.EMPTY
    }))
  ),
  players: [
    { id: 0, position: { x: 0, y: 0 }, ...INITIAL_STATS },
    { id: 1, position: { x: 9, y: 9 }, ...INITIAL_STATS }
  ],
  currentPlayer: 0,
  selectedSpell: null,
  timeLeft: 60,
  winner: null
};

// Clear starting positions
initialState.board[0][0].type = CELL_TYPES.EMPTY;
initialState.board[9][9].type = CELL_TYPES.EMPTY;

const reducer = (state, action) => {
  switch (action.type) {
    case 'MOVE_PLAYER': {
      const { x, y } = action.payload;
      const currentPlayer = state.players[state.currentPlayer];
      
      // Calculate distance
      const distance = Math.abs(x - currentPlayer.position.x) + Math.abs(y - currentPlayer.position.y);
      
      // Check if move is valid
      if (distance > currentPlayer.pm || state.board[y][x].type !== CELL_TYPES.EMPTY) {
        return state;
      }

      // Update player position and PM
      const updatedPlayers = state.players.map((player, index) =>
        index === state.currentPlayer
          ? { ...player, position: { x, y }, pm: player.pm - distance }
          : player
      );

      return {
        ...state,
        players: updatedPlayers
      };
    }

    case 'SELECT_SPELL': {
      return {
        ...state,
        selectedSpell: action.payload
      };
    }

    case 'CAST_SPELL': {
      if (!state.selectedSpell) return state;

      const { x, y } = action.payload;
      const currentPlayer = state.players[state.currentPlayer];
      const targetPlayer = state.players.find(p => 
        p.position.x === x && p.position.y === y
      );

      // Calculate distance
      const distance = Math.abs(x - currentPlayer.position.x) + 
                      Math.abs(y - currentPlayer.position.y);

      // Check if target is in range
      if (distance > state.selectedSpell.range) {
        return state;
      }

      // Check if player has enough PA
      if (currentPlayer.pa < state.selectedSpell.pa) {
        return state;
      }

      let updatedPlayers = [...state.players];

      if (state.selectedSpell.id === 'attack' && targetPlayer && targetPlayer.id !== currentPlayer.id) {
        // Apply damage
        updatedPlayers = state.players.map(player =>
          player.id === targetPlayer.id
            ? { ...player, hp: Math.max(0, player.hp - state.selectedSpell.damage) }
            : player
        );
      } else if (state.selectedSpell.id === 'heal' && targetPlayer && targetPlayer.id === currentPlayer.id) {
        // Apply healing
        updatedPlayers = state.players.map(player =>
          player.id === currentPlayer.id
            ? { ...player, hp: Math.min(100, player.hp + state.selectedSpell.healing) }
            : player
        );
      } else {
        return state;
      }

      // Check for winner
      const winner = updatedPlayers.find(p => p.hp <= 0) 
        ? updatedPlayers.find(p => p.hp > 0).id 
        : null;

      return {
        ...state,
        players: updatedPlayers.map(p =>
          p.id === currentPlayer.id
            ? { ...p, pa: p.pa - state.selectedSpell.pa }
            : p
        ),
        selectedSpell: null,
        winner
      };
    }

    case 'END_TURN': {
      const nextPlayer = (state.currentPlayer + 1) % 2;
      return {
        ...state,
        currentPlayer: nextPlayer,
        timeLeft: 60,
        selectedSpell: null,
        players: state.players.map(p =>
          p.id === nextPlayer
            ? { ...p, pa: 6, pm: 3 }
            : p
        )
      };
    }

    case 'TICK_TIMER': {
      if (state.timeLeft <= 0) {
        return reducer(state, { type: 'END_TURN' });
      }
      return {
        ...state,
        timeLeft: state.timeLeft - 1
      };
    }

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