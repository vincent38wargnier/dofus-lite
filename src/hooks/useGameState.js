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

const handleSpellCast = (state, spell, x, y, currentPlayer, targetPlayer) => {
  let updatedPlayers = [...state.players];
  let damageAnimation = null;

  // Check if spell has uses left and is not on cooldown
  const spellState = currentPlayer.spells.find(s => s.id === spell.id);
  if (spellState.usesLeft <= 0 || spellState.cooldownLeft > 0) {
    return null;
  }

  switch (spell.type) {
    case 'hit': {
      if (targetPlayer && targetPlayer.id !== currentPlayer.id) {
        const finalDamage = spell.damage;
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
          value: spell.healing,
          type: 'heal'
        };

        updatedPlayers = state.players.map(player =>
          player.id === currentPlayer.id
            ? { ...player, hp: Math.min(100, player.hp + spell.healing) }
            : player
        );
      }
      break;
    }

    case 'boostPa':
    case 'boostPm': {
      const buffType = spell.type === 'boostPa' ? 'pa' : 'pm';
      damageAnimation = {
        playerId: currentPlayer.id,
        position: currentPlayer.position,
        value: spell.boost,
        type: spell.type
      };

      const newBuff = {
        spellId: spell.id,
        type: buffType,
        value: spell.boost,
        turnsLeft: spell.duration
      };

      updatedPlayers = state.players.map(player =>
        player.id === currentPlayer.id
          ? {
              ...player,
              activeBuffs: [...player.activeBuffs, newBuff],
              [buffType]: player[buffType] + spell.boost
            }
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

    default:
      return null;
  }

  if (updatedPlayers === null) return null;

  // Update spell uses and cooldown
  updatedPlayers = updatedPlayers.map(player => 
    player.id === currentPlayer.id
      ? {
          ...player,
          spells: player.spells.map(s =>
            s.id === spell.id
              ? { 
                  ...s, 
                  usesLeft: s.usesLeft - 1,
                  cooldownLeft: s.cooldown || 0
                }
              : s
          )
        }
      : player
  );

  return { updatedPlayers, damageAnimation };
};

const updateBuffsAndCooldowns = (players, nextPlayer) => {
  return players.map(player => {
    // Reduce buff durations and remove expired buffs
    const updatedBuffs = player.activeBuffs.filter(buff => buff.turnsLeft > 1)
      .map(buff => ({ ...buff, turnsLeft: buff.turnsLeft - 1 }));
    
    // Remove expired buff effects
    const removedBuffs = player.activeBuffs.filter(buff => buff.turnsLeft <= 1);
    let updatedStats = { ...player };
    removedBuffs.forEach(buff => {
      updatedStats[buff.type] -= buff.value;
    });

    // Reduce cooldowns
    const updatedSpells = player.spells.map(spell => ({
      ...spell,
      cooldownLeft: Math.max(0, spell.cooldownLeft - 1),
      usesLeft: player.id === nextPlayer ? spell.usesPerTurn : spell.usesLeft
    }));

    return {
      ...updatedStats,
      activeBuffs: updatedBuffs,
      spells: updatedSpells
    };
  });
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

      if (distance > state.selectedSpell.range || currentPlayer.pa < state.selectedSpell.pa) {
        return {
          ...state,
          selectedSpell: null
        };
      }

      const result = handleSpellCast(state, state.selectedSpell, x, y, currentPlayer, targetPlayer);
      if (!result) return state;

      const { updatedPlayers, damageAnimation } = result;

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
        damageAnimation,
        winner
      };
    }

    case 'END_TURN': {
      const nextPlayer = (state.currentPlayer + 1) % 2;
      const updatedPlayers = updateBuffsAndCooldowns(state.players, nextPlayer);

      return {
        ...state,
        currentPlayer: nextPlayer,
        timeLeft: 60,
        selectedSpell: null,
        path: [],
        moving: false,
        damageAnimation: null,
        players: updatedPlayers.map(p =>
          p.id === nextPlayer
            ? { ...p, pa: INITIAL_STATS.pa + p.activeBuffs.reduce((acc, buff) => buff.type === 'pa' ? acc + buff.value : acc, 0),
                   pm: INITIAL_STATS.pm + p.activeBuffs.reduce((acc, buff) => buff.type === 'pm' ? acc + buff.value : acc, 0) }
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