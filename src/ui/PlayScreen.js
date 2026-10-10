import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CLASSES } from '../engine/classes';
import { MAPS } from '../engine/maps';
import { ELEMENT_EMOJI } from '../engine/formulas';
import { key, cellsInRange } from '../engine/geometry';
import { compileBot } from '../bots/compile';
import { findBot } from './botsStore';
import { LiveMatch, TURN_SECONDS } from '../game/liveMatch';
import { spellsOf } from '../engine/engine';
import { useLoadouts } from './LoadoutPicker';
import BoardView from './BoardView';
import FighterPanel from './FighterPanel';
import LogPanel from './LogPanel';
import PlayerSetup from './PlayerSetup';
import PlacementPanel from './PlacementPanel';
import { readPlayerSetup, SETUP_STORAGE } from './playerSetupState';
import { RetroSpellIcon, combatAnimationMs, useRetroAssets, useAppearances } from './RetroAssets';

const BOT_STEP_MS = 620;

// Résumé court d'un sort pour l'infobulle du bandeau.
function spellTitle(s) {
  const bits = [`${s.pa} PA`, `portée ${s.range[0]}-${s.range[1]}`];
  if (s.lineOnly) bits.push('en ligne');
  if (!s.needsLos) bits.push('sans ligne de vue');
  if (s.cooldown > 0) bits.push(`relance ${s.cooldown}t`);
  if (s.usesPerTurn > 0) bits.push(`${s.usesPerTurn}x/tour`);
  if (s.usesPerTarget > 0) bits.push(`${s.usesPerTarget}x/cible`);
  if (s.failRate > 0) bits.push(`échec critique 1/${s.failRate} (${(100 / s.failRate).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %)${s.endsTurnOnFailure ? ' : termine le tour' : ''}`);
  if (s.unsupportedEffects?.length) bits.push('Certains effets restent à reproduire — voir le Grimoire');
  return `${s.name} — ${bits.join(' · ')}`;
}

