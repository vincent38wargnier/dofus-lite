import React, { createContext, useContext, useReducer, useCallback, useEffect, useRef } from 'react';
import BoardEngine from '../components/Board/BoardEngine';
import Player from '../components/Player/Player';
import { BOARD_CONFIG, OBSTACLE_TYPES } from '../constants/game/board';
import { GAME_STATUS } from '../constants/game/status';
import { CLASSES } from '../constants/classes';
import { calculateSortEffects, applyEffects } from '../utils/gameLogic';
import { AIPlayerController } from '../components/AI/AIPlayerController';
import { TurnManager } from '../components/Board/TurnManager';
import { SimpleStrategy } from '../components/AI/strategies/SimpleStrategy';
import { GameHistory } from '../game/GameHistory';
import { GameStateSnapshot } from '../game/GameStateSnapshot';

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

    case 'END_TURN': {
      const currentPlayerIndex = state.players.indexOf(state.currentPlayer);
      const nextPlayerIndex = (currentPlayerIndex + 1) % state.players.length;
      const nextPlayer = state.players[nextPlayerIndex];
      
      nextPlayer.startTurn();
      
      return {
        ...state,
        currentPlayer: nextPlayer,
        turnNumber: nextPlayerIndex === 0 ? state.turnNumber + 1 : state.turnNumber,
        selectedAction: null
      };
    }

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
  const turnManagerRef = useRef(new TurnManager());
  const gameHistory = useRef(new GameHistory());

  useEffect(() => {
    initializeDefaultGame();
  }, []);

  useEffect(() => {
    turnManagerRef.current.addTurnStartListener((playerId) => {
      const player = state.players.find(p => p.id === playerId);
      if (player) {
        dispatch({
          type: 'UPDATE_GAME_STATE',
          payload: { currentPlayer: player }
        });
      }
    });

    return () => {
      turnManagerRef.current.turnStartListeners.clear();
    };
  }, []);

  useEffect(() => {
    if (state.currentPlayer) {
      turnManagerRef.current.startTurn(state.currentPlayer.id);
    }
  }, [state.currentPlayer]);

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

    // Add obstacles
    const obstacles = [
      // Center walls
      { type: 'WALL', x: Math.floor(board.width / 2), y: Math.floor(board.height / 2) },
      { type: 'WALL', x: Math.floor(board.width / 2), y: Math.floor(board.height / 2) - 1 },
      { type: 'WALL', x: Math.floor(board.width / 2), y: Math.floor(board.height / 2) + 1 },
      
      // Bushes near corners
      { type: 'BUSH', x: 2, y: 2 },
      { type: 'BUSH', x: board.width - 3, y: 2 },
      { type: 'BUSH', x: 2, y: board.height - 3 },
      { type: 'BUSH', x: board.width - 3, y: board.height - 3 },
      
      // Rocks in strategic positions
      { type: 'ROCK', x: Math.floor(board.width / 2) - 3, y: Math.floor(board.height / 2) },
      { type: 'ROCK', x: Math.floor(board.width / 2) + 3, y: Math.floor(board.height / 2) },
      
      // Additional walls for cover
      { type: 'WALL', x: Math.floor(board.width / 4), y: Math.floor(board.height / 4) },
      { type: 'WALL', x: Math.floor(board.width * 3 / 4), y: Math.floor(board.height * 3 / 4) }
    ];

    obstacles.forEach(({ type, x, y }) => {
      board.placeObstacle({ type, ...OBSTACLE_TYPES[type] }, x, y);
    });

    players[0].startTurn();

    // Make the second player AI-controlled
    const aiStrategy = new SimpleStrategy();
    assignAIControl(players[1].id, aiStrategy);

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

  const castSort = useCallback((sort, target, targetPos) => {
    const currentPlayer = state.currentPlayer;
    if (!currentPlayer.canUseSort(sort.key)) return;

    // Get the spell details from the player's sorts
    const spellDetails = currentPlayer.getSorts()[sort.key];
    if (!spellDetails) return;

    // Only apply cooldown and PA cost after successful cast
    let castSuccessful = false;

    switch (sort.type) {
      case 'DAMAGE':
        if (target) {
          target.reduceHP(sort.damage);
          castSuccessful = true;
        }
        break;
      case 'HEAL':
        if (target) {
          target.increaseHP(sort.healing);
          castSuccessful = true;
        }
        break;
      case 'MOVEMENT':
        // Movement spells are handled in BoardRenderer
        // If we get here, the movement was successful
        castSuccessful = true;
        break;
      case 'DOT_DAMAGE':
        if (target) {
          target.addStatusEffect({
            type: 'DAMAGE_OVER_TIME',
            value: sort.damage,
            duration: sort.duration
          });
          castSuccessful = true;
        }
        break;
      case 'BUFF':
        // Apply buff to self if no target and range is 0
        const buffTarget = (sort.range === 0 || !target) ? currentPlayer : target;
        if (buffTarget) {
          if (sort.effect) {
            buffTarget.addStatusEffect({
              ...sort.effect,
              duration: sort.duration || 1
            });
          }
          castSuccessful = true;
        }
        break;
      case 'DEBUFF':
        if (target) {
          if (sort.effect) {
            target.addStatusEffect({
              ...sort.effect,
              duration: sort.duration || 1
            });
            // If the spell also buffs the caster
            if (sort.self_effect) {
              currentPlayer.addStatusEffect({
                ...sort.self_effect,
                duration: sort.duration || 1
              });
            }
          }
          castSuccessful = true;
        }
        break;
      case 'MOVEMENT_DAMAGE':
        if (target) {
          target.reduceHP(sort.damage);
          castSuccessful = true;
        }
        break;
    }

    if (castSuccessful) {
      // Reduce PA and put spell on cooldown only if cast was successful
      currentPlayer.reducePA(sort.cost);
      // Only set cooldown if spell has one
      if (spellDetails.cooldown > 0) {
        currentPlayer.setSortCooldown(sort.key, spellDetails.cooldown);
      }

      // Update game state
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
    currentPlayer.endTurn();
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

  const playerActions = useCallback((playerId) => ({
    move: async (position) => {
      const player = state.players.find(p => p.id === playerId);
      if (player !== state.currentPlayer) return { success: false, error: 'Not player\'s turn' };
      
      // Validate and execute movement
      const result = await state.board.movePlayer(player, position);
      if (result.success) {
        dispatch({
          type: 'UPDATE_GAME_STATE',
          payload: { board: state.board }
        });
      }
      return result;
    },

    castSpell: async (spellId, targetPosition) => {
      const player = state.players.find(p => p.id === playerId);
      if (player !== state.currentPlayer) return { success: false, error: 'Not player\'s turn' };
      
      // Get spell and validate cast
      const spell = player.getSpell(spellId);
      const result = await castSort(spell, targetPosition);
      return result;
    },

    getAvailableMoves: () => {
      const player = state.players.find(p => p.id === playerId);
      return state.board.getValidMoves(player);
    },

    getSpellTargets: (spellId) => {
      const player = state.players.find(p => p.id === playerId);
      const spell = player.getSpell(spellId);
      return state.board.getValidSpellTargets(player, spell);
    },

    getValidActions: () => {
      const player = state.players.find(p => p.id === playerId);
      return {
        moves: state.board.getValidMoves(player),
        spells: player.getAvailableSpells().map(spell => ({
          id: spell.id,
          targets: state.board.getValidSpellTargets(player, spell)
        }))
      };
    },

    endTurn: async () => {
      const player = state.players.find(p => p.id === playerId);
      if (player !== state.currentPlayer) return { success: false, error: 'Not player\'s turn' };
      await endTurn();
      return { success: true };
    }
  }), [state, endTurn]);

  const assignAIControl = useCallback((playerId, aiStrategy) => {
    const controller = new AIPlayerController(aiStrategy);
    controller.initialize(playerId, playerActions(playerId));
    turnManagerRef.current.registerAIPlayer(playerId, controller);
  }, [playerActions]);

  const executeAction = useCallback(async (action) => {
    const result = await state.board.executeAction(action);
    
    if (result.success) {
      // Record the action and its result
      gameHistory.current.recordAction(action, new GameStateSnapshot(state));
      
      // Update game state
      dispatch({
        type: 'UPDATE_GAME_STATE',
        payload: result.resultingState
      });
    }

    return result;
  }, [state]);

  // Add method to access history
  const getGameHistory = useCallback(() => {
    return gameHistory.current;
  }, []);

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
      }),
      playerActions,
      assignAIControl,
      executeAction,
      getGameHistory
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

// Should expose clear methods for:
interface GameActions {
  movePlayer(playerId: string, targetPosition: Position): boolean;
  castSpell(playerId: string, spellId: string, targetPosition: Position): boolean;
  endTurn(playerId: string): void;
  // etc...
}