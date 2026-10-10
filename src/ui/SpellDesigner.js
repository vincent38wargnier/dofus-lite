import React, { useMemo, useState } from 'react';
import { buildSpell } from '../engine/classes';
import { spellZoneCells } from '../engine/geometry';
import { AUTHORED_LEVEL, EFFECT_TYPES, ELEMENTS, EFFECT_STATS, EFFECT_ZONES, EFFECT_RECIPIENTS, SPELL_TARGETS,
  newAuthoredSpell, newAuthoredEffect, normalizeAuthoredSpell, authoredSpellErrors, authoredSpellWarnings } from '../engine/authoredSpells';
import { CREATION_SPELLS } from './creationCatalogue';
import { RetroSpellIcon } from './RetroAssets';
import '../styles/spellDesigner.css';

const clone = value => JSON.parse(JSON.stringify(value));
const visuals = CREATION_SPELLS.filter(entry => entry.sources.some(source => source.type === 'class'));
const options = values => Object.entries(values).map(([id, label]) => <option key={id} value={id}>{label}</option>);
function NumberField({ label, value, onChange, min = 0, max = 100, hint }) {
  return <label className="field">{label}<input type="number" min={min} max={max} step="1" value={value}
    onChange={event => onChange(event.target.value === '' ? '' : Number(event.target.value))} />{hint && <small>{hint}</small>}</label>;
}
function SelectField({ label, value, onChange, children }) {
  return <label className="field">{label}<select value={value} onChange={event => onChange(event.target.value)}>{children}</select></label>;
}

function ZonePreview({ zone, self }) {
  const target = self ? { x: -2, y: 0 } : { x: 0, y: 0 };
  const cells = new Set(spellZoneCells(zone, target, { x: -2, y: 0 }).map(p => `${p.x},${p.y}`));
  return <svg className="spell-designer-zone" viewBox="0 0 196 108" role="img" aria-label={`Zone : ${EFFECT_ZONES[zone]}`}>
    {Array.from({ length: 49 }, (_, index) => {
      const x = index % 7 - 3, y = Math.floor(index / 7) - 3;
      const cx = 98 + (x - y) * 14, cy = 54 + (x + y) * 7;
      return <g key={index}><path d={`M${cx},${cy - 7}l14,7 -14,7 -14,-7Z`} className={cells.has(`${x},${y}`) ? 'affected' : ''} />
        {x === target.x && y === target.y && <circle cx={cx} cy={cy} r="3" className="aimed" />}
        {x === -2 && y === 0 && <circle cx={cx} cy={cy} r="3" className="caster" />}</g>;
    })}</svg>;
}

function EffectEditor({ effect, index, count, onChange, onMove, onRemove }) {
  const type = EFFECT_TYPES[effect.kind];
  const patch = change => onChange({ ...effect, ...change });
  return <fieldset className="spell-designer-effect"><legend>Effet {index + 1}</legend>
    <div className="spell-designer-effect-heading"><SelectField label="Action" value={effect.kind} onChange={kind => onChange(newAuthoredEffect(kind))}>
      {options(Object.fromEntries(Object.entries(EFFECT_TYPES).map(([id, info]) => [id, info.label])))}</SelectField>
      <div className="spell-designer-effect-actions"><button type="button" className="btn" aria-label={`Monter l’effet ${index + 1}`} disabled={!index} onClick={() => onMove(-1)}>↑</button>
        <button type="button" className="btn" aria-label={`Descendre l’effet ${index + 1}`} disabled={index === count - 1} onClick={() => onMove(1)}>↓</button>
        <button type="button" className="btn" aria-label={`Retirer l’effet ${index + 1}`} disabled={count <= 1} onClick={onRemove}>×</button></div></div>
    <div className="spell-designer-fields">
      {type.element && <SelectField label="Élément" value={effect.element} onChange={element => patch({ element })}>{options(ELEMENTS)}</SelectField>}
      {type.stat && <SelectField label="Caractéristique" value={effect.stat} onChange={stat => patch({ stat })}>{options(EFFECT_STATS)}</SelectField>}
      {effect.kind !== 'teleport' && <>
        <NumberField label={type.movement ? 'Distance (cases)' : 'Minimum'} value={effect.min} min={1} max={type.max}
          onChange={min => patch(type.movement ? { min, max: min } : { min })} />
        {!type.movement && <NumberField label="Maximum" value={effect.max} min={1} max={type.max} onChange={max => patch({ max })} />}
      </>}
      {type.timed && <NumberField label="Durée (tours)" value={effect.duration} max={5} onChange={duration => patch({ duration })}
        hint={['removePa', 'removePm'].includes(effect.kind) ? 'Actif immédiatement. Sur un adversaire, 0 couvre aussi son prochain tour.' : '0 = tour en cours. Actif dès le lancer.'} />}
      {effect.kind !== 'teleport' && <>
        <SelectField label="Destinataires" value={effect.targetMask} onChange={mask => patch({ targetMask: Number(mask), ...(Number(mask) === 32 ? { zone: 'Pa' } : {}) })}>{options(EFFECT_RECIPIENTS)}</SelectField>
        {effect.targetMask !== 32 && <SelectField label="Zone" value={effect.zone} onChange={zone => patch({ zone })}>{options(EFFECT_ZONES)}</SelectField>}
      </>}
    </div>
    {effect.kind === 'teleport' && <p className="muted small">Le lanceur rejoint la case libre visée. Utilisez cet effet seul, avec une portée non modifiable.</p>}
  </fieldset>;
}

