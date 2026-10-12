import { useEffect, useRef, useState } from 'react';
import { fighterUnderPointer } from './fighterHitTesting';
export { fighterUnderPointer } from './fighterHitTesting';

export default function useFighterInspection(matchKey, enabled = true, fighters = null) {
  const [inspection, setInspection] = useState(null);
  const invalid = !!(inspection && fighters && !(fighters[inspection.id]?.hp > 0));
  const closeTimer = useRef(null);
  const dismissed = useRef(null);
  const dialogRef = useRef(null);
  const keepOpen = () => clearTimeout(closeTimer.current);
  const closeSoon = () => {
    keepOpen();
    closeTimer.current = setTimeout(() => {
      if (!dialogRef.current?.contains(document.activeElement)) setInspection(null);
    }, 240);
  };
  const open = (id, anchor, focus = false) => {
    keepOpen();
    if (dismissed.current === id && !focus) return;
    dismissed.current = null;
    setInspection(old => old?.id === id && old.anchor === anchor && !focus ? old : { id, anchor, focus });
  };
  const dismiss = (restoreFocus = false) => {
    keepOpen();
    dismissed.current = inspection?.id;
    setInspection(null);
    if (restoreFocus && inspection?.anchor?.isConnected) inspection.anchor.focus({ preventScroll: true });
  };
  const pointerMove = (event, hit = fighterUnderPointer(event.currentTarget, event.clientX, event.clientY)) => {
    if (event.pointerType === 'touch' || event.target.closest?.('.fighter-inspector')) return;
    if (hit) open(hit.id, hit.anchor);
    else { dismissed.current = null; closeSoon(); }
  };
  const pointerLeave = () => { dismissed.current = null; closeSoon(); };

  useEffect(() => {
    if (!invalid) return;
    clearTimeout(closeTimer.current);
    setInspection(null);
    dismissed.current = null;
  }, [invalid]);
  useEffect(() => {
    setInspection(null); dismissed.current = null;
    if (!enabled) return undefined;
    const leaveBoard = event => {
      if (!event.target.closest?.('.board')) dismissed.current = null;
    };
    document.addEventListener('pointermove', leaveBoard);
    return () => { clearTimeout(closeTimer.current); document.removeEventListener('pointermove', leaveBoard); };
  }, [matchKey, enabled]);
  useEffect(() => {
    if (!inspection) return undefined;
    const escape = event => {
      if (event.key !== 'Escape') return;
      clearTimeout(closeTimer.current);
      dismissed.current = inspection.id;
      const restoreFocus = dialogRef.current?.contains(document.activeElement);
      setInspection(null);
      if (restoreFocus && inspection.anchor.isConnected) inspection.anchor.focus({ preventScroll: true });
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [inspection]);
  return { inspection: invalid ? null : inspection, dialogRef, open, dismiss, keepOpen, closeSoon, pointerMove, pointerLeave };
}
