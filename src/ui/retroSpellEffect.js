// SpellManager.onLoadInit in the installed Retro loader (init-21060).
// Coordinates are native Flash pixels; the target is our stage's origin.
export function spellEffectPlan({ type = 11, fps = 60, duration = 2200, exportFrames = {} }, from, to, scale = 1, grade = 5) {
  const source = { x: (from.x - to.x) / scale, y: (from.y - to.y) / scale };
  const dx = -source.x, dy = -source.y;
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  const casterAnchored = [10, 12, 20, 21, 30, 31, 40, 41].includes(type);
  const origin = casterAnchored ? { ...source } : { x: 0, y: 0 };
  let sx = 1, sy = 1;
  const motion = [];
  // The adapter plays the client in its 60 FPS mode. This is the client's
  // TRIPLEFRAMERATE branch, including the two skipped trail spawn frames.
  if (type === 30 || type === 31) {
    origin.y -= 10;
    sx = dx <= 0 ? -1 : 1;
    sy = dx === 0 && dy < 0 ? -1 : 1;
    const width = Math.abs(dx), height = dy * sy;
    const start = (Math.atan2(dy, width) + Math.PI / 2) * (type === 31 ? .9 : .5) - Math.PI / 2;
    const vx = width === 0 ? 0 : Math.sqrt(4.905 * width * width / Math.abs(height - Math.tan(start) * width));
    const vy = Math.tan(start) * vx;
    const dt = (type === 31 ? .5 : .675) / 3;
    for (let i = 0; i < 1800; i += 1) {
      const t = i * dt, x = t * vx, y = 4.905 * t * t + vy * t;
      const rotation = Math.atan2(vy + 9.81 * t, vx) * 180 / Math.PI;
      if ((Math.abs(y) >= Math.abs(height) && x >= width) || x > width) {
        motion.push([2, width, height, rotation]);
        break;
      }
      motion.push([1, x, y, rotation]);
    }
  } else if (type === 40 || type === 41) {
    const distance = Math.hypot(dx, dy);
    const steps = Math.floor(distance / (20 / 3));
    // A coincident or sub-step target must finish rather than divide by zero.
    for (let i = 1; i <= steps + 3; i += 1) {
      if ((i - 1) % 3 !== 0) motion.push([0, 0, 0, 0]);
      else if (i > steps) { motion.push([type === 41 ? 2 : 0, dx, dy, 0]); break; }
      else motion.push([3, dx * i / steps, dy * i / steps, 0]);
    }
  }
  const tail = Math.max(exportFrames.shoot || 0, exportFrames.duplicate || 0);
  const totalDuration = Math.max(duration, (motion.length + tail) / fps * 1000);
  const points = [source, { x: 0, y: 0 }, ...motion.filter(row => row[0]).map(row => ({
    x: origin.x + row[1] * sx, y: origin.y + row[2] * sy,
  }))];
  const bounds = [Math.floor(Math.min(...points.map(p => p.x))) - 200,
    Math.ceil(Math.max(...points.map(p => p.x))) + 200,
    Math.floor(Math.min(...points.map(p => p.y))) - 200,
    Math.ceil(Math.max(...points.map(p => p.y))) + 200];
  const parameters = {
    effectType: type, effectX: origin.x, effectY: origin.y, effectScaleX: sx * 100, effectScaleY: sy * 100,
    fromX: source.x, fromY: source.y, toX: 0, toY: 0, targetX: dx, targetY: dy,
    spellLevel: grade, effectAngle: angle,
    motion: motion.map(row => row.map(n => Math.round(n * 10000) / 10000).join(',')).join(';'),
  };
  return { parameters: Object.fromEntries(Object.entries(parameters).map(([key, value]) => [key, String(value)])),
    bounds, duration: totalDuration, motion };
}

// Give each effect a stage large enough for its entire trajectory. Changing
// only the header keeps all the client's original vector clips and scripts.
export async function withStageBounds(buffer, bounds) {
  const data = new Uint8Array(buffer);
  let body;
  if (data[0] === 67) {
    body = new Uint8Array(await new Response(new Blob([data.slice(8)])
      .stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
  } else if (data[0] === 70) body = data.slice(8);
  else throw new Error('Format SWF non pris en charge');
  const oldSize = Math.ceil((5 + 4 * (body[0] >> 3)) / 8);
  const values = bounds.map(n => Math.round(n * 20));
  const bits = Math.max(...values.map(n => Math.ceil(Math.log2(Math.abs(n) + 1)) + 1));
  const rect = new Uint8Array(Math.ceil((5 + bits * 4) / 8));
  let cursor = 0;
  const write = (value, width) => {
    for (let i = width - 1; i >= 0; i -= 1, cursor += 1) rect[cursor >> 3] |= ((value >> i) & 1) << (7 - cursor % 8);
  };
  write(bits, 5);
  values.forEach(value => write(value, bits));
  const result = new Uint8Array(8 + rect.length + body.length - oldSize);
  result.set(data.slice(0, 8)); result[0] = 70;
  new DataView(result.buffer).setUint32(4, result.length, true);
  result.set(rect, 8); result.set(body.slice(oldSize), 8 + rect.length);
  return result.buffer;
}
