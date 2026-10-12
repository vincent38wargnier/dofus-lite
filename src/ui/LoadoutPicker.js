import EquipmentWorkshop from './EquipmentWorkshop';
import { customEquipmentItem, equipmentItem, validateCustomEquipment, equipCustomItem } from '../engine/customEquipment';
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Anvil, Backpack, BookOpen, Check, ChartNoAxesColumnIncreasing } from 'lucide-react';
import { CLASSES } from '../engine/classes';
import {
  EQUIPMENT, ITEMS, ITEM_SETS, EQUIPMENT_SLOTS,
  CHARACTERISTICS, STAT_LABELS, ELEMENTS, equipSet, resolveLoadout,
  rolledEffects, effectDefinition, petBonus, availableItemEffects,
} from '../engine/equipment';
import { RetroPortrait } from './RetroAssets';
import SpellLoadoutPicker from './SpellLoadoutPicker';

import LoadoutLibrary from './LoadoutLibrary';
import EquipmentIcon from './EquipmentIcon';
import PersonalEquipment from './PersonalEquipment';
import usePersonalEquipment from './usePersonalEquipment';
import { personalEquipmentDrag, personalEquipmentKey, previewPersonalEquipment } from './personalEquipmentStore';
import { loadoutAtLevel } from './playerSetupState';
import CharacteristicAllocator from './CharacteristicAllocator';
import ForgemagieWorkshop from './ForgemagieWorkshop';
import { matchingForge, forgeRestriction, replaceEquipment } from '../engine/forgedItems';
import { canEquipInSlot, canDropEquipment, dropEquipment } from './equipmentDrag';
import '../styles/loadoutBuilder.css';
export { LoadoutsProvider, useLoadouts } from './LoadoutsContext';
export { default as EquipmentIcon } from './EquipmentIcon';
const fold = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const ALL_ITEMS = Object.values(ITEMS).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, 'fr'));
const SEARCH = Object.fromEntries(ALL_ITEMS.map(item => [item.id, fold(`${item.name} ${ITEM_SETS[item.set]?.name || ''} ${item.id}`)]));
const SETS = Object.values(ITEM_SETS)
  .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

function statLabel(stat) {
  if (STAT_LABELS[stat]) return STAT_LABELS[stat];
  const [kind, element] = stat.split('_');
  return `${kind.includes('Fixed') || kind === 'fixed' ? 'Résistance' : '% résistance'} ${element}${kind.startsWith('pvp') ? ' JcJ' : ''}`;
}

