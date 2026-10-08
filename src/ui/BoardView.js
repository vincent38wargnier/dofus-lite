import React, { useEffect, useState } from 'react';
import { CLASSES } from '../engine/classes';
import { key } from '../engine/geometry';

// Un combattant qui MARCHE suit son chemin case par case (comme en 1.29),
// au lieu de glisser en ligne droite vers sa destination.
function FighterToken({ f, cellSize, activeId, onCellClick, walkPath, frameIdx, bubble }) {
  const [stepIdx, setStepIdx] = useState(null);

  useEffect(() => {
    if (!walkPath || walkPath.length < 2) { setStepIdx(null); return undefined; }
    setStepIdx(0);
    // toute la marche tient en ~500 ms, quel que soit le nombre de cases
    const stepMs = Math.min(130, Math.max(60, Math.floor(500 / (walkPath.length - 1))));
    let i = 0;
    const iv = setInterval(() => {
      i += 1;
      setStepIdx(Math.min(i, walkPath.length - 1));
      if (i >= walkPath.length - 1) clearInterval(iv);
    }, stepMs);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameIdx, f.id]);

  const walking = walkPath && walkPath.length > 1 && stepIdx !== null;
  const pos = walking ? walkPath[Math.min(stepIdx, walkPath.length - 1)] : f.pos;
  const midWalk = walking && stepIdx < walkPath.length - 1;

  return (
    <div
      className={`token side-${f.team}${f.isSummon ? ' summon' : ''}${f.hp <= 0 ? ' dead' : ''}${f.id === activeId && f.hp > 0 ? ' active' : ''}${onCellClick ? ' clickable' : ''}${midWalk ? ' walking' : ''}`}
      style={{ left: pos.x * cellSize, top: pos.y * cellSize }}
      onClick={onCellClick ? () => onCellClick(f.pos.x, f.pos.y) : undefined}
    >
      {bubble ? <div className="bubble">{bubble}</div> : null}
      <div className="avatar">{f.isSummon ? f.emoji : CLASSES[f.classId].emoji}</div>
      <div className="mini-hp">
        <div style={{ width: `${Math.max(0, (f.hp / f.maxHp) * 100)}%` }} />
      </div>
    </div>
  );
}

