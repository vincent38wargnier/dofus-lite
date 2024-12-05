import React, { createContext, useContext, useReducer } from 'react';

// Create the context
const GameContext = createContext();

// Initial state
const initialState = {
  players: [],
  currentPlayer: null,
  board: null,
  gameStatus: 'waiting', // waiting, active, ended
  winner: null,
  turnNumber: 0
};

// Action types
const actions = {
  INITIALIZE_GAME: 'INITIALIZE_GAME',
  UPDATE_GAME_STATE: 'UPDATE_GAME_STATE',
  SET_CURRENT_PLAYER: 'SET_CURRENT_PLAYER',
  END_TURN: 'END_TURN',
  END_GAME: 'END_GAME'
};

// Reducer
function gameReducer(state, action) {
  switch (action.type) {
    case actions.INITIALIZE_GAME:
      return {
        ...state,
        players: action.payload.players,
        board: action.payload.board,
        currentPlayer: action.payload.players[0],
        gameStatus: 'active',
        turnNumber: 1
      };
    case actions.UPDATE_GAME_STATE:
      return {
        ...state,
        ...action.payload
      };
    case actions.SET_CURRENT_PLAYER:
      return {
        ...state,
        currentPlayer: action.payload
      };
    case actions.END_TURN:
      const currentPlayerIndex = state.players.findIndex(
        player => player === state.currentPlayer
      );
      const nextPlayerIndex = (currentPlayerIndex + 1) % state.players.length;
      return {
        ...state,
        currentPlayer: state.players[nextPlayerIndex],
        turnNumber: nextPlayerIndex === 0 ? state.turnNumber + 1 : state.turnNumber
      };
    case actions.END_GAME:
      return {
        ...state,
        gameStatus: 'ended',
        winner: action.payload
      };
    default:
      return state;
  }
}

// Provider component
export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(gameReducer, initialState);

  const value = {
    state,
    dispatch,
    actions: {
      initializeGame: (players, board) =>
        dispatch({
          type: actions.INITIALIZE_GAME,
          payload: { players, board }
        }),
      updateGameState: (newState) =>
        dispatch({
          type: actions.UPDATE_GAME_STATE,
          payload: newState
        }),
      setCurrentPlayer: (player) =>
        dispatch({
          type: actions.SET_CURRENT_PLAYER,
          payload: player
        }),
      endTurn: () =>
        dispatch({
          type: actions.END_TURN
        }),
      endGame: (winner) =>
        dispatch({
          type: actions.END_GAME,
          payload: winner
        })
    }
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

// Custom hook for using the game context
export function useGame() {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
}

export default GameProvider;
