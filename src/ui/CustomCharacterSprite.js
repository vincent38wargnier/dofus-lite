import React, { useEffect, useId, useRef, useState } from 'react';
import { characterArtworkFrame } from './characterArtwork';
import { imageAlphaMask, imageMaskContains, registerSpriteHitTest } from './fighterHitTesting';
import '../styles/characterArtwork.css';

export default function CustomCharacterSprite({ artwork, pose = 'static', direction = { suffix: 'R', mirror: false }, restart = 0, className = '', castSound }) {
  const soundScope = useId();
  const file = characterArtworkFrame(artwork, pose, direction.suffix);
  const [tick, setTick] = useState({ key: '', frame: 0 });
  const key = `${artwork.id}:${file.name}:${restart}`;
  const frame = tick.key === key ? tick.frame : 0;
  const sprite = useRef(null);
  const current = useRef(null);
  current.current = { frame, mirrored: direction.mirror };
  useEffect(() => {
    const element = sprite.current, image = new Image();
    let mask = null;
    const unregister = registerSpriteHitTest(element, (x, y) => mask
      ? imageMaskContains(mask, element.getBoundingClientRect(), x, y, file.frames, current.current.frame, current.current.mirrored)
      : null);
    image.onload = () => { try { mask = imageAlphaMask(image); } catch (_) { /* Keep the fallback for unreadable images. */ } };
    image.src = artwork.images[file.name];
    return () => { image.onload = null; unregister(); };
  }, [artwork, file.name, file.frames]);
  useEffect(() => { if (castSound) window.dofusLiteSound?.(castSound, soundScope); }, [castSound, soundScope, key]);
  useEffect(() => {
    setTick({ key, frame: 0 });
    if (file.frames === 1) return undefined;
    let step = 0;
    const timer = setInterval(() => {
      step++;
      setTick({ key, frame: file.pose === 'walk' ? step % file.frames : Math.min(step, file.frames - 1) });
      if (file.pose !== 'walk' && step >= file.frames - 1) clearInterval(timer);
    }, 1000 / file.fps);
    return () => clearInterval(timer);
  }, [key, file]);
  return <span ref={sprite} id={`retro-sound-${soundScope}`} className={`custom-character-sprite ${className}`} aria-hidden="true" data-artwork-id={artwork.id} data-artwork-file={file.name} data-artwork-frame={frame}
    style={{ backgroundImage: `url("${artwork.images[file.name]}")`, backgroundSize: `${file.frames * 100}% 100%`,
      backgroundPosition: `${file.frames === 1 ? 0 : frame * 100 / (file.frames - 1)}% 0`, transform: direction.mirror ? 'scaleX(-1)' : undefined }} />;
}
