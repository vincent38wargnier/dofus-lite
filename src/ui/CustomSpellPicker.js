import React, { useMemo, useState } from 'react';
import { buildSpell } from '../engine/classes';
import { MAX_CUSTOM_SPELLS } from '../engine/customSpells';
import { isAuthoredSpell, newAuthoredSpell, duplicateAuthoredSpell, authoredSpellErrors, AUTHORED_LEVEL } from '../engine/authoredSpells';
import SpellDesigner from './SpellDesigner';
import SpellBudget from './SpellBudget';
import { spellBalance, spellbookBalance, spellbookBudgetErrors } from '../engine/spellBalance';
import { RetroSpellIcon } from './RetroAssets';
import { sortSpellsByType } from './spellPresentation';
import { CREATION_SPELLS, CREATION_SPELLS_BY_ID, SPELL_SOURCES, ACTION_LABELS, ROLE_LABELS,
  filterCreationSpells, spellLimitations } from './creationCatalogue';

export default function CustomSpellPicker({ loadout, change, ownerType = 'class' }) {
  const ownerLabel = ownerType === 'monster' ? 'monstre' : 'classe';
  const [filters, setFilters] = useState({});
  const [inspected, setInspected] = useState(null);
  const [grades, setGrades] = useState({});
  const [dragged, setDragged] = useState(null);
  const [designer, setDesigner] = useState(null);
  const [notice, setNotice] = useState('');
  const selected = loadout.spells?.custom || [];
  const balance = spellbookBalance(selected);
  const order = loadout.spells?.order || [];
  const ordered = [...selected].sort((a, b) => {
    const ai = order.indexOf(a.id), bi = order.indexOf(b.id);
    return (ai < 0 ? 10000 : ai) - (bi < 0 ? 10000 : bi);
  });
  const selectedIds = new Set(selected.map(spell => spell.id));
  const results = useMemo(() => filterCreationSpells(CREATION_SPELLS, filters), [filters]);
  const filter = (key, value) => setFilters(previous => ({ ...previous, [key]: value }));
  const update = (custom, order = custom.map(spell => spell.id)) => change(current => ({ ...current,
    spells: { ...current.spells, custom, order } }));
  const rawFor = entry => entry.grades.find(raw => raw.grade === grades[entry.id]) || entry.grades.at(-1);
  const add = raw => {
    if (selectedIds.has(raw.id) || selected.length >= MAX_CUSTOM_SPELLS) return;
    const errors = spellbookBudgetErrors([...ordered, raw]);
    if (errors.length) { setNotice(errors.join(' ')); return; }
    update([...ordered, raw]);
  };
  const openDesigner = (raw, editing = false) => { setDesigner({ raw, editing }); setNotice(''); };
  const saveSpell = raw => {
    if (authoredSpellErrors(raw).length) return;
    const next = [...ordered.filter(spell => spell.id !== raw.id), raw];
    const nextBalance = spellbookBalance(next);
    if (nextBalance.score > nextBalance.limit && !(designer.editing && balance.score > balance.limit && nextBalance.score < balance.score)) return;
    if (designer.editing) {
      if (!selectedIds.has(raw.id)) return;
      update(ordered.map(spell => spell.id === raw.id ? raw : spell));
    } else {
      if (selectedIds.has(raw.id) || selected.length >= MAX_CUSTOM_SPELLS) return;
      add(raw);
    }
    setDesigner(null); setNotice(`${raw.name} ${designer.editing ? 'modifié' : `ajouté à votre ${ownerLabel}`}.${nextBalance.valid ? ' Vous pouvez le tester en combat.' : ' Continuez à rééquilibrer le kit avant de jouer.'}`);
  };
  const move = (id, offset) => {
    const next = [...ordered];
    const index = next.findIndex(spell => spell.id === id);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= next.length) return;
    next.splice(target, 0, next.splice(index, 1)[0]); update(next);
  };
  const entry = CREATION_SPELLS_BY_ID[inspected];
  const raw = entry && rawFor(entry);
  const limitations = raw ? spellLimitations(raw) : [];
  const availableActions = [...new Set(CREATION_SPELLS.flatMap(spell => spell.actions))]
    .sort((a, b) => ACTION_LABELS[a].localeCompare(ACTION_LABELS[b], 'fr'));
  return <section className="custom-spell-picker" aria-label="Sorts personnalisés">
    <div className="creator-section-heading"><div><h3>Composez votre grimoire</h3><p>Créez un sort ou piochez dans le catalogue. {MAX_CUSTOM_SPELLS} sorts maximum{ownerType === 'class' ? ', plus votre arme' : ''}.</p></div>
      <div className="creator-new-spell"><span className="creator-count">{selected.length} / {MAX_CUSTOM_SPELLS} sorts</span>
        <button type="button" className="btn primary" disabled={selected.length >= MAX_CUSTOM_SPELLS || !!designer}
          onClick={() => openDesigner(newAuthoredSpell([...selectedIds]))}>+ Créer un sort</button></div></div>
    {notice && <p className="creator-spell-save-notice" role="status">{notice}</p>}
    {loadout.level < AUTHORED_LEVEL && <p className="creator-warning">Les nouveaux sorts utilisent le grade 6, au niveau {AUTHORED_LEVEL}. Passez votre personnage au niveau {AUTHORED_LEVEL} pour les tester.</p>}
    {selected.length > MAX_CUSTOM_SPELLS && <p className="creator-warning" role="alert">Cette ancienne création contient {selected.length} sorts. Retirez-en {selected.length - MAX_CUSTOM_SPELLS} pour pouvoir jouer. Vos choix restent enregistrés pendant la modification.</p>}
    <div className="creator-spell-columns">
      <aside className="creator-spell-selection">
        <div className="creator-section-heading"><h4>Vos sorts</h4><button type="button" className="btn" disabled={selected.length < 2}
          onClick={() => update(selected, sortSpellsByType(selected.map(buildSpell)))}>Trier par type</button></div>
        <p className="muted small">Glissez les sorts pour les réordonner.</p>
        <SpellBudget report={balance} label={ownerType === 'class' ? 'Budget de la classe' : 'Budget du monstre'} />
        {!balance.valid && <p className="creator-warning" role="alert">Création conservée. Rééquilibrez les sorts signalés pour pouvoir jouer.</p>}
        {selected.length === MAX_CUSTOM_SPELLS && <p className="creator-spell-limit" role="status">{MAX_CUSTOM_SPELLS} sorts sélectionnés. Retirez-en un pour le remplacer.</p>}
        {!selected.length && <p className="creator-empty">Créez votre premier sort ou choisissez-le dans le catalogue →</p>}
        <ol className="creator-selected-spells">{ordered.map((spell, index) => <li key={spell.id} draggable
          onDragStart={event => { event.dataTransfer.setData('text/plain', String(spell.id)); event.dataTransfer.effectAllowed = 'move'; setDragged(spell.id); }}
          onDragEnd={() => setDragged(null)} onDragOver={event => { if (dragged !== null) event.preventDefault(); }}
          onDrop={event => { event.preventDefault(); if (dragged !== null) move(dragged, index - ordered.findIndex(value => value.id === dragged)); setDragged(null); }}>
          <button type="button" className="creator-spell-inspect" disabled={!!designer} onClick={() => isAuthoredSpell(spell) ? openDesigner(spell, true) : setInspected(spell.id)}><RetroSpellIcon spell={spell} /><span><strong>{spell.name}</strong><small>{spell.pa} PA · {spell.rangeMin}–{spell.rangeMax} PO</small></span></button>
          <div className="creator-selected-actions">{isAuthoredSpell(spell) ? <span className="creator-authored-label">Créé · niv. {spell.requiredLevel}</span> : <label>Grade<select aria-label={`Grade de ${spell.name}`} value={spell.grade}
            onChange={event => update(ordered.map(value => value.id === spell.id ? CREATION_SPELLS_BY_ID[spell.id]?.grades.find(grade => grade.grade === Number(event.target.value)) || value : value))}>
            {(CREATION_SPELLS_BY_ID[spell.id]?.grades || [spell]).map(grade => <option key={grade.grade} value={grade.grade}>{grade.grade}</option>)}</select></label>}
            <button type="button" className="btn" aria-label={`Monter ${spell.name}`} disabled={!index} onClick={() => move(spell.id, -1)}>↑</button>
            <button type="button" className="btn" aria-label={`Descendre ${spell.name}`} disabled={index === ordered.length - 1} onClick={() => move(spell.id, 1)}>↓</button>
            <button type="button" className="btn" disabled={designer?.raw.id === spell.id} aria-label={`Retirer ${spell.name}`} onClick={() => update(ordered.filter(value => value.id !== spell.id))}>×</button></div>
          <small className={spellBalance(spell).valid ? 'muted' : 'creator-warning'}>Score : {spellBalance(spell).score} / 100</small>
          {isAuthoredSpell(spell) && <div className="creator-authored-actions"><button type="button" className="btn" disabled={!!designer} aria-label={`Modifier ${spell.name}`} onClick={() => openDesigner(spell, true)}>Modifier</button>
            <button type="button" className="btn" disabled={!!designer || selected.length >= MAX_CUSTOM_SPELLS} aria-label={`Dupliquer ${spell.name}`} onClick={() => openDesigner(duplicateAuthoredSpell(spell, [...selectedIds]))}>Dupliquer</button></div>}
        </li>)}</ol>
      </aside>
      {designer ? <SpellDesigner key={designer.raw.id} initialSpell={designer.raw} editing={designer.editing} existingSpells={selected}
        onSave={saveSpell} onCancel={() => setDesigner(null)} /> : <div className="creator-spell-catalogue">
        <div className="creator-section-heading"><h4>Catalogue des sorts</h4><span>{results.length} / {CREATION_SPELLS.length} sorts</span></div>
        <label className="field creator-search">Rechercher<input type="search" placeholder="Furie, Iop, Bouftou Royal, soin…" aria-label="Rechercher dans tous les sorts" value={filters.query || ''} onChange={event => filter('query', event.target.value)} /></label>
        <div className="studio-quick-filters" role="group" aria-label="Types de sorts">{[['', 'Tous'], ['damage', 'Attaque'], ['boost', 'Boost'], ['heal', 'Soin'], ['placement', 'Placement'], ['summon', 'Invocation'], ['debuff', 'Retrait']].map(([id, label]) =>
          <button type="button" key={id} aria-pressed={(filters.role || '') === id} onClick={() => filter('role', id)}>{label}</button>)}</div>
        <details className="studio-advanced-filters"><summary>Filtres avancés{Object.entries(filters).filter(([key, value]) => value && !['query', 'role'].includes(key)).length > 0 ? ' · actifs' : ''}</summary><div className="creator-filters">
          <label className="field">Origine<select value={filters.origin || ''} onChange={event => setFilters(previous => ({ ...previous, origin: event.target.value, source: '' }))}>
            <option value="">Classes et monstres</option><option value="class">Personnages</option><option value="monster">Monstres et invocations</option></select></label>
          <label className="field">Classe ou monstre<select value={filters.source || ''} onChange={event => filter('source', event.target.value)}>
            <option value="">Toutes les origines</option>{['class', 'monster'].filter(type => !filters.origin || type === filters.origin).map(type => <optgroup key={type} label={type === 'class' ? 'Classes' : 'Monstres et invocations'}>
              {SPELL_SOURCES.filter(source => source.type === type).map(source => <option key={source.id} value={source.id}>{source.name}</option>)}</optgroup>)}</select></label>
          <label className="field">Type de sort<select value={filters.role || ''} onChange={event => filter('role', event.target.value)}>
            <option value="">Tous les types</option>{Object.entries(ROLE_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
          <label className="field">Action<select value={filters.action || ''} onChange={event => filter('action', event.target.value)}>
            <option value="">Toutes les actions</option>{availableActions.map(kind => <option key={kind} value={kind}>{ACTION_LABELS[kind]}</option>)}</select></label>
          <label className="field">Élément des dégâts<select value={filters.element || ''} onChange={event => filter('element', event.target.value)}>
            <option value="">Tous les éléments</option>{[['terre', 'Terre'], ['feu', 'Feu'], ['eau', 'Eau'], ['air', 'Air'], ['neutre', 'Neutre'], ['multi', 'Plusieurs éléments'], ['none', 'Sans dégâts élémentaires']].map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
          <label className="field">Zone<select value={filters.area || ''} onChange={event => filter('area', event.target.value)}>
            <option value="">Toutes les zones</option><option value="area">Sorts de zone</option><option value="single">Une case</option></select></label>
          <label className="field">Trier par<select value={filters.sort || 'name'} onChange={event => filter('sort', event.target.value)}>
            <option value="name">Nom</option><option value="role">Type de sort</option><option value="action">Type d’action</option><option value="element">Élément des dégâts</option><option value="pa">Coût en PA</option><option value="range">Portée décroissante</option></select></label>
          <button type="button" className="btn" onClick={() => setFilters({})}>Réinitialiser les filtres</button>
        </div></details>
        {raw && <section className="creator-spell-detail" aria-label={`Détail de ${entry.name}`}>
          <div className="creator-section-heading"><h4>{entry.name}</h4><button type="button" className="btn" onClick={() => setInspected(null)}>Fermer le détail</button></div>
          <p className="muted small">{entry.sources.map(source => source.name).join(' · ')}</p>
          {entry.description && <p>{entry.description}</p>}
          <div className="creator-inline"><label className="field">Grade consulté<select value={raw.grade} onChange={event => setGrades(previous => ({ ...previous, [entry.id]: Number(event.target.value) }))}>
            {entry.grades.map(grade => <option key={grade.grade} value={grade.grade}>{grade.grade}</option>)}</select></label>
            <span>{raw.pa} PA · {raw.rangeMin}–{raw.rangeMax} PO · Relance : {raw.cooldown} tour(s)</span>
            <button type="button" className="btn primary" disabled={selectedIds.has(entry.id) || selected.length >= MAX_CUSTOM_SPELLS} onClick={() => add(raw)}>{selectedIds.has(entry.id) ? 'Déjà ajouté' : 'Ajouter ce sort'}</button></div>
          <p className="muted small">{raw.lineOnly ? 'En ligne · ' : ''}{raw.needsLos ? 'Ligne de vue requise' : 'Sans ligne de vue'} · {raw.maxPerTurn || 'Illimité'} lancer(s) par tour · {raw.emptyCellOnly ? 'Case libre requise' : raw.rangeMax === 0 ? 'Sur soi' : 'Ciblage selon les effets'}</p>
          {limitations.length > 0 && <ul className="creator-warning">{limitations.map(note => <li key={note}>{note}</li>)}</ul>}
          <div className="creator-effect-table"><table><thead><tr><th>Effet</th><th>Valeur</th><th>Zone</th><th>Durée</th></tr></thead><tbody>{raw.effects.map((effect, index) => <tr key={index}>
            <td>{ACTION_LABELS[effect.kind] || 'Effet non simulé'} {effect.element || effect.stat || ''}</td><td>{effect.min ?? '—'}{effect.max !== effect.min ? `–${effect.max ?? '—'}` : ''}</td><td>{effect.zone}</td><td>{effect.duration ? `${effect.duration} tours` : 'Immédiat'}</td>
          </tr>)}</tbody></table></div>
        </section>}
        <div className="creator-spell-results" aria-label="Résultats du catalogue de sorts">{results.map(result => {
          const grade = rawFor(result);
          const warnings = spellLimitations(grade);
          return <article key={result.id} className={`creator-spell-card${selectedIds.has(result.id) ? ' selected' : ''}`}>
            <button type="button" className="creator-spell-inspect" onClick={() => setInspected(result.id)} aria-label={`Voir ${result.name} (${result.id})`}>
              <RetroSpellIcon spell={grade} /><span><strong>{result.name}</strong><small title={result.sources.map(source => source.name).join(', ')}>{result.sources[0]?.name}{result.sources.length > 1 ? ` +${result.sources.length - 1}` : ''}</small></span></button>
            <div className="creator-spell-tags">{result.roles.map(role => <span key={role}>{ROLE_LABELS[role]}</span>)}{result.elements.map(element => <span key={element}>{element}</span>)}{result.area && <span>Zone</span>}</div>
            <small className={spellBalance(grade).valid ? 'muted' : 'creator-warning'}>{result.actions.slice(0, 2).map(action => ACTION_LABELS[action]).join(' · ')} · Score {spellBalance(grade).score}/100</small>
            <div className="creator-spell-facts"><span>{grade.pa} PA · {grade.rangeMin}–{grade.rangeMax} PO · Grade {grade.grade}</span>
              <button type="button" className="btn" disabled={selectedIds.has(result.id) || selected.length >= MAX_CUSTOM_SPELLS}
                aria-label={`Ajouter ${result.name} (${result.id})`} onClick={() => add(grade)}>{selectedIds.has(result.id) ? '✓ Ajouté' : '+ Ajouter'}</button></div>
            {warnings.length > 0 && <small className="creator-warning">Conditions ou limites · voir le détail</small>}
          </article>;
        })}</div>
        {!results.length && <p className="creator-empty">Aucun sort ne correspond. Essayez un autre nom ou réinitialisez les filtres.</p>}
      </div>}
    </div>
  </section>;
}
