import React, { useEffect, useId, useRef, useState } from 'react';
import { ArrowDownWideNarrow, GripVertical, Info, LockKeyhole } from 'lucide-react';
import { ELEMENT_EMOJI } from '../engine/formulas';
import { RetroSpellIcon } from './RetroAssets';
import { combatShortcut, combatShortcutIndex, isTypingTarget, moveCombatSpell } from './combatShortcuts';
import { sortSpellsByType, spellPresentation } from './spellPresentation';
import { inspectCombatSpell, spellRangeLabel, turnLabel } from './spellDetailModel';
import SpellHoverCard from './SpellHoverCard';

export default function CombatSpellBar({ spells, spellInfo, fighter, pa, humanTurn, active, selectedSpell, onSelect, onSelfCast, onHover, onCancel, onReorder, onInspect, saveError, status }) {
  const [dragged, setDragged] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const drag = useRef(null);
  const suppressClick = useRef(false);
  const barRef = useRef(null);
  const [barWidth, setBarWidth] = useState(0);
  useEffect(() => {
    if (!barRef.current || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => setBarWidth(entry.contentRect.width));
    observer.observe(barRef.current);
    return () => observer.disconnect();
  }, []);
  const [hoverCard, setHoverCard] = useState(null);
  const hoverTimer = useRef(null), cardId = useId();
  const keepCard = () => clearTimeout(hoverTimer.current);
  const closeCard = () => { keepCard(); setHoverCard(null); };
  const leaveCard = () => { keepCard(); hoverTimer.current = setTimeout(() => setHoverCard(null), 200); };
  const showCard = (spell, index, anchor) => {
    if (drag.current !== null || document.querySelector('dialog[open]')) return;
    keepCard();
    if (hoverCard?.spellKey === spell.key) return;
    setHoverCard(null);
    hoverTimer.current = setTimeout(() => {
      if (anchor.isConnected && drag.current === null && !document.querySelector('dialog[open]')) {
        setHoverCard({ spellKey: spell.key, index, anchor });
      }
    }, 1000);
  };
  useEffect(() => () => clearTimeout(hoverTimer.current), []);
  useEffect(() => {
    if (!hoverCard) return undefined;
    const escape = event => { if (event.key === 'Escape') { event.preventDefault(); closeCard(); } };
    window.addEventListener('keydown', escape, true);
    return () => window.removeEventListener('keydown', escape, true);
  });
  const unavailable = info => !humanTurn || !info || info.pa > pa || info.cooldownLeft > 0 || info.usesLeft <= 0;

  useEffect(() => {
    if (!active || !humanTurn) return undefined;
    const keydown = event => {
      if (event.defaultPrevented || event.repeat || event.isComposing || drag.current !== null
        || isTypingTarget(event.target) || event.target.closest?.('.spell-hover-card') || document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) return;
      if (event.key === 'Escape' && selectedSpell) {
        event.preventDefault(); onCancel(); return;
      }
      const spell = spells[combatShortcutIndex(event)];
      if (!spell) return;
      event.preventDefault();
      const info = spellInfo[spell.key];
      if (!unavailable(info)) onSelect(info);
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  });

  const clearDrag = () => { drag.current = null; setDragged(null); setDropTarget(null); };
  const move = (from, to) => {
    if (!onReorder) return;
    const ids = spells.map(spell => spell.id);
    const next = moveCombatSpell(ids, from, to);
    if (next !== ids) onReorder(next);
  };

  // Wrap only when another slot would squeeze the icons and their controls.
  const minimumWidth = barWidth >= 900 ? 82 : barWidth >= 650 ? 60 : 44;
  const capacity = barWidth ? Math.max(1, Math.floor((barWidth + 3) / (minimumWidth + 3))) : 12;
  const rows = Math.max(1, Math.ceil(spells.length / capacity));
  const hovered = hoverCard && spells.find(spell => spell.key === hoverCard.spellKey);
  const details = hovered && { ...inspectCombatSpell(hovered, fighter), ...spellInfo[hovered.key] };
  const availability = details?.cooldownLeft > 0 ? `Disponible dans ${turnLabel(details.cooldownLeft)}`
    : details?.usesLeft <= 0 ? 'Limite de lancers atteinte pour ce tour'
      : humanTurn && details?.pa > pa ? `PA insuffisants : ${details.pa} nécessaires, ${pa} disponibles` : !humanTurn ? 'Consultation · En attente de votre tour' : null;
  return <section ref={barRef} className="combat-spellbar" aria-label="Barre de sorts" style={{
    '--spell-columns': Math.ceil(spells.length / rows), '--spell-rows': rows,
  }}>
    <div className="spellbar-guide">
      {status || <span title="Glissez les sorts pour les déplacer ; leur ordre est sauvegardé automatiquement.">Glisser pour réorganiser</span>}
      <div className="spellbar-actions">
        <span className="spellbar-count" title="Tous vos sorts de classe débloqués et vos sorts communs appris, plus l’arme équipée.">{spells.length} cases</span>
        <button type="button" className="spellbar-sort" disabled={!active || !onReorder || dragged !== null}
          title="Arme, éléments, boosts et protections, soins, invocations, placement, retraits et utilitaires. Ordre sauvegardé automatiquement."
          onClick={() => onReorder(sortSpellsByType(spells))}><ArrowDownWideNarrow size={12} /> Trier par type</button>
        <span className="spellbar-shortcuts" title="1–0, Maj + 1–0, Alt + 1–0, Alt + Maj + 1–0 ; Échap pour annuler le ciblage. Clic droit : lancer sur vous si le ciblage le permet.">1–0 · Maj · Alt · Échap</span>
      </div>
    </div>
    <div className="spellbar">
      {spells.map((spell, index) => {
        const info = spellInfo[spell.key], disabled = unavailable(info), shortcut = combatShortcut(index);
        const presentation = spellPresentation(spell);
        const title = `${spell.name} — ${(info || spell).pa} PA · ${spellRangeLabel(info || spell)}${shortcut ? ` · Raccourci ${shortcut.label}` : ''}`;
        return <div key={spell.key} data-spell-id={spell.id}
          data-spell-category={presentation.category} style={{ '--spell-color': presentation.color }}
          className={`spell-slot${dragged === spell.id ? ' dragging' : ''}${dropTarget === spell.id && dragged !== spell.id ? ' drop-target' : ''}`}
          draggable={!spell.isWeapon && !!onReorder}
          tabIndex={disabled ? 0 : undefined} aria-label={disabled ? `${spell.name}, indisponible. ${spell.isWeapon ? 'Arme en première case.' : 'Alt + flèches pour déplacer.'}` : undefined}
          onMouseEnter={event => onHover?.(!event.target.closest?.('.spell-info-button') && active && !disabled && drag.current === null ? info : null)}
          onMouseLeave={() => onHover?.(null)}
          onPointerDown={() => { suppressClick.current = false; }}
          onClickCapture={event => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}
          onContextMenu={event => {
            event.preventDefault();
            closeCard();
            if (active && !disabled && drag.current === null) onSelfCast?.(info);
          }}
          onDragStart={event => {
            if (spell.isWeapon || !onReorder) { event.preventDefault(); return; }
            closeCard();
            onHover?.(null);
            drag.current = spell.id; setDragged(spell.id); suppressClick.current = true;
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', String(spell.id));
            event.dataTransfer.setDragImage?.(event.currentTarget, 30, 30);
          }}
          onDragOver={event => {
            if (drag.current === null) return;
            event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropTarget(spell.id);
          }}
          onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDropTarget(null); }}
          onDrop={event => { event.preventDefault(); if (drag.current !== null) move(drag.current, spell.id); clearDrag(); }}
          onDragEnd={clearDrag}
          onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ') suppressClick.current = false;
            if (!event.altKey || event.ctrlKey || event.metaKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
            event.preventDefault(); event.stopPropagation();
            const target = spells[index + (event.key === 'ArrowLeft' ? -1 : 1)];
            if (target) move(spell.id, target.id);
          }}>
          <div className="spell-slot-tools" aria-hidden="true"><kbd>{shortcut?.label || '—'}</kbd>{spell.isWeapon ? <LockKeyhole size={13} /> : <GripVertical size={13} />}</div>
          <button type="button" className={`spell-btn${selectedSpell === spell.key ? ' selected' : ''}`}
            disabled={disabled} aria-label={title} aria-keyshortcuts={shortcut?.aria}
            onMouseEnter={() => onHover?.(active && !disabled && drag.current === null ? info : null)}
            onClick={() => { closeCard(); if (active && !disabled) onSelect(info); }}>
            <span className="ic"><RetroSpellIcon spell={spell} /></span>
            <span className={`spell-cost${info?.cooldownLeft > 0 ? ' on-cooldown' : ''}`} aria-hidden="true">{info?.cooldownLeft > 0 ? `⌛${info.cooldownLeft}` : info?.pa ?? spell.pa}</span>
            <span className="nm">{spell.name}</span>
            <span className="meta">
              {spell.element ? `${ELEMENT_EMOJI[spell.element]} ` : ''}{info?.pa ?? spell.pa} PA
              {spell.isWeapon ? ` · ${(info || spell).range.join('–')} PO` : ''}
              {spell.isWeapon && (info?.failRate ?? spell.failRate) > 0 ? ` · EC 1/${info?.failRate ?? spell.failRate}` : ''}
              {info && info.cooldownLeft > 0 ? ` · ⏳${info.cooldownLeft}` : ''}
            </span>
          </button>
          <button type="button" className="spell-info-button" aria-label={`Informations sur ${spell.name}`}
            aria-expanded={hoverCard?.spellKey === spell.key}
            aria-controls={hoverCard?.spellKey === spell.key ? cardId : undefined}
            onMouseEnter={event => { onHover?.(null); showCard(spell, index, event.currentTarget); }}
            onMouseLeave={leaveCard}
            onFocus={event => showCard(spell, index, event.currentTarget)}
            onBlur={event => { if (!event.relatedTarget?.closest?.('.spell-hover-card')) leaveCard(); }}
            onPointerDown={event => { event.stopPropagation(); suppressClick.current = false; }}
            onClick={event => { event.stopPropagation(); showCard(spell, index, event.currentTarget); }}
            onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }}
            draggable={false} onDragStart={event => { event.preventDefault(); event.stopPropagation(); }}>
            <Info size={14} aria-hidden="true" />
          </button>
        </div>;
      })}
    </div>
    {details && <SpellHoverCard id={cardId} anchor={hoverCard.anchor} spell={details} ownerName={fighter?.name}
      shortcut={combatShortcut(hoverCard.index)?.label} availability={availability}
      onKeepOpen={keepCard} onLeave={leaveCard} onClose={closeCard}
      onOpen={onInspect ? () => {
        hoverCard.anchor.focus({ preventScroll: true });
        closeCard(); onInspect(hovered.key);
      } : undefined} />}
    {saveError && <p className="spellbar-save-error" role="alert">L’ordre a été modifié, mais sa sauvegarde dans le navigateur a échoué.</p>}
  </section>;
}
