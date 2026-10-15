import { useEffect, useRef, useState } from 'react';

export const CAMERA_MIN = 1;
export const CAMERA_MAX = 4;
export const fitCamera = () => ({ zoom: 1, x: 0, y: 0 });
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export function clampCamera(camera, size) {
  const zoom = clamp(camera.zoom, CAMERA_MIN, CAMERA_MAX);
  const x = Math.max(0, (size.width * zoom - size.viewportWidth) / 2);
  const y = Math.max(0, (size.height * zoom - size.viewportHeight) / 2);
  return { zoom, x: clamp(camera.x, -x, x) || 0, y: clamp(camera.y, -y, y) || 0 };
}
export function zoomCamera(camera, zoom, point, size) {
  const next = clamp(zoom, CAMERA_MIN, CAMERA_MAX), ratio = next / camera.zoom;
  return clampCamera({ zoom: next, x: point.x - (point.x - camera.x) * ratio,
    y: point.y - (point.y - camera.y) * ratio }, size);
}

// Camera transforms never alter game coordinates. The regular pixel-aware
// target resolver continues to use transformed DOM rectangles.
export default function useBoardCamera(ref, size, identity, clearHover) {
  const [camera, setCamera] = useState(fitCamera);
  const [dragging, setDragging] = useState(false);
  const current = useRef(camera), bounds = useRef(size), pointers = useRef(new Map());
  const gesture = useRef(null), suppressClick = useRef(false), clear = useRef(clearHover);
  bounds.current = size; clear.current = clearHover;
  const update = value => { current.current = clampCamera(value, bounds.current); setCamera(current.current); };
  const local = (x, y) => {
    const rect = ref.current.getBoundingClientRect();
    return { x: x - rect.left - bounds.current.viewportWidth / 2, y: y - rect.top - bounds.current.viewportHeight / 2 };
  };
  useEffect(() => { current.current = fitCamera(); setCamera(current.current); pointers.current.clear(); gesture.current = null; setDragging(false); }, [identity]);
  useEffect(() => {
    const next = clampCamera(current.current, size); current.current = next; setCamera(next);
  }, [size.width, size.height, size.viewportWidth, size.viewportHeight]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const element = ref.current;
    const wheel = event => {
      if (event.target.closest('button, input, select, [role="dialog"]')) return;
      event.preventDefault(); clear.current?.();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 300 : 1);
      update(zoomCamera(current.current, current.current.zoom * Math.exp(-clamp(delta, -100, 100) * .003), local(event.clientX, event.clientY), bounds.current));
    };
    element?.addEventListener('wheel', wheel, { passive: false });
    return () => element?.removeEventListener('wheel', wheel);
  }, [ref]); // eslint-disable-line react-hooks/exhaustive-deps
  const pinch = () => {
    const [a, b] = [...pointers.current.values()];
    return { distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), point: local((a.x + b.x) / 2, (a.y + b.y) / 2) };
  };
  const handlers = {
    onPointerDownCapture(event) {
      if (!pointers.current.size) suppressClick.current = false;
      if (event.button > 0 || event.target.closest('button, input, select, [role="dialog"]')) return;
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      gesture.current = { camera: current.current, x: event.clientX, y: event.clientY,
        ...(pointers.current.size === 2 ? { pinch: pinch() } : {}) };
      if (pointers.current.size > 1) { suppressClick.current = true; clear.current?.(); }
    },
    onPointerMoveCapture(event) {
      if (!pointers.current.has(event.pointerId) || !gesture.current) return;
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const start = gesture.current, dx = event.clientX - start.x, dy = event.clientY - start.y;
      if (pointers.current.size > 1 && start.pinch) {
        const now = pinch(), next = zoomCamera(start.camera, start.camera.zoom * now.distance / start.pinch.distance, start.pinch.point, bounds.current);
        update({ ...next, x: next.x + now.point.x - start.pinch.point.x, y: next.y + now.point.y - start.pinch.point.y });
      } else if (Math.hypot(dx, dy) >= 6 || suppressClick.current) {
        update({ ...start.camera, x: start.camera.x + dx, y: start.camera.y + dy });
      } else return;
      suppressClick.current = true; setDragging(true); clear.current?.();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      event.preventDefault(); event.stopPropagation();
    },
    onPointerUpCapture(event) {
      pointers.current.delete(event.pointerId);
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      if (pointers.current.size) {
        const point = pointers.current.values().next().value;
        gesture.current = { ...point, camera: current.current };
      } else { gesture.current = null; setDragging(false); }
    },
    onPointerCancel(event) { pointers.current.clear(); gesture.current = null; setDragging(false); suppressClick.current = true; },
    onClickCapture(event) {
      if (suppressClick.current && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); }
    },
  };
  return { ...camera, dragging, handlers,
    style: { transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`, transformOrigin: 'center',
      '--board-ui-scale': 1 / camera.zoom },
    zoomBy: factor => { clear.current?.(); update(zoomCamera(current.current, current.current.zoom * factor, { x: 0, y: 0 }, bounds.current)); },
    reset: () => { clear.current?.(); update(fitCamera()); },
    focus: point => { clear.current?.(); update({ ...current.current,
      x: (bounds.current.width / 2 - point.x) * current.current.zoom,
      y: (bounds.current.height / 2 - point.y) * current.current.zoom }); },
  };
}
