import React from 'react';
import { useGame } from '../../context/GameContext';
import Button from '../Common/Button';
import Icon from '../Common/Icon';
import SortList from '../Sorts/SortList';
import './ActionBar.css';

const ActionBar = () => {
  const { state, actions } = useGame();
  const { currentPlayer } = state;

  const handleEndTurn = () => {
    actions.endTurn();
  };

  const handleSortSelect = (sort) => {
    // This will be handled by the BoardInteractionManager
    actions.selectSort(sort);
  };

  const handleMoveAction = () => {
    // This will be handled by the BoardInteractionManager
    actions.startMove();
  };

  if (!currentPlayer) return null;

  return (
    <div className="action-bar">
      <div className="action-buttons">
        <Button
          variant="primary"
          onClick={handleMoveAction}
          disabled={currentPlayer.getPM() <= 0}
        >
          <Icon name="move" size="small" />
          Move ({currentPlayer.getPM()} PM)
        </Button>
        
        <Button
          variant="danger"
          onClick={handleEndTurn}
        >
          <Icon name="time" size="small" />
          End Turn
        </Button>
      </div>

      <div className="sorts-container">
        <SortList
          player={currentPlayer}
          onSortSelect={handleSortSelect}
        />
      </div>
    </div>
  );
};

export default ActionBar;
