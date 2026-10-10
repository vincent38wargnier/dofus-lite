import React, { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import FighterPanel from './FighterPanel';
import '../styles/fighterInspector.css';

export default function FighterInspector({ id, fighter, fighters, viewerTeam, activeId, frameIdx, controller }) {
  const { inspection, dialogRef, dismiss, keepOpen, closeSoon } = controller;
  const fighterId = fighter?.id;
  const [position, setPosition] = useState({ left: 12, top: 12 });
  useLayoutEffect(() => {
    if (!inspection || !fighterId) return undefined;
    const place = () => {
      const anchor = inspection.anchor.getBoundingClientRect();
      const card = dialogRef.current?.getBoundingClientRect();
      if (!card) return;
      const margin = 12, gap = 14;
      const right = anchor.right + gap;
      const left = right + card.width <= window.innerWidth - margin ? right : anchor.left - gap - card.width;
      setPosition({ left: Math.max(margin, Math.min(left, window.innerWidth - card.width - margin)),
        top: Math.max(margin, Math.min(anchor.top - 24, window.innerHeight - card.height - margin)) });
    };
    place();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    if (dialogRef.current) observer?.observe(dialogRef.current);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { observer?.disconnect(); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [inspection, fighterId, frameIdx, dialogRef]);
  useLayoutEffect(() => {
    if (inspection?.focus && fighterId) dialogRef.current?.querySelector('button')?.focus({ preventScroll: true });
  }, [inspection, fighterId, dialogRef]);
  if (!inspection || !fighter) return null;
  const relation = viewerTeam ? (fighter.team === viewerTeam ? 'Allié' : 'Adversaire') : `Équipe ${fighter.team}`;
  return createPortal(<aside id={id} ref={dialogRef} className="fighter-inspector" role="dialog"
    aria-label={`Caractéristiques de ${fighter.name}`} style={position} data-inspected-fighter={fighter.id}
    onPointerEnter={keepOpen} onPointerLeave={closeSoon} onFocus={keepOpen}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) closeSoon(); }}>
    <div className="fighter-inspector-toolbar"><span>{relation}{fighter.hp <= 0 ? ' · K.O.' : ''} · Fiche de combat</span>
      <button type="button" onClick={() => dismiss(true)} aria-label="Fermer la fiche du combattant" title="Fermer (Échap)"><X size={16} /></button>
    </div>
    <FighterPanel fighter={fighter} fighters={fighters} side={fighter.team} isActive={fighter.hp > 0 && fighter.id === activeId} compact />
  </aside>, document.body);
}
