import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, X } from 'lucide-react';
import SpellDetails from './SpellDetailCard';

// A hover card stays open while the pointer moves onto it. It never covers
// its source button, and a pinned, keyboard-accessible dialog is one click away.
export default function SpellHoverCard({ id, anchor, spell, ownerName, shortcut, availability, onKeepOpen, onLeave, onClose, onOpen }) {
  const ref = useRef(null);
  const [position, setPosition] = useState(null);
  useLayoutEffect(() => {
    const place = () => {
      if (!anchor?.isConnected || !ref.current) return;
      const rect = anchor.getBoundingClientRect(), width = ref.current.offsetWidth;
      const above = rect.top - 16, below = window.innerHeight - rect.bottom - 16;
      const upwards = above >= Math.min(360, below);
      setPosition({ left: Math.max(8, Math.min(window.innerWidth - width - 8, rect.left)),
        ...(upwards ? { bottom: window.innerHeight - rect.top + 8 } : { top: rect.bottom + 8 }),
        maxHeight: Math.max(120, upwards ? above : below) });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [anchor]);
  return createPortal(<aside id={id} ref={ref} className="spell-hover-card" role="region" aria-label={`Fiche de ${spell.name}`}
    style={{ ...position, visibility: position ? 'visible' : 'hidden' }}
    onMouseEnter={onKeepOpen} onMouseLeave={onLeave} onFocus={onKeepOpen}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) onLeave(); }}
    onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); } }}>
    <div className="spell-hover-toolbar"><span>Fiche du sort</span><button type="button" aria-label="Fermer la fiche du sort" onClick={onClose}><X size={14} /></button></div>
    <div className="spell-hover-content"><SpellDetails key={spell.key} {...{ spell, ownerName, shortcut, availability }} compact /></div>
    {onOpen && <button type="button" className="spell-hover-open" onClick={onOpen}><BookOpen size={15} />Ouvrir dans le grimoire</button>}
  </aside>, document.body);
}
