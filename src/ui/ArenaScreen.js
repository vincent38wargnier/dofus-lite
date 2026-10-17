import { DEFAULT_CLASS_ID, DEFAULT_OPPONENT_ID } from '../engine/classes';
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
import { useProfiles } from './ProfilesContext';
import { useWorlds, WorldFilter } from './WorldsContext';
import { characterMatchesWorld } from './worldCatalogue';
import { cloneCreation } from './creationsStore';
import { loadoutAtLevel, readPlayerSetup } from './playerSetupState';
import BossSetup from './BossSetup';
import AutoDungeonFight from './AutoDungeonFight';
import { defaultMonsterGrade } from '../engine/monsters';
import { dungeonForBoss } from '../engine/dungeons';
import { customDungeonErrors } from '../engine/customDungeons';
import { opponentTeamErrors } from '../engine/opponentTeam';
import { compileAllyBots, compileCompleteTeamBots } from './allyBots';
import { compileOpponentBots } from './opponentBots';
import { AppearanceSelect, RetroPortrait, combatAnimationMs, useRetroAssets, useAppearances } from './RetroAssets';
import '../styles/arenaSetup.css';

const SPEEDS = [
  { label: '×0.5', ms: 850 },
  { label: '×1', ms: 480 },
  { label: '×2', ms: 240 },
  { label: '×4', ms: 110 },
];

