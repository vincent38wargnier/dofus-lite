import { useReducer, useEffect, useCallback } from 'react';
import initialState from '../core/game/state/initialState';
import { gameReducer } from '../core/game/state/gameReducer';

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
      }, 5000);
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

  const setGameState = useCallback((newState) => {
    if (typeof newState === 'function') {
      dispatch({ type: 'SET_STATE', payload: newState(state) });
    } else {
      dispatch({ type: 'SET_STATE', payload: newState });
    }
  }, [state]);

  return {
    gameState: state,
    setGameState,
    movePlayer: handleMove,
    setHoveredCell: (cell) => dispatch({ type: 'SET_HOVERED_CELL', payload: cell }),
    castSpell: (x, y) => dispatch({ type: 'CAST_SPELL', payload: { x, y } }),
    selectSpell: (spell) => dispatch({ type: 'SELECT_SPELL', payload: spell }),
    endTurn: () => dispatch({ type: 'END_TURN' })
  };
};

export default useGameState;