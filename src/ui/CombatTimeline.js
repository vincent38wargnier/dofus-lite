import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Crosshair, EyeOff, Link2, Users } from 'lucide-react';
import { CLASSES } from '../engine/classes';
import { isInvisible } from '../engine/engine';
import { RetroPortrait } from './RetroAssets';
import '../styles/combatTimeline.css';

export const timelineFighterVisible = (fighter, viewerTeam) => !!fighter && fighter.hp > 0
  && !fighter.hidden && (!viewerTeam || fighter.team === viewerTeam || !isInvisible(fighter));

// The client TimelineItem delegates hover/click to the battlefield actor. Keep
// one targeting path here too: portraits never construct their own CAST action.
export default function CombatTimeline({ state, controller, panelId, viewerTeam = 'A', casting = false,
  canTarget, onTarget, onTargetHover }) {
  const rail = useRef(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const fighters = state.order.map(id => state.fighters[id]).filter(fighter => fighter?.hp > 0);
  const roster = fighters.map(fighter => fighter.id).join('|');
  const currentId = !state.over && state.phase !== 'placement' ? state.order[state.currentIndex] : null;
  const measure = () => {
    const element = rail.current;
    if (!element) return;
    const next = { left: element.scrollLeft > 1, right: element.scrollWidth - element.clientWidth - element.scrollLeft > 1 };
    setEdges(old => old.left === next.left && old.right === next.right ? old : next);
  };
  useLayoutEffect(() => {
    const element = rail.current;
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (element) observer?.observe(element);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [roster]);
  useEffect(() => {
    const element = rail.current;
    const card = [...(element?.querySelectorAll('[data-timeline-fighter]') || [])].find(button => button.dataset.timelineFighter === currentId);
    if (!card) return;
    const bounds = element.getBoundingClientRect(), item = card.getBoundingClientRect();
    if (item.left < bounds.left) element.scrollLeft -= bounds.left - item.left + 3;
    else if (item.right > bounds.right) element.scrollLeft += item.right - bounds.right + 3;
    measure();
  }, [currentId]);
  const leave = () => { controller.closeSoon(); onTargetHover?.(null); };
  const inspect = (fighter, element) => {
    if (timelineFighterVisible(fighter, viewerTeam)) controller.open(fighter.id, element);
    else controller.dismiss();
    onTargetHover?.(fighter.id);
  };
  const scroll = direction => {
    if (rail.current) rail.current.scrollLeft += direction * Math.max(100, rail.current.clientWidth * .75);
    measure();
  };
  const focusNeighbour = (event, index) => {
    const last = fighters.length - 1;
    const next = { ArrowLeft: Math.max(0, index - 1), ArrowRight: Math.min(last, index + 1), Home: 0, End: last }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    rail.current?.querySelectorAll('[data-timeline-fighter]')[next]?.focus({ preventScroll: false });
  };
  if (!fighters.length) return null;
  return <nav className={`combat-timeline${casting ? ' is-casting' : ''}`} aria-label="Combattants en vie, ordre des tours">
    <div className="combat-timeline-heading" title="Combattants dans l’ordre des tours. Choisissez un sort, puis cliquez sur un portrait pour le viser.">
      <Users size={15} /><span><strong>Combattants <small>{fighters.length}</small></strong><span>{casting ? 'Cliquez sur une cible' : 'Ordre des tours'}</span></span>
    </div>
    {(edges.left || edges.right) && <button type="button" className="timeline-scroll" aria-label="Voir les combattants précédents" disabled={!edges.left} onClick={() => scroll(-1)}><ChevronLeft size={16} /></button>}
    <ol ref={rail} className="combat-timeline-rail" onScroll={measure}>
      {fighters.map((fighter, index) => {
        const visible = timelineFighterVisible(fighter, viewerTeam);
        const targetable = visible && !fighter.carriedBy && casting && !!canTarget?.(fighter);
        const inspected = visible && controller.inspection?.id === fighter.id;
        const team = fighter.team === viewerTeam ? 'Allié' : 'Adversaire';
        const owner = fighter.ownerId ? state.fighters[fighter.ownerId]?.name : null;
        const hp = `${fighter.hp} / ${fighter.maxHp} PV`;
        const unavailable = !visible ? 'Invisible · position masquée' : fighter.carriedBy ? 'Porté · ciblage direct indisponible'
          : 'Cible indisponible pour ce sort · portée, ligne de vue ou conditions de lancer';
        const description = `${fighter.name} · ${team}${fighter.isSummon ? ` · Invocation${owner ? ` de ${owner}` : ''}` : ''}`;
        const action = casting ? targetable ? 'Cliquer pour lancer le sort' : unavailable : visible ? 'Afficher les caractéristiques' : unavailable;
        return <li key={fighter.id}>
          <button type="button" className={`timeline-fighter side-${fighter.team}${currentId === fighter.id ? ' current' : ''}${inspected ? ' inspected' : ''}${targetable ? ' targetable' : ''}${casting && !targetable ? ' unavailable' : ''}${fighter.isSummon ? ' summon' : ''}`}
            data-timeline-fighter={fighter.id} data-targetable={targetable} data-hidden={!visible}
            aria-label={`${description}${visible ? ` · ${hp}` : ' · Invisible'}${casting ? ` · ${targetable ? 'Cible possible' : unavailable}` : ''}`}
            aria-current={currentId === fighter.id ? 'step' : undefined} aria-disabled={casting && !targetable ? true : undefined}
            aria-controls={inspected ? panelId : undefined} title={`${description}\n${visible ? `${hp} · Niveau ${fighter.level}\n` : ''}${action}`}
            onMouseEnter={event => inspect(fighter, event.currentTarget)} onMouseLeave={leave}
            onFocus={event => inspect(fighter, event.currentTarget)} onBlur={leave}
            onKeyDown={event => focusNeighbour(event, index)}
            onClick={event => {
              if (casting) { if (targetable) onTarget?.(fighter.id); }
              else inspect(fighter, event.currentTarget);
            }}>
            <span className="timeline-position" aria-hidden="true">{index + 1}</span>
            {currentId === fighter.id && <span className="timeline-current-marker" aria-hidden="true" />}
            <span className="timeline-portrait" aria-hidden="true"><RetroPortrait classId={fighter.classId}
              monsterId={fighter.isMonster || (fighter.isSummon && !fighter.isDouble) ? fighter.appearanceMonsterId ?? fighter.monsterId : null}
              artworkId={fighter.artworkId || (!fighter.isMonster && (!fighter.isSummon || fighter.isDouble) ? fighter.loadout?.artworkId : null)}
              side={fighter.team} appearance={fighter.loadout?.profile?.sex === 1 ? 'female' : 'male'} fallback={fighter.emoji || CLASSES[fighter.classId]?.emoji || '●'} /></span>
            {visible ? <span className="timeline-hp" aria-hidden="true"><i style={{ height: `${Math.min(100, Math.max(0, fighter.hp / fighter.maxHp * 100))}%` }} /></span>
              : <EyeOff size={15} className="timeline-hidden" aria-hidden="true" />}
            {fighter.isSummon && <Link2 size={11} className="timeline-summon" aria-hidden="true" />}
            {targetable && <Crosshair size={13} className="timeline-aim" aria-hidden="true" />}
          </button>
        </li>;
      })}
    </ol>
    {(edges.left || edges.right) && <button type="button" className="timeline-scroll" aria-label="Voir les combattants suivants" disabled={!edges.right} onClick={() => scroll(1)}><ChevronRight size={16} /></button>}
  </nav>;
}