export default function ArenaScreen({ allBots, replay, onReplayConsumed, active = true, onOpenCreator,
  selectionRequest, customLaunch, onCustomConsumed, onFightChange, matchLaunch, onMatchConsumed,
  onExit, exitLabel = 'Retour à Combat', onSessionChange }) {
  const assets = useRetroAssets();
  const { appearances, setAppearance } = useAppearances();
  const [botA, setBotA] = useState('maison');
  const [botB, setBotB] = useState('maison');
  const profiles = useProfiles();
  const [initial] = useState(() => readPlayerSetup(localStorage));
  const [mode, setMode] = useState('duel');
  const [bossId, setBossId] = useState(initial.bossId);
  const [bossGrade, setBossGrade] = useState(initial.bossGrade);
  const [customDungeonId, setCustomDungeonId] = useState(initial.customDungeonId);
  const [autoConfig, setAutoConfig] = useState(null);
  const [classA, setClassA] = useState(profiles?.active.classId || DEFAULT_CLASS_ID);
  const [classB, setClassB] = useState(DEFAULT_OPPONENT_ID);
  const normalEquipment = useLoadouts(classA, classB);
  const creations = useCreations();
  const worlds = useWorlds();
  const availableCharacters = worlds?.characters || creations?.characters || [];
  const [customCharacters, setCustomCharacters] = useState(() => profiles ? { A: { ...cloneCreation(profiles.active), sourceProfileId: profiles.activeId } } : {});
  const savedProfiles = profiles?.profiles;
  useEffect(() => {
    if (!active || !savedProfiles) return;
    setCustomCharacters(previous => Object.fromEntries(Object.entries(previous).map(([side, character]) => {
      const saved = savedProfiles.find(profile => profile.id === character?.sourceProfileId);
      return [side, saved && !character.adjusted ? { ...cloneCreation(saved), sourceProfileId: saved.id } : character];
    })));
  }, [active, savedProfiles]); // Refresh saved profiles without discarding adjustments made for this match.
  const customDungeon = creations?.dungeons.find(entry => entry.id === customDungeonId);
  const dungeonErrors = customDungeon ? customDungeonErrors(customDungeon) : dungeonForBoss(bossId) ? [] : ['Choisissez une salle disponible.'];
  useEffect(() => { if (customDungeonId && !customDungeon) setCustomDungeonId(null); }, [customDungeonId, customDungeon]);
  useEffect(() => { onFightChange?.(!!autoConfig); }, [autoConfig, onFightChange]);
  const handledSelection = useRef(null);
  useEffect(() => {
    if (!selectionRequest || handledSelection.current === selectionRequest.id) return;
    handledSelection.current = selectionRequest.id;
    setMode('dungeon'); setAutoConfig(null);
    if (selectionRequest.entry) setCustomDungeonId(selectionRequest.entry.id);
  }, [selectionRequest]);
  const customSummaries = useMemo(() => Object.fromEntries(Object.entries(customCharacters)
    .filter(([, character]) => character).map(([side, character]) => [side, resolveLoadout(character.classId, character.loadout)])), [customCharacters]);
  const equipment = { ...normalEquipment,
    loadouts: { A: customCharacters.A?.loadout || normalEquipment.loadouts.A, B: customCharacters.B?.loadout || normalEquipment.loadouts.B },
    summaries: { ...normalEquipment.summaries, ...customSummaries },
    update: (side, change, targetClass) => {
      if (!customCharacters[side]) { normalEquipment.update(side, change, targetClass); return; }
      setCustomCharacters(previous => ({ ...previous, [side]: { ...previous[side], adjusted: true,
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
  const [mapId, setMapId] = useState((process.env.REACT_APP_PLATFORM === '1' ? 'arene' : 'territoire_des_dopeuls_5383'));
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
  const hasSession = !!(autoConfig || result || running || error);
  useEffect(() => { onSessionChange?.(hasSession); }, [hasSession, onSessionChange]);
  const exit = () => {
    simulation.current?.abort(); simulation.current = null;
    setRunning(false); setPlaying(false); setAutoConfig(null); setResult(null); setError(null);
    onExit?.();
  };

  const launchDungeon = (request) => {
    try {
      const bot = findBot(allBots, request?.botId || botA);
      if (!request?.team && !bot) throw new Error('Choisissez une IA pour le personnage.');
      const decide = request?.team ? undefined : compileBot(bot.code);
      const dungeon = request && Object.prototype.hasOwnProperty.call(request, 'dungeon') ? request.dungeon : customDungeon;
      if (dungeon && customDungeonErrors(dungeon).length) throw new Error(customDungeonErrors(dungeon).join(' '));
      const selectedBoss = request?.bossId ?? bossId;
      if (!dungeon && !dungeonForBoss(selectedBoss)) throw new Error('Choisissez une salle disponible.');
      const character = request?.character || { classId: classA, name: customCharacters.A?.name || CLASSES[classA].name, loadout: equipment.loadouts.A };
      const summary = resolveLoadout(character.classId, character.loadout);
      if (!request?.team && !summary.valid) throw new Error(summary.errors.join(' '));
      simulation.current?.abort(); simulation.current = null; setRunning(false);
      setPlaying(false); setError(null);
      setAutoConfig({ mode: dungeon ? 'custom' : 'boss', dungeon: dungeon ? cloneCreation(dungeon) : undefined,
        allies: cloneCreation(request?.allies || []), team: request?.team, adventureChoice: request?.adventureChoice, roomIndex: request?.roomIndex || 0,
        bossId: selectedBoss, bossGrade: request?.bossGrade ?? bossGrade, seed: Number(request?.seed ?? seed) || 1, controllerName: request?.team ? 'IA de chaque combattant' : bot.name,
        bots: request?.team ? compileCompleteTeamBots(request.team, allBots) : { A: { name: character.name, decide }, ...compileAllyBots(request?.allies || [], allBots, true) },
        classes: { A: request?.team ? request.team[0]?.classId : character.classId }, loadouts: { A: cloneCreation(request?.team ? request.team[0]?.loadout || {} : character.loadout) } });
    } catch (e) { setError(e.message); }
  };
  const handledLaunch = useRef(null);
  useEffect(() => {
    if (!customLaunch || handledLaunch.current === customLaunch.id) return;
    handledLaunch.current = customLaunch.id;
    setMode('dungeon'); setClassA(customLaunch.character.classId); setBotA(customLaunch.botId);
    setCustomCharacters(previous => ({ ...previous, A: cloneCreation(customLaunch.character) }));
    setCustomDungeonId(customLaunch.dungeon.id || null);
    launchDungeon(customLaunch); onCustomConsumed?.();
    // Requests contain a complete, immutable combat setup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customLaunch]);

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
        mapId: c.mapId, battlefield: c.battlefield,
        seed: Number.isSafeInteger(Number(c.seed)) ? Number(c.seed) : 1,
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

  const handledMatch = useRef(null);
  useEffect(() => {
    if (!matchLaunch || handledMatch.current === matchLaunch.id) return;
    handledMatch.current = matchLaunch.id;
    const request = cloneCreation(matchLaunch);
    setClassA(request.character.classId); setBotA(request.botId);
    const firstCharacter = request.opponents?.find(entry => entry.kind === 'character') || request.opponent;
    setClassB(firstCharacter.classId); setBotB(request.botB);
    setCustomCharacters({ A: request.character, B: firstCharacter });
    setMapId(request.mapId); setSeed(request.seed);
    setBossId(request.bossId); setBossGrade(request.bossGrade); setCustomDungeonId(request.dungeon?.id || null);
    setAutoConfig(null); setResult(null);
    setMode(request.mode === 'duel' ? 'duel' : 'dungeon');
    if (request.mode === 'duel' && request.opponents?.length) {
      try {
        const errors = opponentTeamErrors(request.opponents, request.encounter);
        if (errors.length) throw new Error(errors.join(' '));
        const playerBot = findBot(allBots, request.botId);
        const opponentBots = compileOpponentBots(request.opponents, allBots, request.botB || 'maison', request.encounter);
        if (!request.team && !playerBot) throw new Error('Choisissez une IA pour votre personnage.');
        simulation.current?.abort(); simulation.current = null; setRunning(false); setPlaying(false); setError(null);
        setAutoConfig({ mode: 'duel', opponents: request.opponents, mapId: request.mapId, battlefield: request.battlefield, encounter: request.encounter, seed: request.seed,
          allies: request.allies || [], team: request.team,
          controllerName: request.team ? 'IA de chaque combattant' : playerBot.name,
          classes: { A: request.team ? request.team[0]?.classId : request.character.classId }, loadouts: { A: request.team ? request.team[0]?.loadout || {} : request.character.loadout },
          bots: { ...(request.team ? compileCompleteTeamBots(request.team, allBots) : { A: { name: request.character.name, decide: compileBot(playerBot.code) }, ...compileAllyBots(request.allies || [], allBots, true) }),
            ...opponentBots } });
      } catch (e) { setError(e.message); }
    } else if (request.mode === 'duel') launch({ botA: request.botId, botB: request.botB,
      classA: request.character.classId, classB: request.opponent.classId, mapId: request.mapId, battlefield: request.battlefield, seed: request.seed,
      loadouts: { A: request.character.loadout, B: request.opponent.loadout },
      names: { A: request.character.name, B: request.opponent.name } });
    else launchDungeon(request);
    onMatchConsumed?.();
    // The dialog provides the entire configuration, independent of previous Arena selections.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchLaunch]);

  // Replay demandé depuis l'écran Tournoi.
  useEffect(() => {
    if (!replay) return;
    setMode('duel'); setAutoConfig(null);
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
  const worldClasses = CLASS_IDS.filter(id => !worlds || worlds.matches('classes', id, worlds.selected));
  const classOptions = worldClasses.map((id) => (
    <option key={id} value={id}>{CLASSES[id].emoji} {CLASSES[id].name}</option>
  ));
  const chooseStuff = (side, classId, id) => {
    const build = library.builds.find(b => b.id === id);
    if (!build || !commit({ type: 'activate', key: `${side}:${classId}`, id })) return;
    equipment.update(side, current => applySavedEquipment(current, build.loadout), classId);
  };

  if (autoConfig) return <AutoDungeonFight key={`${autoConfig.seed}:${autoConfig.roomIndex || 0}`} config={autoConfig} active={active} onExit={onExit || exit} onCancel={exit} exitLabel={exitLabel}
    onNextRoom={() => setAutoConfig(previous => ({ ...previous, roomIndex: (previous.roomIndex || 0) + 1, seed: Math.floor(Math.random() * 1e9) }))}
    onRematch={() => setAutoConfig(previous => ({ ...previous, seed: Math.floor(Math.random() * 1e9) }))} />;

  return (
    <div className="arena-screen">
      {onExit ? <div className="setup-heading">
        <div><p className="eyebrow">COMBAT AUTOMATIQUE</p><h1>{running ? 'Simulation du combat' : 'Relecture du combat'}</h1>
          {running && <p role="status">{progress ? `Tour ${progress.turn}…` : 'Préparation du combat…'}</p>}
          {error && <p className="penalty" role="alert">{error}</p>}</div>
        <button type="button" className="btn" onClick={running || error ? exit : onExit || exit}>{running ? 'Annuler' : exitLabel}</button>
      </div> : <>
      <div className="setup-heading">
        <div><p className="eyebrow">COMBATS AUTOMATIQUES</p><h1>IA contre IA</h1>
          <p>Confiez vos profils à une IA, en duel ou contre un donjon.</p></div>
      </div>
      <section className="panel arena-setup" aria-label="Préparer un duel IA contre IA" aria-busy={running}>
        <fieldset className="arena-setup-fields" disabled={running}>
        <div className="match-modes" role="group" aria-label="Mode IA contre IA">
          <button type="button" aria-pressed={mode === 'duel'} onClick={() => setMode('duel')}><strong>Duel</strong><span>Deux personnages, deux IA au choix</span></button>
          <button type="button" aria-pressed={mode === 'dungeon'} onClick={() => setMode('dungeon')}><strong>Contre un donjon</strong><span>Votre profil face à toute une salle</span></button>
        </div>
        <WorldFilter />
        <div className={`arena-combatants${mode === 'dungeon' ? ' single' : ''}`}>
          {[
            { side: 'A', classId: classA, botId: botA, setClass: setClassA, setBot: setBotA },
            { side: 'B', classId: classB, botId: botB, setClass: setClassB, setBot: setBotB },
          ].filter(entry => mode === 'duel' || entry.side === 'A').map(({ side, classId, botId, setClass, setBot }) => {
            const loadout = equipment.loadouts[side], summary = equipment.summaries[side];
            const savedStuff = library.builds.find(build => build.id === library.active[`${side}:${classId}`]
              && sameEquipment(build.loadout, loadout));
            return <section className={`arena-combatant side-${side}`} aria-label={`Personnage ${side}`} key={side}>
              <div className="arena-combatant-heading">
                <RetroPortrait classId={classId} artworkId={equipment.loadouts[side]?.artworkId} side={side} fallback={CLASSES[classId].emoji} />
                <div><h2>{customCharacters[side]?.name || `Personnage ${side}`}</h2><p>{CLASSES[classId].name} · niveau {summary.level}</p></div>
                <span className="arena-side-badge" aria-hidden="true">{side}</span>
              </div>
              {profiles && <label className="field">Profil {side}<select aria-label={`Profil ${side}`} value={customCharacters[side]?.sourceProfileId || ''} onChange={event => {
                const profile = profiles.profiles.find(entry => entry.id === event.target.value);
                setCustomCharacters(previous => ({ ...previous, [side]: profile ? { ...cloneCreation(profile), sourceProfileId: profile.id } : null }));
                if (profile) setClass(profile.classId);
              }}><option value="">Configuration libre</option>{profiles.profiles.filter(profile => profile.id === customCharacters[side]?.sourceProfileId || characterMatchesWorld(worlds, profile)).map(profile => <option key={profile.id} value={profile.id}>{profile.name} · {profile.className}</option>)}</select>
                <small>Copie pour ce combat · votre profil enregistré reste intact.</small></label>}
              <div className="arena-ai-choice">
                <label className="field">IA {side}<select aria-label={`IA ${side}`} value={botId} onChange={e => setBot(e.target.value)}>{botOptions}</select></label>
                {side === 'B' ? <button type="button" className="btn" disabled={botA === botB || !findBot(allBots, botA)}
                  onClick={() => setBotB(botA)}>Même IA que A</button> : null}
              </div>
              <details className="arena-adjustments" open={!profiles || undefined}><summary>Ajuster pour ce combat</summary>
              {!!availableCharacters.length && <label className="field">Classe personnalisée {side}<select aria-label={`Personnage personnalisé ${side}`} value={customCharacters[side]?.customCharacterId || (availableCharacters.some(entry => entry.id === customCharacters[side]?.id) ? customCharacters[side].id : '')}
                onChange={event => {
                  const character = availableCharacters.find(entry => entry.id === event.target.value);
                  setCustomCharacters(previous => ({ ...previous, [side]: character ? cloneCreation(character) : null }));
                  if (character) setClass(character.classId);
                }}><option value="">Personnage classique</option>{availableCharacters.filter(character => [customCharacters[side]?.customCharacterId, customCharacters[side]?.id].includes(character.id) || !worlds || worlds.matches('characters', character.id, worlds.selected)).map(character => <option key={character.id} value={character.id}>{character.name} · {CLASSES[character.classId].name}</option>)}</select>
                {customCharacters[side] && <small>Copie indépendante pour ce combat.</small>}
              </label>}
              <div className="arena-character-fields">
                <label className="field">Classe {side}<select aria-label={`Classe ${side}`} disabled={!!customCharacters[side]?.loadout.spells?.custom} value={classId} onChange={e => { setCustomCharacters(previous => ({ ...previous, [side]: null })); setClass(e.target.value); }}>{!worldClasses.includes(classId) && <option value={classId}>{CLASSES[classId].name} · sélection actuelle</option>}{classOptions}</select></label>
                <label className="field">Niveau {side}<select aria-label={`Niveau ${side}`} value={summary.level}
                  onChange={e => equipment.update(side, current => loadoutAtLevel(classId, current, e.target.value))}>
                  {Array.from({ length: 200 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
                </select></label>
                <AppearanceSelect side={side} value={loadout.profile?.sex === 1 ? 'female' : 'male'}
                  onChange={value => equipment.update(side, current => ({ ...current, profile: { ...current.profile, sex: value === 'female' ? 1 : 0 } }))} />
              </div>
              <label className="field">Stuff {side}<select aria-label={`Stuff ${side}`} value={savedStuff?.id || ''} disabled={!library.builds.length}
                onChange={e => chooseStuff(side, classId, e.target.value)}>
                <option value="">{library.builds.length ? 'Stuff actuel · choisir un stuff enregistré…' : 'Stuff actuel · aucun stuff enregistré'}</option>
                {library.builds.map(build => <option key={build.id} value={build.id}>{build.name}</option>)}
              </select></label></details>
              <div className="arena-character-totals"><span>{summary.hp} PV</span><span>{summary.pa} PA</span><span>{summary.pm} PM</span><span>{summary.items.length} objets</span></div>
              {!summary.valid ? <ul className="penalty small" role="alert">{summary.errors.map(message => <li key={message}>{message}</li>)}</ul> : null}
            </section>;
          })}
        </div>
        {mode === 'duel' ? <p className="arena-ai-note">{botA === botB ? 'La même IA pilote les deux personnages.' : 'Chaque personnage utilise l’IA sélectionnée.'} Les classes, niveaux, stuffs et sorts restent indépendants.</p>
          : <BossSetup bossId={bossId} grade={bossGrade} seed={seed} onGradeChange={setBossGrade}
            onBossChange={id => { setBossId(id); setBossGrade(defaultMonsterGrade(id)); setCustomDungeonId(null); }}
            customDungeons={creations?.dungeons} customDungeonId={customDungeonId} onCustomChange={setCustomDungeonId}
            onCreate={onOpenCreator ? () => onOpenCreator('dungeons') : undefined}
            onEdit={onOpenCreator ? entry => onOpenCreator('dungeons', entry.id) : undefined} />}
        <div className="arena-match-options">
          {mode === 'duel' && <MapPicker value={mapId} onChange={setMapId} />}
          <details className="arena-randomness"><summary>Aléatoire du combat</summary><div>
            <label className="field">Graine<input type="number" aria-label="Graine du combat" value={seed} onChange={e => setSeed(e.target.value)} /></label>
            <button type="button" className="btn icon" title="Nouvelle graine aléatoire" onClick={() => setSeed(Math.floor(Math.random() * 1e9))}>🎲</button>
          </div></details>
          <div className="arena-setup-actions">
            <button type="button" className="btn" aria-expanded={showEquipment} aria-controls="arena-equipment" onClick={() => setShowEquipment(!showEquipment)}>
              {showEquipment ? 'Fermer la personnalisation' : mode === 'dungeon' ? 'Ajuster l’équipement et les sorts' : 'Personnaliser les personnages'}
            </button>
            <button type="button" className="btn primary arena-launch" disabled={running || !equipment.summaries.A.valid || (mode === 'duel' ? !equipment.summaries.B.valid : !!dungeonErrors.length)} onClick={() => mode === 'duel' ? launch() : launchDungeon()}>
              {running ? 'Simulation en cours…' : mode === 'duel' ? '⚔️ Lancer le combat' : 'Simuler le donjon'}
            </button>
          </div>
        </div>
        </fieldset>
        {running ? <p className="arena-ai-note" role="status">Simulation du duel{progress ? ` · tour ${progress.turn}` : ''}…</p> : null}
        {error || libraryError ? <p className="penalty" role="alert">{error || libraryError}</p> : null}
      </section>

      {showEquipment ? <div id="arena-equipment"><LoadoutPicker fixedSide={mode === 'dungeon' ? 'A' : undefined} classes={{ A: classA, B: classB }} names={{ A: 'Personnage A', B: 'Personnage B' }} {...equipment} /></div> : null}
      </>}

      {mode === 'duel' && result && <><div className="arena-layout">
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
      </div></>}
    </div>
  );
}
