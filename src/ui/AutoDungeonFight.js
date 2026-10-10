import React, { useEffect, useMemo, useState } from 'react';
import { Pause, Play, RotateCcw, SkipBack, SkipForward, StepBack, StepForward } from 'lucide-react';
import { runMatchAsync } from '../arena/runner';
import { dungeonOutcome } from '../arena/dungeonOutcome';
import { MAPS } from '../engine/maps';
import { combatAnimationMs, useAppearances, useRetroAssets } from './RetroAssets';
import { combatResources } from './combatResources';
import useFighterInspection from './useFighterInspection';
import BoardView from './BoardView';
import CombatStatsPanel from './CombatStatsPanel';
import LogPanel from './LogPanel';

export default function AutoDungeonFight({ config, active, onExit, onRematch }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(1);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [showLog, setShowLog] = useState(false);
  const assets = useRetroAssets();
  const { appearances } = useAppearances();
  const frame = result?.frames[index];
  const lastIndex = result ? result.frames.length - 1 : 0;
  const atEnd = !!result && index === lastIndex;
  const inspection = useFighterInspection(config, active && !!frame, frame?.state.fighters);

  useEffect(() => {
    const controller = new AbortController();
    setResult(null); setError(null); setProgress(1); setIndex(0); setPlaying(true);
    runMatchAsync(config, { signal: controller.signal, onProgress: step => setProgress(step.turn) })
      .then(value => { if (!controller.signal.aborted) setResult(value); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [config]);

  useEffect(() => {
    if (!active || !playing || !frame || atEnd) return undefined;
    const delay = Math.max(480, combatAnimationMs(frame.events, frame.state.fighters, assets, appearances)) / speed;
    const timer = setTimeout(() => setIndex(value => Math.min(lastIndex, value + 1)), delay);
    return () => clearTimeout(timer);
  }, [active, playing, frame, atEnd, speed, assets, appearances, lastIndex]);

  const eventCounts = useMemo(() => {
    let count = 0;
    return result?.frames.map(value => { count += value.events.length; return count; }) || [];
  }, [result]);
  const log = useMemo(() => result?.events.slice(0, eventCounts[index]) || [], [result, eventCounts, index]);
  const names = useMemo(() => Object.fromEntries(Object.values(result?.finalState.fighters || {}).map(f => [f.id, f.name])), [result]);
  const outcome = useMemo(() => result ? dungeonOutcome(result) : null, [result]);
  const seek = value => { setPlaying(false); setIndex(value); };
  const errors = result?.events.filter(event => event.t === 'bot_error').length || 0;
  const state = frame?.state;
  const fighter = state?.fighters[inspection.inspection?.id] || state?.fighters.A;
  const playerResources = state ? combatResources(state.fighters.A, state) : null;

  if (!frame) return <div className="play-screen fight-screen auto-dungeon">
    <div className="auto-simulation panel">
      <h1>{error ? 'Simulation interrompue' : 'Simulation du donjon'}</h1>
      <p role={error ? 'alert' : 'status'}>{error || `Votre personnage joue avec ${config.controllerName} · Tour ${progress}`}</p>
      {!error && <p className="muted">Le combat complet se prépare. Vous pourrez ensuite le regarder ou voir directement le résultat.</p>}
      <button className="btn" onClick={onExit}>{error ? config.mode === 'custom' ? 'Retour à l’atelier' : 'Retour à la préparation' : 'Annuler'}</button>
    </div>
  </div>;

  return <div className="play-screen fight-screen auto-dungeon" data-auto-dungeon data-replay-frame={index}>
    <div className={`fight-workspace${showLog ? ' log-open' : ''}`}>
      {showLog && <section className="fight-log" id="auto-fight-log" aria-label="Journal du combat">
        <button type="button" className="fight-log-close" onClick={() => setShowLog(false)} aria-label="Fermer le journal">×</button>
        <LogPanel events={log} namesById={names} state={state} />
      </section>}
      <div className="fight-main">
        <div className="fight-heading"><div><h1>{MAPS[state.mapId].name.replace(/^🗺\s*/, '')}</h1>
          <p>Donjon automatique · {config.controllerName} · Tour {state.turn}</p></div>
          <div className="fight-heading-actions"><button className="btn" aria-expanded={showLog} aria-controls="auto-fight-log" onClick={() => setShowLog(value => !value)}>Journal</button>
            <button className="btn" onClick={onExit}>{config.mode === 'custom' ? 'Retour à l’atelier' : 'Préparation'}</button></div>
        </div>
        <div className="fight-map"><BoardView fitToContainer state={state} frameEvents={frame.events} frameIdx={index}
          inspectionController={inspection} inspectionPanelId="auto-combat-stats" viewerTeam="A" showWinner={false} /></div>
        <div className="combat-dock">
          <div className="auto-replay-controls" aria-label="Lecture du combat">
            <button className="btn icon" aria-label="Revenir au début" onClick={() => seek(0)} disabled={!index}><SkipBack size={15} /></button>
            <button className="btn icon" aria-label="Action précédente" onClick={() => seek(Math.max(0, index - 1))} disabled={!index}><StepBack size={15} /></button>
            <button className="btn" aria-label={playing && !atEnd ? 'Pause' : 'Lire le combat'} onClick={() => {
              if (atEnd) { setIndex(0); setPlaying(true); } else setPlaying(value => !value);
            }}>{playing && !atEnd ? <Pause size={15} /> : <Play size={15} />}<span>{playing && !atEnd ? 'Pause' : 'Lire'}</span></button>
            <button className="btn icon" aria-label="Action suivante" onClick={() => seek(Math.min(lastIndex, index + 1))} disabled={atEnd}><StepForward size={15} /></button>
            <input type="range" aria-label="Avancement du combat" min="0" max={lastIndex} value={index} onChange={event => seek(Number(event.target.value))} />
            <select aria-label="Vitesse de lecture" value={speed} onChange={event => setSpeed(Number(event.target.value))}>
              {[.5, 1, 2, 4, 8].map(value => <option key={value} value={value}>×{value}</option>)}</select>
            <button className="btn auto-result-button" disabled={atEnd} onClick={() => seek(lastIndex)}><SkipForward size={15} />Voir le résultat</button>
          </div>
          {atEnd ? <div className={`auto-result ${outcome.status}`} role="status" data-outcome={outcome.status}>
            <strong>{outcome.label}</strong><span>{outcome.defeated} / {outcome.total} monstres vaincus · {outcome.turns} tours · {outcome.hp} / {outcome.maxHp} PV restants</span>
            {errors > 0 && <span>{errors} erreur{errors > 1 ? 's' : ''} d’IA · Voir le journal</span>}
          </div> : <div className="auto-combat-status" role="status">{playing ? `${names[state.order[state.currentIndex]]} joue` : 'Lecture en pause'} · {index + 1} / {result.frames.length} actions</div>}
          <CombatStatsPanel id="auto-combat-stats" fighter={fighter} fighters={state.fighters}
            resources={combatResources(fighter, state)} isActive={!state.over && state.order[state.currentIndex] === fighter.id}
            controller={inspection} inspecting={fighter.id !== 'A'} controls={<div className="play-controls combat-turn-controls">
              <div className="player-resources"><span className="hp"><strong>{state.fighters.A.hp}</strong><small>PV</small></span>
                <span className="pa"><strong>{playerResources.pa}</strong><small>PA</small></span><span className="pm"><strong>{playerResources.pm}</strong><small>PM</small></span></div>
              <div className="turn-dial" style={{ '--turn-progress': '0%' }}><div><small>TOUR</small><strong>{state.turn}</strong><span>{atEnd ? 'Terminé' : 'Auto'}</span></div></div>
              <button className="btn primary" onClick={onRematch}><RotateCcw size={13} />Retester</button>
            </div>} />
        </div>
      </div>
    </div>
  </div>;
}
