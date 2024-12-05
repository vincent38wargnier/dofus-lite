import React from 'react';
import Sort from './Sort';
import { SORTS } from '../../utils/constants';
import { useGame } from '../../context/GameContext';

const SortList = ({ player, onSortSelect }) => {
  if (!player) return null;

  const playerSorts = player.getSorts().map(sortKey => ({
    ...SORTS[sortKey],
    key: sortKey,
    cooldown: player.getSortCooldown(sortKey)
  }));

  const renderSort = (sort) => {
    const isUsable = player.canUseSort(sort);
    
    return (
      <Sort
        key={sort.key}
        sort={sort}
        isUsable={isUsable}
        onSelect={() => isUsable && onSortSelect(sort)}
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
