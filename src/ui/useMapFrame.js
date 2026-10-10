import { useEffect, useMemo, useState } from 'react';
import { RETRO_BASE } from './RetroAssets';

const frames = new WeakMap();

// Tactical mode only draws cells. Scenery margins (sometimes larger than the
// terrain itself) must not determine its zoom. Keep the original projection,
// including elevations, and reserve headroom for fighters on playable cells.
export function tacticalMapFrame(map, board) {
  const hw = map?.hw || 1, hh = hw / 2;
  const originX = map?.originX ?? board.height;
  const originY = map?.top ?? hw * 2.4;
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (let y = 0; y < board.height; y++) for (let x = 0; x < board.width; x++) {
    const obstacle = board.obstacles[`${x},${y}`];
    if (obstacle?.type === 'VOID') continue;
    const cx = (x - y + originX) * hw;
    const cy = originY + (x + y + 1) * hh - (map?.elevations?.[`${x},${y}`] || 0);
    const headroom = !obstacle?.blocksMove ? hw * 3 : hh * (obstacle.blocksLos ? 1.8 : 1);
    left = Math.min(left, cx - hw);
    right = Math.max(right, cx + hw);
    top = Math.min(top, cy - headroom);
    bottom = Math.max(bottom, cy + hh);
  }
  if (!Number.isFinite(left)) return null;
  const padding = hw * .25;
  return { left: left - padding, top: top - padding,
    width: right - left + padding * 2, height: bottom - top + padding * 2 };
}

// Ignore transparent export margins, preserving all scenery and the space
// needed by a fighter on every walkable cell. Engine coordinates stay intact.
export function playableMapFrame(map, board, art) {
  let { left, top, right, bottom } = art;
  for (let y = 0; y < board.height; y++) for (let x = 0; x < board.width; x++) {
    if (board.obstacles[`${x},${y}`]?.blocksMove) continue;
    const cx = (x - y + (map.originX ?? board.height)) * map.hw;
    const cy = map.top + (x + y + 1) * map.hw / 2 - (map.elevations[`${x},${y}`] || 0);
    left = Math.min(left, cx - map.hw);
    right = Math.max(right, cx + map.hw);
    top = Math.min(top, cy - map.hw * 3);
    bottom = Math.max(bottom, cy + map.hw / 2);
  }
  left = Math.max(0, left - 6); top = Math.max(0, top - 6);
  right = Math.min(map.width, right + 6); bottom = Math.min(map.height, bottom + 6);
  return { left, top, width: right - left, height: bottom - top };
}

async function readMapFrame(map) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(map.width); canvas.height = Math.ceil(map.height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const images = await Promise.all(map.layers.map(async layer => {
    const img = new Image(); img.src = RETRO_BASE + layer.image; await img.decode(); return img;
  }));
  for (const img of images) context.drawImage(img, 0, 0, map.width, map.height);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  let left = canvas.width, top = canvas.height, right = 0, bottom = 0;
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    if (!data[(y * canvas.width + x) * 4 + 3]) continue;
    left = Math.min(left, x); right = Math.max(right, x + 1);
    top = Math.min(top, y); bottom = Math.max(bottom, y + 1);
  }
  return right > left && bottom > top ? { left, top, right, bottom } : null;
}

export default function useMapFrame(map, board, enabled, tactical = false) {
  const [result, setResult] = useState(null);
  const terrain = useMemo(() => enabled && tactical ? tacticalMapFrame(map, board) : null, [map, board, enabled, tactical]);
  useEffect(() => {
    if (!enabled || !map || tactical) return undefined;
    let cancelled = false;
    if (!frames.has(map)) frames.set(map, readMapFrame(map).catch(() => null));
    frames.get(map).then(art => {
      if (!cancelled) setResult({ map, frame: art ? playableMapFrame(map, board, art) : null });
    });
    return () => { cancelled = true; };
  }, [map, board, enabled, tactical]);
  const frame = tactical ? terrain : enabled && map && result?.map === map ? result.frame : null;
  const { left, top, width, height } = frame || {};
  // Combat snapshots clone the board. Identical bounds should not trigger a
  // layout change that resets an ongoing movement animation.
  return useMemo(() => width === undefined ? null : { left, top, width, height }, [left, top, width, height]);
}