// Renders one replay frame: terrain, tokens, and all the combat feedback of
// this frame's events (projectiles, impacts, zone flashes, floating numbers).
// Everything is keyed by frameIdx so animations restart on every frame.
//
// Mode interactif (écran Jouer): `highlights` colore les cases
// (move/target/range), `onCellClick(x, y)` reçoit les clics — cases ET
// combattants — `onCellHover(x, y)` le survol, et `pathPreview`
// ({ cells, dest, cost }) dessine le chemin qui sera parcouru.
export default function BoardView({
  state, frameEvents, frameIdx, winnerName, endReason, showWinner,
  highlights = null, onCellClick = null, onCellHover = null, pathPreview = null,
}) {
  const { width, height, obstacles } = state.board;
  const fighters = Object.values(state.fighters);
  const activeId = state.order[state.currentIndex];
  // Les vraies cartes Dofus (15-16 cases de large) se rétrécissent un peu.
  const CELL = width > 13 ? 38 : 46;

  const cells = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const obs = obstacles[key(x, y)];
      const kind = obs ? ` ${obs.type.toLowerCase()}` : '';
      const hl = highlights ? highlights[key(x, y)] : null;
      cells.push(
        <div
          key={`${x}-${y}`}
          className={`cell${(x + y) % 2 ? ' alt' : ''}${kind}${hl ? ` hl-${hl}` : ''}`}
          onClick={onCellClick ? () => onCellClick(x, y) : undefined}
          onMouseEnter={onCellHover ? () => onCellHover(x, y) : undefined}
        >
          {obs && obs.emoji ? <span className="obstacle">{obs.emoji}</span> : null}
        </div>,
      );
    }
  }

  const px = (pos) => ({ x: pos.x * CELL + CELL / 2, y: pos.y * CELL + CELL / 2 });
  const at = (id) => state.fighters[id]?.pos;

  const overlays = [];
  const bubbles = {};
  let shake = false;

  const addFloat = (pos, cls, text, i, dy = 0) => {
    overlays.push(
      <div
        key={`f${frameIdx}-${i}-${cls}-${text}`}
        className={`float-text ${cls}`}
        style={{ left: pos.x * CELL + CELL / 2, top: pos.y * CELL - 4 - dy, transform: 'translateX(-50%)' }}
      >
        {text}
      </div>,
    );
  };

  const addBurst = (pos, emoji, i, big = false) => {
    overlays.push(
      <div
        key={`b${frameIdx}-${i}`}
        className={`impact${big ? ' big' : ''}`}
        style={{ left: px(pos).x, top: px(pos).y }}
      >
        {emoji}
      </div>,
    );
  };

  (frameEvents || []).forEach((e, i) => {
    if (e.t === 'cast') {
      // Projectile du lanceur vers la cible + coût en PA
      const from = px(e.from);
      const to = px(e.target);
      const flying = from.x !== to.x || from.y !== to.y;
      if (flying) {
        overlays.push(
          <div
            key={`p${frameIdx}-${i}`}
            className="projectile"
            style={{ '--x0': `${from.x}px`, '--y0': `${from.y}px`, '--x1': `${to.x}px`, '--y1': `${to.y}px` }}
          >
            {e.emoji}
          </div>,
        );
      }
      addBurst(e.target, e.emoji, `imp${i}`);
      addFloat(e.from, 'pa-cost', `-${e.paCost} PA`, i, 14);
      if (e.crit) addFloat(e.from, 'crit', 'CRITIQUE !', `c${i}`);
      // Flash de zone (cercle / croix / ligne)
      if (e.aoe) {
        for (const c of e.aoe) {
          overlays.push(
            <div
              key={`z${frameIdx}-${i}-${c.x}-${c.y}`}
              className="aoe-cell"
              style={{ left: c.x * CELL, top: c.y * CELL, width: CELL, height: CELL }}
            />,
          );
        }
      }
    }
    if (e.t === 'spell_fail') {
      const pos = at(e.fighter);
      if (pos) { addFloat(pos, 'crit', '💫 ÉCHEC !', i); addBurst(pos, '💫', `fb${i}`); }
    }
    if (e.t === 'move' && e.cost > 0) {
      addFloat(e.to, 'pm-cost', `-${e.cost} PM`, i);
      // Traînée de pas le long du chemin
      (e.path || []).slice(0, -1).forEach((c, j) => {
        overlays.push(
          <div
            key={`t${frameIdx}-${i}-${j}`}
            className="trail"
            style={{ left: px(c).x, top: px(c).y, animationDelay: `${j * 45}ms` }}
          />,
        );
      });
    }
    if (e.t === 'teleport') {
      addBurst(e.from, '✨', `tp0${i}`);
      addBurst(e.to, '✨', `tp1${i}`);
    }
    if (e.t === 'swap') {
      addBurst(e.aTo, '🔄', `sw0${i}`);
      addBurst(e.bTo, '🔄', `sw1${i}`);
    }
    if (e.t === 'dispel') {
      const pos = at(e.target);
      if (pos) { addBurst(pos, '🧹', `dp${i}`); addFloat(pos, 'info', `-${e.removed} effet(s)`, i); }
    }
    if (e.t === 'damage') {
      const pos = at(e.target);
      if (pos) addFloat(pos, 'dmg', `-${e.amount}`, i);
      if (e.amount >= 45) shake = true;
    }
    if (e.t === 'heal' && e.amount > 0) {
      const pos = at(e.target);
      if (pos) addFloat(pos, 'heal', `+${e.amount}`, i);
    }
    if (e.t === 'push' && e.collisionDamage > 0) {
      addBurst(e.to, '💥', `pc${i}`, true);
      shake = true;
    }
    if (e.t === 'tackle') {
      const pos = at(e.fighter);
      if (pos) addFloat(pos, 'info', `🪤 Taclé ! -${e.lostPa} PA`, i);
    }
    if (e.t === 'escape') {
      const pos = at(e.fighter);
      if (pos) addFloat(pos, 'info', `🏃 Fuite (${e.chance}%)`, i);
    }
    if (e.t === 'point_removal' && e.removed > 0) {
      const pos = at(e.target);
      if (pos) addFloat(pos, 'pa-cost', `-${e.removed} ${e.stat}`, i);
    }
    if (e.t === 'effect_add') {
      const pos = at(e.fighter);
      if (pos) addFloat(pos, 'info', e.name, i, 14);
    }
    if (e.t === 'death') {
      const pos = at(e.fighter);
      if (pos) addBurst(pos, '☠️', `ko${i}`, true);
      shake = true;
    }
    if (e.t === 'say') bubbles[e.fighter] = e.text;
  });

  // Chemins de marche de ce frame: le token suivra ces cases une à une.
  const walkPaths = {};
  (frameEvents || []).forEach((e) => {
    if (e.t === 'move' && e.path && e.path.length > 1) walkPaths[e.fighter] = e.path;
  });

  return (
    <div className="board-wrap" style={{ '--cell': `${CELL}px` }}>
      <div
        className={`board${shake ? ' shake' : ''}`}
        style={{ gridTemplateColumns: `repeat(${width}, ${CELL}px)`, width: width * CELL }}
        onMouseLeave={onCellHover ? () => onCellHover(null, null) : undefined}
      >
        {cells}

        {pathPreview && pathPreview.cells && pathPreview.cells.length > 0 ? (
          <>
            {pathPreview.cells.map((c, i) => (
              <div
                key={`pp${i}`}
                className="path-dot"
                style={{ left: px(c).x, top: px(c).y, animationDelay: `${i * 30}ms` }}
              />
            ))}
            <div
              className="path-cost"
              style={{ left: pathPreview.dest.x * CELL + CELL / 2, top: pathPreview.dest.y * CELL - 8 }}
            >
              {pathPreview.cost} PM
            </div>
          </>
        ) : null}

        {fighters.map((f) => (
          <FighterToken
            key={f.id}
            f={f}
            cellSize={CELL}
            activeId={activeId}
            onCellClick={onCellClick}
            walkPath={walkPaths[f.id] || null}
            frameIdx={frameIdx}
            bubble={bubbles[f.id] || null}
          />
        ))}

        {overlays}

        {showWinner ? (
          <div className="winner-banner">
            <div className="crown">{winnerName ? '👑' : '🤝'}</div>
            <div className="name">{winnerName || 'Match nul'}</div>
            <div className="why">
              {endReason === 'ko' ? 'Victoire par K.O.'
                : endReason === 'turn_limit' ? 'Limite de tours — victoire aux PV (érosion comprise)'
                : 'Fin du combat'}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
