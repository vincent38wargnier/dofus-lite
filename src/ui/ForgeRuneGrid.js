import React, { useId, useState } from 'react';
import { Check, Plus, Search } from 'lucide-react';
import { RUNES, runeWeight } from '../engine/forgemagie';
import { STAT_LABELS } from '../engine/equipment';
import EquipmentIcon from './EquipmentIcon';

export const forgeStatLabel = stat => STAT_LABELS[stat] || stat.replace('fixed_', 'Rés. fixe ').replace('res_', 'Rés. % ');
const fold = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const supported = RUNES.filter(r => r.supported);
const allStats = [...new Set(supported.map(r => r.stat))];
const tiers = ['simple', 'pa', 'ra'];
// Ga Pa / Ga Pme are their own runes, not Pa variants of another rune.
const tier = rune => /^Rune Pa /.test(rune.name) ? 'pa' : /^Rune Ra /.test(rune.name) ? 'ra' : 'simple';

export default function ForgeRuneGrid({ bounds, suggested, extras, selected, onSelect, onToggleExtra }) {
  const [search, setSearch] = useState('');
  const pickerId = useId();
  const visible = [...new Set([...suggested, ...extras])];
  const optional = allStats.filter(s => !suggested.includes(s));
  const words = fold(search).split(/\s+/).filter(Boolean);
  const choices = optional.filter(s => {
    const text = fold(`${forgeStatLabel(s)} ${supported.filter(r => r.stat === s).map(r => r.name).join(' ')}`);
    return words.every(word => text.includes(word));
  });

  return <div className="fm-rune-palette">
    <div className="fm-grid-heading"><h4>Runes de l’objet</h4><span>Choisis une case</span></div>
    <div className="fm-rune-scroll" role="region" aria-label="Liste des runes" tabIndex={0}>
    {visible.length ? <table className="fm-rune-grid" aria-label="Runes disponibles pour cet objet">
      <thead><tr><th scope="col">Bonus</th><th scope="col">Simple / Ga</th><th scope="col">Pa</th><th scope="col">Ra</th></tr></thead>
      <tbody>{visible.map(stat => <tr key={stat} data-rune-stat={stat}>
        <th scope="row"><span>{forgeStatLabel(stat)}</span>{!bounds[stat] ? <small className="fm-extra-label">Exotique</small> : bounds[stat].max < 0 ? <small className="fm-extra-label">Malus</small> : null}</th>
        {tiers.map(t => {
          const rune = supported.find(r => r.stat === stat && tier(r) === t);
          return <td key={t}>{rune ? <button type="button" data-rune-id={rune.id} aria-pressed={selected?.id === rune.id}
            aria-label={`${rune.name} : +${rune.power} ${forgeStatLabel(stat)}, poids ${runeWeight(rune)}`}
            title={`${rune.name} · +${rune.power} ${forgeStatLabel(stat)} · Poids ${runeWeight(rune)}`}
            className={`fm-rune-cell${selected?.id === rune.id ? ' selected' : ''}`} onClick={() => onSelect(rune)}>
            <span className="fm-rune-gain"><EquipmentIcon item={rune} /><b>+{rune.power}</b></span>
            <span className="fm-rune-name">{rune.name.replace('Rune ', '')}</span>
            {selected?.id === rune.id ? <Check className="fm-rune-check" size={12} aria-hidden="true" /> : null}
          </button> : <span className="fm-no-rune" aria-label="Aucune rune de ce type">—</span>}</td>;
        })}
      </tr>)}</tbody>
    </table> : <p>Aucun bonus modifiable sur cet objet. Ajoute les runes que tu souhaites essayer.</p>}
    <details className="fm-add-runes">
      <summary><Plus size={15} aria-hidden="true" /> Ajouter des runes{extras.length ? <span>{extras.length}</span> : null}</summary>
      <div className="fm-rune-picker">
        <label className="fm-rune-search" htmlFor={pickerId}><Search size={15} aria-hidden="true" /><input id={pickerId} type="search"
          aria-label="Rechercher d’autres runes" placeholder="Force, portée, dommages…" value={search} onChange={e => setSearch(e.target.value)} /></label>
        <p>Coche un bonus pour ajouter ses runes à la grille.</p>
        <div className="fm-rune-options">{choices.map(stat => <label key={stat} className={extras.includes(stat) ? 'selected' : ''}>
          <input type="checkbox" data-extra-stat={stat} checked={extras.includes(stat)} onChange={() => onToggleExtra(stat)} />
          <span>{forgeStatLabel(stat)}<small>{supported.filter(r => r.stat === stat).map(r => r.name.replace('Rune ', '')).join(' · ')}</small></span>
        </label>)}</div>
        {!choices.length ? <p>{optional.length ? 'Aucune rune ne correspond à la recherche.' : 'Toutes les caractéristiques sont déjà dans la grille.'}</p> : null}
      </div>
    </details>
    </div>
  </div>;
}
