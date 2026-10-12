import React, { useMemo, useState } from 'react';
import { Check, Plus, Search } from 'lucide-react';
import { EQUIPMENT_SLOTS, STAT_LABELS } from '../engine/equipment';
import { matchingForge, naturalBounds } from '../engine/forgedItems';
import { canDropEquipment } from './equipmentDrag';
import { personalEquipmentDrag, personalEquipmentKey } from './personalEquipmentStore';
import EquipmentIcon from './EquipmentIcon';

const fold = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function personalEquipmentLabel(entry) {
  if (!entry.forge) return `Créé · niv. ${entry.item.level}`;
  const bounds = naturalBounds(entry.item);
  const priority = { pa: 0, pm: 1, range: 2 };
  const extras = Object.entries(entry.forge.stats).filter(([stat, value]) => value > Math.max(0, bounds[stat]?.max || 0))
    .sort(([a], [b]) => (priority[a] ?? 3) - (priority[b] ?? 3))
    .slice(0, 2).map(([stat, value]) => `+${value - Math.max(0, bounds[stat]?.max || 0)} ${STAT_LABELS[stat] || stat}`);
  return `FM${extras.length ? ` · ${extras.join(' · ')}` : ` · niv. ${entry.item.level}`}`;
}

export default function PersonalEquipment({ entries, error, loadout, selected, onSelect, onEquip, onDrag, onDragEnd, onCreate }) {
  const [search, setSearch] = useState('');
  const shown = useMemo(() => entries.filter(entry => fold(`${entry.item.name} ${personalEquipmentLabel(entry)}`).includes(fold(search))), [entries, search]);
  return <section className="personal-equipment" aria-label="Mes équipements personnalisés">
    <header className="personal-equipment-heading"><div><h3>Mes équipements <span className="collection-count">{entries.length}</span></h3><p>Créations et objets FM · jets conservés</p></div>
      <button type="button" className="btn" onClick={onCreate}><Plus size={14} /> Créer un équipement</button></header>
    {(entries.length > 8 || search) && <label className="personal-equipment-search"><Search size={14} /><input type="search" aria-label="Rechercher dans mes équipements" placeholder="Retrouver un objet…" value={search} onChange={event => setSearch(event.target.value)} /></label>}
    {entries.length ? <>
      <div className="personal-equipment-grid">{shown.map(entry => {
        const usable = EQUIPMENT_SLOTS.some(slot => canDropEquipment(loadout, personalEquipmentDrag(entry), slot.id));
        const equipped = EQUIPMENT_SLOTS.some(slot => loadout.slots[slot.id] === entry.item.id && (entry.forge
          ? matchingForge(entry.item, loadout, slot.id) && personalEquipmentKey({ item: entry.item, forge: loadout.forgedItems[slot.id] }) === entry.key
          : true));
        return <button type="button" key={entry.key} className={`personal-equipment-item${selected?.key === entry.key ? ' selected' : ''}`}
          data-personal-item={entry.item.id} data-personal-kind={entry.forge ? 'fm' : 'created'} aria-label={`${entry.item.name} · ${personalEquipmentLabel(entry)}`}
          aria-pressed={selected?.key === entry.key} title={`${entry.item.name} · ${personalEquipmentLabel(entry)}\nCliquer pour voir · glisser ou double-cliquer pour équiper`}
          draggable={usable} onDragStart={event => onDrag(event, entry)} onDragEnd={onDragEnd} onClick={() => onSelect(entry)} onDoubleClick={() => onEquip(entry)}>
          <span className="personal-equipment-art"><EquipmentIcon item={entry.item} /><span className={`personal-equipment-badge ${entry.forge ? 'fm' : 'created'}`}>{entry.forge ? 'FM' : 'Créé'}</span>{equipped && <Check className="personal-equipment-equipped" size={13} />}</span>
          <strong>{entry.item.name}</strong><small>{personalEquipmentLabel(entry).replace(/^(FM|Créé) · /, '')}</small>
        </button>;
      })}</div>
      {!shown.length && <p className="personal-equipment-empty">Aucun équipement pour cette recherche.</p>}
      <p className="personal-equipment-hint">Clique pour voir les jets · glisse pour équiper.</p>
    </> : <p className="personal-equipment-empty">Tes créations et tes objets forgemagés apparaîtront ici automatiquement.</p>}
    {error && <p className="penalty small" role="alert">{error}</p>}
  </section>;
}
