import React, { useState } from 'react';
import { SPELL_LIBRARY, resolveSpellLoadout, availableSpellGrades, defaultSpellGrade } from '../engine/classes';
import { RetroSpellIcon } from './RetroAssets';

export default function SpellLoadoutPicker({ classId, loadout, change, weapon }) {
  const [dragged, setDragged] = useState(null);
  const [query, setQuery] = useState('');
  const config = loadout.spells || {};
  const level = loadout.level || 100;
  const spells = [...(weapon ? [weapon] : []), ...Object.values(resolveSpellLoadout(classId, loadout).spells)]
    .sort((a, b) => {
      const order = config.order?.length ? config.order : [0];
      const ai = order.indexOf(a.id), bi = order.indexOf(b.id);
      return (ai < 0 ? 10000 : ai) - (bi < 0 ? 10000 : bi);
    });
  const selected = config.common || [];
  const update = patch => change(current => ({ ...current, spells: { ...current.spells, ...patch } }));
  const move = (id, before) => {
    const order = spells.map(s => s.id).filter(s => s !== id);
    const at = before == null ? order.length : order.indexOf(before);
    order.splice(Math.max(0, at), 0, id);
    update({ order });
  };
  const common = SPELL_LIBRARY.common.map(id => SPELL_LIBRARY.spells[id])
    .filter(s => s.name.toLocaleLowerCase('fr').includes(query.toLocaleLowerCase('fr')));
  return <section className="spell-loadout" aria-label="Sorts avant combat">
    <div className="loadout-heading"><div><p className="eyebrow">SORTS ET RACCOURCIS</p><h2>Préparer les sorts</h2></div>
      <button type="button" className="btn subtle" onClick={() => update({ order: [] })}>Ordre de classe</button></div>
    <p className="muted small">Glissez les sorts ou utilisez les flèches pour organiser votre barre. Choisissez leur grade et ajoutez les sorts appris par parchemin ou quête. La configuration est sauvegardée pour ce personnage.</p>
    <div className="spell-defaults"><p>Par défaut : tous les sorts disponibles au <strong>niveau {level >= 200 ? 6 : 5}</strong> · passage automatique au niveau 6 quand votre personnage atteint le niveau 200.</p>
      <button type="button" className="btn" disabled={!Object.keys(config.grades || {}).length} onClick={() => update({ grades: {} })}>Rétablir les niveaux par défaut</button></div>
    <div className="spell-loadout-columns">
      <div><h3>Votre barre · {spells.length} sorts</h3>
        <ol className="spell-loadout-order" aria-label="Ordre des sorts">
          {spells.map((spell, index) => <li key={spell.id} data-spell-id={spell.id}
            draggable onDragStart={event => { setDragged(spell.id); event.dataTransfer.setData('text/plain', String(spell.id)); }}
            onDragEnd={() => setDragged(null)} onDragOver={event => event.preventDefault()}
            onDrop={event => { event.preventDefault(); if (dragged != null && dragged !== spell.id) move(dragged, spell.id); setDragged(null); }}>
            <span className="spell-position">{index + 1}</span><RetroSpellIcon spell={spell} />
            <span className="spell-loadout-name"><strong>{spell.name}</strong><small>{spell.pa} PA · PO {spell.range.join('–')}{spell.cooldown ? ` · Relance ${spell.cooldown} t` : ''}</small></span>
            {!spell.isWeapon && <label className="spell-grade">Grade<select aria-label={`Grade de ${spell.name}`} value={config.grades?.[spell.id] ?? 'auto'}
              onChange={event => {
                const grades = { ...config.grades };
                if (event.target.value === 'auto') delete grades[spell.id];
                else grades[spell.id] = Number(event.target.value);
                update({ grades });
              }}>
              <option value="auto">Auto · {defaultSpellGrade(spell.id, level)}</option>
              {availableSpellGrades(spell.id, level).map(g => <option key={g} value={g}>{g}</option>)}
            </select></label>}
            <div className="spell-order-buttons"><button type="button" className="btn" disabled={!index} aria-label={`Monter ${spell.name}`} onClick={() => move(spell.id, spells[index - 1].id)}>↑</button>
              <button type="button" className="btn" disabled={index === spells.length - 1} aria-label={`Descendre ${spell.name}`} onClick={() => move(spell.id, spells[index + 2]?.id)}>↓</button></div>
          </li>)}
        </ol>
      </div>
      <div><h3>Sorts communs</h3><input type="search" aria-label="Rechercher un sort commun" placeholder="Flamiche, Libération, maîtrise…" value={query} onChange={e => setQuery(e.target.value)} />
        <div className="common-spell-list">{common.map(spell => <label key={spell.id} className={`common-spell${selected.includes(spell.id) ? ' selected' : ''}`}>
          <input type="checkbox" aria-label={`Apprendre ${spell.name}`} checked={selected.includes(spell.id)} onChange={e => update({ common: e.target.checked ? [...selected, spell.id] : selected.filter(id => id !== spell.id) })} />
          <RetroSpellIcon spell={{ id: spell.id, emoji: '✦' }} /><span><strong>{spell.name}</strong><small>{[413, 414].includes(spell.id) ? 'Capture : sans effet sur les joueurs de cette arène.' : spell.description}</small></span>
        </label>)}</div>
        <p className="muted small">Les sorts spéciaux de votre classe sont inclus. Le niveau du personnage limite les grades accessibles ; les points de sorts supplémentaires sont supposés obtenus par parchemins dans ce mode de préparation libre.</p>
      </div>
    </div>
  </section>;
}
