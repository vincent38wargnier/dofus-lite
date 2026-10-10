import { createSoundPlayer, readSoundSettings, resolveSound, saveSoundSettings } from '../ui/RetroSound';

const library = {
  cues: { VLAD_806: { url: 'pressure.mp3', volume: .4, offset: 0 }, 61: { url: 'pressure.mp3', volume: .4 } },
  effects: { 'Tynril_Hit': 'hit.mp3' },
};

function setup() {
  const clips = [];
  const player = createSoundPlayer('/local/', url => {
    const audio = { url, play: jest.fn(() => Promise.resolve()), pause: jest.fn() };
    clips.push(audio);
    return audio;
  });
  player.setLibrary(library);
  player.configure({ enabled: true, volume: .5 });
  return { player, clips };
}

test('original aliases and numeric IDs resolve to their recordings and authored gain', () => {
  expect(resolveSound(library, 'vlad_806')).toEqual(library.cues.VLAD_806);
  expect(resolveSound(library, 61).url).toBe('pressure.mp3');
  expect(resolveSound(library, 'Tynril_Hit').url).toBe('hit.mp3');
  expect(resolveSound(library, 'missing')).toBeNull();
  const { player, clips } = setup();
  player.play('vlad_806', 'spell');
  expect(clips[0].url).toBe('/local/pressure.mp3');
  expect(clips[0].volume).toBeCloseTo(.2);
  expect(clips[0].play).toHaveBeenCalledTimes(1);
});

test('muting stops active sounds immediately and ignores subsequent cues', () => {
  const { player, clips } = setup();
  player.play('vlad_806');
  player.configure({ enabled: false, volume: .5 });
  expect(clips[0].pause).toHaveBeenCalledTimes(1);
  player.play('vlad_806');
  expect(clips).toHaveLength(1);
  player.configure({ enabled: true, volume: 0 });
  player.play('vlad_806');
  expect(clips).toHaveLength(1);
});

test('volume changes affect current voices; leaving one movie stops only its voices', () => {
  const { player, clips } = setup();
  player.play('vlad_806', 'spell');
  player.play('Tynril_Hit', 'actor');
  player.configure({ enabled: true, volume: .25 });
  expect(clips.map(c => c.volume)).toEqual([.1, .25]);
  player.stopScope('spell');
  expect(clips[0].pause).toHaveBeenCalledTimes(1);
  expect(clips[1].pause).not.toHaveBeenCalled();
  player.stopScope();
  expect(clips[1].pause).toHaveBeenCalledTimes(1);
});

test('burst playback replaces the oldest voice and handles unavailable audio', async () => {
  const { player, clips } = setup();
  player.play('missing');
  expect(clips).toHaveLength(0);
  for (let i = 0; i < 13; i++) player.play('vlad_806', i);
  expect(clips[0].pause).toHaveBeenCalledTimes(1);
  expect(clips[12].play).toHaveBeenCalledTimes(1);
  clips[12].onerror();
  expect(clips[12].pause).toHaveBeenCalledTimes(1);
  const refused = { play: () => Promise.reject(new Error('autoplay blocked')), pause: jest.fn() };
  const other = createSoundPlayer('/', () => refused);
  other.setLibrary(library);
  other.configure({ enabled: true, volume: .5 });
  other.play('vlad_806');
  await Promise.resolve();
  expect(refused.pause).toHaveBeenCalledTimes(1);
});

test('mute and volume survive reload, with safe defaults for invalid storage', () => {
  localStorage.clear();
  expect(readSoundSettings()).toEqual({ enabled: true, volume: .35 });
  saveSoundSettings({ enabled: false, volume: .6 });
  expect(readSoundSettings()).toEqual({ enabled: false, volume: .6 });
  localStorage.setItem('dofus-lite-sound', 'invalid');
  expect(readSoundSettings()).toEqual({ enabled: true, volume: .35 });
});