export function effectText(row, value) {
  const [id, min, maximum, argument] = row;
  if (id === 940) return 'Capacités accrues';
  const def = effectDefinition(id);
  const range = maximum > min ? `${min}–${maximum}` : String(min);
  if (def.kind === 'stat' || def.kind === 'utility') {
    return `${def.sign < 0 ? '−' : '+'}${value ?? range} ${statLabel(def.stat)}`;
  }
  if (def.kind === 'spell') {
    const spell = Object.values(CLASSES).flatMap(cls => Object.values(cls.spells)).find(s => s.id === min);
    const label = EQUIPMENT.effectLabels[id] || `Effet ${id}`;
    return label.replace('#1', spell?.name || `sort ${min}`).replace('#3', String(parseInt(argument, 16) || 0));
  }
  if (def.kind === 'weapon') {
    if (id === 108) return `Rend ${range} PV à la cible`;
    if (id === 101 || id === 84) return `${id === 84 ? 'Vole' : 'Retire'} ${range} PA à la cible`;
    return `${id <= 95 ? 'Vol de vie' : 'Dommages'} ${['eau', 'terre', 'air', 'feu', 'neutre'][(id - 91) % 5]} : ${range}`;
  }
  const label = (EQUIPMENT.effectLabels[id] || `Effet ${id}`).split(':')[0].replace(/#\d|\{[^}]+\}/g, '').trim();
  return `${label || `Effet ${id}`} · ${def.kind === 'unsupported' ? 'non reproduit' : 'hors combat'}`;
}

function EffectList({ item, loadout, slot }) {
  const rows = rolledEffects(item, loadout, slot);
  return <ul className="equipment-effects">{rows.map(({ row, value }, i) => {
    const def = effectDefinition(row[0]);
    return <li key={i} className={def.kind === 'unsupported' ? 'unsupported' : def.sign === -1 || row[0] === 122 ? 'penalty' : def.kind === 'metadata' || def.kind === 'utility' ? 'muted' : ''}>
      {effectText(row, ['stat', 'utility'].includes(def.kind) ? value : undefined)}
      {row[2] > row[1] && ['stat', 'utility'].includes(def.kind) ? <small> ({row[1]}–{row[2]})</small> : null}
    </li>;
  })}</ul>;
}

export default function LoadoutPicker({ classes, names = { A: 'Vous', B: 'Adversaire' }, loadouts, update, summaries, saveError,
  embedded = false, fixedSide, activeView, onViewChange, hideNavigation = false, equipmentLibrary, inventoryKey }) {
  const tabId = useId();
  const [creatingEquipment, setCreatingEquipment] = useState(false);
  const [personalSelection, setPersonalSelection] = useState(null);
  const [localView, setLocalView] = useState('equipment');
  const view = activeView ?? localView;
  const setView = onViewChange || setLocalView;
  const gearView = view === 'equipment' || view === 'forge';
  const [sort, setSort] = useState('level-desc');
  const [minLevel, setMinLevel] = useState('');
  const [maxLevel, setMaxLevel] = useState('');
  const [localSide, setSide] = useState('A');
  const side = fixedSide || localSide;
  const [slotId, setSlotId] = useState('hat');
  const [search, setSearch] = useState('');
  const [statFilter, setStatFilter] = useState('');
  const [companionFilter, setCompanionFilter] = useState('');
  const [withinLevel, setWithinLevel] = useState(true);
  const [page, setPage] = useState(0);
  const [inspectId, setInspectId] = useState(null);
  const [setId, setSetId] = useState('1');
  const drag = useRef(null);
  const suppressClick = useRef(false);
  const [dragged, setDragged] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const classId = classes[side];
  useEffect(() => { setInspectId(null); setPersonalSelection(null); setPage(0); }, [side, classId]);
  useEffect(() => { drag.current = null; setDragged(null); setDropTarget(null); }, [side, classId, view]);
  const loadout = loadouts[side];
  const personal = usePersonalEquipment(loadout, inventoryKey || `${side}:${classId}`, names[side]);
  const summary = summaries[side];
  const level = summary.level;
  const selectedSet = ITEM_SETS[setId];
  const setMissing = selectedSet.items.filter(id => !ITEMS[id]);
  const setLevel = Math.max(...selectedSet.items.map(id => ITEMS[id]?.level || 0));
  const slot = EQUIPMENT_SLOTS.find(s => s.id === slotId);
  const selected = equipmentItem(loadout.slots[slotId], loadout);
  const inspected = personalSelection?.item || equipmentItem(inspectId, loadout) || selected;
  const inspectionLoadout = useMemo(() => personalSelection ? previewPersonalEquipment(loadout, personalSelection, slotId) : loadout, [loadout, personalSelection, slotId]);
  const isEquipped = selected?.id === inspected?.id && (!personalSelection || !personalSelection.forge || (matchingForge(selected, loadout, slotId)
    && personalEquipmentKey({ item: selected, forge: loadout.forgedItems[slotId] }) === personalSelection.key));
  const change = next => update(side, next);
  const filtered = useMemo(() => {
    const words = fold(search).split(/\s+/).filter(Boolean);
    return ALL_ITEMS.filter(item => slot.types.includes(item.type) && (!withinLevel || item.level <= level)
      && (slot.id !== 'pet' || !companionFilter || (companionFilter === 'mount' ? !!item.mount
        : companionFilter === 'cosmetic' ? item.pet?.kind === 'cosmetic' : item.type === 18 && item.pet?.kind !== 'cosmetic'))
      && (!minLevel || item.level >= Number(minLevel)) && (!maxLevel || item.level <= Number(maxLevel))
      && words.every(word => (SEARCH[item.id] || fold(item.name)).includes(word))
      && (!statFilter || availableItemEffects(item).some(([id]) => effectDefinition(id).stat === statFilter && effectDefinition(id).sign === 1)))
      .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, 'fr')
        : (sort === 'level-asc' ? a.level - b.level : b.level - a.level) || a.name.localeCompare(b.name, 'fr'));
  }, [slot, withinLevel, search, statFilter, companionFilter, level, minLevel, maxLevel, sort]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 24));
  const actualPage = Math.min(page, pageCount - 1);
  const shown = filtered.slice(actualPage * 24, (actualPage + 1) * 24);
  const inspectUnsupported = inspected?.effects.some(([id]) => effectDefinition(id).kind === 'unsupported')
    || (inspected?.customEquipment && !validateCustomEquipment(inspected.customEquipment).valid);
  const equip = (item = inspected) => {
    if (!canEquipInSlot(item, slotId, level)) return;
    if (personalSelection && item === inspected) { change(current => dropEquipment(current, personalEquipmentDrag(personalSelection), slotId)); return; }
    change(current => replaceEquipment(item.customEquipment ? equipCustomItem(current, slotId, item.customEquipment) : current, slotId, item.id));
  };
  const clearDrag = () => { drag.current = null; setDragged(null); setDropTarget(null); };
  const beginDrag = (event, item, fromSlot = null, entry = null) => {
    if (!item || (!fromSlot && !(entry ? EQUIPMENT_SLOTS.some(s => canDropEquipment(loadout, personalEquipmentDrag(entry), s.id)) : canEquipInSlot(item, slotId, level)))) { event.preventDefault(); return; }
    const payload = { itemId: item.id, fromSlot, side, classId, ...(item.customEquipment ? { customEquipment: item.customEquipment } : {}), ...(entry ? personalEquipmentDrag(entry) : {}) };
    drag.current = payload; setDragged(payload); setDropTarget(null); suppressClick.current = true;
    event.dataTransfer.effectAllowed = fromSlot ? 'move' : 'copy';
    event.dataTransfer.setData('application/x-dofus-equipment', JSON.stringify(payload));
    event.dataTransfer.setData('text/plain', item.name);
    const icon = event.currentTarget.querySelector('.equipment-icon');
    event.dataTransfer.setDragImage?.(icon || event.currentTarget, 20, 20);
  };
  const dragOverSlot = (event, id) => {
    if (!drag.current) return;
    event.preventDefault(); event.stopPropagation();
    const allowed = canDropEquipment(loadout, drag.current, id);
    event.dataTransfer.dropEffect = allowed ? drag.current.fromSlot ? 'move' : 'copy' : 'none';
    setDropTarget(allowed ? id : null);
  };
  const dropOnSlot = (event, id) => {
    event.preventDefault(); event.stopPropagation();
    const payload = drag.current;
    if (payload?.side === side && payload?.classId === classId && canDropEquipment(loadout, payload, id)) {
      change(current => dropEquipment(current, payload, id));
      changeSlot(id); setInspectId(payload.itemId);
    }
    clearDrag();
  };
  const comparison = useMemo(() => inspected && !isEquipped && slot.types.includes(inspected.type)
    ? resolveLoadout(classId, personalSelection ? inspectionLoadout : { ...loadout, ...(inspected.customEquipment ? { customEquipment: { ...loadout.customEquipment, [inspected.id]: inspected.customEquipment } } : {}), slots: { ...loadout.slots, [slotId]: inspected.id } }) : null, [inspected, isEquipped, slot, slotId, classId, loadout, personalSelection, inspectionLoadout]);
  const deltas = comparison ? [
    ...['hp', 'pa', 'pm', 'initiative'].map(stat => ({ stat, label: { hp: 'PV', pa: 'PA', pm: 'PM', initiative: 'Initiative' }[stat], before: summary[stat], after: comparison[stat] })),
    ...CHARACTERISTICS.map(stat => ({ stat, label: STAT_LABELS[stat], before: summary.stats[stat], after: comparison.stats[stat] })),
    ...[...new Set([...Object.keys(summary.bonuses), ...Object.keys(comparison.bonuses)])].filter(stat => ![...CHARACTERISTICS, 'pa', 'pm', 'initiative'].includes(stat))
      .map(stat => ({ stat, label: statLabel(stat), before: summary.bonuses[stat] || 0, after: comparison.bonuses[stat] || 0 })),
  ].filter(row => row.before !== row.after) : [];
  const renderSlot = s => {
    const item = equipmentItem(loadout.slots[s.id], loadout);
    const compatible = dragged && canDropEquipment(loadout, dragged, s.id);
    return <button type="button" key={s.id} className={`equipment-slot${slotId === s.id ? ' selected' : ''}${item ? ' equipped' : ''}${dragged ? compatible ? ' drop-compatible' : ' drop-blocked' : ''}${dropTarget === s.id ? ' drop-target' : ''}${dragged?.fromSlot === s.id ? ' dragging' : ''}`}
      draggable={!!item} onDragStart={event => beginDrag(event, item, s.id)} onDragEnd={clearDrag}
      onDragOver={event => dragOverSlot(event, s.id)} onDrop={event => dropOnSlot(event, s.id)}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDropTarget(current => current === s.id ? null : current); }}
      data-slot={s.id} aria-pressed={slotId === s.id} aria-label={`${s.name} : ${item?.name || 'vide'}`} title={`${s.name} : ${item?.name || 'vide'}`} onClick={() => changeSlot(s.id)}>
      {item ? <EquipmentIcon item={item} /> : <span className="slot-empty" aria-hidden="true">{s.icon}</span>}<span>{s.name}</span>
      {matchingForge(item, loadout, s.id) && <small className="equipment-slot-badge">FM</small>}
    </button>;
  };
  const remove = () => change(current => replaceEquipment(current, slotId, null));
  const changeSlot = id => { setSlotId(id); setInspectId(null); setPersonalSelection(null); setSearch(''); setPage(0); setView('equipment'); };
  const selectPersonal = entry => {
    const targets = EQUIPMENT_SLOTS.filter(s => s.types.includes(entry.item.type));
    const target = targets.find(s => s.id === slotId) || targets.find(s => !loadout.slots[s.id]) || targets[0];
    if (!target) return;
    changeSlot(target.id); setPersonalSelection(entry); setInspectId(entry.item.id);
    return target.id;
  };
  const equipPersonal = entry => {
    const target = selectPersonal(entry);
    if (target) change(current => dropEquipment(current, personalEquipmentDrag(entry), target));
  };

  const creator = creatingEquipment ? <EquipmentWorkshop initialReferenceId={inspected && !inspected.customEquipment && inspected.type !== 23 ? inspected.id : undefined} onClose={() => setCreatingEquipment(false)} onEquip={definition => {
    const item = customEquipmentItem(definition);
    const target = EQUIPMENT_SLOTS.find(s => s.id === slotId && s.types.includes(item.type)) || EQUIPMENT_SLOTS.find(s => s.types.includes(item.type));
    change(current => replaceEquipment(equipCustomItem(current, target.id, definition), target.id, definition.id));
    setCreatingEquipment(false); changeSlot(target.id); setInspectId(definition.id);
    setPersonalSelection({ item, key: personalEquipmentKey({ item }) });
  }} /> : null;

  return <>{creator && <div className="equipment-creation" hidden={!gearView}>{creator}</div>}
  <section hidden={creatingEquipment && gearView} className={`loadout-picker${embedded ? ' builder-embedded' : ' panel'}${dragged ? ' equipment-dragging' : ''}`} aria-label="Équipement avant combat"
    onPointerDownCapture={() => { suppressClick.current = false; }}
    onKeyDownCapture={event => { if (['Enter', ' '].includes(event.key)) suppressClick.current = false; }}
    onClickCapture={event => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}>
    {!embedded && <><div className="loadout-heading">
      <div><p className="eyebrow">ATELIER D’ÉQUIPEMENT</p><h2>Préparez votre prochain combat</h2></div>
      <span className="loadout-save">Dofus Retro · {ALL_ITEMS.length.toLocaleString('fr-FR')} objets · {SETS.length} panoplies</span>
    </div>
    <div className="loadout-sides" role="tablist" aria-label="Combattant à équiper">
      {['A', 'B'].map(s => <button key={s} type="button" role="tab" aria-selected={side === s}
        className={`loadout-side side-${s}${side === s ? ' selected' : ''}`} onClick={() => { setSide(s); setInspectId(null); }}>
        <RetroPortrait classId={classes[s]} artworkId={loadouts[s]?.artworkId} side={s} fallback={CLASSES[classes[s]].emoji} />
        <span><strong>{names[s]}</strong><small>{CLASSES[classes[s]].name} · {summaries[s].items.length} objets</small></span>
        <span className="loadout-side-stats">{summaries[s].hp} PV · {summaries[s].pa} PA · {summaries[s].pm} PM{!summaries[s].valid ? ' · ⚠' : ''}</span>
      </button>)}
    </div>
    </>}
    {!summary.valid ? <div className="loadout-errors" role="alert"><strong>À corriger avant de lancer le combat</strong><ul>{summary.errors.map(error => <li key={error}>{error}</li>)}</ul></div> : null}
    {!hideNavigation && <div className="builder-navigation" role="tablist" aria-label="Préparation du personnage">
      {[['equipment', 'Équipement', Backpack], ['stats', 'Caractéristiques', ChartNoAxesColumnIncreasing], ['spells', 'Sorts', BookOpen]].map(([id, label, Icon]) => <button key={id} type="button" role="tab" id={`${tabId}-${id === 'equipment' ? 'gear' : id}-tab`} aria-controls={`${tabId}-${id === 'equipment' ? 'gear' : id}`} aria-selected={id === 'equipment' ? gearView : view === id} tabIndex={(id === 'equipment' ? gearView : view === id) ? 0 : -1} className={(id === 'equipment' ? gearView : view === id) ? 'selected' : ''} onClick={() => setView(id)} onKeyDown={event => {
        const tabs = ['equipment', 'stats', 'spells'];
        const direction = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
        if (direction || ['Home', 'End'].includes(event.key)) {
          event.preventDefault();
          const next = tabs[event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (tabs.indexOf(gearView ? 'equipment' : view) + direction + tabs.length) % tabs.length];
          setView(next); document.getElementById(`${tabId}-${next === 'equipment' ? 'gear' : next}-tab`)?.focus();
        }
      }}><Icon size={17} />{label}</button>)}
    </div>}
    <header className="builder-context">
      <div><strong>{names[side]}</strong><span>{CLASSES[classId].name} · {summary.items.length} objets équipés</span></div>
      <span className="builder-saved"><Check size={13} />{saveError ? 'Sauvegarde impossible' : 'Enregistré automatiquement'}</span>
      <label>Niveau du personnage <select aria-label="Niveau du personnage" value={level} onChange={e => change(loadoutAtLevel(classId, loadout, e.target.value))}>{Array.from({ length: 200 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}</select></label>
    </header>
    <div id={`${tabId}-gear`} role={hideNavigation ? 'region' : 'tabpanel'} aria-label={hideNavigation ? 'Équipement' : undefined} aria-labelledby={hideNavigation ? undefined : `${tabId}-gear-tab`} hidden={!gearView}>
    <div className="equipment-workspace-nav" role="tablist" aria-label="Équipement et forgemagie">
      {[['equipment', 'Inventaire', Backpack], ['forge', 'Forgemagie', Anvil]].map(([id, label, Icon]) => <button key={id} type="button" role="tab" id={`${tabId}-${id}-tab`} aria-controls={`${tabId}-${id}`} aria-selected={view === id} tabIndex={view === id ? 0 : -1} onClick={() => setView(id)} onKeyDown={event => {
        if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          const next = event.key === 'Home' ? 'equipment' : event.key === 'End' ? 'forge' : view === 'equipment' ? 'forge' : 'equipment';
          setView(next); document.getElementById(`${tabId}-${next}-tab`)?.focus();
        }
      }}><Icon size={16} />{label}</button>)}
    </div>
    <section className="equipment-collection" aria-label="Mes stuffs">
      {equipmentLibrary || <LoadoutLibrary compact side={side} classId={classId} loadout={loadout} update={update} saveError={saveError} />}
    </section>
    <div id={`${tabId}-equipment`} role="tabpanel" aria-labelledby={`${tabId}-equipment-tab`} hidden={view !== 'equipment'}>
    <details className="equipment-options"><summary>Jets et panoplies <span>Équiper un ensemble, choisir les jets ou tout retirer</span></summary>
    <div className="loadout-toolbar">
      <label>Jets <select aria-label="Qualité des jets" value={loadout.rollMode} onChange={e => change({ ...loadout, rollMode: e.target.value })}>
        <option value="max">Meilleurs jets naturels</option><option value="average">Jets moyens</option><option value="random">Jets aléatoires sauvegardés</option>
      </select></label>
      {loadout.rollMode === 'random' ? <button className="btn" type="button" onClick={() => change({ ...loadout, rollSeed: (loadout.rollSeed || 1) + 1 })}>Relancer les jets</button> : null}
    </div>
    <div className="builder-set-tools loadout-toolbar">
      <label>Panoplie <select aria-label="Panoplie à équiper" value={setId} onChange={e => setSetId(e.target.value)}>
        {SETS.map(set => <option key={set.id} value={set.id}>{set.name}{set.items.some(id => !ITEMS[id]) ? ' · données incomplètes' : ` · niv. ${Math.max(...set.items.map(id => ITEMS[id].level))}`}</option>)}
      </select></label>
      <button type="button" className="btn" disabled={setMissing.length > 0 || setLevel > level} onClick={() => { change(current => equipSet(current, setId)); setInspectId(null); }}>Équiper la panoplie</button>
      <button className="btn subtle" type="button" onClick={() => { change({ ...loadout, slots: {}, ...(loadout.forgedItems ? { forgedItems: {} } : {}), ...(loadout.rollOrigins ? { rollOrigins: {} } : {}) }); setInspectId(null); }}>Tout retirer</button>
    </div>
    <details className="set-composition"><summary>{selectedSet.name} · {selectedSet.items.length} pièces · niveau {setLevel}{setMissing.length ? ` · ${setMissing.length} pièces absentes des données client` : ''}</summary>
      <div className="set-piece-list">{selectedSet.items.map(id => {
        const item = ITEMS[id];
        return item ? <button type="button" className="btn" key={id} onClick={() => {
          const compatible = EQUIPMENT_SLOTS.find(s => s.types.includes(item.type));
          if (compatible) { changeSlot(compatible.id); setInspectId(id); }
        }}><EquipmentIcon item={item} /><span>{item.name}<small>Niv. {item.level}{item.level > level ? ' · niveau insuffisant' : ''}</small></span></button>
          : <span className="penalty" key={id}>Pièce #{id} : absente du fichier d’objets installé</span>;
      })}</div>
      {setMissing.length ? <p className="penalty small">Cette référence de panoplie existe dans le client, mais ses objets ne sont pas définis. Elle ne peut pas être équipée tant que leurs données ne sont pas disponibles.</p> : null}
    </details>
    {setLevel > level ? <p className="muted small">Cette panoplie complète nécessite le niveau {setLevel}. Ses pièces restent consultables ci-dessus.</p> : null}
    </details>
    <div className="loadout-workbench">
      <div className="loadout-character">
        <div className="equipment-paperdoll">
          {EQUIPMENT_SLOTS.filter(s => !s.id.startsWith('dofus')).map(renderSlot)}
          <div className="equipment-character-art"><RetroPortrait classId={classId} artworkId={loadout.artworkId} side={side} fallback={CLASSES[classId].emoji} /><strong>{CLASSES[classId].name}</strong><span>Niveau {level}</span><small>{summary.items.length} / 16 objets</small></div>
        </div>
        <div className="equipment-dofus-slots">{EQUIPMENT_SLOTS.filter(s => s.id.startsWith('dofus')).map(renderSlot)}</div>
        <div className="loadout-totals" aria-label="Caractéristiques totales">
          <span><b>{summary.hp}</b> PV</span><span className="pa"><b>{summary.pa}</b> PA</span><span className="pm"><b>{summary.pm}</b> PM</span>
          <span><b>{summary.bonuses.range || 0}</b> PO bonus</span>
        </div>
        <dl className="loadout-characteristics">{CHARACTERISTICS.map(stat => <React.Fragment key={stat}>
          <dt>{STAT_LABELS[stat]}</dt><dd data-stat={stat}>{summary.stats[stat]}<small>{summary.parchments[stat]} parcho + {summary.base[stat]} investis + {summary.bonuses[stat] || 0} stuff</small></dd>
        </React.Fragment>)}</dl>
        <button type="button" className="btn builder-stats-link" onClick={() => setView('stats')}>Répartir les points et voir tous les bonus →</button>
      </div>
      <div className="equipment-inventory">
        <PersonalEquipment {...personal} loadout={loadout} selected={personalSelection} onSelect={selectPersonal} onEquip={equipPersonal}
          onDrag={(event, entry) => beginDrag(event, entry.item, null, entry)} onDragEnd={clearDrag} onCreate={() => setCreatingEquipment(true)} />
        <div className="equipment-inventory-heading"><div><span className="eyebrow">CATALOGUE DOFUS</span><h3>{slot.name}</h3></div><span>{filtered.length} objets</span></div>
        <p className="equipment-drag-hint" role="status">{dragged
          ? 'Déposez l’objet sur un emplacement en surbrillance.'
          : 'Glissez un objet vers son emplacement pour l’équiper.'}</p>
        {slotId === 'pet' ? <div className="companion-intro">
          <p>Familiers au maximum, avec capacités accrues si disponibles. Montures niveau 100, accessibles dès le niveau 60 du personnage. Un seul compagnon équipé.</p>
          <label>Type de compagnon <select aria-label="Type de compagnon" value={companionFilter} onChange={e => { setCompanionFilter(e.target.value); setInspectId(null); setPage(0); }}>
            <option value="">Tous les compagnons</option><option value="pet">Familiers à bonus</option><option value="mount">Montures</option><option value="cosmetic">Familiers d’apparat</option>
          </select></label>
        </div> : null}
        <div className="equipment-search">
          <label className="equipment-search-field"><span>Rechercher un objet</span><input type="search" aria-label="Rechercher un équipement" placeholder="Nom d’objet ou de panoplie…" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} /></label>
          <label><span>Bonus recherché</span><select aria-label="Filtrer par caractéristique" value={statFilter} onChange={e => { setStatFilter(e.target.value); setPage(0); }}>
            <option value="">Tous les bonus</option>{['pa', 'pm', 'range', ...CHARACTERISTICS, 'damage', 'power', 'crit', 'heal', 'summons', 'prospecting', 'pods', ...ELEMENTS.map(e => `res_${e}`)].map(stat => <option key={stat} value={stat}>{statLabel(stat)}</option>)}
          </select></label>
        </div>
        <div className="equipment-filter-row">
          <label className="equipment-level-filter"><input type="checkbox" checked={withinLevel} onChange={e => { setWithinLevel(e.target.checked); setPage(0); }} /> ≤ niv. {level}</label>
          <label className="equipment-level-range">Niv. <input type="number" min="1" max="200" aria-label="Niveau minimum des objets" placeholder="1" value={minLevel} onChange={e => { setMinLevel(e.target.value); setPage(0); }} /> à <input type="number" min="1" max="200" aria-label="Niveau maximum des objets" placeholder="200" value={maxLevel} onChange={e => { setMaxLevel(e.target.value); setPage(0); }} /></label>
          <select aria-label="Trier les équipements" value={sort} onChange={e => { setSort(e.target.value); setPage(0); }}><option value="level-desc">Niveau décroissant</option><option value="level-asc">Niveau croissant</option><option value="name">Nom A–Z</option></select>
          {(search || statFilter || minLevel || maxLevel || !withinLevel) ? <button type="button" className="btn" onClick={() => { setSearch(''); setStatFilter(''); setMinLevel(''); setMaxLevel(''); setWithinLevel(true); setPage(0); }}>Effacer les filtres</button> : null}
        </div>
        <div className="equipment-browser">
          <div>
            <div className="equipment-results" role="list" aria-label="Objets disponibles">
              {shown.map(item => {
                const preview = rolledEffects(item, loadout, slotId).filter(({ row: [id] }) => ['stat', 'utility'].includes(effectDefinition(id).kind))
                  .slice(0, 2).map(({ row, value }) => effectText(row, value)).join(' · ');
                const unsupported = item.effects.some(([id]) => effectDefinition(id).kind === 'unsupported');
                return <button type="button" key={item.id} className={`equipment-result${inspected?.id === item.id ? ' selected' : ''}${item.level > level || unsupported ? ' unavailable' : ''}${dragged?.itemId === item.id && !dragged.fromSlot ? ' dragging' : ''}`}
                  draggable={item.level <= level && !unsupported} onDragStart={event => beginDrag(event, item)} onDragEnd={clearDrag}
                  data-item-id={item.id} onClick={() => { setPersonalSelection(null); setInspectId(item.id); }} onDoubleClick={() => equip(item)} title="Glisser vers un emplacement pour équiper · cliquer pour comparer · double-cliquer pour équiper" aria-pressed={!personalSelection && inspected?.id === item.id}>
                  <EquipmentIcon item={item} /><span className="equipment-result-text"><strong>{item.name}</strong><small>{preview || EQUIPMENT.types[item.type]}{unsupported ? ' · Effet non reproduit' : ''}</small></span>
                  <span className="equipment-item-level">{item.mount ? 'Monture 100' : item.pet?.kind === 'cosmetic' ? 'Apparat' : item.pet ? 'Max' : `Niv. ${item.level}`}
                    {item.pet || item.mount ? <small>Niv. requis {item.level}</small> : null}{selected?.id === item.id ? <small>Équipé</small> : null}</span>
                </button>;
              })}
              {!shown.length ? <p className="equipment-empty muted">Aucun objet ne correspond à ces filtres.</p> : null}
            </div>
            <div className="equipment-pagination"><button className="btn" type="button" disabled={actualPage === 0} onClick={() => setPage(actualPage - 1)} aria-label="Objets précédents">←</button>
              <span>{actualPage + 1} / {pageCount}</span><button className="btn" type="button" disabled={actualPage >= pageCount - 1} onClick={() => setPage(actualPage + 1)} aria-label="Objets suivants">→</button>
            </div>
          </div>
          <aside className="equipment-inspector" aria-label="Détails de l’objet">
            {inspected ? <>
              <div className="equipment-inspector-head" draggable={canEquipInSlot(inspected, slotId, level)}
                onDragStart={event => beginDrag(event, inspected, isEquipped ? slotId : null, isEquipped ? null : personalSelection)} onDragEnd={clearDrag}>
                <EquipmentIcon item={inspected} /><h3>{inspected.name}<small>{EQUIPMENT.types[inspected.type]} · {inspected.mount ? 'Niveau 100' : `Niveau requis ${inspected.level}`}</small></h3></div>
              {inspected.pet?.kind === 'trained' ? <div className="companion-training">
                <p className="companion-status">Bonus maximum{inspected.pet.capacity.increase ? ' · Capacités accrues' : ''}</p>
                {inspected.pet.choices.length > 1 ? <label>Spécialisation du familier
                  <select aria-label="Spécialisation du familier" value={petBonus(inspected, loadout)[0]} onChange={e => {
                    const effect = Number(e.target.value);
                    change(current => ({ ...current, petBonuses: { ...current.petBonuses, [inspected.id]: effect } }));
                  }}>{inspected.pet.choices.map(row => <option key={row[0]} value={row[0]}>{effectText(row, row[1])}</option>)}</select>
                  <small>Le bonus choisi utilise la capacité du familier. Ce choix est sauvegardé avec le stuff.</small>
                </label> : null}
              </div> : null}
              {inspected.pet?.kind === 'fixed' ? <p className="companion-status">Bonus fixes au maximum</p> : null}
              {inspected.mount ? <p className="companion-status">Bonus de niveau 100 · Personnage niveau {inspected.level} minimum</p> : null}
              {comparison ? <div className="equipment-comparison" aria-label="Comparaison avant remplacement">
                <h4>{selected ? `Remplace ${selected.name}` : `Ajoute à ${slot.name}`}</h4>
                {deltas.length ? <table><thead><tr><th>Caractéristique</th><th>Après</th><th>Écart</th></tr></thead><tbody>{deltas.map(row => <tr key={row.stat} data-delta-stat={row.stat}><td>{row.label}</td><td>{row.after}</td><td className={(row.after > row.before) !== (row.stat === 'fail') ? 'gain' : 'penalty'}>{row.after > row.before ? '+' : ''}{row.after - row.before}</td></tr>)}</tbody></table> : <p>Mêmes caractéristiques totales.</p>}
                <small>Jets sélectionnés et bonus de panoplie inclus.</small>
                {comparison.errors.filter(error => !summary.errors.includes(error)).map(error => <p key={error} className="penalty">{error}</p>)}
              </div> : <p className="equipment-equipped-label">Actuellement équipé</p>}
              <h4 className="equipment-effects-title">Effets de l’objet</h4>
              <EffectList item={inspected} loadout={inspectionLoadout} slot={slotId} />
              {matchingForge(inspected, inspectionLoadout, slotId) ? <p className="equipment-equipped-label">Jet forgemagé · conservé dans Mes équipements</p> : null}
              {!inspected.effects.some(([id]) => ['stat', 'utility', 'spell'].includes(effectDefinition(id).kind)) ? <p className="muted small">{inspected.pet?.kind === 'cosmetic'
                ? 'Familier d’apparat : ce modèle ne donne pas de bonus de caractéristiques.' : 'Aucun bonus permanent dans ce modèle.'}</p> : null}
              {inspected.weapon ? <p className="equipment-weapon">
                {inspected.weapon.pa} PA · Portée {inspected.weapon.range.join('–')}<br />
                CC 1/{inspected.weapon.critRate || '—'} (+{inspected.weapon.critBonus}) · {inspected.weapon.twoHanded ? '2 mains' : '1 main'}<br />
                Échec critique de base : {inspected.weapon.failRate
                  ? `1/${inspected.weapon.failRate} (${(100 / inspected.weapon.failRate).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %) · termine le tour`
                  : 'aucun'}
              </p> : null}
              {inspected.condition ? <p className="equipment-condition">Conditions : <code>{inspected.condition}</code></p> : null}
              {inspected.ethereal ? <p className="muted small">Arme éthérée · usure hors combat non simulée.</p> : null}
              {ITEM_SETS[inspected.set] ? <p className="equipment-set-name">{ITEM_SETS[inspected.set].name}</p> : null}
              <button type="button" className="btn primary equipment-equip" disabled={inspected.level > level || inspectUnsupported || !slot.types.includes(inspected.type) || (personalSelection && !canDropEquipment(loadout, personalEquipmentDrag(personalSelection), slotId))} onClick={() => equip()}>
                {isEquipped ? 'Actuellement équipé' : selected ? `Remplacer · ${slot.name}` : `Équiper · ${slot.name}`}
              </button>
              {isEquipped && !forgeRestriction(inspected) ? <button type="button" className="btn equipment-forge" onClick={() => setView('forge')}>Forgemager cet objet →</button> : null}
              {inspected.level > level ? <p className="penalty small">Cet objet nécessite le niveau {inspected.level}. Votre personnage est niveau {level}.</p> : null}
              {inspectUnsupported ? <p className="penalty small">Cet objet ne peut pas encore être utilisé en combat.</p> : null}
            </> : <p className="muted equipment-empty">Sélectionnez un objet pour voir ses caractéristiques et l’équiper.</p>}
            {selected ? <button type="button" className="btn equipment-remove" onClick={remove}>Retirer {selected.name}</button> : null}
          </aside>
        </div>
      </div>
    </div>
    <div className="loadout-sets" aria-label="Bonus de panoplie">
      {summary.sets.map(set => <div key={set.id}><strong>{set.name} <span>{set.count}/{set.total}</span></strong><p>{set.effects.length ? set.effects.map(row => effectText(row, row[1])).join(' · ') : 'Prochain bonus à 2 objets.'}</p></div>)}
    </div>
    {summary.equipmentBudget && <details className={`equipment-outfit-budget${summary.equipmentBudget.valid ? '' : ' invalid'}`} open={(summary.equipmentBudget.enforced && !summary.equipmentBudget.valid) || undefined}><summary><strong>Budget du stuff : {summary.equipmentBudget.score} / {summary.equipmentBudget.max}</strong> · hors Dofus</summary>
      <small>{summary.equipmentBudget.enforced ? 'Objets créés présents : plafond appliqué au lancement du combat.' : 'Indicateur de création. Les équipements Dofus d’origine restent jouables.'} Panoplies et cumul de PA / PM / portée inclus.</small></details>}
    <p className="equipment-catalog-note">Glissez un objet sur un emplacement pour l’équiper. Glissez un anneau ou un Dofus entre ses emplacements pour les échanger. Le double-clic permet aussi d’équiper un objet. <a href="/dofus-local/equipment-audit.json" target="_blank" rel="noreferrer">Audit du catalogue</a></p>
    </div>
    <div id={`${tabId}-forge`} role="tabpanel" aria-labelledby={`${tabId}-forge-tab`} hidden={view !== 'forge'}>
      {view === 'forge' ? <ForgemagieWorkshop key={`${side}:${classId}`} loadout={loadout} change={change} initialSlot={slotId} saveError={saveError} /> : null}
    </div>
    </div>
    <div id={`${tabId}-stats`} className="builder-stats-panel" role={hideNavigation ? 'region' : 'tabpanel'} aria-label={hideNavigation ? 'Caractéristiques' : undefined} aria-labelledby={hideNavigation ? undefined : `${tabId}-stats-tab`} hidden={view !== 'stats'}>
      <div className="builder-stats-heading"><h3>Caractéristiques</h3><p>{summary.hp} PV · {summary.pa} PA · {summary.pm} PM · {summary.initiative} initiative</p></div>
      <CharacteristicAllocator key={`${side}:${classId}`} classId={classId} summary={summary} onChange={change} />
      <div className="builder-stats-columns">
        <details className="loadout-details" open><summary>Bonus avancés et résistances</summary>
          <dl className="loadout-characteristics">{['damage', 'power', 'crit', 'heal', 'trapDamage', 'trapPower', 'reflect', 'summons', 'dodgePa', 'dodgePm'].map(stat =>
            <React.Fragment key={stat}><dt>{STAT_LABELS[stat]}</dt><dd>{stat === 'summons' ? Math.max(0, 1 + (summary.bonuses[stat] || 0))
              : ['dodgePa', 'dodgePm'].includes(stat) ? Math.floor(Math.max(0, summary.stats.sagesse) / 4) + (summary.bonuses[stat] || 0) : summary.bonuses[stat] || 0}</dd></React.Fragment>)}
            <dt>Initiative</dt><dd>{summary.initiative}</dd>
          </dl>
          <table className="loadout-resistances"><thead><tr><th>Élément</th><th>Fixe</th><th>%</th></tr></thead><tbody>{ELEMENTS.map(element => <tr key={element}>
            <td>{element}</td><td>{summary.resistancesFixed[element]}{summary.bonuses[`pvpFixed_${element}`] ? ` +${summary.bonuses[`pvpFixed_${element}`]} JcJ` : ''}</td>
            <td>{summary.resistances[element]}{summary.bonuses[`pvpRes_${element}`] ? ` +${summary.bonuses[`pvpRes_${element}`]} JcJ` : ''}</td></tr>)}</tbody></table>
          <p className="muted small">Résistances en % limitées à 50 en combat. Les bonus JcJ s’appliquent aux attaques des joueurs.</p>
        </details>
        <details className="loadout-details"><summary>Profil des conditions JcJ</summary>
          <div className="base-stat-inputs"><label>Alignement<select value={loadout.profile?.alignment || 0} onChange={e => change({ ...loadout, profile: { ...loadout.profile, alignment: Number(e.target.value) } })}>
            <option value="0">Neutre</option><option value="1">Bonta</option><option value="2">Brâkmar</option></select></label>
            <label>Grade<input type="number" min="0" max="10" value={loadout.profile?.rank || 0} onChange={e => change({ ...loadout, profile: { ...loadout.profile, rank: Number(e.target.value) } })} /></label>
            <label>Sexe requis<select value={loadout.profile?.sex || 0} onChange={e => change({ ...loadout, profile: { ...loadout.profile, sex: Number(e.target.value) } })}><option value="0">Masculin</option><option value="1">Féminin</option></select></label>
          </div>
        </details>
      </div>
      <p className="loadout-footnote">La force améliore les dégâts terre et neutre ; l’intelligence, le feu et les soins ; la chance, l’eau ; l’agilité, l’air et les critiques. Les objets ne changent pas l’élément des sorts.</p>
    </div>
    <div id={`${tabId}-spells`} role={hideNavigation ? 'region' : 'tabpanel'} aria-label={hideNavigation ? 'Sorts' : undefined} aria-labelledby={hideNavigation ? undefined : `${tabId}-spells-tab`} hidden={view !== 'spells'}>
    {view === 'spells' && <SpellLoadoutPicker weapon={summary.weaponSpell} classId={classId} loadout={loadout} change={change} />}
    </div>
  </section></>;
}
