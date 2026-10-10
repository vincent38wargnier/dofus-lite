import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CLASSES, CLASS_IDS } from '../engine/classes';
import { resolveLoadout } from '../engine/equipment';
import { compileBot } from '../bots/compile';
import { runMatchAsync } from '../arena/runner';
import { findBot } from './botsStore';
import BoardView from './BoardView';
import FighterPanel from './FighterPanel';
import LogPanel from './LogPanel';
import MapPicker from './MapPicker';
import LoadoutPicker, { useLoadouts } from './LoadoutPicker';
import { useLoadoutLibrary } from './LoadoutsContext';
import { applySavedEquipment, sameEquipment } from './loadoutStore';
import { useCreations } from './CreationsContext';
import { cloneCreation } from './creationsStore';
import { loadoutAtLevel } from './playerSetupState';
import { AppearanceSelect, RetroPortrait, combatAnimationMs, useRetroAssets, useAppearances } from './RetroAssets';
import '../styles/arenaSetup.css';

const SPEEDS = [
  { label: '×0.5', ms: 850 },
  { label: '×1', ms: 480 },
  { label: '×2', ms: 240 },
  { label: '×4', ms: 110 },
];

export default function ArenaScreen({ allBots, replay, onReplayConsumed, active = true }) {
  const assets = useRetroAssets();
  const { appearances, setAppearance } = useAppearances();
  const [botA, setBotA] = useState('maison');
  const [botB, setBotB] = useState('maison');
  const [classA, setClassA] = useState('IOP');
  const [classB, setClassB] = useState('CRA');
  const normalEquipment = useLoadouts(classA, classB);
  const creations = useCreations();
  const [customCharacters, setCustomCharacters] = useState({});
  const customSummaries = useMemo(() => Object.fromEntries(Object.entries(customCharacters)
    .filter(([, character]) => character).map(([side, character]) => [side, resolveLoadout(character.classId, character.loadout)])), [customCharacters]);
  const equipment = { ...normalEquipment,
    loadouts: { A: customCharacters.A?.loadout || normalEquipment.loadouts.A, B: customCharacters.B?.loadout || normalEquipment.loadouts.B },
    summaries: { ...normalEquipment.summaries, ...customSummaries },
    update: (side, change, targetClass) => {
      if (!customCharacters[side]) { normalEquipment.update(side, change, targetClass); return; }
      setCustomCharacters(previous => ({ ...previous, [side]: { ...previous[side],
        loadout: typeof change === 'function' ? change(previous[side].loadout) : change } }));
    },
  };
  const { library, commit, libraryError } = useLoadoutLibrary();
  const sexA = equipment.loadouts.A.profile?.sex || 0;
  const sexB = equipment.loadouts.B.profile?.sex || 0;
  useEffect(() => {
    if (active) { setAppearance('A', sexA === 1 ? 'female' : 'male'); setAppearance('B', sexB === 1 ? 'female' : 'male'); }
  }, [active, sexA, sexB, setAppearance]);
  const [showEquipment, setShowEquipment] = useState(false);
  const [mapId, setMapId] = useState('territoire_des_dopeuls_5383');
  const [seed, setSeed] = useState(1337);
  const [error, setError] = useState(null);
  const simulation = useRef(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  useEffect(() => () => simulation.current?.abort(), []);

  const [result, setResult] = useState(null);
  const [frameIdx, setFrameIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(1);

  const launch = async (cfg) => {
    const c = cfg || { botA, botB, classA, classB, mapId, seed, loadouts: equipment.loadouts,
      names: { A: customCharacters.A?.name, B: customCharacters.B?.name } };
    setError(null);
    const a = findBot(allBots, c.botA);
    const b = findBot(allBots, c.botB);
    if (!a || !b) { setError('Choisissez une IA pour chaque personnage.'); return; }
    let decideA;
    let decideB;
    try { decideA = compileBot(a.code); } catch (e) { setError(`${a.name} : ${e.message}`); return; }
    try { decideB = compileBot(b.code); } catch (e) { setError(`${b.name} : ${e.message}`); return; }

    simulation.current?.abort();
    const controller = new AbortController();
    simulation.current = controller;
    setRunning(true); setProgress(null); setPlaying(false); setShowEquipment(false);
    try {
      const r = await runMatchAsync({
        bots: {
          A: { name: `${c.names?.A || CLASSES[c.classA].name} A · ${a.name}`, decide: decideA },
          B: { name: `${c.names?.B || CLASSES[c.classB].name} B · ${b.name}`, decide: decideB },
        },
        classes: { A: c.classA, B: c.classB },
        mapId: c.mapId,
        seed: Number(c.seed) || 1,
        loadouts: c.loadouts,
      }, { signal: controller.signal, onProgress: setProgress });
      if (controller.signal.aborted) return;
      setResult(r);
      setFrameIdx(0);
      setPlaying(true);
      setShowEquipment(false);
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message);
    } finally {
      if (simulation.current === controller) { simulation.current = null; setRunning(false); }
    }
  };

  // Replay demandé depuis l'écran Tournoi.
  useEffect(() => {
    if (!replay) return;
    setCustomCharacters({});
    setBotA(replay.botA); setBotB(replay.botB);
    setClassA(replay.classA); setClassB(replay.classB);
    setMapId(replay.mapId); setSeed(replay.seed);
    launch(replay);
    onReplayConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replay]);

  const lastIdx = result ? result.frames.length - 1 : 0;

  useEffect(() => {
    if (!active || !playing || !result) return undefined;
    const current = result.frames[frameIdx];
    const duration = combatAnimationMs(current.events, current.state.fighters, assets, appearances);
    const timer = setTimeout(() => {
      setFrameIdx((i) => {
        if (i >= lastIdx) { setPlaying(false); return i; }
        return i + 1;
      });
    }, Math.max(SPEEDS[speedIdx].ms, duration * SPEEDS[speedIdx].ms / 480));
    return () => clearTimeout(timer);
  }, [active, playing, speedIdx, result, lastIdx, frameIdx, assets, appearances]);

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
  const chooseStuff = (side, classId, id) => {
    const build = library.builds.find(b => b.id === id);
    if (!build || !commit({ type: 'activate', key: `${side}:${classId}`, id })) return;
    equipment.update(side, current => applySavedEquipment(current, build.loadout), classId);
  };

  return (
    <div className="arena-screen">
      <div className="setup-heading">
        <div><p className="eyebrow">DUEL AUTOMATIQUE</p><h1>IA contre IA</h1>
          <p>Choisissez deux personnages et l’IA qui les pilote, puis regardez leur combat.</p></div>
      </div>
      <section className="panel arena-setup" aria-label="Préparer un duel IA contre IA" aria-busy={running}>
        <fieldset className="arena-setup-fields" disabled={running}>
        <div className="arena-combatants">
          {[
            { side: 'A', classId: classA, botId: botA, setClass: setClassA, setBot: setBotA },
            { side: 'B', classId: classB, botId: botB, setClass: setClassB, setBot: setBotB },
          ].map(({ side, classId, botId, setClass, setBot }) => {
            const loadout = equipment.loadouts[side], summary = equipment.summaries[side];
            const savedStuff = library.builds.find(build => build.id === library.active[`${side}:${classId}`]
              && sameEquipment(build.loadout, loadout));
            return <section className={`arena-combatant side-${side}`} aria-label={`Personnage ${side}`} key={side}>
              <div className="arena-combatant-heading">
                <RetroPortrait classId={classId} artworkId={equipment.loadouts[side]?.artworkId} side={side} fallback={CLASSES[classId].emoji} />
                <div><h2>{customCharacters[side]?.name || `Personnage ${side}`}</h2><p>{CLASSES[classId].name} · niveau {summary.level}</p></div>
                <span className="arena-side-badge" aria-hidden="true">{side}</span>
              </div>
              {!!creations?.characters.length && <label className="field">Création de l’atelier {side}<select aria-label={`Personnage personnalisé ${side}`} value={customCharacters[side]?.id || ''}
                onChange={event => {
                  const character = creations.characters.find(entry => entry.id === event.target.value);
                  setCustomCharacters(previous => ({ ...previous, [side]: character ? cloneCreation(character) : null }));
                  if (character) setClass(character.classId);
                }}><option value="">Personnage classique</option>{creations.characters.map(character => <option key={character.id} value={character.id}>{character.name} · {CLASSES[character.classId].name}</option>)}</select>
                {customCharacters[side] && <small>Copie indépendante pour ce duel. L’original reste dans l’atelier.</small>}
              </label>}
              <div className="arena-character-fields">
                <label className="field">Classe {side}<select aria-label={`Classe ${side}`} disabled={!!customCharacters[side]} value={classId} onChange={e => setClass(e.target.value)}>{classOptions}</select></label>
                <label className="field">Niveau {side}<select aria-label={`Niveau ${side}`} value={summary.level}
                  onChange={e => equipment.update(side, current => loadoutAtLevel(classId, current, e.target.value))}>
                  {Array.from({ length: 200 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
                </select></label>
                <AppearanceSelect side={side} value={loadout.profile?.sex === 1 ? 'female' : 'male'}
                  onChange={value => equipment.update(side, current => ({ ...current, profile: { ...current.profile, sex: value === 'female' ? 1 : 0 } }))} />
              </div>
              <div className="arena-ai-choice">
                <label className="field">IA {side}<select aria-label={`IA ${side}`} value={botId} onChange={e => setBot(e.target.value)}>{botOptions}</select></label>
                {side === 'B' ? <button type="button" className="btn" disabled={botA === botB || !findBot(allBots, botA)}
                  onClick={() => setBotB(botA)}>Même IA que A</button> : null}
              </div>
              <label className="field">Stuff {side}<select aria-label={`Stuff ${side}`} value={savedStuff?.id || ''} disabled={!library.builds.length}
                onChange={e => chooseStuff(side, classId, e.target.value)}>
                <option value="">{library.builds.length ? 'Stuff actuel · choisir un stuff enregistré…' : 'Stuff actuel · aucun stuff enregistré'}</option>
                {library.builds.map(build => <option key={build.id} value={build.id}>{build.name}</option>)}
              </select></label>
              <div className="arena-character-totals"><span>{summary.hp} PV</span><span>{summary.pa} PA</span><span>{summary.pm} PM</span><span>{summary.items.length} objets</span></div>
              {!summary.valid ? <ul className="penalty small" role="alert">{summary.errors.map(message => <li key={message}>{message}</li>)}</ul> : null}
            </section>;
          })}
        </div>
        <p className="arena-ai-note">{botA === botB ? 'La même IA pilote les deux personnages.' : 'Chaque personnage utilise l’IA sélectionnée.'} Les classes, niveaux, stuffs et sorts restent indépendants.</p>
        <div className="arena-match-options">
          <MapPicker value={mapId} onChange={setMapId} />
          <details className="arena-randomness"><summary>Aléatoire du combat</summary><div>
            <label className="field">Graine<input type="number" aria-label="Graine du combat" value={seed} onChange={e => setSeed(e.target.value)} /></label>
            <button type="button" className="btn icon" title="Nouvelle graine aléatoire" onClick={() => setSeed(Math.floor(Math.random() * 1e9))}>🎲</button>
          </div></details>
          <div className="arena-setup-actions">
            <button type="button" className="btn" aria-expanded={showEquipment} aria-controls="arena-equipment" onClick={() => setShowEquipment(!showEquipment)}>
              {showEquipment ? 'Fermer la personnalisation' : 'Personnaliser les personnages'}
            </button>
            <button type="button" className="btn primary arena-launch" disabled={running || !equipment.summaries.A.valid || !equipment.summaries.B.valid} onClick={() => launch()}>
              {running ? 'Simulation en cours…' : '⚔️ Lancer le combat'}
            </button>
          </div>
        </div>
        </fieldset>
        {running ? <p className="arena-ai-note" role="status">Simulation du duel{progress ? ` · tour ${progress.turn}` : ''}…</p> : null}
        {error || libraryError ? <p className="penalty" role="alert">{error || libraryError}</p> : null}
      </section>

      {showEquipment ? <div id="arena-equipment"><LoadoutPicker classes={{ A: classA, B: classB }} names={{ A: 'Personnage A', B: 'Personnage B' }} {...equipment} /></div> : null}

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
                <button className="btn icon" aria-label="Revenir au début" onClick={() => { setPlaying(false); setFrameIdx(0); }}>⏮</button>
                <button className="btn icon" aria-label="Action précédente" onClick={() => { setPlaying(false); setFrameIdx((i) => Math.max(0, i - 1)); }}>◀</button>
                <button className="btn icon" aria-label={playing ? 'Mettre en pause' : 'Lire le combat'} onClick={() => (atEnd ? (setFrameIdx(0), setPlaying(true)) : setPlaying(!playing))}>
                  {playing ? '⏸' : '▶'}
                </button>
                <button className="btn icon" aria-label="Action suivante" onClick={() => { setPlaying(false); setFrameIdx((i) => Math.min(lastIdx, i + 1)); }}>▶︎▶︎</button>
                <input
                  type="range"
                  aria-label="Progression du combat"
                  min={0}
                  max={lastIdx}
                  value={frameIdx}
                  onChange={(e) => { setPlaying(false); setFrameIdx(Number(e.target.value)); }}
                />
                <span className="turn-badge">Tour {frame.state.turn}</span>
                <select aria-label="Vitesse de lecture" value={speedIdx} onChange={(e) => setSpeedIdx(Number(e.target.value))}>
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
                Choisissez une IA pour chaque personnage et lancez le combat.<br />
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
