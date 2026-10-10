import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { CLASSES } from '../engine/classes';
import { effectiveStat, ELEMENT_EMOJI, resistanceValues, statBuffTotal } from '../engine/formulas';
import { spellsOf } from '../engine/engine';
import { RetroPortrait } from './RetroAssets';
import { combatStatLabel, effectDescription, effectDuration, groupCombatEffects, signed, temporaryBonuses } from './combatEffects';

const ATTRIBUTES = ['force', 'intelligence', 'chance', 'agilite', 'sagesse', 'vitalite'];
const BONUSES = ['damage', 'power', 'physicalDamage', 'heal', 'crit', 'range', 'summons', 'reflect',
  'dodgePa', 'dodgePm', 'armor', 'armorPhysical', 'armorMagic', 'trapDamage', 'trapPower', 'fail'];

function PagedRows({ rows, empty }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / 3));
  const current = Math.min(page, pages - 1);
  return <>
    <div className="dock-rows">
      {rows.length ? rows.slice(current * 3, current * 3 + 3).map(row => <div key={row.key} className="dock-detail-row" title={row.title || `${row.name} : ${row.value}`}>
        <span>{row.name}</span><strong>{row.value}</strong>{row.duration && <small>{row.duration}</small>}
      </div>) : <p className="dock-empty">{empty}</p>}
    </div>
    {pages > 1 && <div className="dock-pages" aria-label="Pages du détail">
      <button type="button" aria-label="Page précédente" disabled={current === 0} onClick={() => setPage(current - 1)}><ChevronLeft size={13} /></button>
      <span>{current + 1} / {pages}</span>
      <button type="button" aria-label="Page suivante" disabled={current === pages - 1} onClick={() => setPage(current + 1)}><ChevronRight size={13} /></button>
    </div>}
  </>;
}

function StatsContent({ fighter, fighters, isActive, id }) {
  const [tab, setTab] = useState('effects');
  const bonuses = temporaryBonuses(fighter);
  const effects = groupCombatEffects(fighter);
  const tabs = [['effects', `Effets${effects.length ? ` · ${effects.length}` : ''}`], ['stats', 'Caracs'], ['bonuses', 'Bonus'], ['spells', 'Sorts']];
  return <>
    <div className="dock-stat-tabs" role="tablist" aria-label="Détails du combattant">
      {tabs.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key}
        id={`${id}-${key}`} aria-controls={`${id}-content`} onClick={() => setTab(key)}>{label}</button>)}
    </div>
    <div className="dock-stat-content" role="tabpanel" id={`${id}-content`} aria-labelledby={`${id}-${tab}`}>
      {tab === 'stats' ? <>
        <dl className="dock-attributes" aria-label="Caractéristiques actuelles, bonus temporaires inclus">
          {ATTRIBUTES.map(stat => <div key={stat} data-live-stat={stat} title={`${combatStatLabel(stat)} : ${effectiveStat(fighter, stat)}${bonuses[stat] ? ` (${signed(bonuses[stat])} temporaire)` : ''}`}>
            <dt>{combatStatLabel(stat)}</dt><dd>{effectiveStat(fighter, stat)}</dd>
          </div>)}
        </dl>
      </> : tab === 'bonuses' ? <PagedRows key="bonuses" empty="Aucun bonus de combat." rows={BONUSES
        .map(stat => ({ key: stat, name: combatStatLabel(stat), value: statBuffTotal(fighter, stat) })).filter(row => row.value !== 0)} />
        : tab === 'effects' ? <PagedRows key="effects" empty="Aucun effet temporaire." rows={effects.flatMap(group => group.rows.map(effect => ({
          key: effect.key, name: group.name, value: effectDescription(effect), duration: effectDuration(effect.turnsLeft, isActive),
          title: `${group.name} : ${effectDescription(effect)} · ${effectDuration(effect.turnsLeft, isActive)}${group.source ? ` · Par ${fighters[group.source]?.name || group.source}` : ''}${effect.kind === 'punishment' ? ` · Gagné ce tour : ${effect.gained || 0}/${effect.maxPerTurn}` : ''}`,
        })))} /> : <PagedRows key="spells" empty="Aucun sort." rows={Object.values(spellsOf(fighter)).map(spell => ({
          key: spell.key, name: spell.name, value: `${spell.pa} PA · ${spell.range.join('–')} PO`,
          title: `${spell.name} · ${spell.isWeapon ? 'Arme' : `Niveau ${spell.grade}`} · ${spell.pa} PA · ${spell.range.join('–')} PO · Relance restante : ${fighter.cooldowns?.[spell.key] || 0}`,
        }))} />}
    </div>
  </>;
}