export default function PlayScreen({ allBots, active = true }) {
  const assets = useRetroAssets();
  const { appearances, setAppearance } = useAppearances();
  const [initial] = useState(() => readPlayerSetup({ getItem: key => localStorage.getItem(key) }));
  const [animating, setAnimating] = useState(false);
  const animationUntil = useRef(0);
  const animationTimer = useRef(null);
  const [playerClass, setPlayerClass] = useState(initial.playerClass);
  const [botId, setBotId] = useState(() => allBots.some(bot => bot.id === initial.botId) ? initial.botId : 'maison');
  const [botClass, setBotClass] = useState(initial.botClass);
  const equipment = useLoadouts(playerClass, botClass);
  const [mapId, setMapId] = useState(initial.mapId);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const [error, setError] = useState(null);
  const [settingsError, setSettingsError] = useState(false);
  useEffect(() => {
    try { localStorage.setItem(SETUP_STORAGE, JSON.stringify({ playerClass, botClass, botId, mapId })); setSettingsError(false); }
    catch (_) { setSettingsError(true); }
  }, [playerClass, botClass, botId, mapId]);
  const playerSex = equipment.loadouts.A.profile?.sex || 0;
  const botSex = equipment.loadouts.B.profile?.sex || 0;
  useEffect(() => {
    if (active) { setAppearance('A', playerSex === 1 ? 'female' : 'male'); setAppearance('B', botSex === 1 ? 'female' : 'male'); }
  }, [active, playerSex, botSex, setAppearance]);
  useEffect(() => { if (!allBots.some(bot => bot.id === botId)) setBotId('maison'); }, [allBots, botId]);

  const [phase, setPhase] = useState('setup'); // 'setup' | 'fight'
  const [botName, setBotName] = useState('');
  const [step, setStep] = useState(0);
  const [lastEvents, setLastEvents] = useState([]);
  const [log, setLog] = useState([]);
  const [selectedSpell, setSelectedSpell] = useState(null);
  const [hoverCell, setHoverCell] = useState(null);
  const [timeLeft, setTimeLeft] = useState(TURN_SECONDS);
  const matchRef = useRef(null);

  const pushEvents = (events) => {
    clearTimeout(animationTimer.current);
    const duration = combatAnimationMs(events, matchRef.current?.state.fighters || {}, assets, appearances);
    animationUntil.current = Date.now() + duration;
    setAnimating(true);
    animationTimer.current = setTimeout(() => setAnimating(false), duration);
    setLastEvents(events);
    if (events.length) setLog((l) => [...l, ...events]);
    setStep((s) => s + 1);
  };
  useEffect(() => () => clearTimeout(animationTimer.current), []);

  const start = (newSeed) => {
    clearTimeout(animationTimer.current);
    animationUntil.current = 0;
    setAnimating(false);
    setError(null);
    const bot = findBot(allBots, botId);
    if (!bot) { setError('Choisissez un adversaire.'); return; }
    let decideB;
    try { decideB = compileBot(bot.code); } catch (e) { setError(`${bot.name} : ${e.message}`); return; }
    const s = newSeed ?? (Number(seed) || 1);
    setSeed(s);
    let m;
    try {
      m = new LiveMatch({ playerClass, botClass, mapId, seed: s, botName: bot.name, botDecide: decideB,
        loadouts: equipment.loadouts });
    } catch (e) { setError(e.message); return; }
    matchRef.current = m;
    setBotName(bot.name);
    setLog(m.initialEvents);
    setLastEvents(m.initialEvents);
    setSelectedSpell(null);
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
    } else if (reachInfo) {
      for (const k of reachInfo.keys()) h[k] = 'move';
    }
    return h;
  }, [view, api, selectedSpell, reachInfo]);

  // Survol d'une case verte: aperçu du chemin exact + coût en PM.
  const pathPreview = useMemo(() => {
    if (!reachInfo || !hoverCell) return null;
    const c = reachInfo.get(hoverCell);
    if (!c || !c.path) return null;
    return { cells: c.path.slice(1), dest: c.pos, cost: c.cost };
  }, [reachInfo, hoverCell]);

  const onCellHover = (x, y) => setHoverCell(x === null || x === undefined ? null : key(x, y));

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
    if (!mm || !mm.isHumanTurn() || !highlights || animating) return;
    const k = key(x, y);
    if (selectedSpell) {
      if (highlights[k] === 'target') {
        setSelectedSpell(null);
        pushEvents(mm.humanAct({ type: 'CAST', spell: selectedSpell, target: { x, y } }).events);
      } else {
        setSelectedSpell(null); // cliquer ailleurs annule la visée
      }
    } else if (highlights[k] === 'move') {
      pushEvents(mm.humanAct({ type: 'MOVE', to: { x, y } }).events);
    }
  };

  const onSpellClick = (info) => {
    const mm = matchRef.current;
    if (!mm || !mm.isHumanTurn() || !view || animating) return;
    if (info.targetMode === 'self') {
      setSelectedSpell(null);
      pushEvents(mm.humanAct({ type: 'CAST', spell: info.key, target: view.you.pos }).events);
      return;
    }
    setSelectedSpell(selectedSpell === info.key ? null : info.key);
  };

  const endTurn = () => {
    const mm = matchRef.current;
    if (!mm || !mm.isHumanTurn() || animating) return;
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
    for (const e of log) if (e.t === 'summon_add') names[e.id] = e.name;
    return names;
  }, [log, botName]);

  const tackle = humanTurn && api ? api.tackleInfo() : null;
  const spellInfo = view ? Object.fromEntries(view.you.spells.map((s) => [s.key, s])) : {};
  const timerPct = Math.round((timeLeft / TURN_SECONDS) * 100);

  return (
    <div className={phase === 'fight' ? 'play-screen fight-screen' : 'play-screen'}>
      {phase !== 'fight' ? (
        <PlayerSetup {...{ playerClass, setPlayerClass, botClass, setBotClass, botId, setBotId, allBots, mapId, setMapId, seed, setSeed, equipment, error, settingsError }} onStart={() => start()} />
      ) : (
        <>
          <div className="fight-heading"><div><p className="eyebrow">{placing ? 'PLACEMENT' : m.over ? 'COMBAT TERMINÉ' : 'COMBAT EN COURS'}</p><h1>{CLASSES[playerClass].name} <span>contre</span> {CLASSES[botClass].name}</h1><p>{MAPS[mapId].name.replace(/^🗺\s*/, '')} · {placing ? 'Avant le combat' : `Tour ${m.state.turn}`}</p></div>
            <button className="btn" onClick={() => { matchRef.current = null; setPhase('setup'); }}>{m.over || placing ? 'Retour à la préparation' : 'Abandonner'}</button></div>
          {error ? <p className="loadout-errors" role="alert">{error}</p> : null}
          <div className="arena-layout">
            <div>
              <FighterPanel
                fighter={m.state.fighters.A}
                fighters={m.state.fighters}
                side="A"
                isActive={humanTurn}
              />
            </div>

            <div className="arena-center">
              <BoardView
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
              />

              {placing ? <PlacementPanel state={m.state} onReady={confirmPlacement} /> : !m.over ? (
                <>
                  <div className="play-controls">
                    <div className={`turn-status${humanTurn ? ' yours' : ''}`}>
                      {humanTurn
                        ? (selectedSpell ? '🎯 Choisissez une cible' : '👉 À vous de jouer')
                        : `🤖 ${namesById[m.current().id] || m.current().name} joue…`}
                    </div>
                    {humanTurn ? (
                      <div className="turn-timer" title="Chrono de tour">
                        <div
                          className={`bar${timeLeft < 8 ? ' hot' : ''}`}
                          style={{ width: `${timerPct}%` }}
                        />
                        <span className="secs">{Math.ceil(timeLeft)}s</span>
                      </div>
                    ) : null}
                    {tackle && tackle.inContact ? (
                      <span className="chip" title="Si vous bougez, jet de fuite : échec = déplacement annulé, PM perdus et une partie des PA.">
                        🪤 fuite {tackle.escapeChance}%
                      </span>
                    ) : null}
                    <button className="btn" disabled={!humanTurn || animating} onClick={endTurn}>⏭ Fin de tour</button>
                  </div>

                  <div className="spellbar">
                    {Object.values(spellsOf(m.state.fighters.A)).map((s) => {
                      const info = spellInfo[s.key];
                      const disabled = !humanTurn || animating || !info
                        || info.pa > view.you.pa || info.cooldownLeft > 0 || info.usesLeft <= 0;
                      return (
                        <button
                          key={s.key}
                          className={`spell-btn${selectedSpell === s.key ? ' selected' : ''}`}
                          disabled={disabled}
                          title={spellTitle(info || s)}
                          onClick={() => info && onSpellClick(info)}
                        >
                          <span className="ic"><RetroSpellIcon spell={s} /></span>
                          <span className="nm">{s.name}</span>
                          <span className="meta">
                            {s.element ? `${ELEMENT_EMOJI[s.element]} ` : ''}{info?.pa ?? s.pa} PA
                            {s.isWeapon && (info?.failRate ?? s.failRate) > 0 ? ` · EC 1/${info?.failRate ?? s.failRate}` : ''}
                            {info && info.cooldownLeft > 0 ? ` · ⏳${info.cooldownLeft}` : ''}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="play-controls">
                  <button className="btn primary" onClick={() => start(Math.floor(Math.random() * 1e9))}>
                    Revanche
                  </button>
                  <button className="btn" onClick={() => { matchRef.current = null; setPhase('setup'); }}>
                    Modifier mon personnage
                  </button>
                </div>
              )}

              {!placing && <div className="muted small">
                Tour {m.state.turn} / {m.state.maxTurns} · seed {m.seed} ·
                {' '}les invocations jouent toutes seules, le chrono passe votre tour à 0s.
              </div>}
            </div>

            <div>
              <FighterPanel
                fighter={m.state.fighters.B}
                fighters={m.state.fighters}
                side="B"
                isActive={!placing && !m.over && m.current().id === 'B'}
              />
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <LogPanel events={log} namesById={namesById} state={m.state} />
          </div>
        </>
      )}
    </div>
  );
}