function comparisons(spell) {
  const main = spell.effects[0];
  if (!main) return [];
  return visuals.map(entry => ({ entry, raw: entry.grades.find(g => g.grade === 6) }))
    .filter(({ raw }) => raw?.effects.some(effect => effect.kind === main.kind)
      && !raw.requiredStates?.length && !raw.initialCooldown && raw.effects.every(effect => !effect.chance && !effect.trigger))
    .map(value => ({ ...value, score: Math.abs(value.raw.pa - spell.pa) + Math.abs(value.raw.rangeMax - spell.rangeMax) / 4
      + (value.raw.effects[0]?.zone === main.zone ? 0 : 2) + (value.raw.effects[0]?.element === main.element ? 0 : 1) }))
    .sort((a, b) => a.score - b.score).slice(0, 3);
}

export default function SpellDesigner({ initialSpell, existingSpells, editing, onSave, onCancel }) {
  const [draft, setDraft] = useState(() => clone(initialSpell));
  const [criticalTab, setCriticalTab] = useState(false);
  const [visualQuery, setVisualQuery] = useState('');
  const raw = normalizeAuthoredSpell(draft);
  const errors = authoredSpellErrors(raw);
  const warnings = authoredSpellWarnings(raw, existingSpells);
  const reference = useMemo(() => comparisons(raw), [raw]);
  const patch = values => setDraft(previous => ({ ...previous, ...values }));
  const listKey = criticalTab && draft.critRate ? 'critEffects' : 'effects';
  const effects = draft[listKey];
  const changeEffects = next => patch({ [listKey]: next });
  const moveEffect = (index, offset) => {
    const next = [...effects]; next.splice(index + offset, 0, next.splice(index, 1)[0]); changeEffects(next);
  };
  const changeTarget = targetMode => patch({ targetMode,
    ...(targetMode === 'self' ? { rangeMin: 0, rangeMax: 0, adjustableRange: false }
      : { rangeMin: targetMode === 'enemy' || targetMode === 'freeCell' ? Math.max(1, draft.rangeMin) : draft.rangeMin, rangeMax: Math.max(1, draft.rangeMax) }) });
  const visualOptions = visuals.filter(entry => entry.id === draft.visualSpellId || entry.name.toLocaleLowerCase('fr').includes(visualQuery.toLocaleLowerCase('fr')));
  const preview = buildSpell(raw);
  return <form className="spell-designer" aria-label="Créateur de sort" noValidate onSubmit={event => { event.preventDefault(); if (!errors.length) onSave(raw); }}>
    <div className="creator-section-heading"><div><h4>{editing ? 'Modifier votre sort' : 'Créer un sort'}</h4>
      <p>Combinez les effets dans l’ordre. Votre brouillon sera ajouté à la classe quand vous l’enregistrerez.</p></div>
      <button type="button" className="btn" onClick={onCancel}>Annuler</button></div>
    <div className="spell-designer-layout"><div className="spell-designer-form">
      {!editing && <SelectField label="Partir d’un modèle" value="" onChange={preset => {
        if (!preset) return;
        const next = newAuthoredSpell([], preset);
        setDraft({ ...next, id: draft.id, key: draft.key, name: draft.name, description: draft.description }); setCriticalTab(false);
      }}><option value="">Choisir un point de départ…</option>{options({ attack: 'Attaque à distance', heal: 'Soin', boost: 'Boost sur soi', debuff: 'Retrait de PM', teleport: 'Téléportation' })}</SelectField>}
      <label className="field">Nom du sort<input value={draft.name} maxLength={80} onChange={event => patch({ name: event.target.value })} /></label>
      <label className="field">Description<textarea rows={2} maxLength={800} value={draft.description} placeholder="Rôle, synergies et limites du sort…" onChange={event => patch({ description: event.target.value })} /></label>
      <fieldset className="spell-designer-rules"><legend>Lancer et ciblage</legend>
        <div className="spell-designer-fields">
          <NumberField label="Coût en PA" value={draft.pa} min={1} max={8} onChange={pa => patch({ pa })} />
          <SelectField label="Cible du lancer" value={draft.targetMode} onChange={changeTarget}>{options(SPELL_TARGETS)}</SelectField>
          <NumberField label="Portée minimale" value={draft.rangeMin} max={12} onChange={rangeMin => patch({ rangeMin })} />
          <NumberField label="Portée maximale" value={draft.rangeMax} max={12} onChange={rangeMax => patch({ rangeMax })} />
          <NumberField label="Lancers par tour" value={draft.maxPerTurn} min={1} max={3} onChange={maxPerTurn => patch({ maxPerTurn })} />
          <NumberField label="Lancers par cible" value={draft.maxPerTarget} max={3} onChange={maxPerTarget => patch({ maxPerTarget })} hint="0 = seule la limite par tour s’applique." />
          <NumberField label="Relance (tours)" value={draft.cooldown} max={10} onChange={cooldown => patch({ cooldown })} />
        </div>
        <div className="spell-designer-checks">{[['needsLos', 'Ligne de vue'], ['lineOnly', 'En ligne uniquement'], ['adjustableRange', 'Portée modifiable']].map(([key, label]) => <label key={key}>
          <input type="checkbox" checked={draft[key]} onChange={event => patch({ [key]: event.target.checked })} />{label}</label>)}</div>
      </fieldset>
      <section className="spell-designer-effects"><div className="creator-section-heading"><h4>Effets du sort</h4><span>{effects.length} / 4</span></div>
        <p className="muted small">Résolus de haut en bas. Un boost s’applique immédiatement aux effets suivants. La limite par cible compte la case visée, pas chaque victime de la zone.</p>
        <label className="spell-designer-check"><input type="checkbox" checked={!!draft.critRate} onChange={event => {
          patch({ critRate: event.target.checked ? 50 : 0, critEffects: event.target.checked ? clone(draft.effects) : [] }); setCriticalTab(false);
        }} /> Activer les coups critiques</label>
        {!!draft.critRate && <><NumberField label="Critique : 1 chance sur" value={draft.critRate} min={2} max={100} onChange={critRate => patch({ critRate })} hint="Avant les bonus de critiques du personnage." />
          <div className="spell-designer-variants" role="group" aria-label="Variante des effets"><button type="button" className={`btn${!criticalTab ? ' primary' : ''}`} aria-pressed={!criticalTab} onClick={() => setCriticalTab(false)}>Effets normaux</button>
            <button type="button" className={`btn${criticalTab ? ' primary' : ''}`} aria-pressed={criticalTab} onClick={() => setCriticalTab(true)}>Effets critiques</button></div>
          {criticalTab && <p className="muted small">Cette liste remplace entièrement les effets normaux. <button className="btn" type="button" onClick={() => patch({ critEffects: clone(draft.effects) })}>Copier les effets normaux</button></p>}</>}
        <div aria-label={listKey === 'effects' ? 'Liste des effets normaux' : 'Liste des effets critiques'}>{effects.map((effect, index) => <EffectEditor key={`${listKey}-${index}`} effect={effect} index={index} count={effects.length}
          onChange={value => changeEffects(effects.map((e, i) => i === index ? value : e))} onMove={offset => moveEffect(index, offset)} onRemove={() => changeEffects(effects.filter((_, i) => i !== index))} />)}</div>
        <button type="button" className="btn" disabled={effects.length >= 4} onClick={() => changeEffects([...effects, newAuthoredEffect()])}>+ Ajouter un effet</button>
      </section>
      <details className="spell-designer-visual"><summary>Icône, animation et son</summary><p className="muted small">Reprenez le visuel d’un sort existant. Ses effets restent ceux que vous avez définis ci-dessus.</p>
        <label className="field">Rechercher un visuel<input type="search" value={visualQuery} onChange={event => setVisualQuery(event.target.value)} placeholder="Flèche, Puissance, Bond…" /></label>
        <SelectField label="Visuel du sort" value={draft.visualSpellId} onChange={value => patch({ visualSpellId: Number(value) })}>{visualOptions.map(entry => <option key={entry.id} value={entry.id}>{entry.name} · {entry.sources[0].name}</option>)}</SelectField>
      </details>
      <details><summary>Échec critique</summary><p className="muted small">0 désactive les échecs. Sinon, indiquez le dénominateur de la probabilité (1 sur N).</p>
        <NumberField label="Échec : 1 chance sur" value={draft.failRate} max={1000} onChange={failRate => patch({ failRate })} />
        <label className="spell-designer-check"><input type="checkbox" checked={draft.endsTurnOnFailure} onChange={event => patch({ endsTurnOnFailure: event.target.checked })} /> L’échec termine le tour</label>
      </details>
    </div>
    <aside className="spell-designer-review" aria-label="Aperçu du sort"><div className="creator-spell-inspect"><RetroSpellIcon spell={preview} /><div><strong>{raw.name || 'Votre sort'}</strong><small>Grade 6 · niveau {AUTHORED_LEVEL}</small></div></div>
      <p className="spell-designer-numbers"><strong>{draft.pa || '—'} PA</strong><span>{draft.rangeMin}–{draft.rangeMax} PO</span><span>Relance {draft.cooldown || 0}</span></p>
      <ol className="spell-designer-preview-effects">{effects.map((effect, index) => <li key={index}>
        <strong>{EFFECT_TYPES[effect.kind].label}</strong><span>{effect.kind !== 'teleport' && `${effect.min}–${effect.max} `}{ELEMENTS[effect.element] || EFFECT_STATS[effect.stat] || ''}{effect.duration ? ` · ${effect.duration} tour(s)` : ''}</span>
        <small>{EFFECT_RECIPIENTS[effect.targetMask]} · {EFFECT_ZONES[effect.zone]}</small>
        <ZonePreview zone={effect.zone} self={effect.targetMask === 32} />
      </li>)}</ol><p className="muted small">Bleu : lanceur. Point sombre : case visée. Les valeurs sont brutes, avant caractéristiques, résistances et coefficients de zone.</p>
      <div className="spell-designer-balance"><h4>Repères d’équilibrage</h4>
        <p>Un sort valide n’est pas forcément équilibré. Testez la classe complète contre plusieurs adversaires, avec et sans équipement.</p>
        {!!warnings.length && <ul>{warnings.map(message => <li key={message}>{message}</li>)}</ul>}
        {!!reference.length && <details><summary>Comparer aux sorts existants</summary><table><thead><tr><th>Grade 6</th><th>PA / PO</th><th>Effet brut</th></tr></thead><tbody>{reference.map(({ entry, raw: value }) => {
          const effect = value.effects.find(e => e.kind === raw.effects[0].kind);
          return <tr key={entry.id}><td>{entry.name}<small>{value.maxPerTurn || '∞'}/tour · relance {value.cooldown}</small></td><td>{value.pa} / {value.rangeMin}–{value.rangeMax}</td><td>{effect.min}–{effect.max}<small>{EFFECT_ZONES[effect.zone] || effect.zone}{effect.duration ? ` · ${effect.duration} t` : ''}{value.effects.length > 1 ? ' · autres effets' : ''}</small></td></tr>;
        })}</tbody></table><p className="muted small">Comparaisons indicatives. Les contraintes et les autres effets de ces sorts diffèrent.</p></details>}
      </div>
    </aside></div>
    {!!errors.length && <div className="spell-designer-errors" role="alert"><strong>À corriger avant d’enregistrer</strong><ul>{errors.map(error => <li key={error}>{error}</li>)}</ul></div>}
    <div className="spell-designer-save"><span>{errors.length ? `${errors.length} point(s) à corriger` : 'Définition valide · équilibre à tester'}</span><button type="submit" className="btn primary" disabled={!!errors.length}>{editing ? 'Enregistrer les modifications' : 'Ajouter à ma classe'}</button></div>
  </form>;
}
