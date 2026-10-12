import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CLASSES } from '../engine/classes';
import { resolveLoadout } from '../engine/equipment';
import { MAPS } from '../engine/maps';
import { KANOJEDO_MAP_ID, POUTCH_ID } from '../engine/monsters';
import { key, cellsInRange } from '../engine/geometry';
import { LiveMatch, TURN_SECONDS } from '../game/liveMatch';
import { isInvisible, spellsOf, validateAction } from '../engine/engine';
import { useLoadouts } from './LoadoutPicker';
import BoardView from './BoardView';
import CombatStatsPanel from './CombatStatsPanel';
import useFighterInspection from './useFighterInspection';
import LogPanel from './LogPanel';
import PlayerSetup from './PlayerSetup';
import CombatTurnControls from './CombatTurnControls';
import CombatSpellBar from './CombatSpellBar';
import CombatTimeline, { timelineFighterVisible } from './CombatTimeline';
import { readPlayerSetup, SETUP_STORAGE } from './playerSetupState';
import { combatAnimationMs, useRetroAssets, useAppearances } from './RetroAssets';
import { weaponTargetPlans, weaponZoneLabel } from './weaponTargeting';
import { spellTargetPreview } from './spellTargeting';
import { combatResources } from './combatResources';
import { useCreations } from './CreationsContext';
import { useProfiles } from './ProfilesContext';
import { cloneCreation, newCreationId } from './creationsStore';
import { readOpponentTeam, persistOpponentTeam } from './opponentTeamStore';
import { readAllyTeam, persistAllyTeam } from './allyTeamStore';
import { allyFighterId, teamFighterId, isAutomaticTeam } from '../engine/allyTeam';
import { compileAllyBots, compileCompleteTeamBots } from './allyBots';
import { compileOpponentBots } from './opponentBots';
import { PeerRoom } from '../net/peerRoom';
import { takeInvitation } from '../net/p2p';
import PeerLobby, { PeerFightBar } from './PeerLobby';

const BOT_STEP_MS = 620;

