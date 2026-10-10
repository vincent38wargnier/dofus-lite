import React, { useEffect, useId, useState } from 'react';
import { Brain, Droplets, Flame, Heart, Leaf, Minus, Plus, RotateCcw, Wind } from 'lucide-react';
import { CLASSES } from '../engine/classes';
import { CHARACTERISTICS, EQUIPMENT, STAT_LABELS, pointCost } from '../engine/equipment';
import { allocateCharacteristic, characteristicStep, maximumCharacteristic } from '../engine/characteristicAllocation';
import '../styles/characteristicAllocator.css';

const DETAILS = {
  vitalite: { Icon: Heart, text: 'Points de vie' },
  force: { Icon: Leaf, text: 'Terre & neutre' },
  intelligence: { Icon: Flame, text: 'Feu & soins' },
  chance: { Icon: Droplets, text: 'Eau' },
  agilite: { Icon: Wind, text: 'Air, tacle & critiques' },
  sagesse: { Icon: Brain, text: 'Retrait & esquive PA / PM' },
};

function AllocationValue({ value, gain, label, onCommit, id }) {
  const [draft, setDraft] = useState(null);
  const text = draft?.base === value ? draft.text : String(value);
  const commit = () => {
    // An empty field is not a request to erase an existing allocation.
    const next = text.trim() === '' ? value : Number(text);
    onCommit(next);
    setDraft(null);
  };
  return <input id={id} type="number" inputMode="numeric" min="0" max="1990" step={gain}
    aria-label={`${label} de base`} value={text} onChange={event => setDraft({ base: value, text: event.target.value })}
    onBlur={commit} onKeyDown={event => {
      if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
      if (event.key === 'Escape') { setDraft(null); }
    }} />;
}

