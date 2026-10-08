import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CLASSES, CLASS_IDS } from '../engine/classes';
import { MAPS, MAP_IDS } from '../engine/maps';
import { ELEMENT_EMOJI } from '../engine/formulas';
import { key, cellsInRange } from '../engine/geometry';
import { compileBot } from '../bots/compile';
import { findBot } from './botsStore';
import { LiveMatch, TURN_SECONDS } from '../game/liveMatch';
import BoardView from './BoardView';
import FighterPanel from './FighterPanel';
import LogPanel from './LogPanel';

const BOT_STEP_MS = 620;

// Résumé court d'un sort pour l'infobulle du bandeau.
function spellTitle(s) {
  const bits = [`${s.pa} PA`, `portée ${s.range[0]}-${s.range[1]}`];
  if (s.lineOnly) bits.push('en ligne');
  if (!s.needsLos) bits.push('sans ligne de vue');
  if (s.cooldown > 0) bits.push(`relance ${s.cooldown}t`);
  if (s.usesPerTurn > 0) bits.push(`${s.usesPerTurn}x/tour`);
  return `${s.name} — ${bits.join(' · ')}`;
}

export default function PlayScreen({ allBots }) {
  const [playerClass, setPlayerClass] = useState('IOP');
  const [botId, setBotId] = useState('maison');
  const [botClass, setBotClass] = useState('CRA');
  const [mapId, setMapId] = useState('arene');
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const [error, setError] = useState(null);

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
    setLastEvents(events);
    if (events.length) setLog((l) => [...l, ...events]);
    setStep((s) => s + 1);
  };

  const start = (newSeed) => {
    setError(null);
    const bot = findBot(allBots, botId);
    if (!bot) { setError('Choisissez un adversaire.'); return; }
    let decideB;
    try { decideB = compileBot(bot.code); } catch (e) { setError(`${bot.name} : ${e.message}`); return; }
    const s = newSeed ?? (Number(seed) || 1);
    setSeed(s);
    const m = new LiveMatch({
      playerClass, botClass, mapId, seed: s, botName: bot.name, botDecide: decideB,
    });
    matchRef.current = m;
    setBotName(bot.name);
    setLog(m.initialEvents);
    setLastEvents(m.initialEvents);
    setSelectedSpell(null);
    setPhase('fight');
    setStep((x) => x + 1);
  };

  const m = phase === 'fight' ? matchRef.current : null;
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
    if (!m || m.over || m.isHumanTurn()) return undefined;
    const t = setTimeout(() => pushEvents(m.botStep().events), BOT_STEP_MS);
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
    if (!mm || !mm.isHumanTurn() || !highlights) return;
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
    if (!mm || !mm.isHumanTurn() || !view) return;
    if (info.targetMode === 'self') {
      setSelectedSpell(null);
      pushEvents(mm.humanAct({ type: 'CAST', spell: info.key, target: view.you.pos }).events);
      return;
    }
    setSelectedSpell(selectedSpell === info.key ? null : info.key);
  };

  const endTurn = () => {
    const mm = matchRef.current;
    if (!mm || !mm.isHumanTurn()) return;
    setSelectedSpell(null);
    pushEvents(mm.humanAct({ type: 'PASS' }).events);
  };

  const namesById = useMemo(() => {
    const names = { A: 'Vous', B: botName };
    for (const e of log) if (e.t === 'summon_add') names[e.id] = e.name;
    return names;
  }, [log, botName]);

  const botOptions = allBots.map((b) => (
    <option key={b.id} value={b.id}>{b.emoji} {b.name}{b.custom ? ' (perso)' : ''}</option>
  ));
  const classOptions = CLASS_IDS.map((id) => (
    <option key={id} value={id}>{CLASSES[id].emoji} {CLASSES[id].name}</option>
  ));

  const tackle = humanTurn && api ? api.tackleInfo() : null;
  const spellInfo = view ? Object.fromEntries(view.you.spells.map((s) => [s.key, s])) : {};
  const timerPct = Math.round((timeLeft / TURN_SECONDS) * 100);

  return (
    <div>
      <div className="panel" style={{ marginBottom: 14, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label className="field">
          <span style={{ color: 'var(--blue)', fontWeight: 700 }}>Votre classe</span>
          <select value={playerClass} onChange={(e) => setPlayerClass(e.target.value)}>{classOptions}</select>
        </label>
        <span style={{ fontWeight: 900, color: 'var(--gold)', paddingBottom: 9 }}>VS</span>
        <label className="field">
          <span style={{ color: 'var(--red)', fontWeight: 700 }}>Bot adverse</span>
          <select value={botId} onChange={(e) => setBotId(e.target.value)}>{botOptions}</select>
        </label>
        <label className="field">
          Classe adverse
          <select value={botClass} onChange={(e) => setBotClass(e.target.value)}>{classOptions}</select>
        </label>
        <label className="field">
          Carte
          <select value={mapId} onChange={(e) => setMapId(e.target.value)}>
            {MAP_IDS.map((id) => <option key={id} value={id}>{MAPS[id].name}</option>)}
          </select>
        </label>
        <label className="field">
          Seed
          <input type="number" value={seed} style={{ width: 110 }} onChange={(e) => setSeed(e.target.value)} />
        </label>
        <button className="btn primary" onClick={() => start()}>🎮 Jouer</button>
        {phase === 'fight' ? (
          <button className="btn" onClick={() => { matchRef.current = null; setPhase('setup'); }}>⏹ Abandonner</button>
        ) : null}
        {error ? <span style={{ color: 'var(--danger)', fontWeight: 700 }}>{error}</span> : null}
      </div>

      {phase !== 'fight' ? (
        <div className="panel" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 40 }}>🎮</div>
          <p className="muted">
            Affrontez un bot en direct : cliquez pour vous déplacer, choisissez un sort puis sa cible.<br />
            Vos invocations sont autonomes, comme en 1.29 — et le chrono de tour est de {TURN_SECONDS} secondes.
          </p>
        </div>
      ) : (
        <>
          <div className="arena-layout">
            <div>
              <FighterPanel
                fighter={m.state.fighters.A}
                side="A"
                isActive={humanTurn}
              />
            </div>

            <div className="arena-center">
              <BoardView
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

              {!m.over ? (
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
                    <button className="btn" disabled={!humanTurn} onClick={endTurn}>⏭ Fin de tour</button>
                  </div>

                  <div className="spellbar">
                    {Object.values(CLASSES[playerClass].spells).map((s) => {
                      const info = spellInfo[s.key];
                      const disabled = !humanTurn || !info
                        || info.pa > view.you.pa || info.cooldownLeft > 0 || info.usesLeft <= 0;
                      return (
                        <button
                          key={s.key}
                          className={`spell-btn${selectedSpell === s.key ? ' selected' : ''}`}
                          disabled={disabled}
                          title={spellTitle(info || s)}
                          onClick={() => info && onSpellClick(info)}
                        >
                          <span className="ic">{s.emoji}</span>
                          <span className="nm">{s.name}</span>
                          <span className="meta">
                            {s.element ? `${ELEMENT_EMOJI[s.element]} ` : ''}{s.pa} PA
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
                    🔁 Revanche (nouveau seed)
                  </button>
                  <button className="btn" onClick={() => { matchRef.current = null; setPhase('setup'); }}>
                    ⚙️ Changer la config
                  </button>
                </div>
              )}

              <div className="muted small">
                Tour {m.state.turn} / {m.state.maxTurns} · seed {seed} ·
                {' '}les invocations jouent toutes seules, le chrono passe votre tour à 0s.
              </div>
            </div>

            <div>
              <FighterPanel
                fighter={m.state.fighters.B}
                side="B"
                isActive={!m.over && m.current().id === 'B'}
              />
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <LogPanel events={log} namesById={namesById} />
          </div>
        </>
      )}
    </div>
  );
}
