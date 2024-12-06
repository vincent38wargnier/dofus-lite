import React from 'react';
import Sort from './Sort';
import { SORTS } from '../../utils/constants';
import { useGame } from '../../context/GameContext';

const SortList = ({ player }) => {
  const { actions } = useGame();
  
  if (!player) return null;

  const playerSorts = player.getSorts().map(sortKey => ({
    ...SORTS[sortKey],
    key: sortKey,
    cooldown: player.getSortCooldown(sortKey)
  }));

  const handleSortSelect = (sort) => {
    actions.selectAction({
      type: 'CAST_SORT',
      sort: sort
    });
  };

  const renderSort = (sort) => {
    // We pass the sort key directly instead of the sort object
    const isUsable = player.canUseSort(sort.key);
    
    return (
      <Sort
        key={sort.key}
        sort={sort}
        isUsable={isUsable}
        onSelect={() => handleSortSelect(sort)}
      />
    );
  };

  return (
    <div className="sort-list">
      <h3 className="sort-list-title">Sorts</h3>
      <div className="sorts-container">
        {playerSorts.map(renderSort)}
      </div>
    </div>
  );
};

export default SortList;