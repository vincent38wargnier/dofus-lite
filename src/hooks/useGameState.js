import { useReducer, useEffect } from 'react';
import { BOARD_SIZE, INITIAL_STATS, OBSTACLE_CHANCE, CELL_TYPES } from '../utils/constants';
import { CLASSES } from '../utils/classes';

// Initial game state
const createInitialState = () => ({
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
      spells: CLASSES.SWORD.spells
    },
    { 
      id: 1,
      class: 'ARCHER', 
      position: { x: 9, y: 9 }, 
      hp: INITIAL_STATS.hp, 
      pa: INITIAL_STATS.pa, 
      pm: INITIAL_STATS.pm,
      spells: CLASSES.ARCHER.spells
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

const findPath = (start, end, board, maxDistance) => {
  if (!start || !end) return null;
  
  const queue = [{ pos: start, path: [start], cost: 0 }];
  const visited = new Set();

  while (queue.length > 0) {
    const { pos, path, cost } = queue.shift();
    const key = `${pos.x},${pos.y}`;

    if (visited.has(key)) continue;
    visited.add(key);

    if (pos.x === end.x && pos.y === end.y) {
      return path;
    }

    if (cost >= maxDistance) continue;

    const directions = [
      { x: 1, y: 0 }, { x: -1, y: 0 },
      { x: 0, y: 1 }, { x: 0, y: -1 }
    ];

    for (const dir of directions) {
      const newX = pos.x + dir.x;
      const newY = pos.y + dir.y;

      if (
        newX >= 0 && newX < BOARD_SIZE &&
        newY >= 0 && newY < BOARD_SIZE &&
        board[newY][newX].type === CELL_TYPES.EMPTY
      ) {
        queue.push({
          pos: { x: newX, y: newY },
          path: [...path, { x: newX, y: newY }],
          cost: cost + 1
        });
      }
    }
  }

  return null;
};

const gameReducer = (state, action) => {
  switch (action.type) {
    case 'SET_HOVERED_CELL': {
      if (state.moving || state.selectedSpell) return state;
      
      const currentPlayer = state.players[state.currentPlayer];
      const path = findPath(
        currentPlayer.position,
        action.payload,
        state.board,
        currentPlayer.pm
      );

      return {
        ...state,
        hoveredCell: action.payload,
        path: path || []
      };
    }

    case 'MOVE_PLAYER': {
      if (state.selectedSpell || state.moving) return state;

      const { path } = action.payload;
      if (!path || path.length === 0) return state;

      const distance = path.length - 1;
      const currentPlayer = state.players[state.currentPlayer];
      
      if (distance > currentPlayer.pm) return state;

      return {
        ...state,
        moving: true,
        path
      };
    }

    case 'UPDATE_POSITION': {
      const { position } = action.payload;
      return {
        ...state,
        players: state.players.map((player, index) =>
          index === state.currentPlayer
            ? { ...player, position }
            : player
        )
      };
    }

    case 'FINISH_MOVE': {
      const currentPlayer = state.players[state.currentPlayer];
      const distance = state.path.length - 1;

      return {
        ...state,
        moving: false,
        path: [],
        players: state.players.map((player, index) =>
          index === state.currentPlayer
            ? { ...player, pm: player.pm - distance }
            : player
        )
      };
    }

    case 'SELECT_SPELL': {
      return {
        ...state,
        selectedSpell: action.payload,
        path: []
      };
    }

    case 'CAST_SPELL': {
      if (!state.selectedSpell) return state;

      const { x, y } = action.payload;
      const currentPlayer = state.players[state.currentPlayer];
      const targetPlayer = state.players.find(p => 
        p.position.x === x && p.position.y === y
      );

      const distance = Math.abs(x - currentPlayer.position.x) + 
                      Math.abs(y - currentPlayer.position.y);

      if (distance > state.selectedSpell.range) {
        return {
          ...state,
          selectedSpell: null
        };
      }

      if (currentPlayer.pa < state.selectedSpell.pa) {
        return state;
      }

      let updatedPlayers = [...state.players];
      let damageAnimation = null;

      switch (state.selectedSpell.type) {
        case 'hit': {
          if (targetPlayer && targetPlayer.id !== currentPlayer.id) {
            const finalDamage = state.selectedSpell.damage;
            damageAnimation = {
              playerId: targetPlayer.id,
              position: targetPlayer.position,
              value: finalDamage,
              type: 'damage'
            };

            updatedPlayers = state.players.map(player =>
              player.id === targetPlayer.id
                ? { ...player, hp: Math.max(0, player.hp - finalDamage) }
                : player
            );
          }
          break;
        }

        case 'heal': {
          if (!targetPlayer || targetPlayer.id === currentPlayer.id) {
            damageAnimation = {
              playerId: currentPlayer.id,
              position: currentPlayer.position,
              value: state.selectedSpell.healing,
              type: 'heal'
            };

            updatedPlayers = state.players.map(player =>
              player.id === currentPlayer.id
                ? { ...player, hp: Math.min(100, player.hp + state.selectedSpell.healing) }
                : player
            );
          }
          break;
        }

        case 'boostPa': {
          damageAnimation = {
            playerId: currentPlayer.id,
            position: currentPlayer.position,
            value: state.selectedSpell.boost,
            type: 'boostPa'
          };

          updatedPlayers = state.players.map(player =>
              player.id === currentPlayer.id
                ? { ...player, pa: player.pa + state.selectedSpell.boost }
                : player
          );
          break;
        }

        case 'boostPm': {
          damageAnimation = {
            playerId: currentPlayer.id,
            position: currentPlayer.position,
            value: state.selectedSpell.boost,
            type: 'boostPm'
          };

          updatedPlayers = state.players.map(player =>
              player.id === currentPlayer.id
                ? { ...player, pm: player.pm + state.selectedSpell.boost }
                : player
          );
          break;
        }

        case 'teleport': {
          if (state.board[y][x].type === CELL_TYPES.EMPTY && !targetPlayer) {
            updatedPlayers = state.players.map(player =>
              player.id === currentPlayer.id
                ? { ...player, position: { x, y } }
                : player
            );
          }
          break;
        }
      }

      return {
        ...state,
        players: updatedPlayers.map(p =>
          p.id === currentPlayer.id
            ? { ...p, pa: p.pa - state.selectedSpell.pa }
            : p
        ),
        selectedSpell: null,
        damageAnimation
      };
    }

    case 'CLEAR_ANIMATION': {
      return {
        ...state,
        damageAnimation: null
      };
    }

    case 'END_TURN': {
      const nextPlayer = (state.currentPlayer + 1) % 2;
      return {
        ...state,
        currentPlayer: nextPlayer,
        timeLeft: 60,
        selectedSpell: null,
        path: [],
        moving: false,
        damageAnimation: null,
        players: state.players.map(p =>
          p.id === nextPlayer
            ? { ...p, pa: INITIAL_STATS.pa, pm: INITIAL_STATS.pm }
            : p
        )
      };
    }

    case 'TICK_TIMER': {
      if (state.timeLeft <= 0) {
        return gameReducer(state, { type: 'END_TURN' });
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

const useGameState = () => {
  const [state, dispatch] = useReducer(gameReducer, initialState);

  useEffect(() => {
    const timer = setInterval(() => {
      dispatch({ type: 'TICK_TIMER' });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (state.damageAnimation) {
      const timer = setTimeout(() => {
        dispatch({ type: 'CLEAR_ANIMATION' });
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [state.damageAnimation]);

  const handleMove = (path) => {
    if (!path || path.length === 0) return;
    
    dispatch({ type: 'MOVE_PLAYER', payload: { path } });

    let currentIndex = 0;
    const interval = setInterval(() => {
      if (currentIndex < path.length) {
        dispatch({ 
          type: 'UPDATE_POSITION',
          payload: { position: path[currentIndex] }
        });
        currentIndex++;
      } else {
        clearInterval(interval);
        dispatch({ type: 'FINISH_MOVE' });
      }
    }, 150);
  };

  return {
    gameState: state,
    movePlayer: handleMove,
    setHoveredCell: (cell) => dispatch({ type: 'SET_HOVERED_CELL', payload: cell }),
    castSpell: (x, y) => dispatch({ type: 'CAST_SPELL', payload: { x, y } }),
    selectSpell: (spell) => dispatch({ type: 'SELECT_SPELL', payload: spell }),
    endTurn: () => dispatch({ type: 'END_TURN' })
  };
};

export default useGameState;