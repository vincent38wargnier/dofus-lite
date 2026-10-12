import React, { useEffect, useRef, useState } from 'react';
import { ArrowDownWideNarrow, GripVertical, LockKeyhole } from 'lucide-react';
import { ELEMENT_EMOJI } from '../engine/formulas';
import { RetroSpellIcon } from './RetroAssets';
import { combatShortcut, combatShortcutIndex, isTypingTarget, moveCombatSpell } from './combatShortcuts';
import { sortSpellsByType, spellPresentation } from './spellPresentation';

function spellTitle(s) {
  const bits = [...(!s.isWeapon ? [`niveau ${s.grade}`] : []), `${s.pa} PA`, `portée ${s.range[0]}-${s.range[1]}`];
  if (s.lineOnly) bits.push('en ligne');
  if (!s.needsLos) bits.push('sans ligne de vue');
  if (s.cooldown > 0) bits.push(`relance ${s.cooldown}t`);
  if (s.usesPerTurn > 0) bits.push(`${s.usesPerTurn}x/tour`);
  if (s.usesPerTarget > 0) bits.push(`${s.usesPerTarget}x/cible`);
  if (s.failRate > 0) bits.push(`échec critique 1/${s.failRate} (${(100 / s.failRate).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %)${s.endsTurnOnFailure ? ' : termine le tour' : ''}`);
  if (s.unsupportedEffects?.length) bits.push('Certains effets restent à reproduire — voir le Grimoire');
  return `${s.name} — ${bits.join(' · ')}`;
}

export default function CombatSpellBar({ spells, spellInfo, pa, humanTurn, active, selectedSpell, onSelect, onSelfCast, onHover, onCancel, onReorder, saveError, status }) {
  const [dragged, setDragged] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const drag = useRef(null);
  const suppressClick = useRef(false);
  const unavailable = info => !humanTurn || !info || info.pa > pa || info.cooldownLeft > 0 || info.usesLeft <= 0;

  useEffect(() => {
    if (!active || !humanTurn) return undefined;
    const keydown = event => {
      if (event.defaultPrevented || event.repeat || event.isComposing || drag.current !== null
        || isTypingTarget(event.target) || document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) return;
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

  // Keep the standard spell book on two rows so names have room to be read.
  const rows = Math.max(2, Math.ceil(spells.length / 24));
  const narrowRows = Math.max(2, Math.ceil(spells.length / 16));
  return <section className="combat-spellbar" aria-label="Barre de sorts" style={{
    '--spell-columns': Math.ceil(spells.length / rows), '--spell-rows': rows,
    '--spell-columns-narrow': Math.ceil(spells.length / narrowRows), '--spell-rows-narrow': narrowRows,
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
        const title = `${spellTitle(info || spell)} · ${presentation.label}${shortcut ? ` · Raccourci ${shortcut.label}` : ''} · Clic droit : lancer sur vous si le ciblage le permet`;
        return <div key={spell.key} data-spell-id={spell.id}
          data-spell-category={presentation.category} style={{ '--spell-color': presentation.color }}
          className={`spell-slot${dragged === spell.id ? ' dragging' : ''}${dropTarget === spell.id && dragged !== spell.id ? ' drop-target' : ''}`}
          draggable={!spell.isWeapon && !!onReorder} title={`${title} · ${spell.isWeapon ? 'Arme toujours en première case' : onReorder ? 'Glissez pour déplacer ; Alt + ← / → au clavier' : 'Sort du monstre'}`}
          tabIndex={disabled ? 0 : undefined} aria-label={disabled ? `${spell.name}, indisponible. ${spell.isWeapon ? 'Arme en première case.' : 'Alt + flèches pour déplacer.'}` : undefined}
          onMouseEnter={() => onHover?.(active && !disabled && drag.current === null ? info : null)}
          onMouseLeave={() => onHover?.(null)}
          onPointerDown={() => { suppressClick.current = false; }}
          onClickCapture={event => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}
          onContextMenu={event => {
            event.preventDefault();
            if (active && !disabled && drag.current === null) onSelfCast?.(info);
          }}
          onDragStart={event => {
            if (spell.isWeapon || !onReorder) { event.preventDefault(); return; }
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
            disabled={disabled} title={title} aria-label={title} aria-keyshortcuts={shortcut?.aria}
            onClick={() => { if (active && !disabled) onSelect(info); }}>
            <span className="ic"><RetroSpellIcon spell={spell} /></span>
            <span className={`spell-cost${info?.cooldownLeft > 0 ? ' on-cooldown' : ''}`} aria-hidden="true" title={info?.cooldownLeft > 0 ? 'Tours de relance restants' : 'Coût en PA'}>{info?.cooldownLeft > 0 ? `⌛${info.cooldownLeft}` : info?.pa ?? spell.pa}</span>
            <span className="nm">{spell.name}</span>
            <span className="meta">
              {spell.element ? `${ELEMENT_EMOJI[spell.element]} ` : ''}{info?.pa ?? spell.pa} PA
              {spell.isWeapon ? ` · ${(info || spell).range.join('–')} PO` : ''}
              {spell.isWeapon && (info?.failRate ?? spell.failRate) > 0 ? ` · EC 1/${info?.failRate ?? spell.failRate}` : ''}
              {info && info.cooldownLeft > 0 ? ` · ⏳${info.cooldownLeft}` : ''}
            </span>
          </button>
        </div>;
      })}
    </div>
    {saveError && <p className="spellbar-save-error" role="alert">L’ordre a été modifié, mais sa sauvegarde dans le navigateur a échoué.</p>}
  </section>;
}
