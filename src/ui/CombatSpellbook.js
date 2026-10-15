import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Search } from 'lucide-react';
import { spellsOf } from '../engine/engine';
import { CharacterDialog } from './CharacterDialog';
import { RetroPortrait, RetroSpellIcon } from './RetroAssets';
import { spellPresentation } from './spellPresentation';
import { describeSpellEffect, inspectCombatSpell, spellDescription, spellRangeLabel, turnLabel } from './spellDetailModel';
import SpellDetails from './SpellDetailCard';
import '../styles/combatSpellbook.css';

const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');
const searchSpell = (spell, query) => fold(`${spell.name} ${spellDescription(spell)} ${spellPresentation(spell).label} ${(spell.effects || []).map(e => describeSpellEffect(e, spell).text).join(' ')}`).includes(query);
export function SpellbookButton({ onClick }) {
  return <button type="button" className="btn combat-spellbook-button" onClick={onClick}><BookOpen size={15} /><span>Sorts du combat</span></button>;
}

export default function CombatSpellbook({ state, viewerTeam = 'A', initialFighterId, initialSpellKey, live = false, onClose }) {
  const [fighterId, setFighterId] = useState(initialFighterId || Object.values(state.fighters).find(f => f.team !== viewerTeam)?.id);
  const [spellKey, setSpellKey] = useState(initialSpellKey);
  const [query, setQuery] = useState('');
  const body = useRef(null);
  const roster = useMemo(() => [...new Set([...state.order, ...Object.keys(state.fighters)])].map(id => {
    const fighter = state.fighters[id];
    return { fighter, spells: Object.values(spellsOf(fighter)) };
  }), [state]);
  const filtered = roster.filter(({ fighter, spells }) => !query || fold(fighter.name).includes(fold(query)) || spells.some(spell => searchSpell(spell, fold(query))));
  const selected = filtered.find(entry => entry.fighter.id === fighterId) || filtered[0];
  const fighter = selected?.fighter;
  const spells = selected?.spells.filter(spell => !query || fold(fighter.name).includes(fold(query)) || searchSpell(spell, fold(query))) || [];
  const rawSpell = spells.find(spell => spell.key === spellKey) || spells[0];
  const spell = rawSpell && inspectCombatSpell(rawSpell, fighter);
  const selectedFighterId = fighter?.id, selectedSpellKey = spell?.key;
  useLayoutEffect(() => {
    const revealSelection = () => {
      body.current?.querySelector('.combat-spellbook-fighter.selected')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      body.current?.querySelector('.combat-spellbook-spell.selected')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    };
    // The parent opens its native dialog in an effect after our layout effect.
    const timer = setTimeout(revealSelection, 0);
    window.addEventListener('resize', revealSelection);
    return () => { clearTimeout(timer); window.removeEventListener('resize', revealSelection); };
  }, [selectedFighterId, selectedSpellKey]);
  const availability = fighter?.hp <= 0 ? 'Combattant vaincu' : spell?.cooldownLeft > 0 ? `Disponible dans ${turnLabel(spell.cooldownLeft)}`
    : spell?.usesLeft === 0 ? 'Limite de lancers atteinte pour ce tour' : null;
  return <CharacterDialog title="Sorts du combat" description={live ? 'Partie en réseau : le combat continue pendant la lecture.' : 'Combat en pause. Prenez le temps de découvrir chaque capacité.'}
    onClose={onClose} className="combat-spellbook-dialog">
    <label className="combat-spellbook-search"><Search size={17} /><input type="search" aria-label="Rechercher un combattant ou un sort" placeholder="Un combattant, un sort, un effet…" value={query} onChange={event => setQuery(event.target.value)} />
      <span>{roster.length} combattants</span></label>
    <div className="combat-spellbook-body" ref={body}>
      <nav className="combat-spellbook-roster" aria-label="Grimoires des combattants">{[false, true].map(allied => {
        const entries = filtered.filter(entry => (entry.fighter.team === viewerTeam) === allied);
        if (!entries.length) return null;
        return <section key={String(allied)}><h3>{allied ? 'Votre équipe' : 'Adversaires'}</h3>{entries.map(({ fighter: f, spells: kit }) => <button type="button" key={f.id}
          className={`combat-spellbook-fighter${fighter?.id === f.id ? ' selected' : ''}`} aria-pressed={fighter?.id === f.id}
          data-spellbook-fighter={f.id} onClick={() => { setFighterId(f.id); setSpellKey(null); }}>
          <span className="spellbook-fighter-portrait"><RetroPortrait classId={f.classId} monsterId={f.isMonster || (f.isSummon && !f.isDouble) ? f.appearanceMonsterId ?? f.monsterId : null}
            artworkId={f.artworkId || f.loadout?.artworkId} appearance={f.loadout?.profile?.sex === 1 ? 'female' : 'male'} fallback={f.emoji || '●'} /></span>
          <span><strong>{f.name}</strong><small>Niv. {f.level} · {kit.length} capacités{f.hp <= 0 ? ' · Vaincu' : ''}</small></span>
        </button>)}</section>;
      })}</nav>
      <section className="combat-spellbook-spells" aria-label={fighter ? `Sorts de ${fighter.name}` : 'Liste des sorts'}>
        <h3>{fighter?.name || 'Aucun résultat'}</h3><p>Choisissez une capacité</p>
        <div>{spells.map(s => <button type="button" key={s.key} aria-pressed={spell?.key === s.key}
          className={`combat-spellbook-spell${spell?.key === s.key ? ' selected' : ''}`} style={{ '--spell-detail-color': spellPresentation(s).color }}
          onClick={() => setSpellKey(s.key)} data-spellbook-spell={s.key}>
          <RetroSpellIcon spell={s} /><span><strong>{s.name}</strong><small>{s.pa} PA · {spellRangeLabel(inspectCombatSpell(s, fighter))}</small></span>
        </button>)}</div>
        {fighter && !spells.length && <p>Ce combattant ne possède aucun sort.</p>}
      </section>
      <section className="combat-spellbook-detail" aria-label="Détail de la capacité">
        {spell ? <SpellDetails key={`${fighter.id}:${spell.key}`} spell={spell} ownerName={fighter.name} availability={availability} />
          : <p className="spellbook-no-result">Aucun sort à afficher. Essayez un autre nom.</p>}
      </section>
    </div>
    <footer><p>Consulter une fiche ne lance aucun sort.</p><button type="button" className="btn primary" onClick={onClose}>Revenir au combat</button></footer>
  </CharacterDialog>;
}
