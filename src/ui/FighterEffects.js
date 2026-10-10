import React from 'react';
import { CLASSES } from '../engine/classes';
import { RetroSpellIcon } from './RetroAssets';
import { effectDescription, effectDuration, effectTone, groupCombatEffects, statChange, statTone, temporaryBonuses } from './combatEffects';
import '../styles/fighterEffects.css';

const SPELLS = Object.values(CLASSES).flatMap(cls => Object.values(cls.spells));

export default function FighterEffects({ fighter, fighters = {}, isActive }) {
  const groups = groupCombatEffects(fighter);
  const totals = Object.entries(temporaryBonuses(fighter)).filter(([, value]) => value !== 0);
  return <section className="fighter-effects" aria-label={`Effets en cours de ${fighter.name}`}>
    <div className="fighter-effects-heading"><h3>Effets en cours</h3><span>{groups.length}</span></div>
    {groups.length === 0 ? <p className="fighter-effects-empty">Aucun effet temporaire.</p> : <>
      {totals.length > 0 && <div className="combat-bonus-totals" aria-label="Cumul des bonus et malus temporaires" aria-live="polite">
        {totals.map(([stat, value]) => <span key={stat} className={`combat-bonus ${statTone(stat, value)}`} data-bonus-stat={stat}>
          {statChange(stat, value)}
        </span>)}
      </div>}
      <div className="combat-effect-list" tabIndex={0} role="region" aria-label={`Détail des effets de ${fighter.name}`}>
        {groups.map(group => {
          const spell = SPELLS.find(s => group.spellId ? s.id === group.spellId : s.name === group.name);
          const sourceName = fighters[group.source]?.name;
          return <article key={group.key} className="combat-effect" data-effect-name={group.name}>
            <div className="combat-effect-heading">
              <RetroSpellIcon spell={spell || { id: group.spellId, emoji: '✦' }} />
              <div><h4>{group.name}</h4>{sourceName && group.source !== fighter.id && <small>Par {sourceName}</small>}</div>
            </div>
            <ul>{group.rows.map(e => <li key={e.key} className={`combat-effect-row ${effectTone(e)}`}>
              <div className="combat-effect-description"><span>{effectDescription(e)}</span>
                <span className="combat-effect-duration" title="Durée restante, décomptée à la fin des tours de ce personnage.">{effectDuration(e.turnsLeft, isActive)}</span>
              </div>
              {e.stacks > 1 && <small>{e.stacks} gains cumulés</small>}
              {e.kind === 'punishment' && <div className="punishment-progress">
                <div><span>Gagné ce tour</span><strong>{e.gained || 0} / {e.maxPerTurn}</strong></div>
                <progress value={Math.min(e.gained || 0, e.maxPerTurn)} max={e.maxPerTurn} aria-label={`Gains de ${group.name} ce tour`}
                  title="Le compteur revient à zéro au début du tour du personnage. Les bonus acquis gardent leur durée." />
              </div>}
            </li>)}</ul>
          </article>;
        })}
      </div>
    </>}
  </section>;
}
