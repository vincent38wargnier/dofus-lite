import React, { useState } from 'react';
import { Crosshair, Eye, Clock3, Sparkles, AlertTriangle, Zap } from 'lucide-react';
import { RetroSpellIcon } from './RetroAssets';
import { spellPresentation } from './spellPresentation';
import { describeSpellEffect, spellCanHitAllies, spellDescription, spellRangeLabel, stateName, turnLabel } from './spellDetailModel';
import '../styles/combatSpellbook.css';

function EffectRow({ row }) {
  return <li className={`spell-detail-effect element-${row.element || 'support'}`}>
    <strong>{row.text}</strong>
    <div className="spell-effect-tags"><span>{row.target}</span><span>{row.zone}</span><span>{row.duration}</span>{row.chance && <span>{row.chance}</span>}</div>
    {row.note && <p>{row.note}</p>}
    {row.children.length > 0 && <ul className="spell-detail-effects">{row.children.map((child, index) => <EffectRow key={index} row={child} />)}</ul>}
  </li>;
}

export default function SpellDetails({ spell, ownerName, compact = false, shortcut, availability }) {
  const [variant, setVariant] = useState('normal');
  const presentation = spellPresentation(spell);
  const critical = variant === 'critical' && spell.critRate > 0;
  const effects = critical && spell.critEffects?.length ? spell.critEffects : spell.effects || [];
  const rate = spell.effectiveCritRate ?? spell.critRate;
  const description = spellDescription(spell);
  const target = ({ self: 'Sur le lanceur', enemy: 'Un ennemi', fighter: 'Un combattant', cell: 'Une case, même vide', freeCell: 'Une case libre' })[spell.targetMode] || 'Une case';
  const hasInstantBoost = effects.some(e => /^(buff|resist.*Buff)/.test(e.kind));
  return <article className={`spell-details${compact ? ' compact' : ''}`} style={{ '--spell-detail-color': presentation.color }}>
    <header className="spell-detail-heading"><div className="spell-detail-icon"><RetroSpellIcon spell={spell} /></div>
      <div><span className="spell-detail-eyebrow">{ownerName ? `${ownerName} · ` : ''}{presentation.label}</span><h3>{spell.name}</h3>
        <span className="spell-detail-grade">{spell.isWeapon ? 'Arme équipée' : `Grade ${spell.grade}`}{shortcut ? ` · Raccourci ${shortcut}` : ''}</span></div></header>
    {description && <p className="spell-detail-description">{description}</p>}
    <dl className="spell-detail-facts">
      <div><dt><Zap size={13} />Coût</dt><dd>{spell.pa} PA</dd></div>
      <div><dt><Crosshair size={13} />Portée</dt><dd>{spellRangeLabel(spell)}</dd></div>
      <div><dt><Clock3 size={13} />Relance</dt><dd>{spell.cooldown > 0 ? turnLabel(spell.cooldown) : 'Chaque tour'}</dd></div>
    </dl>
    {availability && <p className="spell-detail-availability">{availability}</p>}
    <div className="spell-variant-tabs" role="group" aria-label="Valeurs du sort">
      <button type="button" aria-pressed={!critical} onClick={() => setVariant('normal')}>Normal</button>
      {spell.critRate > 0 && <button type="button" aria-pressed={critical} onClick={() => setVariant('critical')}><Sparkles size={12} />Critique · {rate ? `1/${rate}` : 'bloqué'}</button>}
      {!spell.critRate && <span>Sans coup critique</span>}
    </div>
    <p className="spell-detail-base-note">Valeurs de base · avant caractéristiques et résistances</p>
    <ul className="spell-detail-effects">{effects.map((effect, index) => <EffectRow key={index} row={describeSpellEffect(effect, spell)} />)}</ul>
    {!effects.length && <p className="spell-detail-base-note">Aucun effet simulé pour ce sort.</p>}
    {hasInstantBoost && <p className="spell-detail-hint">Les boosts s’appliquent immédiatement, dès ce lancer.</p>}
    {spellCanHitAllies(spell) && <p className="spell-detail-warning"><AlertTriangle size={14} />La zone peut aussi toucher vos alliés.</p>}
    <section className="spell-detail-rules" aria-label="Conditions de lancer"><h4>Ciblage et limites</h4>
      <p><Crosshair size={13} />{target}{spell.lineOnly ? ' · En ligne uniquement' : ''}</p>
      <p><Eye size={13} />{spell.needsLos ? 'Ligne de vue requise' : 'Traverse les obstacles (sans ligne de vue)'} · {spell.adjustableRange ? 'Portée modifiable' : 'Portée fixe'}</p>
      <p>{spell.usesPerTurn ? `${spell.usesPerTurn} lancer(s) par tour` : 'Pas de limite par tour'} · {spell.usesPerTarget ? `${spell.usesPerTarget} par cible / tour` : 'Pas de limite par cible'}</p>
      {spell.requiredStates?.length > 0 && <p>État requis : {spell.requiredStates.map(stateName).join(', ')}.</p>}
      {spell.forbiddenStates?.length > 0 && <details><summary>États incompatibles</summary><p>{spell.forbiddenStates.map(stateName).join(', ')}</p></details>}
      {spell.failRate > 0 && <p className="spell-detail-failure">Échec critique : 1/{spell.failRate}{spell.endsTurnOnFailure ? ' · Termine le tour' : ' · PA consommés, sans effet'}</p>}
    </section>
    {compact && <p className="spell-detail-base-note">Clic droit : lancer sur vous si le ciblage le permet.</p>}
    {(spell.unsupportedEffects?.length > 0 || spell.missingSummons?.length > 0) && <p className="spell-detail-warning"><AlertTriangle size={14} />Certains effets ou invocations de ce sort ne sont pas encore simulés.</p>}
    {spell.auditNotes?.length > 0 && <details className="spell-detail-rules"><summary>Particularités de ce sort</summary>{spell.auditNotes.map(note => <p key={note}>{note}</p>)}</details>}
  </article>;
}
