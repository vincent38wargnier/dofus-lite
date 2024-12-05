import { INITIAL_STATS } from '../../../utils/constants';
import { findPath } from '../../../utils/pathfinding';
import { handleSpellCast } from '../combat/spellCasting';
import { updateBuffsAndCooldowns } from '../combat/buffManagement';

export const gameReducer = (state, action) => {
  switch (action.type) {
    case 'SET_STATE': {
      return {
        ...state,
        ...action.payload
      };
    }

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

    case 'CLEAR_ANIMATION': {
      return {
        ...state,
        damageAnimation: null
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