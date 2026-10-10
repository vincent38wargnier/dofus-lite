import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CLASSES } from '../engine/classes';
import { spellsOf, isInvisible } from '../engine/engine';
import { key } from '../engine/geometry';
import { RETRO_BASE, RetroMovie, RetroSpellEffect, getActorId, resolveAnimation, useAppearances, useRetroAssets } from './RetroAssets';
import { CUSTOM_ARTWORK_ACTOR, useCharacterArtwork } from './characterArtwork';
import CustomCharacterSprite from './CustomCharacterSprite';
import { customActorCastSound } from './combatSounds';
import useFighterAnimation from './useFighterAnimation';
import useCombatSounds from './useCombatSounds';
import { fighterAccessories } from './retroEquipment';
import useMapFrame from './useMapFrame';
import HealthChangeFloats from './HealthChangeFloats';
import { healthChangeGroups } from './healthChanges';
import FighterInspector from './FighterInspector';
import useFighterInspection from './useFighterInspection';
import { Grid2X2 } from 'lucide-react';
import TacticalTerrain, { tacticalCellKind, TACTICAL_LABELS } from './TacticalTerrain';
import useTacticalMode from './useTacticalMode';
import '../styles/tacticalMode.css';
import '../styles/placement.css';

// ---------------------------------------------------------------- projection
// Vue isométrique 2:1. Le moteur travaille déjà dans le repère « losange »
// des cartes 1.29 (4 voisins, distances de Manhattan) : projeter (x, y) en
// ((x − y)·L/2, (x + y)·H/2) redonne la disposition en rangées décalées des
// vraies cartes (même formule que scripts/import_dofus_maps.py).
// Le SVG sert de repli sans installation locale. Les bibliothèques du client
// fournissent les personnages animés et les décors des cartes importées.

const MAX_BOARD_PX = 760;
const TACTICAL_LEGEND_PX = 28;

export function makeLayout(width, height, availPx, retroMap = null, availHeight = null, mapFrame = null) {
  const frame = mapFrame || retroMap;
  const sourceHw = retroMap?.hw || 1;
  const span = frame ? frame.width / sourceHw : width + height;
  const usable = Math.min(MAX_BOARD_PX, (availPx || 672) - 30);
  const fitted = availHeight !== null;
  const heightPerHw = frame ? frame.height / sourceHw : 2.4 + span / 2 + .65;
  let hw = fitted
    ? Math.max(.1, Math.min(((availPx || 672) - 2) / span, (availHeight - 2 - (frame ? 0 : 8)) / heightPerHw))
    : Math.max(2, Math.min(28, Math.floor(usable / span)));
  if (!fitted && hw % 2) hw -= 1;
  const hh = hw / 2;
  const fig = Math.round(hw * 1.55); // diamètre du médaillon d'un combattant
  const lift = Math.round(hh * 0.4); // le médaillon flotte au-dessus de sa case
  const top = retroMap ? retroMap.top * hw / retroMap.hw : fitted ? hw * 2.4 : Math.round(hw * 2.4);
  const cliff = fitted ? hh * 1.3 : Math.round(hh * 1.3); // épaisseur du socle de l'île
  const scale = hw / sourceHw;
  const offsetX = (mapFrame?.left || 0) * scale, offsetY = (mapFrame?.top || 0) * scale;
  const cx = (x, y) => (x - y + (retroMap?.originX ?? height)) * hw - offsetX;
  const cy = (x, y) => top + (x + y + 1) * hh - (retroMap?.elevations[`${x},${y}`] || 0) * scale - offsetY;
  return {
    hw,
    hh,
    fig,
    lift,
    cliff,
    w: span * hw,
    h: frame ? frame.height * scale : top + span * hh + cliff + 8,
    mapLayerStyle: retroMap ? { width: retroMap.width * scale, height: retroMap.height * scale, left: -offsetX, top: -offsetY } : null,
    cx,
    cy,
    ground: (p) => ({ x: cx(p.x, p.y), y: cy(p.x, p.y) }),
    chest: (p) => ({ x: cx(p.x, p.y), y: cy(p.x, p.y) - lift - fig / 2 }),
    head: (p) => ({ x: cx(p.x, p.y), y: cy(p.x, p.y) - lift - fig - 8 }),
    diamond: (x, y, k = 1) => {
      const X = cx(x, y);
      const Y = cy(x, y);
      const a = hw * k;
      const b = hh * k;
      return `${X},${Y - b} ${X + a},${Y} ${X},${Y + b} ${X - a},${Y}`;
    },
  };
}