function Resistances({ fighter }) {
  return <table className="dock-resistances" aria-label="Résistances actuelles">
    <thead><tr>{['neutre', 'terre', 'feu', 'eau', 'air'].map(element => <th key={element} scope="col">{ELEMENT_EMOJI[element]}<span>{element}</span></th>)}</tr></thead>
    <tbody><tr>{['neutre', 'terre', 'feu', 'eau', 'air'].map(element => {
      const normal = resistanceValues(element, fighter);
      const pvp = resistanceValues(element, fighter, { leader: true });
      return <td key={element} title={`${element} : ${normal.percent} %, ${normal.fixed} fixes · JcJ : ${pvp.percent} %, ${pvp.fixed} fixes`}>
        <strong>{normal.percent} %</strong><small>{normal.fixed} fixes</small>
      </td>;
    })}</tr></tbody>
  </table>;
}

export default function CombatStatsPanel({ id, fighter, resources = fighter, fighters, isActive, controller, inspecting, controls }) {
  const cls = CLASSES[fighter.classId];
  const kind = fighter.isSummon ? 'Invocation' : fighter.isMonster ? 'Monstre' : cls?.name;
  return <aside id={id} ref={controller.dialogRef} className={`combat-stats${inspecting ? ' inspecting' : ''}`}
    aria-label={`Caractéristiques de ${fighter.name}`} data-inspected-fighter={fighter.id}
    onPointerEnter={controller.keepOpen} onPointerLeave={controller.closeSoon} onFocus={controller.keepOpen}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) controller.closeSoon(); }}>
    <div className="dock-details">
      <StatsContent key={fighter.id} {...{ fighter, fighters, isActive, id }} />
    </div>
    {controls}
    <div className="dock-fighter-summary">
      <div className="dock-fighter-heading">
      <div className="dock-portrait">{fighter.isSummon ? fighter.emoji : <RetroPortrait classId={fighter.classId} artworkId={fighter.artworkId || fighter.loadout?.artworkId}
        monsterId={fighter.isMonster ? fighter.appearanceMonsterId ?? fighter.monsterId : null} side={fighter.team} fallback={fighter.emoji || cls?.emoji} />}</div>
      <div className="dock-fighter-name"><strong>{fighter.name}</strong><small title={`Initiative : ${fighter.initiative}${fighter.ownerId ? ` · Invoquée par ${fighters[fighter.ownerId]?.name || fighter.ownerId}` : ''}`}>
        {kind} · niv. {fighter.level}{inspecting ? (fighter.team === 'A' ? ' · Allié' : ' · Adversaire') : ' · Vous'}
      </small></div>
      <div className="dock-points" data-points-mode={resources.preview ? 'next-turn' : 'current'}
        title={resources.preview ? 'PA et PM prévus au prochain tour · bonus et retraits actifs inclus' : 'PA et PM restants'}>
        <span className="pa">{resources.pa} PA</span><span className="pm">{resources.pm} PM</span>
      </div>
      {inspecting && <button type="button" className="dock-reset" title="Revenir à vos statistiques (Échap)" aria-label="Revenir à mes statistiques" onClick={() => controller.dismiss(true)}><X size={14} /></button>}
    </div>
    <div className="statbar dock-health"><div className="fill hp" style={{ width: `${Math.max(0, fighter.hp / fighter.maxHp * 100)}%` }} />
      <div className="txt">{fighter.hp} / {fighter.maxHp} PV</div>
    </div>
      <Resistances fighter={fighter} />
    </div>
  </aside>;
}
