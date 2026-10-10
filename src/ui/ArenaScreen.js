import React, { useEffect, useMemo, useState } from 'react';
import { CLASSES, CLASS_IDS } from '../engine/classes';
import { compileBot } from '../bots/compile';
import { runMatch } from '../arena/runner';
import { findBot } from './botsStore';
import BoardView from './BoardView';
import FighterPanel from './FighterPanel';
import LogPanel from './LogPanel';
import MapPicker from './MapPicker';
import LoadoutPicker, { useLoadouts } from './LoadoutPicker';
import { AppearanceSelect, combatAnimationMs, useRetroAssets, useAppearances } from './RetroAssets';

const SPEEDS = [
  { label: '×0.5', ms: 850 },
  { label: '×1', ms: 480 },
  { label: '×2', ms: 240 },
  { label: '×4', ms: 110 },
];

export default function ArenaScreen({ allBots, replay, onReplayConsumed, active = true }) {
  const assets = useRetroAssets();
  const { appearances, setAppearance } = useAppearances();
  const [botA, setBotA] = useState('brutus');
  const [botB, setBotB] = useState('plume');
  const [classA, setClassA] = useState('IOP');
  const [classB, setClassB] = useState('CRA');
  const equipment = useLoadouts(classA, classB);
  const sexA = equipment.loadouts.A.profile?.sex || 0;
  const sexB = equipment.loadouts.B.profile?.sex || 0;
  useEffect(() => {
    if (active) { setAppearance('A', sexA === 1 ? 'female' : 'male'); setAppearance('B', sexB === 1 ? 'female' : 'male'); }
  }, [active, sexA, sexB, setAppearance]);
  const [showEquipment, setShowEquipment] = useState(true);
  const [mapId, setMapId] = useState('territoire_des_dopeuls_5383');
  const [seed, setSeed] = useState(1337);
  const [error, setError] = useState(null);

  const [result, setResult] = useState(null);
  const [frameIdx, setFrameIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(1);

  const launch = (cfg) => {
    const c = cfg || { botA, botB, classA, classB, mapId, seed, loadouts: equipment.loadouts };
    setError(null);
    const a = findBot(allBots, c.botA);
    const b = findBot(allBots, c.botB);
    if (!a || !b) { setError('Choisissez deux bots.'); return; }
    let decideA;
    let decideB;
    try { decideA = compileBot(a.code); } catch (e) { setError(`${a.name} : ${e.message}`); return; }
    try { decideB = compileBot(b.code); } catch (e) { setError(`${b.name} : ${e.message}`); return; }

    let r;
    try { r = runMatch({
      bots: { A: { name: a.name, decide: decideA }, B: { name: b.name, decide: decideB } },
      classes: { A: c.classA, B: c.classB },
      mapId: c.mapId,
      seed: Number(c.seed) || 1,
      loadouts: c.loadouts,
    }); } catch (e) { setError(e.message); return; }
    setResult(r);
    setFrameIdx(0);
    setPlaying(true);
    setShowEquipment(false);
  };

  // Replay demandé depuis l'écran Tournoi.
  useEffect(() => {
    if (!replay) return;
    setBotA(replay.botA); setBotB(replay.botB);
    setClassA(replay.classA); setClassB(replay.classB);
    setMapId(replay.mapId); setSeed(replay.seed);
    launch(replay);
    onReplayConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replay]);

  const lastIdx = result ? result.frames.length - 1 : 0;

  useEffect(() => {
    if (!playing || !result) return undefined;
    const current = result.frames[frameIdx];
    const duration = combatAnimationMs(current.events, current.state.fighters, assets, appearances);
    const timer = setTimeout(() => {
      setFrameIdx((i) => {
        if (i >= lastIdx) { setPlaying(false); return i; }
        return i + 1;
      });
    }, Math.max(SPEEDS[speedIdx].ms, duration * SPEEDS[speedIdx].ms / 480));
    return () => clearTimeout(timer);
  }, [playing, speedIdx, result, lastIdx, frameIdx, assets, appearances]);

  // Événements aplatis une seule fois, tagués par frame, pour le journal.
  const taggedEvents = useMemo(() => {
    if (!result) return [];
    const out = [];
    result.frames.forEach((f, fi) => f.events.forEach((e) => out.push({ fi, e })));
    return out;
  }, [result]);

  const frame = result ? result.frames[frameIdx] : null;
  const logEvents = useMemo(
    () => taggedEvents.filter((x) => x.fi <= frameIdx).map((x) => x.e),
    [taggedEvents, frameIdx],
  );

  const namesById = useMemo(() => {
    if (!result) return {};
    const names = { A: result.config.botNames.A, B: result.config.botNames.B };
    for (const { e } of taggedEvents) {
      if (e.t === 'summon_add') names[e.id] = e.name;
    }
    return names;
  }, [result, taggedEvents]);

  const atEnd = result && frameIdx === lastIdx;
  const winnerName = result && result.winner ? namesById[result.winner] : null;

  const botOptions = allBots.map((b) => (
    <option key={b.id} value={b.id}>{b.emoji} {b.name}{b.custom ? ' (perso)' : ''}</option>
  ));
  const classOptions = CLASS_IDS.map((id) => (
    <option key={id} value={id}>{CLASSES[id].emoji} {CLASSES[id].name}</option>
  ));

  return (
    <div>
      <div className="panel" style={{ marginBottom: 14, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label className="field">
          <span style={{ color: 'var(--blue)', fontWeight: 700 }}>Bot A</span>
          <select value={botA} onChange={(e) => setBotA(e.target.value)}>{botOptions}</select>
        </label>
        <label className="field">
          Classe A
          <select value={classA} onChange={(e) => setClassA(e.target.value)}>{classOptions}</select>
        </label>
        <span style={{ fontWeight: 900, color: 'var(--gold)', paddingBottom: 9 }}>VS</span>
        <label className="field">
          <span style={{ color: 'var(--red)', fontWeight: 700 }}>Bot B</span>
          <select value={botB} onChange={(e) => setBotB(e.target.value)}>{botOptions}</select>
        </label>
        <label className="field">
          Classe B
          <select value={classB} onChange={(e) => setClassB(e.target.value)}>{classOptions}</select>
        </label>
        <MapPicker value={mapId} onChange={setMapId} />
        {['A', 'B'].map(side => <AppearanceSelect key={side} side={side} value={equipment.loadouts[side].profile?.sex === 1 ? 'female' : 'male'}
          onChange={value => equipment.update(side, current => ({ ...current, profile: { ...current.profile, sex: value === 'female' ? 1 : 0 } }))} />)}
        <label className="field">
          Seed
          <input
            type="number"
            value={seed}
            style={{ width: 110 }}
            onChange={(e) => setSeed(e.target.value)}
          />
        </label>
        <button className="btn icon" title="Seed aléatoire" onClick={() => setSeed(Math.floor(Math.random() * 1e9))}>🎲</button>
        <button className="btn primary" disabled={!equipment.summaries.A.valid || !equipment.summaries.B.valid} onClick={() => launch()}>⚔️ Lancer le combat</button>
        {result ? <button className="btn" onClick={() => setShowEquipment(!showEquipment)}>{showEquipment ? 'Fermer l’équipement' : 'Équipement du prochain match'}</button> : null}
        {error ? <span style={{ color: 'var(--danger)', fontWeight: 700 }}>{error}</span> : null}
      </div>

      {showEquipment ? <LoadoutPicker onClassChange={(side, id) => side === 'A' ? setClassA(id) : setClassB(id)} classes={{ A: classA, B: classB }} names={{ A: 'Combattant A', B: 'Combattant B' }} {...equipment} /> : null}

      <div className="arena-layout">
        <div>
          {frame
            ? (
              <FighterPanel
                fighter={frame.state.fighters.A}
                fighters={frame.state.fighters}
                side="A"
                isActive={!atEnd && frame.state.order[frame.state.currentIndex] === 'A'}
              />
            )
            : <div className="panel muted small">Le combattant A apparaîtra ici.</div>}
        </div>

        <div className="arena-center">
          {frame ? (
            <>
              <BoardView
                state={frame.state}
                frameEvents={frame.events}
                frameIdx={frameIdx}
                winnerName={winnerName}
                endReason={result.endReason}
                showWinner={atEnd}
              />
              <div className="playback">
                <button className="btn icon" onClick={() => { setPlaying(false); setFrameIdx(0); }}>⏮</button>
                <button className="btn icon" onClick={() => { setPlaying(false); setFrameIdx((i) => Math.max(0, i - 1)); }}>◀</button>
                <button className="btn icon" onClick={() => (atEnd ? (setFrameIdx(0), setPlaying(true)) : setPlaying(!playing))}>
                  {playing ? '⏸' : '▶'}
                </button>
                <button className="btn icon" onClick={() => { setPlaying(false); setFrameIdx((i) => Math.min(lastIdx, i + 1)); }}>▶︎▶︎</button>
                <input
                  type="range"
                  min={0}
                  max={lastIdx}
                  value={frameIdx}
                  onChange={(e) => { setPlaying(false); setFrameIdx(Number(e.target.value)); }}
                />
                <span className="turn-badge">Tour {frame.state.turn}</span>
                <select value={speedIdx} onChange={(e) => setSpeedIdx(Number(e.target.value))}>
                  {SPEEDS.map((s, i) => <option key={s.label} value={i}>{s.label}</option>)}
                </select>
              </div>
              <div className="muted small">
                {result.turns} tours · {result.config.botNames.A} a infligé {result.stats.A.damageDealt} dégâts
                {' '}· {result.config.botNames.B} en a infligé {result.stats.B.damageDealt}
                {result.stats.A.errors + result.stats.B.errors > 0
                  ? ` · ⚠️ ${result.stats.A.errors + result.stats.B.errors} crash(s) de bot`
                  : ''}
              </div>
            </>
          ) : (
            <div className="panel" style={{ padding: 40, textAlign: 'center' }}>
              <div style={{ fontSize: 40 }}>🏟️</div>
              <p className="muted">
                Choisissez deux bots et lancez le combat.<br />
                Le match se joue instantanément puis se rejoue ici, coup par coup.
              </p>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {frame ? (
            <FighterPanel
              fighter={frame.state.fighters.B}
              fighters={frame.state.fighters}
              side="B"
              isActive={!atEnd && frame.state.order[frame.state.currentIndex] === 'B'}
            />
          ) : null}
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <LogPanel events={logEvents} namesById={namesById} state={frame?.state} />
      </div>
    </div>
  );
}
