import React, { useEffect, useId, useRef } from 'react';
import { mapPropLayout } from './mapPropLayout';
import { validSpellVisual } from '../visuals/spellVisuals';
import '../styles/originalVisuals.css';

// Original vector effects: no Flash files, client particles, sounds or textures.
// A cast owns its lifetime. A later action neither waits for it nor cancels it.
export default function OriginalSpellEffect({ event, L, onComplete }) {
  const uid = useId().replace(/:/g, ''), done = useRef(onComplete);
  done.current = onComplete;
  const fx = event.visualEffect;
  useEffect(() => {
    const timer = setTimeout(() => done.current(), fx.durationMs);
    return () => clearTimeout(timer);
  }, [fx.durationMs]);
  if (!validSpellVisual(fx)) return null;
  const from = L.ground(event.from), to = L.ground(event.target);
  const scale = L.hw / 30, lift = L.hw * .8;
  const start = { x: from.x, y: from.y - lift }, end = { x: to.x, y: to.y - lift };
  const angle = Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI;
  const projectile = ['arrow', 'ice-lance', 'fireball', 'thrust'].includes(fx.kind);
  const travel = projectile ? fx.durationMs * .36 : 0, impact = fx.durationMs - travel;
  const begin = `${travel}ms`, duration = `${impact}ms`, full = `${fx.durationMs}ms`;
  const shards = ['shatter', 'ice-lance', 'fang'].includes(fx.kind);
  const fire = ['fireball', 'fire-wave', 'embers'].includes(fx.kind);
  const support = ['shield', 'rally', 'embers', 'bell'].includes(fx.kind);
  const fade = <animate attributeName="opacity" values="0;1;.85;0" keyTimes="0;.08;.58;1" dur={duration} begin={begin} fill="freeze" />;
  const particles = Array.from({ length: fire ? 18 : 12 }, (_, i) => {
    const a = i * Math.PI * 2 / (fire ? 18 : 12), reach = 24 + (i % 4) * 9;
    return { x: Math.cos(a) * reach, y: Math.sin(a) * reach * .75, turn: a * 180 / Math.PI };
  });
  return <svg className="original-spell-effect" data-original-fx={fx.kind} width={L.w} height={L.h}
    viewBox={`0 0 ${L.w} ${L.h}`} aria-hidden="true" style={{ zIndex: 10 + (event.target.x + event.target.y) * 4 + 4,
      '--fx-color': fx.color, '--fx-accent': fx.accent }}>
    <defs>
      <radialGradient id={`${uid}light`}><stop stopColor={fx.accent} stopOpacity=".75" /><stop offset=".35" stopColor={fx.color} stopOpacity=".35" /><stop offset="1" stopColor={fx.color} stopOpacity="0" /></radialGradient>
      <linearGradient id={`${uid}edge`}><stop stopColor={fx.color} stopOpacity="0" /><stop offset=".55" stopColor={fx.color} /><stop offset="1" stopColor={fx.accent} /></linearGradient>
    </defs>
    {projectile && <>
      <path d={`M${start.x} ${start.y} L${end.x} ${end.y}`} stroke={`url(#${uid}edge)`} strokeWidth={3 * scale} opacity="0">
        <animate attributeName="opacity" values="0;.7;0" dur={`${travel + 100}ms`} fill="freeze" />
      </path>
      <g opacity="0"><animate attributeName="opacity" values="1;1;0" keyTimes="0;.95;1" dur={`${travel}ms`} fill="freeze" />
        <animateTransform attributeName="transform" type="translate" from={`${start.x} ${start.y}`} to={`${end.x} ${end.y}`} dur={`${travel}ms`} fill="freeze" />
        <g transform={`rotate(${angle}) scale(${scale})`}>
          {fx.kind === 'fireball' ? <><ellipse cx="-10" rx="29" ry="12" fill={`url(#${uid}light)`} /><path d="M-40,-5 Q-23,-16 -12,-6 Q4,-12 13,0 Q0,14 -17,7 L-37,11 -23,0Z" fill={fx.color} /><ellipse rx="8" ry="5" fill={fx.accent} /></>
            : <><path d="M-32,-2 L12,-2 24,0 12,3 -32,2Z" fill={fx.accent} /><path d="M-9,0 L12,-7 25,0 12,6Z" fill={fx.color} stroke={fx.accent} strokeWidth=".8" /><path d="M-31,0 L-37,-6 -25,-3 M-31,0 L-37,6 -25,3" fill={fx.accent} /></>}
        </g>
      </g>
    </>}
    {fx.kind === 'raven-step' ? [start, end].map((p, side) => <g key={side} transform={`translate(${p.x} ${p.y}) scale(${scale})`}>
      {Array.from({ length: 7 }, (_, i) => <g key={i} opacity="0">
        <animate attributeName="opacity" values="0;1;1;0" dur={full} fill="freeze" />
        <animateTransform attributeName="transform" type="translate" from={`${(i - 3) * 5} 12`} to={`${(i - 3) * 17} ${-30 - i * 8}`} dur={full} fill="freeze" />
        <path d="M0,0 Q-9,-18 -24,-12 L-14,-5 -4,-3 0,7 4,-3 14,-5 24,-12 Q9,-18 0,0Z" fill="#111725" stroke={fx.color} strokeWidth=".7">
          <animateTransform attributeName="transform" type="scale" values="1 1;1 .4;1 1" dur="210ms" repeatCount="indefinite" />
        </path>
      </g>)}
    </g>) : <>
      <g transform={`translate(${end.x} ${end.y}) scale(${scale})`} opacity="0">{fade}
        <ellipse rx={fire ? 72 : 50} ry={fire ? 55 : 42} fill={`url(#${uid}light)`} />
        {['slash', 'thrust'].includes(fx.kind) && <g transform={`rotate(${angle + 25})`}>
          <path d="M-50,23 Q-5,-58 49,-10 Q-3,-29 -37,28Z" fill={`url(#${uid}edge)`} />
          <path d="M-45,24 Q-5,-50 45,-12" fill="none" stroke={fx.accent} strokeWidth="2" />
          <animateTransform attributeName="transform" type="rotate" from={`${angle - 30}`} to={`${angle + 65}`} dur={duration} fill="freeze" />
        </g>}
        {shards && particles.map((p, i) => <g key={i}>
          <animateTransform attributeName="transform" type="translate" from="0 0" to={`${p.x} ${p.y}`} dur={duration} begin={begin} fill="freeze" />
          <path d="M0,-14 L5,1 0,8 -3,0Z" transform={`rotate(${p.turn})`} fill={i % 2 ? fx.color : '#182d3b'} stroke={fx.accent} strokeWidth=".8" />
        </g>)}
        {fire && particles.map((p, i) => <g key={i}>
          <animateTransform attributeName="transform" type="translate" from={`${p.x * .15} 18`} to={`${p.x} ${p.y - 32}`} dur={duration} begin={begin} fill="freeze" />
          <path d="M0,-13 Q9,1 2,8 Q-7,12 -5,2Z" fill={i % 3 ? fx.color : fx.accent} transform={`scale(${.45 + (i % 4) * .16})`} />
        </g>)}
        {fx.kind === 'shield' && <><path d="M-25,-33 L0,-42 25,-33 21,-2 Q17,16 0,28 Q-17,16 -21,-2Z" fill={fx.color} fillOpacity=".22" stroke={fx.accent} strokeWidth="2" /><path d="M0,-31 V17 M-15,-19 L0,-27 15,-19 M-14,-3 L0,7 14,-3" fill="none" stroke={fx.accent} strokeWidth="1.6" /></>}
        {fx.kind === 'rally' && <><path d="M-17,4 L-23,-16 -10,-11 0,-30 10,-11 23,-16 17,4 0,18Z" fill={fx.color} stroke={fx.accent} strokeWidth="1.5" /><path d="M-8,0 L-3,3 M8,0 L3,3" stroke={fx.accent} strokeWidth="2" /></>}
        {fx.kind === 'bell' && <path d="M-18,1 L-14,-17 Q-13,-37 0,-38 Q13,-37 14,-17 L18,1 25,5 -25,5Z M-5,6 Q0,19 5,6" fill={fx.color} fillOpacity=".6" stroke={fx.accent} strokeWidth="1.7" />}
      </g>
      {(support || fire || fx.kind === 'shatter') && [0, 1, 2].map(i => <g key={i} transform={`translate(${to.x} ${to.y}) scale(${scale} ${scale * .5})`}>
        <circle r="15" fill="none" stroke={i % 2 ? fx.color : fx.accent} strokeWidth="1.7" opacity="0">
          <animate attributeName="r" from={12 + i * 9} to={55 + i * 12 + (event.aoe?.length > 1 ? 22 : 0)} dur={duration} begin={begin} fill="freeze" />
          <animate attributeName="opacity" values="0;.7;0" dur={duration} begin={begin} fill="freeze" />
        </circle>
      </g>)}
    </>}
  </svg>;
}

