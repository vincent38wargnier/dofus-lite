import React from 'react';
import { SPELLS } from '../../utils/constants';
import Button from '../shared/Button';

const SpellBook = ({ pa, onSpellSelect }) => {
  const spells = Object.values(SPELLS);

  return (
    <div className="space-y-2">
      {spells.map(spell => (
        <Button
          key={spell.id}
          onClick={() => onSpellSelect(spell)}
          disabled={pa < spell.pa}
          fullWidth
          variant="primary"
        >
          <div className="flex items-center justify-between w-full">
            <span>{spell.emoji} {spell.name}</span>
            <span>{spell.pa} PA</span>
          </div>
        </Button>
      ))}
    </div>
  );
};

export default SpellBook;