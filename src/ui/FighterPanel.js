import { equipmentItem } from '../engine/customEquipment';
import React from 'react';
import { CLASSES } from '../engine/classes';
import { ELEMENT_EMOJI, effectiveStat } from '../engine/formulas';
import { RetroPortrait, RetroSpellIcon } from './RetroAssets';
import { spellsOf } from '../engine/engine';
import { EquipmentIcon } from './LoadoutPicker';
import FighterEffects from './FighterEffects';
import FighterCombatStats from './FighterCombatStats';
import { combatStatLabel, signed, statTone, temporaryBonuses } from './combatEffects';

// Live sheet of one fighter for the current replay frame:
// HP (érosion comprise), PA / PM, caractéristiques, effets, sorts.
export default function FighterPanel({ fighter, fighters, side, isActive, compact = false }) {
  const cls = CLASSES[fighter.classId];
  const hpPct = Math.max(0, Math.round((fighter.hp / fighter.maxHp) * 100));
  const eroded = fighter.baseMaxHp && fighter.maxHp < fighter.baseMaxHp;

  const bonuses = temporaryBonuses(fighter);
  const spells = Object.values(spellsOf(fighter)).sort((a, b) => Number(!!b.isWeapon) - Number(!!a.isWeapon));

  return (
    <div className={`panel fighter-card${isActive ? ' is-active' : ''}`} data-fighter-id={fighter.id}>
      <div className="fighter-head">
        <div className={`face side-${side}-border`}>{fighter.isSummon ? <span aria-hidden="true">{fighter.emoji || '✦'}</span>
          : <RetroPortrait classId={fighter.classId} artworkId={fighter.artworkId || fighter.loadout?.artworkId} monsterId={fighter.isMonster ? fighter.appearanceMonsterId ?? fighter.monsterId : null} side={side} fallback={fighter.emoji || cls?.emoji} />}</div>
        <div className="who">
          <div className="bot-name">{fighter.name}</div>
          <div className="class-name">{fighter.isSummon ? (fighter.isDouble ? 'Double' : fighter.staticSummon ? 'Invocation statique' : 'Invocation') : fighter.isMonster ? 'Monstre' : cls.name} · niv. {fighter.level}</div>
          {fighter.ownerId && <div className="class-name">Invoquée par {fighters?.[fighter.ownerId]?.name || fighter.ownerId}</div>}
        </div>
        {isActive ? <span className="turn-chip">à lui de jouer</span> : null}
      </div>

      <div className="statbar">
        <div className="fill hp" style={{ width: `${hpPct}%` }} />
        <div className="txt">
          {fighter.hp} / {fighter.maxHp} PV{eroded ? ' (érodé)' : ''}
        </div>
      </div>

      <div className="pips">
        <span className="pa" key={`pa-${fighter.pa}`}>★ {fighter.pa} PA</span>
        <span className="pm" key={`pm-${fighter.pm}`}>➤ {fighter.pm} PM</span>
        <span className="muted small" style={{ marginLeft: 'auto' }}>
          init {fighter.initiative}
        </span>
      </div>

      <dl className="fighter-live-stats" aria-label="Caractéristiques actuelles, bonus temporaires inclus">
        {['force', 'intelligence', 'chance', 'agilite', 'sagesse', 'vitalite'].map(stat => {
          const bonus = bonuses[stat] || 0;
          const base = effectiveStat({ ...fighter, effects: [] }, stat);
          return <div key={stat} className="fighter-live-stat" data-live-stat={stat}
            title={`${combatStatLabel(stat)} : ${base} de base et équipement${bonus ? `, ${signed(bonus)} temporaire` : ''}`}>
            <dt>{combatStatLabel(stat)}</dt><dd>{effectiveStat(fighter, stat)}
              {bonus !== 0 && <small className={statTone(stat, bonus)} aria-label={`${signed(bonus)} temporaire`}>{signed(bonus)}</small>}
            </dd>
          </div>;
        })}
      </dl>

      {compact && <FighterCombatStats fighter={fighter} />}
      <FighterEffects fighter={fighter} fighters={fighters} isActive={isActive} />

      {!compact && fighter.equipment ? <details className="fighter-equipment"><summary>{fighter.equipment.items.length} objets équipés</summary>
        {fighter.equipment.items.map(item => <div key={item.slot}><EquipmentIcon item={equipmentItem(item.id, fighter.loadout)} /><span>{item.name}</span></div>)}
        {fighter.equipment.sets.filter(set => set.effects.length).map(set => <p key={set.id}>{set.name} · {set.count}/{set.total}</p>)}
      </details> : null}

      {(!compact || fighter.isSummon || fighter.isMonster) && <details className="fighter-spells"><summary>{fighter.isSummon ? 'Sorts de l’invocation' : fighter.isMonster ? 'Sorts du monstre' : 'Sorts et arme'} · {spells.length}</summary><div className="spell-list">
        {spells.map((s) => {
          const cd = fighter.cooldowns?.[s.key] || 0;
          return (
            <div key={s.key} className={`spell-row${cd > 0 ? ' on-cd' : ''}`}>
              <RetroSpellIcon spell={s} />
              <span>{s.name}</span>
              {s.element ? <span title={s.element}>{ELEMENT_EMOJI[s.element]}</span> : null}
              {cd > 0 ? <span className="cd">⏳{cd}</span> : null}
              <span className="cost">{s.pa} PA</span>
            </div>
          );
        })}
      </div></details>}
    </div>
  );
}
