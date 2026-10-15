import React from 'react';
import { render, act, cleanup } from '@testing-library/react';
import OriginalSpellEffect from '../ui/OriginalSpellEffect';
import { makeLayout } from '../ui/BoardView';
import { createOriginalSoundPlayer } from '../ui/originalSounds';
import { ORIGINAL_EFFECTS } from '../visuals/spellVisuals';
const event = kind => ({ from: { x: 2, y: 2 }, target: { x: 5, y: 3 }, visualEffect: { version: 1, kind, color: '#69bde6', accent: '#ffffff', durationMs: 1000 } });
afterEach(() => { cleanup(); jest.useRealTimers(); jest.restoreAllMocks(); localStorage.clear(); });

test('all original effects use vectors, scale to the board, expire, and do not restart on resizing', () => {
  jest.useFakeTimers();
  for (const kind of ORIGINAL_EFFECTS) {
    const onComplete = jest.fn(), e = event(kind);
    const { container, rerender, unmount } = render(<OriginalSpellEffect event={e} L={makeLayout(13, 13, 1200, null, 700)} onComplete={onComplete} />);
    expect(container.querySelector(`[data-original-fx="${kind}"]`)).not.toBeNull();
    expect(container.querySelectorAll('image, img, iframe, video, audio, canvas')).toHaveLength(0);
    act(() => jest.advanceTimersByTime(500));
    rerender(<OriginalSpellEffect event={e} L={makeLayout(13, 13, 500, null, 500)} onComplete={onComplete} />);
    act(() => jest.advanceTimersByTime(499)); expect(onComplete).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(1)); expect(onComplete).toHaveBeenCalledTimes(1);
    unmount();
  }
});

test('new sound cues synthesize audio, respect mute and volume, and release their context', () => {
  const previous = window.AudioContext, sources = [], nodes = [];
  const param = () => ({ value: 0, setValueAtTime: jest.fn(), exponentialRampToValueAtTime: jest.fn() });
  const node = () => { const n = { frequency: param(), gain: param(), connect: jest.fn(), disconnect: jest.fn(), start: jest.fn(), stop: jest.fn() }; nodes.push(n); return n; };
  const close = jest.fn(async () => {});
  window.AudioContext = jest.fn(() => ({ currentTime: 0, state: 'running', sampleRate: 8000, destination: {}, close,
    createOscillator: () => { const n = node(); sources.push(n); return n; }, createGain: node, createBiquadFilter: node,
    createBuffer: (_, length) => ({ getChannelData: () => new Float32Array(length) }),
    createBufferSource: () => { const n = node(); sources.push(n); return n; } }));
  try {
    const player = createOriginalSoundPlayer();
    localStorage.setItem('dofus-lite-sound', JSON.stringify({ enabled: false, volume: .5 }));
    player.play('fireball'); expect(window.AudioContext).not.toHaveBeenCalled();
    localStorage.setItem('dofus-lite-sound', JSON.stringify({ enabled: true, volume: .5 }));
    for (const kind of [...ORIGINAL_EFFECTS, 'step', 'critical', 'failure']) player.play(kind);
    expect(sources.length).toBeGreaterThan(20); expect(sources.every(n => n.start.mock.calls.length === 1)).toBe(true);
    localStorage.setItem('dofus-lite-sound', JSON.stringify({ enabled: true, volume: 0 }));
    const count = sources.length; player.play('bell'); expect(sources).toHaveLength(count);
    player.close(); expect(close).toHaveBeenCalledTimes(1); expect(sources.every(n => n.stop.mock.calls.length > 0)).toBe(true);
  } finally { window.AudioContext = previous; }
});
