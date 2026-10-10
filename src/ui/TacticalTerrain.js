import React from 'react';
import { key } from '../engine/geometry';

// The local client's clips/gfx/tactic.swf uses neutral diamonds and simple
// volumes. Draw that view directly from combat collision flags so decoration
// can never imply a different movement or line-of-sight rule.
export function tacticalCellKind(obstacle) {
  if (obstacle?.type === 'VOID') return 'void';
  if (obstacle?.blocksLos) return 'sight';
  return obstacle?.blocksMove ? 'movement' : 'free';
}

export const TACTICAL_LABELS = {
  free: 'Case libre',
  movement: 'Déplacement bloqué, ligne de vue libre',
  sight: 'Déplacement et ligne de vue bloqués',
};

export default React.memo(function TacticalTerrain({ L, board, uid }) {
  const cells = [];
  for (let y = 0; y < board.height; y++) {
    for (let x = 0; x < board.width; x++) {
      const kind = tacticalCellKind(board.obstacles[key(x, y)]);
      if (kind !== 'void') cells.push({ x, y, kind });
    }
  }
  cells.sort((a, b) => (a.x + a.y) - (b.x + b.y));
  const rise = L.hh * .8;
  return <svg className="terrain tactical-terrain" width={L.w} height={L.h} aria-hidden="true">
    <defs><pattern id={`${uid}-blocked`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
      <line x1="0" y1="0" x2="0" y2="7" stroke="#a4afb2" strokeOpacity=".3" strokeWidth="2" />
    </pattern></defs>
    {cells.map(({ x, y, kind }) => {
      const X = L.cx(x, y), Y = L.cy(x, y), { hw, hh } = L;
      return <g key={key(x, y)} data-cell={key(x, y)} data-terrain={kind}>
        <polygon className={`tactical-tile ${kind} parity-${(x + y) % 2}`} points={L.diamond(x, y)} />
        {kind === 'movement' && <polygon points={L.diamond(x, y)} fill={`url(#${uid}-blocked)`} />}
        {kind === 'sight' && <>
          <polygon className="tactical-wall-left" points={`${X - hw},${Y - rise} ${X},${Y + hh - rise} ${X},${Y + hh} ${X - hw},${Y}`} />
          <polygon className="tactical-wall-right" points={`${X},${Y + hh - rise} ${X + hw},${Y - rise} ${X + hw},${Y} ${X},${Y + hh}`} />
          <polygon className="tactical-wall-top" points={L.diamond(x, y)} transform={`translate(0 ${-rise})`} />
        </>}
      </g>;
    })}
  </svg>;
});
