import React, { useEffect, useRef } from 'react';
import { MAPS } from '../engine/maps';

function line(e, nameOf) {
  switch (e.t) {
    case 'match_start': {
      const order = e.order.map((o) => `${o.name} (${o.initiative})`).join(' puis ');
      return { cls: 'turn', text: `🏟️ ${MAPS[e.mapId]?.name || e.mapId} — initiative: ${order}` };
    }
    case 'turn_start':
      return { cls: 'turn', text: `— Tour ${e.turn} · ${nameOf(e.fighter)} (${e.pa} PA, ${e.pm} PM)` };
    case 'move':
      return { cls: 'info', text: `${nameOf(e.fighter)} se déplace de ${e.cost} case${e.cost > 1 ? 's' : ''}` };
    case 'tackle':
      return { cls: 'dmg', text: `🪤 ${nameOf(e.fighter)} rate sa fuite (${e.chance}%) : taclé ! -${e.lostPa} PA, tous les PM perdus` };
    case 'escape':
      return { cls: 'info', text: `🏃 ${nameOf(e.fighter)} s'échappe du contact (${e.chance}%)` };
    case 'cast':
      return { cls: 'info', text: `${nameOf(e.fighter)} lance ${e.emoji} ${e.spellName}${e.crit ? ' — COUP CRITIQUE !' : ''}` };
    case 'spell_fail':
      return { cls: 'error', text: `💫 ÉCHEC CRITIQUE de ${nameOf(e.fighter)} sur ${e.spellName}${e.endsTurn ? ' — le tour s’arrête !' : ''}` };
    case 'point_removal':
      return {
        cls: 'info',
        text: `🐌 ${e.name} : ${nameOf(e.target)} perd ${e.removed} ${e.stat}${e.dodged > 0 ? ` (${e.dodged} esquivé${e.dodged > 1 ? 's' : ''})` : ''}`,
      };
    case 'pull':
      return { cls: 'info', text: `🧲 ${nameOf(e.target)} est attiré` };
    case 'swap':
      return { cls: 'info', text: `🔄 ${nameOf(e.a)} échange sa position avec ${nameOf(e.b)} (${e.name})` };
    case 'dispel':
      return { cls: 'info', text: `🧹 ${e.name} : ${nameOf(e.target)} perd ${e.removed} effet${e.removed > 1 ? 's' : ''}` };
    case 'summon_add':
      return { cls: 'turn', text: `${e.emoji} ${nameOf(e.fighter)} invoque ${e.name} (${e.hp} PV) !` };
    case 'damage':
      return {
        cls: 'dmg',
        text: `💢 ${nameOf(e.target)} subit ${e.amount} dégâts${e.element ? ` de ${e.element}` : ''} (${e.label}) → ${e.hpLeft} PV${e.erosion ? ` · érosion -${e.erosion} PV max` : ''}`,
      };
    case 'heal':
      return { cls: 'heal', text: `💚 ${nameOf(e.target)} récupère ${e.amount} PV (${e.label})` };
    case 'push':
      return e.moved > 0
        ? { cls: 'info', text: `💨 ${nameOf(e.target)} est poussé de ${e.moved} case${e.moved > 1 ? 's' : ''}` }
        : { cls: 'info', text: `💨 ${nameOf(e.target)} est écrasé contre l'obstacle` };
    case 'teleport':
      return { cls: 'info', text: `🦘 ${nameOf(e.fighter)} bondit` };
    case 'effect_add':
      return { cls: 'info', text: `✨ ${nameOf(e.fighter)} : ${e.name} pendant ${e.turns} tour${e.turns > 1 ? 's' : ''}` };
    case 'effect_end':
      return { cls: 'info', text: `${e.name} se dissipe sur ${nameOf(e.fighter)}` };
    case 'say':
      return { cls: 'say', text: `💬 ${nameOf(e.fighter)} : « ${e.text} »` };
    case 'invalid':
      return { cls: 'error', text: `⚠️ ${nameOf(e.fighter)} — action refusée : ${e.reason}` };
    case 'bot_error':
      return { cls: 'error', text: `💥 Le bot ${nameOf(e.fighter)} a planté : ${e.message}` };
    case 'forfeit_turn':
      return { cls: 'error', text: `🏳️ ${nameOf(e.fighter)} perd son tour (${e.reason})` };
    case 'death':
      return { cls: 'turn', text: `☠️ ${nameOf(e.fighter)} est K.O. !` };
    case 'match_end':
      return {
        cls: 'turn',
        text: e.winner
          ? `🏆 ${nameOf(e.winner)} remporte le combat (${e.reason === 'ko' ? 'K.O.' : 'aux PV à la limite de tours'})`
          : '🤝 Match nul',
      };
    default:
      return null;
  }
}

export default function LogPanel({ events, namesById }) {
  const ref = useRef(null);
  const nameOf = (id) => namesById[id] || id;

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [events.length]);

  return (
    <div className="panel">
      <h3>Journal du combat</h3>
      <div className="log" ref={ref}>
        {events.length === 0
          ? <span className="muted small">Lancez un combat pour voir le déroulé…</span>
          : events.map((e, i) => {
            const l = line(e, nameOf);
            return l ? <div key={i} className={`entry ${l.cls}`}>{l.text}</div> : null;
          })}
      </div>
    </div>
  );
}
