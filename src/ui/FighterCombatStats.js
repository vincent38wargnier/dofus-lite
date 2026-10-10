import React from 'react';
import { ELEMENT_EMOJI, resistanceValues, statBuffTotal } from '../engine/formulas';
import { combatStatLabel } from './combatEffects';

const BONUSES = ['damage', 'power', 'physicalDamage', 'heal', 'crit', 'range', 'summons', 'reflect',
  'dodgePa', 'dodgePm', 'armor', 'armorPhysical', 'armorMagic', 'trapDamage', 'trapPower', 'fail'];

export default function FighterCombatStats({ fighter }) {
  const bonuses = BONUSES.map(stat => [stat, statBuffTotal(fighter, stat)]).filter(([, value]) => value !== 0);
  return <>
    {bonuses.length > 0 && <dl className="inspector-combat-bonuses" aria-label="Bonus de combat, équipement et effets inclus">
      {bonuses.map(([stat, value]) => <div key={stat}><dt>{combatStatLabel(stat)}</dt><dd>{value}</dd></div>)}
    </dl>}
    <table className="inspector-resistances">
      <caption>Résistances actuelles</caption>
      <thead><tr><th scope="col">Élément</th><th scope="col">%</th><th scope="col">Fixe</th></tr></thead>
      <tbody>{['neutre', 'terre', 'feu', 'eau', 'air'].map(element => {
        const normal = resistanceValues(element, fighter);
        const pvp = resistanceValues(element, fighter, { leader: true });
        return <tr key={element}>
          <th scope="row">{ELEMENT_EMOJI[element]} {element}</th>
          <td>{normal.percent} %{normal.percent !== pvp.percent && <small>JcJ : {pvp.percent} %</small>}</td>
          <td>{normal.fixed}{normal.fixed !== pvp.fixed && <small>JcJ : {pvp.fixed}</small>}</td>
        </tr>;
      })}</tbody>
    </table>
  </>;
}
