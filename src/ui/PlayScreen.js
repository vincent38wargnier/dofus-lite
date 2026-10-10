import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CLASSES } from '../engine/classes';
import { MAPS } from '../engine/maps';
import { KANOJEDO_MAP_ID } from '../engine/monsters';
import { key, cellsInRange } from '../engine/geometry';
import { compileBot } from '../bots/compile';
import { findBot } from './botsStore';
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
import { readPlayerSetup, SETUP_STORAGE } from './playerSetupState';
import { combatAnimationMs, useRetroAssets, useAppearances } from './RetroAssets';
import { weaponTargetPlans, weaponZoneLabel } from './weaponTargeting';
import { spellTargetPreview } from './spellTargeting';
import { combatResources } from './combatResources';
import AutoDungeonFight from './AutoDungeonFight';

const BOT_STEP_MS = 620;

export default function PlayScreen({ allBots, active = true, onFightChange }) {
  const assets = useRetroAssets();
  const { appearances, setAppearance } = useAppearances();
  const [initial] = useState(() => readPlayerSetup({ getItem: key => localStorage.getItem(key) }));
  const animationUntil = useRef(0);
  const [playerClass, setPlayerClass] = useState(initial.playerClass);
  const [botId, setBotId] = useState(() => allBots.some(bot => bot.id === initial.botId) ? initial.botId : 'maison');
  const [botClass, setBotClass] = useState(initial.botClass);
  const equipment = useLoadouts(playerClass, botClass);
  const [mapId, setMapId] = useState(initial.mapId);
  const [mode, setMode] = useState(initial.mode);
  const [monsterGrade, setMonsterGrade] = useState(initial.monsterGrade);
  const [bossId, setBossId] = useState(initial.bossId);
  const [bossGrade, setBossGrade] = useState(initial.bossGrade);
  const [playerBotId, setPlayerBotId] = useState(() => allBots.some(bot => bot.id === initial.playerBotId) ? initial.playerBotId : 'maison');
  const [autoConfig, setAutoConfig] = useState(null);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const [error, setError] = useState(null);
  const [settingsError, setSettingsError] = useState(false);
  useEffect(() => {
    try { localStorage.setItem(SETUP_STORAGE, JSON.stringify({ playerClass, botClass, botId, playerBotId, mapId, mode, monsterGrade, bossId, bossGrade })); setSettingsError(false); }
    catch (_) { setSettingsError(true); }
  }, [playerClass, botClass, botId, playerBotId, mapId, mode, monsterGrade, bossId, bossGrade]);
  const playerSex = equipment.loadouts.A.profile?.sex || 0;
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
  const [hoveredSpell, setHoveredSpell] = useState(null);
  const [timeLeft, setTimeLeft] = useState(TURN_SECONDS);
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
  useEffect(() => { onFightChange?.(phase !== 'setup'); }, [phase, onFightChange]);
  const inspection = useFighterInspection(`${phase}:${seed}`, active && phase === 'fight', matchRef.current?.state.fighters);

  const pushEvents = (events) => {
    // Pace automatic opponents only. Human actions are validated immediately
    // by LiveMatch; decorative effects can finish alongside the next action.
    const duration = combatAnimationMs(events, matchRef.current?.state.fighters || {}, assets, appearances);
    animationUntil.current = Date.now() + duration;
    setLastEvents(events);
    if (events.length) setLog((l) => [...l, ...events]);
    setStep((s) => s + 1);
  };
  const start = (newSeed) => {
    animationUntil.current = 0;
    setError(null);
    const bot = findBot(allBots, botId);
    if (mode === 'duel' && !bot) { setError('Choisissez un adversaire.'); return; }
    let decideB;
    if (mode === 'duel') {
      try { decideB = compileBot(bot.code); } catch (e) { setError(`${bot.name} : ${e.message}`); return; }
    }
    const s = newSeed ?? (Number(seed) || 1);
    setSeed(s);
    if (mode === 'boss-auto') {
      const controller = findBot(allBots, playerBotId);
      if (!controller) { setError('Choisissez une IA pour votre personnage.'); return; }
      let decide;
      try { decide = compileBot(controller.code); } catch (e) { setError(`${controller.name} : ${e.message}`); return; }
      setAutoConfig({ mode: 'boss', bossId, bossGrade, seed: s, controllerName: controller.name,
        bots: { A: { name: 'Vous', decide } }, classes: { A: playerClass },
        loadouts: { A: JSON.parse(JSON.stringify(equipment.loadouts.A)) } });
      matchRef.current = null;
      setPhase('auto');
      return;
    }
    let m;
    try {
      m = new LiveMatch({ playerClass, botClass, mapId: mode === 'kanojedo' ? KANOJEDO_MAP_ID : mapId,
        mode, monsterGrade, bossId, bossGrade, seed: s, botName: bot?.name, botDecide: decideB, loadouts: equipment.loadouts });
    } catch (e) { setError(e.message); return; }
    matchRef.current = m;
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

  const m = phase === 'fight' ? matchRef.current : null;
  const placing = !!m?.placing;
  const humanTurn = !!(m && m.isHumanTurn());

  // Vue + api officielles côté joueur (mêmes règles que les bots).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const view = useMemo(() => (humanTurn ? m.humanView() : null), [step, phase]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const api = useMemo(() => (view ? m.humanApi(view) : null), [view]);
  const selectedInfo = view?.you.spells.find(spell => spell.key === selectedSpell);
  const weaponTargets = useMemo(() => weaponTargetPlans(selectedInfo, view, api), [selectedInfo, view, api]);
  const hoveredSelfInfo = view?.you.spells.find(spell => spell.key === hoveredSpell && spell.targetMode === 'self');
  const targetPreview = useMemo(() => {
    if (!active || !view || !api) return null;
    if (hoveredSelfInfo) return spellTargetPreview(hoveredSelfInfo, view, api, view.you.pos);
    if (!selectedInfo || !hoverCell) return null;
    if (selectedInfo.isWeapon) return weaponTargets.get(hoverCell) || null;
    const [x, y] = hoverCell.split(',').map(Number);
    return spellTargetPreview(selectedInfo, view, api, { x, y });
  }, [active, view, api, hoveredSelfInfo, selectedInfo, hoverCell, weaponTargets]);

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
    setHoveredSpell(null);
    setHoverCell(x === null || x === undefined ? null : key(x, y));
  };

  const onSpellHover = info => {
    setHoveredSpell(info?.key || null);
    setHoverCell(null);
  };

  // Le bot (et toutes les invocations) jouent automatiquement, un coup à la fois.
  useEffect(() => {
    if (!m || m.placing || m.over || m.isHumanTurn()) return undefined;
    const t = setTimeout(() => pushEvents(m.botStep().events), Math.max(BOT_STEP_MS, animationUntil.current - Date.now()));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, phase]);

  // Chrono de tour (30 s, comme en 1.29) — uniquement pour l'humain.
  const humanTurnKey = humanTurn ? `h${m.state.turn}` : 'none';
  useEffect(() => {
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
  }, [humanTurnKey]);

  const onCellClick = (x, y) => {
    const mm = matchRef.current;
    if (mm?.placing) {
      const result = mm.placeHuman({ x, y });
      if (result.ok) {
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

  const onSpellSelfCast = (info) => {
    const mm = matchRef.current;
    if (!active || !mm?.isHumanTurn()) return;
    const action = { type: 'CAST', spell: info.key, target: { ...mm.state.fighters.A.pos } };
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
    const fighter = mm.state.fighters.A;
    const withOrder = loadout => ({ ...loadout, spells: { ...loadout.spells,
      order: [...order, ...(loadout.spells?.order || []).filter(id => !order.includes(id))] } });
    // Cosmetic preference only: keep the current combat export and saved draft
    // in sync without advancing the turn or replaying the last animation.
    mm.state = { ...mm.state, fighters: { ...mm.state.fighters, A: { ...fighter, loadout: withOrder(fighter.loadout) } } };
    equipment.update('A', withOrder, fighter.classId);
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
  const inspectedFighter = hoveredFighter && (hoveredFighter.team === 'A' || !isInvisible(hoveredFighter)) ? hoveredFighter : null;
  const statsFighter = inspectedFighter || m?.state.fighters.A;
  const leaveFight = () => { matchRef.current = null; setPhase('setup'); setHoverCell(null); };
  const selectionLabel = selectedInfo?.isWeapon
    ? `${selectedInfo.name} · ${selectedInfo.pa} PA · Visée ${selectedInfo.range[0] === selectedInfo.range[1] ? selectedInfo.range[0] : selectedInfo.range.join('–')} PO · ${weaponZoneLabel(selectedInfo)}`
    : selectedInfo ? `${selectedInfo.name} · Choisissez une cible` : '';

  if (phase === 'auto') return <AutoDungeonFight config={autoConfig} active={active} onExit={leaveFight}
    onRematch={() => start(Math.floor(Math.random() * 1e9))} />;

  return (
    <div className={phase === 'fight' ? 'play-screen fight-screen' : 'play-screen'}>
      {phase !== 'fight' ? (
        <PlayerSetup {...{ playerClass, setPlayerClass, botClass, setBotClass, botId, setBotId, playerBotId, setPlayerBotId, allBots, mapId, setMapId, mode, setMode, monsterGrade, setMonsterGrade, bossId, setBossId, bossGrade, setBossGrade, seed, setSeed, equipment, error, settingsError }} onStart={() => start()} />
      ) : (
        <div className={`fight-workspace${showLog ? ' log-open' : ''}`}>
          {showLog && <section className="fight-log" id="fight-log" aria-label="Journal du combat">
            <button type="button" className="fight-log-close" onClick={() => setShowLog(false)} aria-label="Fermer le journal">×</button>
            <LogPanel events={log} namesById={namesById} state={m.state} />
          </section>}
          <div className="fight-main">
          <div className="fight-heading"><div><h1>{MAPS[m.state.mapId].name.replace(/^🗺\s*/, '')}</h1><p>{placing ? 'Placement' : m.over ? 'Combat terminé' : `Tour ${m.state.turn} / ${m.state.maxTurns}`} · {CLASSES[playerClass].name}</p></div>
            <div className="fight-heading-actions"><button className="btn" aria-expanded={showLog} aria-controls="fight-log" onClick={() => setShowLog(open => !open)}>Journal</button>
              <button className="btn" onClick={leaveFight}>{m.over || placing ? 'Préparation' : 'Abandonner'}</button></div></div>
          {error ? <p className="loadout-errors" role="alert">{error}</p> : null}
          <div className="fight-map">
              <BoardView
                fitToContainer
                inspectionController={inspection}
                inspectionPanelId="combat-stats"
                viewerTeam="A"
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
              <CombatSpellBar spells={Object.values(spellsOf(m.state.fighters.A))} spellInfo={spellInfo}
                pa={view?.you.pa || 0} humanTurn={humanTurn} active={active && !placing && !m.over} selectedSpell={selectedSpell}
                onSelect={onSpellClick} onSelfCast={onSpellSelfCast} onHover={onSpellHover}
                onCancel={() => setSelectedSpell(null)} onReorder={reorderSpells} saveError={equipment.saveError}
                status={<div className={`turn-status${humanTurn ? ' yours' : ''}`} role="status"
                  title={selectedInfo ? `${selectionLabel}. Glissez les sorts pour réorganiser la barre.` : 'Glissez les sorts pour les réorganiser ; leur ordre est sauvegardé.'}>
                  {placing ? (m.state.placement.cells.A.length > 1 ? 'Choisissez une case bleue, puis cliquez sur Prêt' : 'Position de départ fixée · Cliquez sur Prêt') : m.over ? 'Combat terminé'
                    : humanTurn ? (selectedInfo ? selectionLabel : 'À vous de jouer')
                      : `${namesById[m.current().id] || m.current().name} joue…`}
                  {tackle?.inContact && <span className="tackle-chance" title="Probabilité de réussir un déplacement au contact"> · Fuite {tackle.escapeChance}%</span>}
                </div>} />
            <CombatStatsPanel id="combat-stats" fighter={statsFighter} fighters={m.state.fighters}
              resources={combatResources(statsFighter, m.state)}
              isActive={!placing && !m.over && m.current().id === statsFighter.id}
              controller={inspection} inspecting={statsFighter.id !== 'A'}
              controls={<CombatTurnControls player={m.state.fighters.A} resources={combatResources(m.state.fighters.A, m.state)} turn={m.state.turn} {...{ placing, humanTurn, timeLeft }}
                over={m.over} onReady={confirmPlacement} onEndTurn={endTurn} onRematch={() => start(Math.floor(Math.random() * 1e9))}
                onPlayerFocus={() => inspection.dismiss()} />} />
          </div>
          </div>
        </div>
      )}
    </div>
  );
}