export default function CharacteristicAllocator({ classId, summary, onChange }) {
  const id = useId();
  const [error, setError] = useState('');
  const [undo, setUndo] = useState(null);
  const base = summary.base;
  const remaining = summary.characteristicPoints - summary.points;
  const invalid = !Number.isFinite(remaining);
  useEffect(() => { setError(''); setUndo(null); }, [classId, summary.level]);
  useEffect(() => { setError(''); setUndo(previous => summary.points === 0 ? previous : null); }, [summary.points]);
  const setValue = (stat, amount) => {
    const result = allocateCharacteristic(classId, stat, amount, base, summary.level);
    setError(result.error || '');
    if (result.error) return false;
    if (amount !== base[stat]) {
      setUndo(null);
      onChange(current => ({ ...current, base: result.base }));
    }
    return true;
  };
  const reset = () => {
    setUndo({ ...base }); setError('');
    onChange(current => ({ ...current, base: Object.fromEntries(CHARACTERISTICS.map(stat => [stat, 0])) }));
  };

  return <section className="characteristic-allocator" aria-labelledby={`${id}-heading`}>
    <div className="allocation-heading">
      <div><h2 id={`${id}-heading`}>Répartissez vos points</h2><p><strong>Parchottage 101 offert dans les six caractéristiques.</strong> Ajoutez vos boosts avec les points gagnés par niveau.</p></div>
      <div className={`allocation-budget${remaining < 0 || invalid ? ' over-budget' : ''}`} role="status" aria-live="polite" aria-atomic="true">
        <strong data-remaining-points={remaining}>{invalid ? '—' : Math.abs(remaining)}</strong>
        <span>{invalid ? 'répartition invalide' : remaining < 0 ? 'points en trop' : 'points disponibles'}<small>sur {summary.characteristicPoints} au niveau {summary.level}</small></span>
      </div>
    </div>
    <div className="allocation-toolbar"><p><strong>+5 points</strong> par niveau · 0 au niveau 1</p>
      <button type="button" className="allocation-reset" onClick={reset} disabled={CHARACTERISTICS.every(stat => base[stat] === 0)}><RotateCcw size={13} /> Tout remettre à zéro</button></div>
    {remaining < 0 || invalid ? <p className="allocation-error" role="alert">{invalid ? 'Corrigez les valeurs invalides ou remettez la répartition à zéro.' : `Cette répartition dépasse le capital de ce niveau de ${-remaining} points. Retirez des points pour pouvoir jouer.`} Votre répartition a été conservée.</p> : null}
    <table className="allocation-table">
      <caption className="allocation-sr-only">Parchottage gratuit, boosts achetés avec le capital, coût, bonus du stuff et total.</caption>
      <thead><tr><th scope="col">Caractéristique</th><th scope="col">Parcho</th><th scope="col">Vos boosts</th><th scope="col">Prochain ajout</th><th scope="col">Stuff</th><th scope="col">Total</th></tr></thead>
      <tbody>{CHARACTERISTICS.map(stat => {
        const { Icon, text } = DETAILS[stat];
        const value = base[stat];
        const step = characteristicStep(classId, stat, value) || { cost: 1, gain: 1 };
        const spent = pointCost(classId, stat, value);
        const max = maximumCharacteristic(classId, stat, base, summary.level);
        const refund = spent - pointCost(classId, stat, Math.max(0, value - step.gain));
        return <tr key={stat} data-allocation-stat={stat} className={`allocation-row ${stat}`}>
          <th scope="row"><label htmlFor={`${id}-${stat}`}><Icon size={18} /><span>{STAT_LABELS[stat]}<small>{text}</small></span></label></th>
          <td className="allocation-parchment"><span className="allocation-mobile-label">Parcho </span>+{summary.parchments[stat]}</td>
          <td className="allocation-value"><div className="allocation-controls">
            <button type="button" className="allocation-min" aria-label={`Minimum en ${STAT_LABELS[stat]}`} title="Remettre ces boosts à 0 et récupérer leurs points, sans changer les autres caractéristiques" disabled={value === 0} onClick={() => setValue(stat, 0)}>Min</button>
            <button type="button" aria-label={`Diminuer ${STAT_LABELS[stat]}`} title={`Récupérer ${refund} point(s) de capital`} disabled={value <= 0} onClick={() => setValue(stat, Math.max(0, value - step.gain))}><Minus size={14} /></button>
            <AllocationValue key={classId} id={`${id}-${stat}`} label={STAT_LABELS[stat]} value={value} gain={step.gain} onCommit={amount => setValue(stat, amount)} />
            <button type="button" aria-label={`Augmenter ${STAT_LABELS[stat]}`} title={`${step.cost} point(s) de capital pour +${step.gain}`} disabled={invalid || remaining < step.cost} onClick={() => setValue(stat, value + step.gain)}><Plus size={14} /></button>
            <button type="button" className="allocation-max" aria-label={`Maximum en ${STAT_LABELS[stat]}`} title="Utiliser les points restants ici, sans changer les autres caractéristiques" disabled={max <= value || remaining <= 0 || invalid} onClick={() => setValue(stat, max)}>Max</button>
          </div><small className="allocation-spent">{Number.isFinite(spent) ? spent : '—'} points investis</small></td>
          <td className="allocation-cost"><strong>{step.cost}</strong> pour <strong>+{step.gain}</strong><small>point{step.cost > 1 ? 's' : ''} de capital</small></td>
          <td className="allocation-gear"><span className="allocation-mobile-label">Stuff </span>{(summary.bonuses[stat] || 0) > 0 ? '+' : ''}{summary.bonuses[stat] || 0}</td>
          <td className="allocation-total"><span className="allocation-mobile-label">Total </span><strong>{summary.stats[stat]}</strong></td>
        </tr>;
      })}</tbody>
    </table>
    {error ? <p className="allocation-error" role="alert">Valeur non appliquée. {error}</p> : null}
    {undo ? <p className="allocation-undo" role="status">Points récupérés. <button type="button" onClick={() => { onChange(current => ({ ...current, base: undo })); setUndo(null); }}>Annuler la remise à zéro</button></p> : null}
    <div className="allocation-footer"><p>Total = 101 de parchottage + vos boosts + le stuff. Les paliers tiennent compte du parchottage ; les 101 points restent gratuits. Remettre à zéro retire uniquement vos boosts.</p>
      <details className="allocation-tiers"><summary>Voir les paliers de {CLASSES[classId].name}</summary>
        <p>Coût du prochain ajout selon la base actuelle : 101 de parchottage + vos boosts, hors équipement.</p>
        <dl>{CHARACTERISTICS.map(stat => <div key={stat}><dt>{STAT_LABELS[stat]}</dt><dd>{EQUIPMENT.caps[classId][stat].map(([threshold, cost, gain = 1], index, tiers) =>
          <span key={threshold} className={summary.baseStats[stat] >= threshold && (!tiers[index + 1] || summary.baseStats[stat] < tiers[index + 1][0]) ? 'current-tier' : ''}>
            {tiers[index + 1] ? `${threshold}–${tiers[index + 1][0] - 1}` : `${threshold}+`} : {cost} pour +{gain}
          </span>)}</dd></div>)}</dl>
        <p className="allocation-source">Paliers : <a href="https://dofusretro.cdn.ankama.com/static-data/612/lang/swf/classes_fr_1391.swf" target="_blank" rel="noreferrer">données officielles Dofus Retro</a>.</p>
      </details>
    </div>
  </section>;
}