export function OriginalMapProp({ obstacle, L, artwork, background }) {
  const p = L.ground(obstacle), size = L.hw * 2;
  const image = artwork?.images[background?.propsFile];
  if (image) {
    const { frame, size: span, left, top, zIndex } = mapPropLayout(obstacle, L);
    return <span className="original-map-prop original-map-prop-image" aria-hidden="true" data-original-prop={obstacle.prop}
      style={{ left, top, width: span, height: span, zIndex,
        backgroundImage: `url("${image}")`, backgroundSize: '300% 100%', backgroundPosition: `${frame * 50}% 0` }} />;
  }
  return <svg className="original-map-prop" width={size} height={size * 1.65} viewBox="0 0 100 165" aria-hidden="true"
    style={{ left: p.x - size / 2, top: p.y - size * 1.4, zIndex: 10 + (obstacle.x + obstacle.y) * 4 + 2 }}>
    <ellipse cx="50" cy="140" rx="44" ry="19" fill="#07111f" opacity=".3" />
    {obstacle.prop === 'pillar' ? <>
      <path d="M19,48 50,31 81,48 77,133 50,148 23,133Z" fill="#526573" stroke="#253949" strokeWidth="2" />
      <path d="M50,31 81,48 77,133 50,148Z" fill="#303f50" /><path d="M19,48 50,65 81,48 50,31Z" fill="#d3e6ec" />
      <path d="M23,79 50,93 79,77 M23,107 50,122 78,105 M50,65 V147" fill="none" stroke="#203241" strokeWidth="2" />
      <path d="M17,47 49,27 84,46 79,54 53,59 37,54 21,57Z" fill="#e2eff2" />
    </> : obstacle.prop === 'brazier' ? <>
      <path d="M27,111 33,143 M72,111 66,143 M49,115 V154" stroke="#202633" strokeWidth="6" />
      <ellipse cx="50" cy="136" rx="44" ry="25" fill="#ef9639" opacity=".14" />
      <g className="original-brazier-flame"><path d="M29,108 Q12,82 39,53 Q33,79 49,67 Q67,45 63,26 Q94,68 77,99 L60,120Z" fill="#e06726" /><path d="M36,110 Q24,93 51,65 Q45,83 63,79 Q78,99 60,116Z" fill="#ffc25c" /><path d="M45,113 Q34,104 55,87 Q66,105 57,118Z" fill="#fff1b2" /></g>
      <path d="M19,100 81,100 69,123 32,123Z" fill="#34343a" stroke="#171d27" strokeWidth="3" /><path d="M28,101 36,122 M43,101 45,122 M57,101 55,122 M72,101 64,122" stroke="#eda34a" strokeWidth="2" />
    </> : <>
      <path d="M13,137 28,86 69,144 M34,150 72,91 87,130" stroke="#342f2e" strokeWidth="8" />
      <path d="M15,100 77,127 87,116 24,88Z M21,123 67,105 73,116 25,136Z" fill="#77645a" stroke="#302d2d" strokeWidth="2" />
      <path d="M13,98 24,87 88,115 82,121 24,96Z" fill="#d3e5ed" />
      <path d="M36,100 45,79 48,106 M56,110 64,85 67,117" fill="#9dabb4" stroke="#465460" />
    </>}
  </svg>;
}