export default function PlayScreen({ allBots, active = true, onFightChange, customLaunch, onCustomConsumed, onCustomExit, onOpenCreator, selectionRequest, onAutomaticLaunch, onResumeAutomatic, onOpenPeer }) {
  const assets = useRetroAssets();
  const { appearances, setAppearance } = useAppearances();
  const [initial] = useState(() => readPlayerSetup({ getItem: key => localStorage.getItem(key) }));
  const animationUntil = useRef(0);
  const lastEventsRef = useRef(null); // derniers events botStep (détection « réfléchit »)
  const [standardPlayerClass, setStandardPlayerClass] = useState(initial.playerClass);
  const [customCharacterId, setCustomCharacterId] = useState(initial.customCharacterId);
  const creations = useCreations();
  const profiles = useProfiles();
  const profile = profiles?.active;
  const customCharacter = useMemo(() => profile ? (profile.loadout.spells?.custom ? { ...profile, name: profile.className } : null)
    : creations?.characters.find(character => character.id === customCharacterId), [profile, creations?.characters, customCharacterId]);
  const playerClass = profile?.classId || customCharacter?.classId || standardPlayerClass;
  const setPlayerClass = classId => { if (profiles) profiles.create(classId); else { setStandardPlayerClass(classId); setCustomCharacterId(null); } };
  const selectCustomCharacter = character => {
    if (profiles) profiles.create(character.classId, character);
    else { setStandardPlayerClass(character.classId); setCustomCharacterId(character.id); }
  };
  useEffect(() => {
    if (customCharacterId && !customCharacter) setCustomCharacterId(null);
  }, [customCharacterId, customCharacter]);
  const [botId, setBotId] = useState(() => allBots.some(bot => bot.id === initial.botId) ? initial.botId : 'maison');
  const [playerBotId, setPlayerBotId] = useState(() => allBots.some(bot => bot.id === initial.playerBotId) ? initial.playerBotId : 'maison');
  const [controller, setController] = useState(initial.controller);
  const [legacyBotClass, setLegacyBotClass] = useState(initial.botClass);
  const [savedOpponents] = useState(() => readOpponentTeam(localStorage, botId));
  const [opponentDraft, setOpponentDraft] = useState(savedOpponents.entries);
  const [opponentSaveError, setOpponentSaveError] = useState(savedOpponents.error);
  const [savedAllies] = useState(() => readAllyTeam(localStorage));
  const [allies, setAllies] = useState(savedAllies.entries);
  const [includePlayer, setIncludePlayer] = useState(savedAllies.includePlayer);
  const [allySaveError, setAllySaveError] = useState(savedAllies.error);
  const [editingTeam, setEditingTeam] = useState('opponents');
  const [editingOpponentIndex, setEditingOpponentIndex] = useState(0);
  const editingOpponent = (editingTeam === 'allies' ? allies : opponentDraft)?.[editingOpponentIndex];
  const botClass = editingOpponent?.kind === 'character' ? editingOpponent.classId : legacyBotClass;
  const setBotClass = classId => { setLegacyBotClass(classId); setOpponentDraft(null); };
  const standardEquipment = useLoadouts(playerClass, botClass);
  const customSummary = useMemo(() => customCharacter && resolveLoadout(customCharacter.classId, customCharacter.loadout), [customCharacter]);
  const profileSummary = useMemo(() => profile && resolveLoadout(profile.classId, profile.loadout), [profile]);
  // Profiles own their full preparation. Keep the legacy draft path available
  // for standalone integrations that do not mount ProfilesProvider.
  const playerEquipment = profile ? { ...standardEquipment,
    loadouts: { ...standardEquipment.loadouts, A: profile.loadout },
    summaries: { ...standardEquipment.summaries, A: profileSummary },
    saveError: standardEquipment.saveError || !!profiles.error,
    update: (side, change, targetClass) => side === 'A'
      ? profiles.update(current => ({ ...current, loadout: typeof change === 'function' ? change(current.loadout) : change }))
      : standardEquipment.update(side, change, targetClass),
  } : customCharacter ? {
    ...standardEquipment,
    loadouts: { ...standardEquipment.loadouts, A: customCharacter.loadout },
    summaries: { ...standardEquipment.summaries, A: customSummary },
    saveError: standardEquipment.saveError || !!creations.error,
    update: (side, change, targetClass) => {
      if (side !== 'A') { standardEquipment.update(side, change, targetClass); return; }
      creations.update(previous => ({ ...previous, characters: previous.characters.map(character => character.id === customCharacter.id
        ? { ...character, loadout: typeof change === 'function' ? change(character.loadout) : change } : character) }));
    },
  } : standardEquipment;
  const opponentSummary = useMemo(() => editingOpponent?.kind === 'character' ? resolveLoadout(editingOpponent.classId, editingOpponent.loadout) : null, [editingOpponent]);
  const equipment = opponentSummary ? { ...playerEquipment,
    loadouts: { ...playerEquipment.loadouts, B: editingOpponent.loadout },
    summaries: { ...playerEquipment.summaries, B: opponentSummary },
    update: (side, change, targetClass) => {
      if (side !== 'B') { playerEquipment.update(side, change, targetClass); return; }
      (editingTeam === 'allies' ? setAllies : setOpponentDraft)(previous => previous.map((entry, index) => index === editingOpponentIndex
        ? { ...entry, loadout: typeof change === 'function' ? change(entry.loadout) : change } : entry));
    },
  } : playerEquipment;
  const opponents = useMemo(() => opponentDraft || [{ kind: 'character', name: CLASSES[legacyBotClass].name,
    classId: legacyBotClass, loadout: standardEquipment.loadouts.B, botId }], [opponentDraft, legacyBotClass, standardEquipment.loadouts.B, botId]);
  const team = [...(includePlayer ? [{ kind: 'character', classId: playerClass, name: profile?.name || customCharacter?.name || CLASSES[playerClass].name,
    loadout: equipment.loadouts.A, controller, botId: playerBotId }] : []), ...allies];
  useEffect(() => {
    if (opponentDraft === null) return;
    try { persistOpponentTeam(localStorage, opponentDraft); setOpponentSaveError(''); }
    catch (_) { setOpponentSaveError('Le groupe n’a pas pu être sauvegardé dans ce navigateur.'); }
  }, [opponentDraft]);
  useEffect(() => {
    if (savedAllies.error && allies === savedAllies.entries && includePlayer === savedAllies.includePlayer) return;
    try { persistAllyTeam(localStorage, allies, includePlayer); setAllySaveError(''); }
    catch (_) { setAllySaveError('Votre équipe n’a pas pu être sauvegardée dans ce navigateur.'); }
  }, [allies, includePlayer, savedAllies]);
  const [mapId, setMapId] = useState(initial.mapId);
  const [mode, setMode] = useState(initial.mode);
  const [monsterGrade, setMonsterGrade] = useState(initial.monsterGrade);
  const [bossId, setBossId] = useState(initial.bossId);
  const [bossGrade, setBossGrade] = useState(initial.bossGrade);
  const [customDungeonId, setCustomDungeonId] = useState(initial.customDungeonId);
  const customDungeon = creations?.dungeons.find(entry => entry.id === customDungeonId);
  useEffect(() => { if (customDungeonId && !customDungeon) setCustomDungeonId(null); }, [customDungeonId, customDungeon]);
  const handledSelection = useRef(null);
  const [externalSession, setExternalSession] = useState(null);
  const handledLaunch = useRef(null);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const [error, setError] = useState(null);
  useEffect(() => { setError(null); }, [mode, controller, botId, playerBotId, bossId, bossGrade, customDungeonId, opponents, allies, includePlayer]);
  const [settingsError, setSettingsError] = useState(false);
  useEffect(() => {
    try { localStorage.setItem(SETUP_STORAGE, JSON.stringify({ playerClass, customCharacterId: profile?.customCharacterId || customCharacter?.id || null, botClass, botId, playerBotId, controller, mapId, mode, monsterGrade, bossId, bossGrade, customDungeonId })); setSettingsError(false); }
    catch (_) { setSettingsError(true); }
  }, [playerClass, profile?.customCharacterId, customCharacter?.id, botClass, botId, playerBotId, controller, mapId, mode, monsterGrade, bossId, bossGrade, customDungeonId]);
  const playerSex = (externalSession?.character.loadout || equipment.loadouts.A).profile?.sex || 0;
  const botSex = equipment.loadouts.B.profile?.sex || 0;
  useEffect(() => {
    if (active) { setAppearance('A', playerSex === 1 ? 'female' : 'male'); setAppearance('B', botSex === 1 ? 'female' : 'male'); }
  }, [active, playerSex, botSex, setAppearance]);
  useEffect(() => { if (!allBots.some(bot => bot.id === botId)) setBotId('maison'); }, [allBots, botId]);
  useEffect(() => { if (!allBots.some(bot => bot.id === playerBotId)) setPlayerBotId('maison'); }, [allBots, playerBotId]);

  const [phase, setPhase] = useState('setup'); // 'setup' | 'fight'
  const [botName, setBotName] = useState('');
  const [step, setStep] = useState(0);
  const [lastEvents, setLastEvents] = useState([]);
  const [log, setLog] = useState([]);
  const [selectedSpell, setSelectedSpell] = useState(null);
  const [hoverCell, setHoverCell] = useState(null);
  const [timelineHoverId, setTimelineHoverId] = useState(null);
  const [hoveredSpell, setHoveredSpell] = useState(null);
  const [timeLeft, setTimeLeft] = useState(TURN_SECONDS);
  const [placementId, setPlacementId] = useState('A');
  const [wideLog, setWideLog] = useState(true);
  const [compactLog, setCompactLog] = useState(false);
  const [compactScreen, setCompactScreen] = useState(() => window.innerWidth < 1000);
  useEffect(() => {
    const query = window.matchMedia?.('(max-width: 999px)');
    if (!query) return undefined;
    const change = () => setCompactScreen(query.matches);
    change(); query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  const showLog = compactScreen ? compactLog : wideLog;
  const setShowLog = compactScreen ? setCompactLog : setWideLog;
  const matchRef = useRef(null);
  const [peerInput, setPeerInput] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('p2p') || '');
  const [peerOpen, setPeerOpen] = useState(!!peerInput);
  const [peerRoom, setPeerRoom] = useState(null);
  const peerRef = useRef(null), peerEvents = useRef(null);
  const openPeerRef = useRef(onOpenPeer); openPeerRef.current = onOpenPeer;
  const closePeer = () => { peerRef.current?.close(); peerRef.current = null; setPeerRoom(null); };
  useEffect(() => {
    const incoming = () => {
      const code = takeInvitation();
      if (!code) return;
      openPeerRef.current?.();
      setPeerInput(code);
      const match = matchRef.current;
      if (match?.network && !match.over && !match.room.fault) {
        setError('Nouvelle invitation reçue. Quittez ce combat pour la rejoindre.'); return;
      }
      if (match) {
        peerRef.current?.close(); peerRef.current = null; setPeerRoom(null);
        matchRef.current = null; setPhase('setup'); setExternalSession(null);
      }
      setPeerOpen(true);
    };
    incoming();
    window.addEventListener('hashchange', incoming);
    return () => { window.removeEventListener('hashchange', incoming); peerRef.current?.close(); };
  }, []);
  useEffect(() => {
    if (!selectionRequest || handledSelection.current === selectionRequest.id) return;
    handledSelection.current = selectionRequest.id;
    if (selectionRequest.entry && selectionRequest.tab === 'characters') selectCustomCharacter(selectionRequest.entry);
    if (selectionRequest.tab === 'dungeons') {
      setMode('boss');
      if (selectionRequest.entry) setCustomDungeonId(selectionRequest.entry.id);
    }
    if (selectionRequest.openDialog) {
      // Testing a room prepares the shared lobby, even if a previous fight
      // was left mounted while editing in the Atelier.
      animationUntil.current = 0; matchRef.current = null;
      setExternalSession(null); setPhase('setup'); setError(null);
    }
    // Navigation requests are immutable and consumed once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionRequest]);
  useEffect(() => { onFightChange?.(phase !== 'setup'); }, [phase, onFightChange]);
  const inspection = useFighterInspection(`${phase}:${seed}`, active && phase === 'fight', matchRef.current?.state.fighters);

  const pushEvents = (events) => {
    if (!events) return; // Peer actions arrive through acknowledged commits.
    // Pace automatic opponents only. Human actions are validated immediately
    // by LiveMatch; decorative effects can finish alongside the next action.
    const duration = combatAnimationMs(events, matchRef.current?.state.fighters || {}, assets, appearances);
    animationUntil.current = Date.now() + duration;
    setLastEvents(events);
    if (events.length) setLog((l) => [...l, ...events]);
    setStep((s) => s + 1);
  };
  peerEvents.current = pushEvents;
  const createPeerRoom = ({ role, character }) => {
    closePeer();
    const room = new PeerRoom({ role, character,
      settings: { mode: mode === 'boss' && customDungeon ? 'custom' : mode, mapId, seed: (Number(seed) || 1) >>> 0, bossId, bossGrade, monsterGrade }, dungeon: customDungeon,
      onChange: () => { if (peerRef.current === room) setStep(value => value + 1); },
      onEvents: events => { if (peerRef.current === room) peerEvents.current(events); },
      onStart: match => {
        if (peerRef.current !== room) return;
        matchRef.current = match; animationUntil.current = 0;
        setSeed(match.seed); setPlacementId(match.localId); setBotName(match.state.fighters.B.name);
        setLog(match.initialEvents); setLastEvents(match.initialEvents); setSelectedSpell(null); setHoverCell(null); setHoveredSpell(null);
        setExternalSession(null); setCompactLog(false); setPeerOpen(false); setPeerInput(''); setError(null); setPhase('fight'); setStep(value => value + 1);
      } });
    peerRef.current = room; setPeerRoom(room); return room;
  };
  const start = (newSeed) => {
    animationUntil.current = 0;
    setError(null);
    const s = newSeed ?? (Number(seed) || 1);
    setSeed(s);
    let m;
    try {
      m = new LiveMatch({ playerClass, playerName: profile?.name || customCharacter?.name || 'Vous', botClass, mapId: mode === 'kanojedo' ? KANOJEDO_MAP_ID : mapId,
        mode: mode === 'boss' && customDungeon ? 'custom' : mode, dungeon: customDungeon,
        opponents: mode === 'duel' ? opponents : undefined,
        opponentBots: mode === 'duel' ? compileOpponentBots(opponents, allBots, botId) : {},
        team, allyBots: compileCompleteTeamBots(team, allBots),
        monsterGrade, bossId, bossGrade, seed: s, loadouts: equipment.loadouts });
    } catch (e) { setError(e.message); return; }
    matchRef.current = m;
    m.includeProfile = includePlayer;
    setPlacementId('A');
    setBotName(m.state.fighters.B.name);
    setLog(m.initialEvents);
    setLastEvents(m.initialEvents);
    setSelectedSpell(null);
    setHoverCell(null);
    setHoveredSpell(null);
    setCompactLog(false);
    setPhase('fight');
    setStep((x) => x + 1);
  };

  const startAutomatic = () => {
    // Only a fully automatic team uses the replay runner. A manual companion
    // must keep its controls even when the principal character has an AI.
    if (!isAutomaticTeam(controller, allies, includePlayer)) { start(); return false; }
    try {
      compileCompleteTeamBots(team, allBots);
      if (mode === 'duel') compileOpponentBots(opponents, allBots, botId);
      onAutomaticLaunch(cloneCreation({ id: newCreationId(), mode: mode === 'kanojedo' ? 'duel' : mode === 'boss' && customDungeon ? 'custom' : mode,
        character: team[0]?.kind === 'character' ? { classId: team[0].classId, name: team[0].name, loadout: team[0].loadout }
          : { classId: playerClass, name: profile?.name || customCharacter?.name || CLASSES[playerClass].name, loadout: equipment.loadouts.A },
        opponent: { classId: botClass, name: CLASSES[botClass].name, loadout: equipment.loadouts.B },
        opponents: mode === 'kanojedo' ? [{ kind: 'monster', monsterId: POUTCH_ID, grade: monsterGrade }] : mode === 'duel' ? opponents : undefined,
        allies, team,
        botId: team[0]?.botId || playerBotId, botB: botId, mapId: mode === 'kanojedo' ? KANOJEDO_MAP_ID : mapId, bossId, bossGrade, dungeon: mode === 'boss' ? customDungeon || null : null,
        seed: Number(seed) || 1 }));
      setError(null);
      return true;
    } catch (e) { setError(e.message); return false; }
  };

  const startCustom = (request, newSeed = Math.floor(Math.random() * 1e9)) => {
    const { character, dungeon } = request;
    const loadouts = { A: JSON.parse(JSON.stringify(character.loadout)) };
    try {
      animationUntil.current = 0;
      setError(null); setSeed(newSeed);
      const match = new LiveMatch({ mode: 'custom', dungeon, seed: newSeed,
        allies, allyBots: compileAllyBots(allies, allBots),
        playerClass: character.classId, playerName: character.name, loadouts });
      setPlacementId('A');
      matchRef.current = match; setBotName(dungeon.name);
      setLog(match.initialEvents); setLastEvents(match.initialEvents);
      setSelectedSpell(null); setHoverCell(null); setHoveredSpell(null); setCompactLog(false);
      setPhase('fight'); setStep(value => value + 1);
      setExternalSession(request);
    } catch (e) { setExternalSession(null); setPhase('setup'); onCustomExit?.(e.message); }
  };
  useEffect(() => {
    if (!customLaunch || handledLaunch.current === customLaunch.id) return;
    handledLaunch.current = customLaunch.id;
    startCustom(customLaunch); onCustomConsumed?.();
    // A request is an immutable snapshot; changing settings never restarts it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customLaunch]);

  const m = phase === 'fight' ? matchRef.current : null;
  const placing = !!m?.placing;
  const humanTurn = !!(m && m.isHumanTurn());
  const controlled = placing ? m.state.fighters[placementId] || m.state.fighters.A : m?.controlledFighter();
  const viewerTeam = m?.network && placing ? controlled.team : m?.viewerTeam || 'A';
  const controlledId = controlled?.id;
  useEffect(() => { setSelectedSpell(null); setHoverCell(null); setTimelineHoverId(null); setHoveredSpell(null); inspection.dismiss(); }, [controlledId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Vue + api officielles côté joueur (mêmes règles que les bots).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const view = useMemo(() => (humanTurn ? m.humanView() : null), [step, phase]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const api = useMemo(() => (view ? m.humanApi(view) : null), [view]);
  const selectedInfo = view?.you.spells.find(spell => spell.key === selectedSpell);
  const weaponTargets = useMemo(() => weaponTargetPlans(selectedInfo, view, api), [selectedInfo, view, api]);
  const hoveredSelfInfo = view?.you.spells.find(spell => spell.key === hoveredSpell && spell.targetMode === 'self');
  const timelineHoverFighter = m?.state.fighters[timelineHoverId];
  const aimCell = timelineHoverId ? (timelineFighterVisible(timelineHoverFighter, viewerTeam) && !timelineHoverFighter.carriedBy
    ? key(timelineHoverFighter.pos.x, timelineHoverFighter.pos.y) : null) : hoverCell;
  const targetPreview = useMemo(() => {
    if (!active || !view || !api) return null;
    if (hoveredSelfInfo) return spellTargetPreview(hoveredSelfInfo, view, api, view.you.pos);
    if (!selectedInfo || !aimCell) return null;
    if (selectedInfo.isWeapon) return weaponTargets.get(aimCell) || null;
    const [x, y] = aimCell.split(',').map(Number);
    return spellTargetPreview(selectedInfo, view, api, { x, y });
  }, [active, view, api, hoveredSelfInfo, selectedInfo, aimCell, weaponTargets]);

  // Cases atteignables (avec leur chemin) — pour le surlignage ET le survol.
  const reachInfo = useMemo(() => {
    if (!view || !api || selectedSpell || view.you.pm <= 0) return null;
    const m = new Map();
    for (const c of api.reachable()) m.set(key(c.pos.x, c.pos.y), c);
    return m;
  }, [view, api, selectedSpell]);

  // Cases surlignées: sort visé → TOUTE la grille de portée (bleu) + les
  // cibles réellement lançables (rouge); sinon les déplacements (vert).
  const highlights = useMemo(() => {
    if (!view || !api) return null;
    const h = {};
    if (selectedSpell) {
      const info = view.you.spells.find((s) => s.key === selectedSpell);
      if (info) {
        for (const c of cellsInRange(
          view.you.pos, info.range[0], info.range[1],
          view.board.width, view.board.height, info.lineOnly,
        )) h[key(c.x, c.y)] = 'range';
      }
      for (const c of api.castTargets(selectedSpell)) h[key(c.x, c.y)] = 'target';
      for (const k of weaponTargets.keys()) if (h[k] !== 'target') h[k] = 'splash';
    } else if (reachInfo) {
      for (const k of reachInfo.keys()) h[k] = 'move';
    }
    return h;
  }, [view, api, selectedSpell, reachInfo, weaponTargets]);

  // Survol d'une case verte: aperçu du chemin exact + coût en PM.
  const pathPreview = useMemo(() => {
    if (!reachInfo || !hoverCell) return null;
    const c = reachInfo.get(hoverCell);
    if (!c || !c.path) return null;
    return { cells: c.path.slice(1), dest: c.pos, cost: c.cost };
  }, [reachInfo, hoverCell]);

  const onCellHover = (x, y) => {
    setTimelineHoverId(null);
    setHoveredSpell(null);
    setHoverCell(x === null || x === undefined ? null : key(x, y));
  };

  const onSpellHover = info => {
    setTimelineHoverId(null);
    setHoveredSpell(info?.key || null);
    setHoverCell(null);
  };

  // Le bot (et toutes les invocations) jouent automatiquement, un coup à la fois.
  // Les ticks « réfléchit » du Stratège (SAY d'attente pendant que son worker
  // calcule) re-sondent VITE: rien ne s'anime, chaque 620 ms d'attente serait
  // du temps de tour perdu. Les vraies actions gardent la cadence d'animation.
  useEffect(() => {
    if (!m || m.placing || m.over || m.isHumanTurn() || (m.network && !m.canBotStep())) return undefined;
    const thinking = lastEventsRef.current?.length === 1 && lastEventsRef.current[0]?.t === 'say'
      && String(lastEventsRef.current[0]?.text || '').includes('calcule');
    const delay = thinking ? 150 : Math.max(BOT_STEP_MS, animationUntil.current - Date.now());
    const t = setTimeout(() => {
      const r = m.botStep();
      lastEventsRef.current = r.events;
      pushEvents(r.events);
    }, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, phase]);

  // Chrono de tour (30 s, comme en 1.29) — uniquement pour l'humain.
  const humanTurnKey = humanTurn ? `${m.current().id}:${m.state.turn}` : 'none';
  useEffect(() => {
    if (m?.network) {
      const update = () => setTimeLeft(m.room.timeLeft());
      update(); const interval = setInterval(update, 200);
      return () => clearInterval(interval);
    }
    if (humanTurnKey === 'none') return undefined;
    setTimeLeft(TURN_SECONDS);
    const started = Date.now();
    const iv = setInterval(() => {
      const left = TURN_SECONDS - (Date.now() - started) / 1000;
      setTimeLeft(Math.max(0, left));
      if (left <= 0) {
        clearInterval(iv);
        const mm = matchRef.current;
        if (mm && mm.isHumanTurn()) {
          setSelectedSpell(null);
          pushEvents(mm.humanAct({ type: 'PASS' }).events);
        }
      }
    }, 200);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [humanTurnKey, phase]);

  const onCellClick = (x, y) => {
    const mm = matchRef.current;
    if (mm?.placing) {
      if (mm.network && !mm.canPlace(placementId)) return;
      const ally = Object.values(mm.state.fighters).find(f => (mm.network ? mm.canPlace(f.id) : f.team === 'A') && f.pos.x === x && f.pos.y === y);
      if (ally) { setPlacementId(ally.id); return; }
      const result = mm.placeHuman({ x, y }, placementId);
      if (result.ok && !result.pending) {
        setLastEvents(result.events);
        setLog(l => [...l, ...result.events]);
        setStep(s => s + 1);
      }
      return;
    }
    if (!mm || !mm.isHumanTurn() || !highlights) return;
    const k = key(x, y);
    if (selectedSpell) {
      const weaponAim = weaponTargets.get(k)?.target;
      if (highlights[k] === 'target' || weaponAim) {
        setSelectedSpell(null);
        pushEvents(mm.humanAct({ type: 'CAST', spell: selectedSpell, target: weaponAim || { x, y } }).events);
      } else {
        setSelectedSpell(null); // cliquer ailleurs annule la visée
      }
    } else if (highlights[k] === 'move') {
      pushEvents(mm.humanAct({ type: 'MOVE', to: { x, y } }).events);
    }
  };

  const canTargetPortrait = fighter => active && humanTurn && !!selectedInfo
    && timelineFighterVisible(fighter, viewerTeam) && !fighter.carriedBy
    && (highlights?.[key(fighter.pos.x, fighter.pos.y)] === 'target' || weaponTargets.has(key(fighter.pos.x, fighter.pos.y)));
  const onPortraitTarget = id => {
    // Read the current fighter, not the position saved when its card rendered.
    const fighter = matchRef.current?.state.fighters[id];
    if (!canTargetPortrait(fighter)) return;
    onCellClick(fighter.pos.x, fighter.pos.y);
  };
  const onPortraitHover = id => { setTimelineHoverId(id); setHoverCell(null); setHoveredSpell(null); };

  const onSpellSelfCast = (info) => {
    const mm = matchRef.current;
    if (!active || !mm?.isHumanTurn()) return;
    const action = { type: 'CAST', spell: info.key, target: { ...mm.current().pos } };
    // Check the current state, including range, occupied cells, states and
    // per-target limits, before spending PA or cancelling the current aim.
    if (!validateAction(mm.state, action).ok) return;
    setSelectedSpell(null);
    pushEvents(mm.humanAct(action).events);
  };

  const onSpellClick = (info) => {
    const mm = matchRef.current;
    if (!active || !mm || !mm.isHumanTurn() || !view
      || info.pa > view.you.pa || info.cooldownLeft > 0 || info.usesLeft <= 0) return;
    if (info.targetMode === 'self') {
      onSpellSelfCast(info);
      return;
    }
    setSelectedSpell(selectedSpell === info.key ? null : info.key);
  };

  const reorderSpells = order => {
    const mm = matchRef.current;
    if (!active || !mm || mm.over) return;
    if (mm.network) { mm.reorder(order); return; }
    const fighter = mm.controlledFighter();
    if (!fighter.loadout) return;
    const withOrder = loadout => ({ ...loadout, spells: { ...loadout.spells,
      order: [...order, ...(loadout.spells?.order || []).filter(id => !order.includes(id))] } });
    // Cosmetic preference only: keep the current combat export and saved draft
    // in sync without advancing the turn or replaying the last animation.
    mm.state = { ...mm.state, fighters: { ...mm.state.fighters, [fighter.id]: { ...fighter, loadout: withOrder(fighter.loadout) } } };
    if (fighter.id !== 'A' || mm.includeProfile === false) {
      setAllies(previous => previous.map((entry, index) => (mm.includeProfile === false ? teamFighterId(index) : allyFighterId(index)) === fighter.id ? { ...entry, loadout: withOrder(entry.loadout) } : entry));
      setStep(value => value + 1);
    } else if (externalSession) {
      const character = { ...externalSession.character, loadout: withOrder(fighter.loadout) };
      setExternalSession(previous => ({ ...previous, character }));
      if (character.id) creations?.update(previous => ({ ...previous,
        characters: previous.characters.map(entry => entry.id === character.id
          ? { ...entry, loadout: withOrder(entry.loadout) } : entry) }));
      else equipment.update('A', withOrder, fighter.classId);
      setStep(value => value + 1);
    } else equipment.update('A', withOrder, fighter.classId);
  };

  const endTurn = () => {
    const mm = matchRef.current;
    if (!mm || !mm.isHumanTurn()) return;
    setSelectedSpell(null);
    pushEvents(mm.humanAct({ type: 'PASS' }).events);
  };

  const confirmPlacement = () => {
    const result = matchRef.current?.ready();
    if (result?.ok) { setHoverCell(null); setError(null); pushEvents(result.events); }
    else if (result) setError(result.reason);
  };

  const namesById = useMemo(() => {
    const names = { A: 'Vous', B: botName };
    for (const fighter of Object.values(m?.state.fighters || {})) names[fighter.id] = fighter.name;
    for (const e of log) if (e.t === 'summon_add') names[e.id] = e.name;
    return names;
  }, [log, botName, m]);

  const tackle = humanTurn && api ? api.tackleInfo() : null;
  const spellInfo = view ? Object.fromEntries(view.you.spells.map((s) => [s.key, s])) : {};
  const hoveredFighter = m?.state.fighters[inspection.inspection?.id];
  const inspectedFighter = hoveredFighter && (hoveredFighter.team === viewerTeam || !isInvisible(hoveredFighter)) ? hoveredFighter : null;
  const statsFighter = inspectedFighter || controlled;
  const leaveFight = () => {
    if (matchRef.current?.network) closePeer();
    matchRef.current = null; setPhase('setup'); setHoverCell(null);
    if (peerInput) setPeerOpen(true);
    if (externalSession) { setExternalSession(null); onCustomExit?.(); }
  };
  const selectionLabel = selectedInfo?.isWeapon
    ? `${selectedInfo.name} · ${selectedInfo.pa} PA · Visée ${selectedInfo.range[0] === selectedInfo.range[1] ? selectedInfo.range[0] : selectedInfo.range.join('–')} PO · ${weaponZoneLabel(selectedInfo)}`
    : selectedInfo ? `${selectedInfo.name} · Choisissez une cible` : '';

  return (
    <div className={phase === 'fight' ? 'play-screen fight-screen' : 'play-screen'}>
      {phase !== 'fight' ? (
        <PlayerSetup {...{ playerClass, setPlayerClass, customCharacter, selectCustomCharacter, botClass, setBotClass, botId, allBots, mapId, setMapId, mode, setMode, monsterGrade, setMonsterGrade, bossId, setBossId, bossGrade, setBossGrade, seed, setSeed, equipment, error, settingsError,
          profiles, onOpenCreator, selectionRequest, customDungeonId, setCustomDungeonId, active, controller, setController, playerBotId, setPlayerBotId,
          opponents, opponentSaveError, editingOpponentIndex, editingTeam, allies, allySaveError, includePlayer, setIncludePlayer }}
          onAlliesChange={setAllies} onSelectAlly={index => { setEditingTeam('allies'); setEditingOpponentIndex(index); }}
          onOpponentsChange={setOpponentDraft} onSelectOpponent={index => { setEditingTeam('opponents'); setEditingOpponentIndex(index); }}
          onAutomaticStart={onAutomaticLaunch ? startAutomatic : undefined} onResumeAutomatic={onResumeAutomatic}
          onFriends={() => { setPeerInput(''); setPeerOpen(true); }}
          customDungeons={creations?.dungeons} customCharacters={creations?.characters} onStart={() => start()} />
      ) : (
        <div className={`fight-workspace${showLog ? ' log-open' : ''}`}>
          {showLog && <section className="fight-log" id="fight-log" aria-label="Journal du combat">
            <button type="button" className="fight-log-close" onClick={() => setShowLog(false)} aria-label="Fermer le journal">×</button>
            <LogPanel events={log} namesById={namesById} state={m.state} />
          </section>}
          <div className="fight-main">
          <div className="fight-heading"><div><h1>{MAPS[m.state.mapId].name.replace(/^🗺\s*/, '')}</h1><p>{placing ? 'Placement' : m.over ? 'Combat terminé' : `Tour ${m.state.turn} / ${m.state.maxTurns}`} · {controlled.name}</p></div>
            <div className="fight-heading-actions"><button className="btn" aria-expanded={showLog} aria-controls="fight-log" onClick={() => setShowLog(open => !open)}>Journal</button>
              <button className="btn" onClick={leaveFight}>{m.over || placing ? externalSession ? 'Retour à l’atelier' : 'Préparation' : 'Abandonner'}</button></div></div>
          {error ? <p className="loadout-errors" role="alert">{error}</p> : null}
          {m.network && <PeerFightBar room={m.room} />}
          {placing && Object.values(m.state.fighters).filter(f => m.network ? m.humanIds.has(f.id) : f.team === 'A').length > 1 && <div className="team-placement" role="group" aria-label="Placer votre équipe">
            <span>À placer :</span>{Object.values(m.state.fighters).filter(f => m.network ? m.humanIds.has(f.id) : f.team === 'A').map(f => <button type="button" key={f.id} className="btn" aria-pressed={placementId === f.id} onClick={() => setPlacementId(f.id)}>{f.name}</button>)}
          </div>}
          <div className="fight-map">
              <BoardView
                fitToContainer
                inspectionController={inspection}
                inspectionPanelId="combat-stats"
                viewerTeam={viewerTeam}
                placementFighterId={placementId}
                state={m.state}
                frameEvents={lastEvents}
                frameIdx={step}
                winnerName={m.state.winner ? namesById[m.state.winner] : null}
                endReason={m.state.endReason}
                showWinner={m.over}
                highlights={m.over ? null : highlights}
                onCellClick={m.over ? null : onCellClick}
                onCellHover={m.over ? null : onCellHover}
                pathPreview={m.over ? null : pathPreview}
                targetPreview={m.over ? null : targetPreview}
              />
          </div>
          <div className="combat-dock">
              {!placing && <CombatTimeline state={m.state} controller={inspection} panelId="combat-stats" viewerTeam={viewerTeam}
                casting={!!selectedInfo} canTarget={canTargetPortrait} onTarget={onPortraitTarget} onTargetHover={onPortraitHover} />}
              <CombatSpellBar key={controlled.id} spells={Object.values(spellsOf(controlled))} spellInfo={spellInfo}
                pa={view?.you.pa || 0} humanTurn={humanTurn} active={active && !placing && !m.over} selectedSpell={selectedSpell}
                onSelect={onSpellClick} onSelfCast={onSpellSelfCast} onHover={onSpellHover}
                onCancel={() => setSelectedSpell(null)} onReorder={controlled.loadout ? reorderSpells : undefined} saveError={equipment.saveError || !!allySaveError}
                status={<div className={`turn-status${humanTurn ? ' yours' : ''}`} role="status"
                  title={selectedInfo ? `${selectionLabel}. Glissez les sorts pour réorganiser la barre.` : m.network ? 'Glissez les sorts pour les réorganiser dans ce combat.' : 'Glissez les sorts pour les réorganiser ; leur ordre est sauvegardé.'}>
                  {placing ? (m.network && m.isReady() ? 'Positions confirmées · En attente des autres joueurs' : m.state.placement.cells[controlled.id].length > 1 ? 'Choisissez une case de départ, puis cliquez sur Prêt' : 'Position de départ fixée · Cliquez sur Prêt') : m.over ? 'Combat terminé'
                    : humanTurn ? (selectedInfo ? selectionLabel : `${m.humanIds.size > 1 ? `${controlled.name} · ` : ''}À vous de jouer`)
                      : `${namesById[m.current().id] || m.current().name} joue…`}
                  {tackle?.inContact && <span className="tackle-chance" title="Probabilité de réussir un déplacement au contact"> · Fuite {tackle.escapeChance}%</span>}
                </div>} />
            <CombatStatsPanel id="combat-stats" fighter={statsFighter} fighters={m.state.fighters}
              resources={combatResources(statsFighter, m.state)}
              isActive={!placing && !m.over && m.current().id === statsFighter.id}
              controller={inspection} inspecting={statsFighter.id !== controlled.id}
              controls={<CombatTurnControls player={controlled} resources={combatResources(controlled, m.state)} turn={m.state.turn} {...{ placing, humanTurn, timeLeft }}
                over={m.over} onReady={confirmPlacement} onEndTurn={endTurn} onRematch={m.network ? leaveFight : () => start(Math.floor(Math.random() * 1e9))}
                readyDisabled={m.network && (!m.available || m.isReady())} readyLabel={m.network && m.isReady() ? 'En attente…' : 'Prêt'} rematchLabel={m.network ? 'Préparation' : 'Revanche'}
                onPlayerFocus={() => inspection.dismiss()} />} />
          </div>
          </div>
        </div>
      )}
      {peerOpen && phase === 'setup' && <PeerLobby profiles={profiles?.profiles} customCharacters={creations?.characters} customDungeons={creations?.dungeons}
        character={profile || { id: 'current', name: customCharacter?.name || CLASSES[playerClass].name, classId: playerClass, loadout: equipment.loadouts.A }}
        settings={{ mode: mode === 'boss' && customDungeon ? 'custom' : mode }}
        encounterName={mode === 'boss' ? customDungeon?.name || 'Le donjon sélectionné dans Combat' : mode === 'kanojedo' ? 'Kanojedo · Poutchs' : MAPS[mapId]?.name}
        initialCode={peerInput} room={peerRoom} createRoom={createPeerRoom} onReset={closePeer}
        onClose={() => { closePeer(); setPeerOpen(false); setPeerInput(''); }} />}
    </div>
  );
}
