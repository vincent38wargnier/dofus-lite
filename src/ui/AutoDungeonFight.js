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
import CombatTimeline from './CombatTimeline';
import CombatSpellbook, { SpellbookButton } from './CombatSpellbook';
import LogPanel from './LogPanel';
import { CampaignBrief, CampaignResult } from './DungeonCampaign';

export default function AutoDungeonFight({ config, active, onExit, onCancel = onExit, onRematch, onNextRoom, exitLabel = 'Retour à Combat' }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(1);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [showLog, setShowLog] = useState(false);
  const [spellbookOpen, setSpellbookOpen] = useState(false);
  const [roomBrief, setRoomBrief] = useState(!!config.dungeon?.rooms);
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
    if (!active || !playing || !frame || atEnd || spellbookOpen || roomBrief) return undefined;
    const delay = Math.max(480, combatAnimationMs(frame.events, frame.state.fighters, assets, appearances)) / speed;
    const timer = setTimeout(() => setIndex(value => Math.min(lastIndex, value + 1)), delay);
    return () => clearTimeout(timer);
  }, [active, playing, frame, atEnd, speed, assets, appearances, lastIndex, spellbookOpen, roomBrief]);

  const eventCounts = useMemo(() => {
    let count = 0;
    return result?.frames.map(value => { count += value.events.length; return count; }) || [];
  }, [result]);
  const log = useMemo(() => result?.events.slice(0, eventCounts[index]) || [], [result, eventCounts, index]);
  const names = useMemo(() => Object.fromEntries(Object.values(result?.finalState.fighters || {}).map(f => [f.id, f.name])), [result]);
  const outcome = useMemo(() => result ? dungeonOutcome(result) : null, [result]);
  const seek = value => { setPlaying(false); setIndex(value); };
  const errors = result?.events.filter(event => event.t === 'bot_error').length || 0;
  const composed = !!config.opponents;
  const state = frame?.state;
  const fighter = state?.fighters[inspection.inspection?.id] || state?.fighters.A;
  const playerResources = state ? combatResources(state.fighters.A, state) : null;

  if (!frame) return <div className="play-screen fight-screen auto-dungeon">
    <div className="auto-simulation panel">
      <h1>{error ? 'Simulation interrompue' : composed ? 'Simulation du combat' : 'Simulation du donjon'}</h1>
      <p role={error ? 'alert' : 'status'}>{error || `Votre personnage joue avec ${config.controllerName} · Tour ${progress}`}</p>
      {!error && <p className="muted">Le combat complet se prépare. Vous pourrez ensuite le regarder ou voir directement le résultat.</p>}
      <button className="btn" onClick={onCancel}>{error ? exitLabel : 'Annuler'}</button>
    </div>
  </div>;

  return <div className="play-screen fight-screen auto-dungeon" data-auto-dungeon data-replay-frame={index}>
    <div className={`fight-workspace${showLog ? ' log-open' : ''}`}>
      {showLog && <section className="fight-log" id="auto-fight-log" aria-label="Journal du combat">
        <button type="button" className="fight-log-close" onClick={() => setShowLog(false)} aria-label="Fermer le journal">×</button>
        <LogPanel events={log} namesById={names} state={state} />
      </section>}
      <div className="fight-main">
        <div className="fight-heading"><div><h1>{(state.board.name || MAPS[state.mapId]?.name || 'Terrain personnalisé').replace(/^🗺\s*/, '')}</h1>
          <p>{composed ? 'IA contre IA' : 'IA contre donjon'} · {config.controllerName} · Tour {state.turn}{state.encounter?.commanderId && <span className="army-objective" data-army-objective> · Objectif : {state.fighters[state.encounter.commanderId]?.name}</span>}</p></div>
          <div className="fight-heading-actions"><button className="btn" aria-expanded={showLog} aria-controls="auto-fight-log" onClick={() => setShowLog(value => !value)}>Journal</button>
            <SpellbookButton onClick={() => setSpellbookOpen(true)} />
            <button className="btn" onClick={onExit}>{exitLabel}</button></div>
        </div>
        <div className="fight-map"><BoardView fitToContainer state={state} frameEvents={frame.events} frameIdx={index}
          inspectionController={inspection} inspectionPanelId="auto-combat-stats" viewerTeam="A" showWinner={false} />
          {atEnd && config.dungeon?.rooms && <CampaignResult dungeon={config.dungeon} roomIndex={config.roomIndex || 0} state={state}
            onNext={onNextRoom} onRetry={onRematch} onExit={onExit} />}
          {roomBrief && config.dungeon?.rooms && <CampaignBrief dungeon={config.dungeon} roomIndex={config.roomIndex || 0} onClose={() => setRoomBrief(false)} />}</div>
        <div className="combat-dock">
          <CombatTimeline state={state} controller={inspection} panelId="auto-combat-stats" />
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
            <strong>{composed && outcome.status === 'victory' ? 'Victoire · Camp adverse vaincu' : outcome.label}</strong><span>{outcome.defeated} / {outcome.total} {composed ? 'adversaires' : config.mode === 'custom' ? 'combattants' : 'monstres'} vaincus · {outcome.turns} tours · {outcome.hp} / {outcome.maxHp} PV restants</span>
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
    {spellbookOpen && <CombatSpellbook state={state} initialFighterId={inspection.inspection?.id} onClose={() => setSpellbookOpen(false)} />}
  </div>;
}
