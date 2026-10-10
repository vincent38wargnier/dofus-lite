import React, { useEffect, useRef, useState } from 'react';
import { healthChangeGroups } from './healthChanges';

export const HEALTH_FLOAT_MS = 1100;

// Adjacent fighters can have heads only a few pixels apart in the isometric
// projection. Reserve a column for each position over the full upward motion.
function layoutFloats(floats, L) {
  const columns = new Map();
  for (const f of floats) {
    const key = `${f.target}:${f.pos.x},${f.pos.y}`;
    const p = L.head(f.pos);
    const width = Math.max(64, (String(f.amount).length + 1) * 14 + 12);
    const top = p.y - 48 - f.lane * 34;
    if (!columns.has(key)) columns.set(key, { x: p.x, width: 0, top, bottom: top, floats: [] });
    const c = columns.get(key);
    c.width = Math.max(c.width, width);
    c.top = Math.min(c.top, top - 40);
    c.bottom = Math.max(c.bottom, top + 32);
    c.floats.push({ ...f, top });
  }
  const placed = [];
  for (const c of [...columns.values()].sort((a, b) => a.x - b.x)) {
    for (const other of placed) {
      if (c.top >= other.bottom || c.bottom <= other.top) continue;
      if (c.x - c.width / 2 < other.x + other.width / 2 + 10) c.x = other.x + (other.width + c.width) / 2 + 10;
    }
    placed.push(c);
  }
  return placed.flatMap(c => c.floats.map(f => ({ ...f, left: c.x, width: c.width })));
}

export default function HealthChangeFloats({ frameEvents, frameIdx, fighters, L }) {
  const [floats, setFloats] = useState([]);
  const previous = useRef(null);
  useEffect(() => {
    if (previous.current === frameIdx) return;
    const rewind = previous.current !== null && frameIdx < previous.current;
    previous.current = frameIdx;
    const now = Date.now();
    const next = healthChangeGroups(frameEvents).filter(g => g.t === 'damage' || g.amount > 0);
    setFloats(current => {
      const active = rewind ? [] : current.filter(f => f.expiresAt > now);
      for (const group of next) {
        const fighter = fighters.find(f => f.id === group.target);
        if (!fighter) continue;
        // Put the latest number below older ones. All rise together; putting
        // the latest above would let the older animation catch up with it.
        for (let i = 0; i < active.length; i++) {
          if (active[i].target === group.target) active[i] = { ...active[i], lane: active[i].lane + 1 };
        }
        active.push({ ...group, id: `${frameIdx}:${group.id}`, pos: { ...fighter.pos }, lane: 0,
          expiresAt: now + HEALTH_FLOAT_MS });
      }
      return active;
    });
    // Capture the position once per action. Hover, resize and movement must not
    // restart a number or cut short a previous action's animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameIdx]);

  useEffect(() => {
    if (!floats.length) return undefined;
    const timer = setTimeout(() => setFloats(current => current.filter(f => f.expiresAt > Date.now())),
      Math.max(0, Math.min(...floats.map(f => f.expiresAt)) - Date.now()));
    return () => clearTimeout(timer);
  }, [floats]);

  const visible = floats.filter(f => fighters.some(fighter => fighter.id === f.target));
  return layoutFloats(visible, L).map(f => {
    return <div key={f.id} className={`float-text health-change ${f.t === 'damage' ? 'dmg' : 'heal'}`}
      data-target={f.target} data-action-id={f.actionId} data-health-lines={f.lines.length}
      style={{ left: f.left, top: f.top, width: f.width }}>
      {f.t === 'damage' ? '−' : '+'}{f.amount}
    </div>;
  });
}
