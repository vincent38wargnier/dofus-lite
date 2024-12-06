import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import BoardEngine from '../components/Board/BoardEngine';
import Player from '../components/Player/Player';
import { BOARD_CONFIG, GAME_STATUS, SORTS } from '../utils/constants';
import { calculateSortEffects, applyEffects } from '../utils/gameLogic';

const GameContext = createContext();

const initialState = {
  status: GAME_STATUS.ACTIVE,
  players: [],
  board: null,
  currentPlayer: null,
  turnNumber: 1,
  selectedAction: null,
  winner: null
};

function gameReducer(state, action) {
  switch (action.type) {
    case 'INITIALIZE_GAME':
      return {
        ...state,
        ...action.payload,
        status: GAME_STATUS.ACTIVE
      };
      
    case 'UPDATE_GAME_STATE':
      return {
        ...state,
        ...action.payload
      };

    case 'SELECT_ACTION':
      return {
        ...state,
        selectedAction: action.payload
      };

    case 'END_TURN':
      const currentPlayerIndex = state.players.indexOf(state.currentPlayer);
      const nextPlayerIndex = (currentPlayerIndex + 1) % state.players.length;
      
      return {
        ...state,
        currentPlayer: state.players[nextPlayerIndex],
        turnNumber: nextPlayerIndex === 0 ? state.turnNumber + 1 : state.turnNumber,
        selectedAction: null
      };

    case 'END_GAME':
      return {
        ...state,
        status: GAME_STATUS.ENDED,
        winner: action.payload,
        selectedAction: null
      };

    default:
      return state;
  }
}

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(gameReducer, initialState);

  useEffect(() => {
    initializeDefaultGame();
  }, []);

  const initializeDefaultGame = () => {
    const board = new BoardEngine(
      BOARD_CONFIG.DEFAULT_SIZE.columns,
      BOARD_CONFIG.DEFAULT_SIZE.rows
    );

    const players = [
      new Player('Mage', 'MAGE'),
      new Player('Warrior', 'WARRIOR')
    ];

    const startPositions = [
      { x: 0, y: Math.floor(board.height / 2) },
      { x: board.width - 1, y: Math.floor(board.height / 2) }
    ];

    players.forEach((player, index) => {
      board.placePlayer(player, startPositions[index].x, startPositions[index].y);
    });

    dispatch({
      type: 'INITIALIZE_GAME',
      payload: {
        board,
        players,
        currentPlayer: players[0]
      }
    });
  };

  const selectAction = useCallback((action) => {
    dispatch({
      type: 'SELECT_ACTION',
      payload: action
    });
  }, []);

  const castSort = useCallback(async (sort, target) => {
    const currentPlayer = state.currentPlayer;
    const sortData = SORTS[sort.key];
    
    if (currentPlayer.getPA() >= sortData.cost) {
      const effects = calculateSortEffects(sort.key, currentPlayer, target);
      applyEffects(effects, state);

      currentPlayer.reducePA(sortData.cost);
      currentPlayer.updateSortCooldown(sort.key, sortData.cooldown);

      // Clear selected action after casting
      dispatch({
        type: 'SELECT_ACTION',
        payload: null
      });

      // Update game state to reflect changes
      dispatch({
        type: 'UPDATE_GAME_STATE',
        payload: {
          board: state.board,
          currentPlayer: currentPlayer
        }
      });
    }
  }, [state]);

  const endTurn = useCallback(() => {
    const currentPlayer = state.currentPlayer;
    currentPlayer.resetPA();
    currentPlayer.resetPM();
    dispatch({ type: 'END_TURN' });
  }, [state.currentPlayer]);

  const checkGameEnd = useCallback(() => {
    const alivePlayers = state.players.filter(player => player.isAlive());
    
    if (alivePlayers.length === 1) {
      dispatch({
        type: 'END_GAME',
        payload: alivePlayers[0]
      });
    }
  }, [state.players]);

  const value = {
    state,
    actions: {
      initializeGame: initializeDefaultGame,
      selectAction,
      castSort,
      endTurn,
      checkGameEnd,
      updateGameState: (newState) => dispatch({
        type: 'UPDATE_GAME_STATE',
        payload: newState
      })
    }
  };

  return (
    <GameContext.Provider value={value}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
}