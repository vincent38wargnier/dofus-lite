import React from 'react';
import { CLASSES } from '../engine/classes';
import { ELEMENT_EMOJI } from '../engine/formulas';

// Live sheet of one fighter for the current replay frame:
// HP (érosion comprise), PA / PM, caractéristiques, effets, sorts.
export default function FighterPanel({ fighter, side, isActive }) {
  const cls = CLASSES[fighter.classId];
  const hpPct = Math.max(0, Math.round((fighter.hp / fighter.maxHp) * 100));
  const eroded = fighter.baseMaxHp && fighter.maxHp < fighter.baseMaxHp;

  const effectLabel = (e) => {
    if (e.kind === 'poison') return `☠️ ${e.name} (${e.turnsLeft}t)`;
    if (e.kind === 'punishment') return `⛓️ ${e.name} (${e.turnsLeft}t)`;
    const statName = {
      pa: 'PA', pm: 'PM', power: '% dmg', damage: 'dmg', crit: 'crit',
      vitalite: 'vita', range: 'PO', armor: 'armure',
      res_terre: '% rés. terre', res_feu: '% rés. feu', res_eau: '% rés. eau',
      res_air: '% rés. air', res_neutre: '% rés. neutre',
    }[e.stat] || e.stat;
    return `${e.value > 0 ? '+' : ''}${e.value} ${statName} (${e.turnsLeft}t)`;
  };

  return (
    <div className={`panel fighter-card${isActive ? ' is-active' : ''}`}>
      <div className="fighter-head">
        <div className={`face side-${side}-border`}>{cls.emoji}</div>
        <div className="who">
          <div className="bot-name">{fighter.name}</div>
          <div className="class-name">{cls.name} · niv. {fighter.level}</div>
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

      <div className="muted small">
        🟤 {fighter.stats.force} force · 🔥 {fighter.stats.intelligence} intel ·
        {' '}💧 {fighter.stats.chance} chance · 💨 {fighter.stats.agilite} agi ·
        {' '}🦉 {fighter.stats.sagesse} sagesse
      </div>

      <div className="effects">
        {fighter.effects.length === 0
          ? <span className="chip">aucun effet</span>
          : fighter.effects.map((e, i) => (
            <span key={i} className={`chip ${e.kind === 'poison' ? 'poison' : 'buff'}`}>
              {effectLabel(e)}
            </span>
          ))}
      </div>

      <div className="spell-list">
        {Object.values(cls.spells).map((s) => {
          const cd = fighter.cooldowns?.[s.key] || 0;
          return (
            <div key={s.key} className={`spell-row${cd > 0 ? ' on-cd' : ''}`}>
              <span>{s.emoji}</span>
              <span>{s.name}</span>
              {s.element ? <span title={s.element}>{ELEMENT_EMOJI[s.element]}</span> : null}
              {cd > 0 ? <span className="cd">⏳{cd}</span> : null}
              <span className="cost">{s.pa} PA</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
