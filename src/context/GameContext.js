import React, { createContext, useContext, useReducer, useCallback } from 'react';
import BoardEngine from '../components/Board/BoardEngine';
import Player from '../components/Player/Player';
import { BOARD_CONFIG, GAME_STATUS } from '../utils/constants';
import { GameState } from '../utils/GameState';

const GameContext = createContext();

const initialState = {
  status: GAME_STATUS.WAITING,
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

  const initializeGame = useCallback((playerConfigs) => {
    // Create board
    const board = new BoardEngine(
      BOARD_CONFIG.DEFAULT_SIZE.columns,
      BOARD_CONFIG.DEFAULT_SIZE.rows
    );

    // Create players
    const players = playerConfigs.map(config => 
      new Player(config.name, config.class)
    );

    // Place players on board
    const startPositions = [
      { x: 0, y: Math.floor(board.height / 2) },
      { x: board.width - 1, y: Math.floor(board.height / 2) }
    ];

    players.forEach((player, index) => {
      board.placePlayer(player, startPositions[index].x, startPositions[index].y);
    });

    // Initialize game state
    dispatch({
      type: 'INITIALIZE_GAME',
      payload: {
        board,
        players,
        currentPlayer: players[0],
        status: GAME_STATUS.ACTIVE
      }
    });
  }, []);

  const selectAction = useCallback((action) => {
    dispatch({
      type: 'SELECT_ACTION',
      payload: action
    });
  }, []);

  const endTurn = useCallback(() => {
    const currentPlayer = state.currentPlayer;
    
    // Reset player's points
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
      initializeGame,
      selectAction,
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
