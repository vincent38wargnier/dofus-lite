import React, { useEffect, useState } from 'react';
import { Star } from 'lucide-react';

export function RatingSummary({ rating, compact = false }) {
  const count = rating?.count || 0;
  return <span className={'af-rating-summary' + (compact ? ' compact' : '')}>
    <Star size={compact ? 15 : 19} aria-hidden="true" fill={count ? 'currentColor' : 'none'} />
    {count ? <><strong>{rating.average.toLocaleString('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}<small>/5</small></strong><span>({count} {count === 1 ? 'note' : 'notes'})</span></> : <span>Pas encore de note</span>}
  </span>;
}

export default function WorldRating({ library, user, busy, onLogin, onSave }) {
  const [value, setValue] = useState(library.myRating || 0);
  useEffect(() => setValue(library.myRating || 0), [library.id, library.myRating, user?.id]);
  const owner = user?.id === library.owner;
  return <section className="af-world-rating" aria-label="Notes des joueurs">
    <div><h2>L’aventure vous a plu ?</h2><RatingSummary rating={library.rating} /></div>
    {!user ? <div><p>Connectez-vous pour donner votre note.</p><button className="af-button" onClick={onLogin}>Se connecter pour noter</button></div>
      : owner ? <p>Les autres joueurs peuvent noter votre monde.</p>
        : <form onSubmit={event => { event.preventDefault(); onSave(value); }}>
          <fieldset disabled={busy}><legend>{library.myRating ? 'Votre note' : 'Notez ce monde'}</legend>
            <div className="af-rating-stars">{[1, 2, 3, 4, 5].map(score => <label key={score} className={value >= score ? 'filled' : ''}>
              <input type="radio" name="world-rating" value={score} checked={value === score} onChange={() => setValue(score)} aria-label={`${score} étoile${score === 1 ? '' : 's'}`} />
              <Star size={27} aria-hidden="true" fill={value >= score ? 'currentColor' : 'none'} />
            </label>)}</div>
          </fieldset>
          <div className="af-actions"><button className="af-button" disabled={busy || !value || value === library.myRating}>{library.myRating ? 'Modifier ma note' : 'Enregistrer ma note'}</button>
            {library.myRating && <button type="button" className="af-link" disabled={busy} onClick={() => onSave(null)}>Retirer ma note</button>}</div>
          <p className="af-caption">Une note par compte, modifiable à tout moment.</p>
        </form>}
  </section>;
}
