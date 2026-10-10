import React, { useEffect, useRef, useState } from 'react';
import { COMBAT_RULES_VERSION } from '../engine/engine';
import { effectDescription, signed } from './combatEffects';
import { summarizedHealthEvents } from './healthChanges';

function lines(e, nameOf) {
  const change = (id, value, cls = 'info') => ({ cls, subject: nameOf(id), value, title: e.name || e.label });
  switch (e.t) {
    case 'damage':
      return [change(e.target, `${signed(-e.amount)} PV`, 'dmg')];
    case 'heal':
      return [change(e.target, `${signed(e.amount)} PV`, 'heal')];
    case 'point_removal':
      return [change(e.target, `${signed(-e.removed)} ${e.stat}`),
        ...(e.stolen && e.removed > 0 ? [change(e.fighter, `${signed(e.removed)} ${e.stat}`)] : [])];
    case 'pa_refund':
      return [change(e.fighter, `${signed(e.value)} PA`)];
    case 'effect_add':
      return [change(e.fighter, e.kind === 'buff' ? effectDescription(e) : e.name || effectDescription(e))];
    case 'effect_end':
      return [change(e.fighter, `Fin : ${e.name}`)];
    case 'dispel':
      return [change(e.target, `−${e.removed} effet${e.removed > 1 ? 's' : ''}`)];
    case 'tackle':
      return [change(e.fighter, `${signed(-e.lostPa)} PA · PM à 0`)];
    case 'damage_dodged':
      return [change(e.fighter, '0 PV', 'dmg')];
    // Failed actions still need feedback, even in the compact journal.
    case 'unsupported_effects':
      return [{ cls: 'error', text: `${e.name} : effet indisponible` }];
    case 'spell_fail':
      return [change(e.fighter, 'Échec critique', 'error')];
    case 'invalid':
      return [change(e.fighter, e.reason, 'error')];
    case 'bot_error':
      return [change(e.fighter, 'Erreur de jeu', 'error')];
    default:
      return [];
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
  const entries = (details ? events : summarizedHealthEvents(events)).flatMap((event, index) => {
    if (details && event.t === 'effect_roll') return [{ key: index, cls: 'info',
      text: `Jet ${event.roll}/99 · effet ${event.effectId} · ${event.chance}% · ${event.selected ? 'retenu' : 'écarté'}`, event }];
    return lines(event, nameOf).map((line, row) => ({ ...line, key: `${index}-${row}`, event }));
  });

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [entries.length, details]);

  const download = () => {
    const record = combatRecord(events, namesById, state);
    const url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = `combat-${record.seed || 'local'}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="panel">
      <div className="combat-log-heading"><h3>Journal du combat <small className="muted">{entries.length} entrée{entries.length > 1 ? 's' : ''}</small></h3>
        <label><input type="checkbox" checked={details} onChange={e => setDetails(e.target.checked)} /> Détails des jets</label>
        <button className="btn" onClick={download} disabled={!events.length}>Exporter le journal</button>
      </div>
      <div className="log" ref={ref}>
        {entries.length === 0
          ? <span className="muted small">Aucun changement pour le moment.</span>
          : entries.map(({ event: e, ...l }) => {
            return <div key={l.key} className={`entry ${l.cls}`} title={l.title}>
              {l.text || <>{l.subject} : <strong className={['damage', 'heal', 'point_removal', 'pa_refund'].includes(e.t) ? 'log-amount' : undefined}>{l.value}</strong></>}
              {details && e.calculation && <div className="muted small">Jet {e.calculation.jet}{e.calculation.boost ? ` + charge ${e.calculation.boost}` : ''}{e.calculation.flatDamage ? ` · ${e.calculation.flatDamage > 0 ? '+' : ''}${e.calculation.flatDamage} dommages fixes` : ''} → {e.calculation.raw} après caractéristiques{e.calculation.areaPercent !== undefined && e.calculation.areaPercent !== 100 ? ` → zone ${e.calculation.areaPercent} % : ${e.calculation.afterArea}` : ''} → {e.calculation.afterRes} après résistances → armure −{e.calculation.armor}</div>}
            </div>;
          })}
      </div>
    </div>
  );
}