// In combat, fit both axes of the flexible map area, including after a resize.
function useParentSize(ref) {
  const [size, setSize] = useState({ width: null, height: null });
  useLayoutEffect(() => {
    const parent = ref.current && ref.current.parentElement;
    if (!parent || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize(old => old.width === width && old.height === height ? old : { width, height });
    });
    ro.observe(parent);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

// Bruit déterministe par case : la même carte a toujours le même sol.
function hash(x, y, salt) {
  let h = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263) ^ Math.imul(salt + 1, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ------------------------------------------------------------------- terrain

const THEMES = {
  // Arènes du Koliséum : sable damé
  sand: {
    tile: [39, 42, 69],
    dh: 3,
    dl: 4,
    grid: 'rgba(112, 82, 36, 0.30)',
    cliffL: ['#b38b55', '#7a5a33'],
    cliffR: ['#c49d63', '#8f6d3e'],
  },
  // Cartes importées : prairie
  grass: {
    tile: [86, 30, 44],
    dh: 8,
    dl: 5,
    grid: 'rgba(26, 44, 12, 0.28)',
    cliffL: ['#7b5735', '#43301d'],
    cliffR: ['#906843', '#583d25'],
  },
};

function tileFill(t, x, y) {
  // variations douces (sinus) + un peu de grain par case
  const n = 0.45 * Math.sin(x * 0.55 + 1.3) * Math.cos(y * 0.47 - 0.4)
    + 0.35 * Math.sin((x + y) * 0.23 + 2.1)
    + (hash(x, y, 1) - 0.5) * 0.4;
  const [h, s, l] = t.tile;
  return `hsl(${(h + n * t.dh).toFixed(1)}, ${s}%, ${(l + n * t.dl).toFixed(1)}%)`;
}

function terrainKind(board, x, y) {
  if (x < 0 || y < 0 || x >= board.width || y >= board.height) return 'void';
  const o = board.obstacles[key(x, y)];
  if (!o) return 'floor';
  if (o.type === 'VOID') return 'void';
  if (o.type === 'WATER') return 'water';
  if (o.type === 'HOLE') return 'hole';
  return 'floor'; // ROCK / WALL / BUSH : un décor posé sur le sol
}

// Le sol ne change jamais pendant un combat : il n'est redessiné que si la
// carte ou la taille des cases change (signature `sig`).
const TerrainLayer = React.memo(function TerrainLayer({ L, board, theme, uid }) {
  const t = THEMES[theme];
  const kind = (x, y) => terrainKind(board, x, y);
  const cells = [];
  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) if (kind(x, y) !== 'void') cells.push({ x, y });
  }
  // peintre : de l'arrière (x + y petit) vers l'avant
  cells.sort((a, b) => (a.x + a.y) - (b.x + b.y));

  const { hw, hh, cliff } = L;
  const s = hw / 22;
  const items = [];
  const decor = [];
  for (const { x, y } of cells) {
    const k = kind(x, y);
    const X = L.cx(x, y);
    const Y = L.cy(x, y);
    // flancs de l'île, côté vide : bas-gauche = (x, y+1), bas-droit = (x+1, y)
    if (kind(x, y + 1) === 'void') {
      items.push(
        <polygon
          key={`fl${x},${y}`}
          points={`${X - hw},${Y} ${X},${Y + hh} ${X},${Y + hh + cliff} ${X - hw},${Y + cliff}`}
          fill={`url(#${uid}-cl)`}
        />,
      );
    }
    if (kind(x + 1, y) === 'void') {
      items.push(
        <polygon
          key={`fr${x},${y}`}
          points={`${X},${Y + hh} ${X + hw},${Y} ${X + hw},${Y + cliff} ${X},${Y + hh + cliff}`}
          fill={`url(#${uid}-cr)`}
        />,
      );
    }

    if (k === 'water') {
      items.push(
        <polygon key={`t${x},${y}`} points={L.diamond(x, y)} fill={`url(#${uid}-water)`} stroke="rgba(220, 245, 255, 0.14)" />,
      );
      decor.push(
        <polygon
          key={`g${x},${y}`}
          className="water-glint"
          points={L.diamond(x, y, 0.42)}
          style={{ animationDelay: `${(hash(x, y, 7) * 3).toFixed(2)}s` }}
        />,
      );
    } else if (k === 'hole') {
      items.push(<polygon key={`t${x},${y}`} points={L.diamond(x, y)} fill="#3b2a1a" stroke={t.grid} />);
      items.push(<polygon key={`h${x},${y}`} points={L.diamond(x, y, 0.74)} fill={`url(#${uid}-hole)`} />);
    } else {
      items.push(<polygon key={`t${x},${y}`} points={L.diamond(x, y)} fill={tileFill(t, x, y)} stroke={t.grid} />);
      if (board.obstacles[key(x, y)]) continue; // un décor occupe déjà la case
      // petits détails de sol, toujours à l'intérieur du losange
      const r = hash(x, y, 3);
      const a = (hash(x, y, 4) - 0.5) * 0.9;
      const b = (hash(x, y, 5) - 0.5) * 2 * (0.5 - Math.abs(a));
      const px = X + a * hw;
      const py = Y + b * hh;
      if (theme === 'grass' && r < 0.24) {
        decor.push(
          <path
            key={`d${x},${y}`}
            d={`M${px - 2.6 * s},${py} l${-1.3 * s},${-4.4 * s} M${px},${py} l${0.2 * s},${-5.6 * s} M${px + 2.6 * s},${py} l${1.3 * s},${-4.4 * s}`}
            stroke="rgba(38, 66, 18, 0.75)"
            strokeWidth={1.3 * s}
            strokeLinecap="round"
            fill="none"
          />,
        );
      } else if (theme === 'grass' && r < 0.3) {
        decor.push(
          <g key={`d${x},${y}`}>
            <circle cx={px} cy={py} r={1.8 * s} fill="#f4ecc2" />
            <circle cx={px} cy={py} r={0.75 * s} fill="#e2a83c" />
          </g>,
        );
      } else if (theme === 'sand' && r < 0.12) {
        decor.push(
          <ellipse key={`d${x},${y}`} cx={px} cy={py} rx={2.4 * s} ry={1.5 * s} fill="#a0957f" stroke="#6e6553" strokeWidth={0.8 * s} />,
        );
      } else if (theme === 'sand' && r < 0.18) {
        decor.push(
          <path
            key={`d${x},${y}`}
            d={`M${px - 4 * s},${py} l${2.5 * s},${-1.2 * s} l${1.8 * s},${1.6 * s} l${3 * s},${-1.4 * s}`}
            stroke="rgba(120, 88, 42, 0.5)"
            strokeWidth={s}
            strokeLinecap="round"
            fill="none"
          />,
        );
      }
    }
  }

  return (
    <svg className="terrain" width={L.w} height={L.h} aria-hidden="true">
      <defs>
        <linearGradient id={`${uid}-cl`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={t.cliffL[0]} />
          <stop offset="1" stopColor={t.cliffL[1]} />
        </linearGradient>
        <linearGradient id={`${uid}-cr`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={t.cliffR[0]} />
          <stop offset="1" stopColor={t.cliffR[1]} />
        </linearGradient>
        {/* un seul dégradé pour toute la carte : l'eau paraît continue */}
        <linearGradient id={`${uid}-water`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={L.w} y2={L.h}>
          <stop offset="0" stopColor="#62b4ca" />
          <stop offset="0.5" stopColor="#4a9bb6" />
          <stop offset="1" stopColor="#357d99" />
        </linearGradient>
        <radialGradient id={`${uid}-hole`} cx="0.5" cy="0.35" r="0.65">
          <stop offset="0" stopColor="#050302" />
          <stop offset="1" stopColor="#24180e" />
        </radialGradient>
      </defs>
      {items}
      {decor}
    </svg>
  );
}, (a, b) => a.sig === b.sig);

// ------------------------------------------------------------------- décors
// Ancre (ax, ay) = point du dessin posé au centre de la case.

const PROP_ART = {
  ROCK: {
    vw: 100,
    vh: 80,
    ay: 66,
    art: (
      <>
        <ellipse cx="50" cy="66" rx="40" ry="10" fill="rgba(15, 10, 5, 0.35)" />
        <path d="M14 62 C9 47 19 31 36 26 C48 15 70 17 81 31 C92 42 91 60 78 66 C66 71 34 71 22 68 C17 67 15 65 14 62 Z" fill="#8d8579" />
        <path d="M60 23 C72 22 81 30 84 38 C90 48 88 60 78 66 C70 69 60 70 52 70 C62 60 66 44 60 23 Z" fill="#6f675c" />
        <path d="M24 44 C25 35 33 29 43 27 C37 34 33 41 31 50 Z" fill="#aaa295" />
        <path d="M44 40 L50 46 L48 54 M66 48 L72 52" stroke="#4f483f" strokeWidth="1.8" strokeLinecap="round" fill="none" />
        <path d="M14 62 C9 47 19 31 36 26 C48 15 70 17 81 31 C92 42 91 60 78 66 C66 71 34 71 22 68 C17 67 15 65 14 62 Z" fill="none" stroke="#463f36" strokeWidth="2.5" strokeLinejoin="round" />
      </>
    ),
  },
  BUSH: {
    vw: 100,
    vh: 92,
    ay: 78,
    art: (
      <>
        <ellipse cx="50" cy="79" rx="38" ry="9" fill="rgba(15, 10, 5, 0.32)" />
        <circle cx="29" cy="60" r="19" fill="#47752f" stroke="#284419" strokeWidth="2.5" />
        <circle cx="71" cy="60" r="19" fill="#436e2c" stroke="#284419" strokeWidth="2.5" />
        <circle cx="50" cy="42" r="23" fill="#578c3c" stroke="#284419" strokeWidth="2.5" />
        <ellipse cx="50" cy="65" rx="26" ry="15" fill="#4f8236" stroke="#284419" strokeWidth="2.5" />
        <path d="M36 33 C40 26 48 23 55 25" stroke="#8cc163" strokeWidth="4" strokeLinecap="round" fill="none" />
        <path d="M18 55 C20 50 24 47 29 46" stroke="#79ad55" strokeWidth="3.5" strokeLinecap="round" fill="none" />
        <circle cx="62" cy="50" r="3.2" fill="#c4473a" />
        <circle cx="38" cy="62" r="3.2" fill="#c4473a" />
        <circle cx="61" cy="49" r="1" fill="#f6d2c8" />
        <circle cx="37" cy="61" r="1" fill="#f6d2c8" />
      </>
    ),
  },
  // Muret : un bloc dont la base épouse exactement le losange de la case.
  WALL: {
    vw: 100,
    vh: 112,
    ay: 87,
    art: (
      <>
        <polygon points="0,25 50,50 50,112 0,87" fill="#8b816d" />
        <polygon points="50,50 100,25 100,87 50,112" fill="#71685a" />
        <polygon points="50,0 100,25 50,50 0,25" fill="#b7ad97" />
        <path d="M0 40.5 L50 65.5 L100 40.5 M0 56 L50 81 L100 56 M0 71.5 L50 96.5 L100 71.5" stroke="#5b5346" strokeWidth="1.6" fill="none" />
        <path d="M25 37.5 V53 M75 37.5 V53 M12 46.5 V62 M38 59.5 V75 M62 59.5 V75 M88 46.5 V62 M25 68.5 V84 M75 68.5 V84 M12 77.5 V93 M38 90.5 V106 M62 90.5 V106 M88 77.5 V93" stroke="#5b5346" strokeWidth="1.4" />
        <path d="M30 22 C38 18 46 20 50 24" stroke="#d3cab5" strokeWidth="2" strokeLinecap="round" fill="none" />
        <path d="M50 0 L100 25 L100 87 L50 112 L0 87 L0 25 Z M0 25 L50 50 L100 25 M50 50 V112" stroke="#3f392f" strokeWidth="2.2" strokeLinejoin="round" fill="none" />
      </>
    ),
  },
};

function Prop({ type, x, y, L }) {
  const art = PROP_ART[type];
  const v = hash(x, y, 9);
  const scale = type === 'WALL' ? 1 : 0.92 + v * 0.16; // un peu de variété
  const w = 2 * L.hw * scale;
  const h = w * (art.vh / art.vw);
  const flip = type !== 'WALL' && v > 0.5;
  return (
    <svg
      className={`prop prop-${type.toLowerCase()}`}
      viewBox={`0 0 ${art.vw} ${art.vh}`}
      width={w}
      height={h}
      style={{
        left: L.cx(x, y) - w / 2,
        top: L.cy(x, y) - h * (art.ay / art.vh),
        zIndex: 10 + (x + y) * 4 + 2,
        transform: flip ? 'scaleX(-1)' : undefined,
      }}
      aria-hidden="true"
    >
      {art.art}
    </svg>
  );
}

// --------------------------------------------------------------- combattants

// Un combattant qui MARCHE suit son chemin case par case (comme en 1.29),
// au lieu de glisser en ligne droite vers sa destination.
function FighterToken({
  f, L, activeId, frameIdx, frameEvents, bubble, targetable, onCellClick, onCellHover,
  inspectorId, isInspected, onInspect, onInspectLeave, placing, inlineInspection,
}) {
  const assets = useRetroAssets();
  const { appearances } = useAppearances();
  const actorId = getActorId(assets, f, appearances[f.team]);
  const { artwork } = useCharacterArtwork(f.artworkId || (!f.isMonster && (!f.isSummon || f.isDouble) ? f.loadout?.artworkId : null));
  const actor = artwork ? CUSTOM_ARTWORK_ACTOR : assets?.actors[actorId];
  const { hat, cape, pet } = f.loadout?.slots || {};
  const accessories = useMemo(() => fighterAccessories({ isMonster: f.isMonster, isSummon: f.isSummon,
    loadout: { slots: { hat, cape, pet } } }, assets), [assets, hat, cape, pet, f.isMonster, f.isSummon]);
  const [failedActor, setFailedActor] = useState(null);
  const { pose, direction, restart, position } = useFighterAnimation(f, frameEvents, frameIdx, actor, assets);
  const useOriginal = !artwork && actor && failedActor !== actorId;
  const midWalk = pose === 'walk' && position;
  const pos = position || f.pos;
  const animation = resolveAnimation(actor, pose, direction.suffix);
  const previousLayout = useRef(L);
  const [settlingLayout, setSettlingLayout] = useState(false);
  const resized = previousLayout.current !== L;
  useLayoutEffect(() => {
    if (previousLayout.current === L) return undefined;
    previousLayout.current = L;
    // Keep transitions off through the paint. A hover or animation render in
    // the same frame must not re-enable movement while the board resizes.
    setSettlingLayout(true);
    let settled;
    const paint = requestAnimationFrame(() => {
      settled = requestAnimationFrame(() => setSettlingLayout(false));
    });
    return () => { cancelAnimationFrame(paint); cancelAnimationFrame(settled); };
  }, [L]);

  return (
    <div
      className={`token side-${f.team}${useOriginal || artwork ? ' retro-token' : ''}${artwork ? ' custom-artwork-token' : ''}${f.isSummon ? ' summon' : ''}${f.id === activeId ? ' active' : ''}${targetable ? ' targetable' : ''}${midWalk ? ' walking' : ''}${isInspected ? ' is-inspected' : ''}`}
      data-fighter-id={f.id}
      data-actor={actorId || undefined}
      data-animation={animation || undefined}
      data-mirror={String(direction.mirror)}
      aria-label={f.name}
      style={{ left: L.cx(pos.x, pos.y), top: L.cy(pos.x, pos.y) - (f.carriedBy ? L.fig * .75 : 0), opacity: isInvisible(f) ? .45 : 1, transition: resized || settlingLayout ? 'none' : undefined, zIndex: (placing ? 2150 : 10) + (pos.x + pos.y) * 4 + 3 }}
    >
      <div className="ring" />
      {/* Ciblable : cliquer le corps vise sa case. Sinon les clics traversent
          jusqu'au sol, pour viser précisément la case derrière. */}
      <div
        className={`figure${useOriginal || artwork ? ' retro-figure' : ''}`}
        role="button" tabIndex={0} aria-label={`Inspecter ${f.name}`} aria-haspopup={inlineInspection ? undefined : 'dialog'}
        aria-expanded={isInspected} aria-controls={isInspected ? inspectorId : undefined}
        onFocus={event => onInspect(f.id, event.currentTarget)} onBlur={onInspectLeave}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onInspect(f.id, event.currentTarget, true); }
        }}
        onClick={targetable ? () => onCellClick(f.pos.x, f.pos.y) : event => onInspect(f.id, event.currentTarget, true)}
        onMouseEnter={targetable && onCellHover ? () => onCellHover(f.pos.x, f.pos.y) : undefined}
      >
        {artwork ? <CustomCharacterSprite artwork={artwork} pose={pose} direction={direction} restart={restart}
          castSound={customActorCastSound(assets?.actors[actorId], pose, direction.suffix, assets)} /> : useOriginal ? (
          <RetroMovie
            url={actor.url} animation={animation} restart={restart}
            accessories={accessories} mirrored={direction.mirror}
            className="retro-actor" scriptAccess combatSteps
            style={{ transform: direction.mirror ? 'scaleX(-1)' : undefined }}
            onFailure={() => setFailedActor(actorId)}
          />
        ) : <div className="avatar">{f.isSummon || f.isMonster ? f.emoji : CLASSES[f.classId].emoji}</div>}
      </div>
      <div className="mini-hp">
        <div style={{ transform: `scaleX(${Math.max(0, f.hp / f.maxHp)})` }} />
      </div>
      {bubble ? <div className="bubble">{bubble}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------- plateau

// Renders one replay frame: terrain, tokens, and all the combat feedback of
// this frame's events (projectiles, impacts, zone flashes, floating numbers).
// Everything is keyed by frameIdx so animations restart on every frame.
//
// Mode interactif (écran Jouer): `highlights` colore les cases
// (move/target/range), `onCellClick(x, y)` reçoit les clics — cases ET
// combattants ciblables — `onCellHover(x, y)` le survol, et `pathPreview`
// ({ cells, dest, cost }) dessine le chemin qui sera parcouru.
function SpellEffects({ state, frameEvents, frameIdx, assets, L }) {
  const [casts, setCasts] = useState([]);
  const previous = useRef(-1);
  useEffect(() => {
    const next = (frameEvents || []).filter(e => e.t === 'cast' || e.t === 'hazard_effect').map((e, i) => {
      const info = assets?.spells[e.visualSpellId ?? e.spellId];
      return info?.effect ? { id: `${frameIdx}-${i}`, event: e, info } : null;
    }).filter(Boolean);
    const rewind = frameIdx <= previous.current;
    setCasts(current => rewind ? next : [...current, ...next].slice(-12));
    previous.current = frameIdx;
    // One retained effect per combat action; later movement must not truncate it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameIdx, assets]);
  return casts.map(c => <RetroSpellEffect key={c.id} url={c.info.effect}
    grade={c.event.grade || 5} duration={c.info.duration} fps={c.info.fps} maxDuration={1500}
    type={c.info.type} exportFrames={c.info.exportFrames}
    zIndex={10 + (c.event.target.x + c.event.target.y) * 4 + (c.info.front === false ? 2 : 4)}
    from={L.ground(c.event.from)} to={L.ground(c.event.target)} scale={L.hw / 26.75}
    onComplete={() => setCasts(current => current.filter(x => x.id !== c.id))} />);
}

export default function BoardView({
  state, frameEvents, frameIdx, winnerName, endReason, showWinner,
  highlights = null, onCellClick = null, onCellHover = null, pathPreview = null,
  targetPreview = null,
  viewerTeam = null,
  fitToContainer = false, inspectionController = null, inspectionPanelId = null,
}) {
  const wrapRef = useRef(null);
  const avail = useParentSize(wrapRef);
  const uid = useId().replace(/:/g, '');
  const [tacticalMode, toggleTacticalMode] = useTacticalMode();
  const localInspection = useFighterInspection(`${state.mapId}:${state.seed}`, !inspectionController, state.fighters);
  const inspection = inspectionController || localInspection;
  const inspectorId = inspectionPanelId || `${uid}-fighter-inspector`;
  const assets = useRetroAssets();
  const { appearances } = useAppearances();
  const retroMap = assets?.imagesReady ? assets.maps[state.mapId] : null;
  const mapFrame = useMapFrame(retroMap, state.board, fitToContainer, tacticalMode);
  const { width, height, obstacles } = state.board;
  const bottomInset = fitToContainer && tacticalMode ? TACTICAL_LEGEND_PX : 0;
  const fittedHeight = fitToContainer && avail.height !== null ? avail.height - bottomInset : null;
  const L = useMemo(() => makeLayout(width, height, avail.width, retroMap, fittedHeight, mapFrame), [width, height, avail.width, retroMap, fittedHeight, mapFrame]);
  const visible = f => f && (!viewerTeam || f.team === viewerTeam || !isInvisible(f));
  const fighters = Object.values(state.fighters).filter(visible);
  // Keep defeated fighters for the final damage numbers, but remove their
  // sprites, rings, health bars and inspection targets as soon as they die.
  const livingFighters = fighters.filter(f => f.hp > 0);
  const inspectedFighter = livingFighters.find(f => f.id === inspection.inspection?.id);
  // Keep actual invisible positions out of movement/effect overlays.
  frameEvents = (frameEvents || []).filter(e => (!e.fighter || visible(state.fighters[e.fighter])) && (!e.target || typeof e.target !== 'string' || visible(state.fighters[e.target])));
  const soundScope = useCombatSounds(frameIdx, frameEvents, state.fighters, assets, appearances, `${state.mapId}:${state.seed}`);
  const placing = state.phase === 'placement';
  const activeId = placing ? null : state.order[state.currentIndex];

  // Les cartes importées (eau, bords vides) deviennent des prairies ; les
  // arènes du Koliséum restent en sable.
  const obstacleList = Object.values(obstacles);
  const theme = obstacleList.some((o) => o.type === 'VOID' || o.type === 'WATER') ? 'grass' : 'sand';
  const sig = `${width}x${height}|${L.hw}|${theme}|${obstacleList.map((o) => `${o.x},${o.y}${o.type}`).join(';')}`;

  const fighterAt = {};
  for (const f of livingFighters) if (!f.carriedBy) fighterAt[key(f.pos.x, f.pos.y)] = f;
  // un sort vise le buste d'un combattant, sinon le sol
  const aim = (pos) => (fighterAt[key(pos.x, pos.y)] ? L.chest(pos) : L.ground(pos));
  const at = (id) => state.fighters[id]?.pos;

  const overlays = [];
  const aoeCells = [];
  const bubbles = {};
  let shake = healthChangeGroups(frameEvents).some(g => g.t === 'damage' && g.amount >= 45);

  const addFloat = (pos, cls, text, i, dy = 0) => {
    const p = L.head(pos);
    overlays.push(
      <div
        key={`f${frameIdx}-${i}-${cls}-${text}`}
        className={`float-text ${cls}`}
        style={{ left: p.x, top: p.y - dy }}
      >
        {text}
      </div>,
    );
  };

  const addBurst = (pos, emoji, i, big = false) => {
    const p = aim(pos);
    overlays.push(
      <div
        key={`b${frameIdx}-${i}`}
        className={`impact${big ? ' big' : ''}`}
        style={{ left: p.x, top: p.y }}
      >
        {emoji}
      </div>,
    );
  };

  (frameEvents || []).forEach((e, i) => {
    if (e.t === 'cast') {
      const caster = state.fighters[e.fighter];
      const spell = caster ? spellsOf(caster)[e.spell] : null;
      const effectInfo = assets?.spells[e.visualSpellId ?? e.spellId ?? spell?.visualSpellId ?? spell?.id];
      const originalEffect = effectInfo?.effect || effectInfo?.playEffect === false;
      // Projectile du lanceur vers la cible + coût en PA
      const from = L.chest(e.from);
      const to = aim(e.target);
      const flying = e.from.x !== e.target.x || e.from.y !== e.target.y;
      if (!originalEffect && flying) {
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
      if (!originalEffect) addBurst(e.target, e.emoji, `imp${i}`);
      addFloat(e.from, 'pa-cost', `-${e.paCost} PA`, i, 14);
      if (e.crit) addFloat(e.from, 'crit', 'CRITIQUE !', `c${i}`);
      // Flash de zone (cercle / croix / ligne)
      if (e.aoe) {
        for (const c of e.aoe) {
          aoeCells.push(
            <polygon key={`z${frameIdx}-${i}-${c.x}-${c.y}`} className="aoe-cell" points={L.diamond(c.x, c.y)} />,
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
            style={{ left: L.cx(c.x, c.y), top: L.cy(c.x, c.y), animationDelay: `${j * 45}ms` }}
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

  // Cases cliquables : des losanges transparents posés sur le sol, que les
  // surbrillances (move / target / range) colorent.
  const cellPolys = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const obs = obstacles[key(x, y)];
      if (obs && obs.type === 'VOID') continue;
      const hl = highlights ? highlights[key(x, y)] : null;
      cellPolys.push(
        <polygon
          key={`${x}-${y}`}
          data-cell={key(x, y)}
          className={`cell${obs ? ` ${obs.type.toLowerCase()}` : ''}${hl ? ` hl-${hl}` : ''}`}
          points={L.diamond(x, y)}
          onClick={onCellClick ? () => onCellClick(x, y) : undefined}
          onMouseEnter={onCellHover ? () => onCellHover(x, y) : undefined}
        >{tacticalMode && <title>{TACTICAL_LABELS[tacticalCellKind(obs)]}</title>}</polygon>,
      );
    }
  }

  return (
    <div
      ref={wrapRef}
      id={`retro-sound-${soundScope}`}
      className={`board-wrap${tacticalMode ? ' tactical-mode' : ''}${fitToContainer ? ' fitted-board' : ''}`}
      style={{ '--hw': `${L.hw}px`, '--hh': `${L.hh}px`, '--fig': `${L.fig}px`, '--lift': `${L.lift}px`, paddingBottom: bottomInset || undefined }}
    >
      <div className="board-tools">
        <button type="button" className="board-mode-toggle" aria-pressed={tacticalMode}
          title={tacticalMode ? 'Revenir au décor de la carte' : 'Masquer les décors et afficher les obstacles'}
          onClick={() => { inspection.dismiss(); toggleTacticalMode(); }}>
          <Grid2X2 size={15} aria-hidden="true" /><span>Mode tactique</span><i className="mode-indicator" aria-hidden="true" />
        </button>
      </div>
      <div
        className={`board${shake ? ' shake' : ''}`}
        style={{ width: L.w, height: L.h }}
        onPointerMove={inspection.pointerMove} onPointerLeave={inspection.pointerLeave}
        onMouseLeave={onCellHover ? () => onCellHover(null, null) : undefined}
      >
        {tacticalMode ? <TacticalTerrain L={L} board={state.board} uid={uid} /> : retroMap ? retroMap.layers.map(layer => (
          <img key={layer.name} src={RETRO_BASE + layer.image} alt="" className="retro-map-layer"
            style={{ ...L.mapLayerStyle, zIndex: layer.name === 'ground' ? 0 : 10 + Number(layer.name) * 4 + 2 }} />
        )) : <TerrainLayer sig={sig} L={L} board={state.board} theme={theme} uid={uid} />}

        <svg className="grid-layer" width={L.w} height={L.h}>
          {/* survol du vide autour de l'île = plus aucune case survolée */}
          {onCellHover ? (
            <rect className="board-bg" width={L.w} height={L.h} onMouseEnter={() => onCellHover(null, null)} />
          ) : null}
          {cellPolys}
          {(state.hazards || []).filter(h => h.kind === 'glyph' || !viewerTeam || h.team === viewerTeam || h.revealedTo?.includes(viewerTeam)).flatMap(h => h.cells
            .filter(c => c.x >= 0 && c.y >= 0 && c.x < width && c.y < height && obstacles[key(c.x, c.y)]?.type !== 'VOID')
            .map(c => <polygon key={`${h.id}-${c.x}-${c.y}`} className={`hazard-zone ${h.kind}`}
              points={L.diamond(c.x, c.y, .91)}><title>{h.name}{h.turnsLeft ? ` · ${h.turnsLeft} tours` : ''}</title></polygon>))}
          {aoeCells}
        </svg>

        {targetPreview && <svg className="attack-preview-layer" width={L.w} height={L.h}
          role="img" aria-label={`Zone d’effet : ${targetPreview.cells.length} cases`}>
          {targetPreview.cells.map(c => <polygon key={`aim-${c.x}-${c.y}`}
            className={`attack-preview-cell${c.x === targetPreview.target.x && c.y === targetPreview.target.y ? ' aim' : ''}`}
            data-attack-cell={key(c.x, c.y)} points={L.diamond(c.x, c.y, .9)} />)}
        </svg>}

        {placing && <svg className="placement-layer" width={L.w} height={L.h} aria-label="Cases de départ">
          {Object.entries(state.placement.cells).filter(([id], i, entries) =>
            entries.findIndex(([otherId]) => state.fighters[otherId].team === state.fighters[id].team) === i)
            .flatMap(([id, cells]) => cells.map((cell, index) => {
            const own = state.fighters[id].team === viewerTeam;
            const selected = Object.values(state.fighters).some(f => f.team === state.fighters[id].team
              && key(cell.x, cell.y) === key(f.pos.x, f.pos.y));
            const canPlace = own && onCellClick && !state.placement.ready[id];
            const label = `${own ? 'Votre' : 'Adversaire :'} départ ${index + 1}`;
            return <g key={`${id}-${index}`}>
              <polygon points={L.diamond(cell.x, cell.y, .92)}
                className={`placement-cell ${own ? 'yours' : 'enemy'}${selected ? ' selected' : ''}`}
                data-placement-cell={key(cell.x, cell.y)} data-team={state.fighters[id].team}
                role={canPlace ? 'button' : 'img'} tabIndex={canPlace ? 0 : undefined}
                aria-label={label} aria-pressed={canPlace ? selected : undefined}
                onClick={canPlace ? () => onCellClick(cell.x, cell.y) : undefined}
                onKeyDown={canPlace ? e => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCellClick(cell.x, cell.y); }
                } : undefined}><title>{label}</title></polygon>
              {selected && <polygon className="placement-selection" points={L.diamond(cell.x, cell.y, .65)} />}
            </g>;
          }))}
        </svg>}

        {pathPreview && pathPreview.cells && pathPreview.cells.length > 0 ? (
          <>
            {pathPreview.cells.map((c, i) => (
              <div
                key={`pp${i}`}
                className="path-dot"
                style={{ left: L.cx(c.x, c.y), top: L.cy(c.x, c.y), animationDelay: `${i * 30}ms` }}
              />
            ))}
            <div
              className="path-cost"
              style={{ left: L.cx(pathPreview.dest.x, pathPreview.dest.y), top: L.cy(pathPreview.dest.x, pathPreview.dest.y) - L.hh - 24 }}
            >
              {pathPreview.cost} PM
            </div>
          </>
        ) : null}

        {!tacticalMode && !retroMap && obstacleList.filter((o) => PROP_ART[o.type]).map((o) => (
          <Prop key={`o${o.x},${o.y}`} type={o.type} x={o.x} y={o.y} L={L} />
        ))}

        {livingFighters.map((f) => (
          <FighterToken
            key={f.id}
            f={f}
            L={L}
            activeId={activeId}
            placing={placing}
            frameIdx={frameIdx}
            frameEvents={frameEvents}
            bubble={bubbles[f.id] || null}
            targetable={Boolean(onCellClick && highlights && ['target', 'splash'].includes(highlights[key(f.pos.x, f.pos.y)]))}
            onCellClick={onCellClick}
            onCellHover={onCellHover}
            inspectorId={inspectorId}
            inlineInspection={!!inspectionController}
            isInspected={f.id === inspectedFighter?.id}
            onInspect={inspection.open} onInspectLeave={inspection.closeSoon}
          />
        ))}

        {overlays}
        <HealthChangeFloats key={`health-${state.mapId}-${state.seed}`} frameEvents={frameEvents}
          frameIdx={frameIdx} fighters={fighters} L={L} />
        <SpellEffects key={`${state.mapId}-${state.seed}`} state={state} frameEvents={frameEvents} frameIdx={frameIdx} assets={assets} L={L} />

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
      {tacticalMode && <div className="tactical-legend" aria-label="Légende du mode tactique">
        <span><i className="free" aria-hidden="true" />Case libre</span>
        <span title={TACTICAL_LABELS.movement}><i className="movement" aria-hidden="true" />Déplacement bloqué</span>
        <span title={TACTICAL_LABELS.sight}><i className="sight" aria-hidden="true" />Vue bloquée</span>
      </div>}
      {!inspectionController && <FighterInspector id={inspectorId} fighter={inspectedFighter} fighters={state.fighters} viewerTeam={viewerTeam}
        activeId={activeId} frameIdx={frameIdx} controller={inspection} />}
    </div>
  );
}
