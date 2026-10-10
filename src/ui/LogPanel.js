import React, { useEffect, useRef, useState } from 'react';
import { MAPS } from '../engine/maps';
import { COMBAT_RULES_VERSION } from '../engine/engine';
import { effectDescription } from './combatEffects';

function line(e, nameOf) {
  switch (e.t) {
    case 'placement_start':
      return { cls: 'turn', text: `Placement sur ${MAPS[e.mapId]?.name || e.mapId} — choisissez votre case de départ.` };
    case 'placement_move':
      return { cls: 'info', text: `${nameOf(e.fighter)} change de case de départ.` };
    case 'placement_ready':
      return { cls: 'info', text: `${nameOf(e.fighter)} est prêt pour le combat.` };
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
    case 'non_combat_effect':
      return [413, 414].includes(e.spellId) ? { cls: 'info', text: `${e.name} : pas de capture dans cette arène.` } : null;
    case 'turn_skipped':
      return { cls: 'turn', text: `${nameOf(e.fighter)} passe son tour sous l’effet d’un sort.` };
    case 'carry':
      return { cls: 'info', text: `${nameOf(e.fighter)} porte ${nameOf(e.target)}.` };
    case 'reveal':
      return { cls: 'info', text: `${nameOf(e.fighter)} redevient visible.` };
    case 'spell_reflected':
      return { cls: 'info', text: `${nameOf(e.fighter)} renvoie le sort sur ${nameOf(e.target)}.` };
    case 'unsupported_effects':
      return { cls: 'error', text: `${e.name} : certains effets restent à reproduire (${e.effects.join(', ')}).` };
    case 'state_change':
      return { cls: 'info', text: `${nameOf(e.fighter)} : ${e.name}, état ${e.stateId} ${e.active ? 'activé' : 'retiré'}.` };
    case 'hazard_add':
      return { cls: 'info', text: `${nameOf(e.fighter)} pose ${e.name}${e.turns ? ` (${e.turns} tours)` : ''}.` };
    case 'hazard_trigger':
      return { cls: 'dmg', text: `${e.name} se déclenche sur ${nameOf(e.target)}.` };
    case 'hazard_end':
      return { cls: 'info', text: `${e.name} disparaît.` };
    case 'spell_fail':
      return { cls: 'error', text: `💫 ÉCHEC CRITIQUE de ${nameOf(e.fighter)} sur ${e.spellName}${e.endsTurn ? ' — le tour s’arrête !' : ''}` };
    case 'point_removal':
      return {
        cls: 'info',
        text: `🐌 ${e.name} : ${nameOf(e.target)} perd ${e.removed} ${e.stat}${e.dodged > 0 ? ` (${e.dodged} esquivé${e.dodged > 1 ? 's' : ''})` : ''}`,
      };
    case 'pa_refund':
      return { cls: 'info', text: `${nameOf(e.fighter)} récupère ${e.value} PA (${e.name}).` };
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
      return { cls: 'info', text: `✨ ${nameOf(e.fighter)} : ${['buff', 'punishment'].includes(e.kind) ? `${effectDescription(e)} — ` : ''}${e.name} (${e.turns} tour${e.turns > 1 ? 's' : ''})` };
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

export function combatRecord(events, namesById, state) {
  return { format: 'dofus-lite-combat', version: 1, rulesVersion: COMBAT_RULES_VERSION,
    mapId: state?.mapId || events.find(e => e.t === 'match_start')?.mapId,
    seed: state?.seed ?? events.find(e => e.t === 'match_start')?.seed,
    names: namesById, events: events.map((event, sequence) => ({ sequence, ...event })),
    state: state || null };
}

export default function LogPanel({ events, namesById, state }) {
  const ref = useRef(null);
  const [details, setDetails] = useState(false);
  const nameOf = (id) => namesById[id] || id;

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [events.length]);

  const download = () => {
    const record = combatRecord(events, namesById, state);
    const url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = `combat-${record.seed || 'local'}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="panel">
      <div className="combat-log-heading"><h3>Journal du combat <small className="muted">{events.length} événements</small></h3>
        <label><input type="checkbox" checked={details} onChange={e => setDetails(e.target.checked)} /> Détails des jets</label>
        <button className="btn" onClick={download} disabled={!events.length}>Exporter le journal</button>
      </div>
      <div className="log" ref={ref}>
        {events.length === 0
          ? <span className="muted small">Lancez un combat pour voir le déroulé…</span>
          : events.map((e, i) => {
            const l = line(e, nameOf);
            if (details && e.t === 'effect_roll') return <div key={i} className="entry info">Jet {e.roll}/99 · effet {e.effectId} · {e.chance}% · {e.selected ? 'retenu' : 'écarté'}</div>;
            return l ? <div key={i} className={`entry ${l.cls}`}>{l.text}
              {details && e.calculation && <div className="muted small">Jet {e.calculation.jet}{e.calculation.boost ? ` + charge ${e.calculation.boost}` : ''} → {e.calculation.raw} après caractéristiques → {e.calculation.afterRes} après résistances → armure −{e.calculation.armor}</div>}
            </div> : null;
          })}
      </div>
    </div>
  );
}
