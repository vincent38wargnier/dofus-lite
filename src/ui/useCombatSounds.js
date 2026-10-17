import { useEffect, useId, useRef } from 'react';
import { spellsOf } from '../engine/engine';
import { useRetroSoundPlayer, getActorId } from './RetroAssets';
import { facing } from './retroAnimation';
import { castFallbackSound, criticalSound, movementSounds } from './combatSounds';
import { createOriginalSoundPlayer } from './originalSounds';
import { originalCombatVisuals } from '../visuals/spellVisuals';

// Audio belongs to the action, not its damage rows. Movement jobs are scoped
// per fighter so another fighter's action cannot cut their footsteps off.
export default function useCombatSounds(frame, events, fighters, assets, appearances, scene, original = false) {
  const scope = useId();
  const player = useRetroSoundPlayer();
  const previous = useRef({ scene, frame: -1 });
  const moves = useRef(new Map());
  const directions = useRef(new Map());
  const authoredPlayer = useRef(null);
  authoredPlayer.current ||= createOriginalSoundPlayer();

  useEffect(() => {
    if (!assets && !original) return;
    const stopMove = id => { clearInterval(moves.current.get(id)); moves.current.delete(id); };
    const reset = previous.current.scene !== scene || frame < previous.current.frame || frame > previous.current.frame + 1;
    if (reset) {
      for (const id of moves.current.keys()) stopMove(id);
      player?.stopScope(scope);
      authoredPlayer.current.stop();
      directions.current.clear();
    }
    if (!reset && previous.current.frame === frame) return;
    previous.current = { scene, frame };
    const play = name => { if (name) window.dofusLiteSound?.(name, scope); };
    for (const event of events || []) {
      const fighter = fighters[event.fighter];
      if (!assets || originalCombatVisuals(original, fighter) || event.visualEffect) {
        if (event.t === 'cast') {
          if (event.crit) authoredPlayer.current.play('critical');
          authoredPlayer.current.play(event.visualEffect?.kind || 'slash');
        }
        if (event.t === 'spell_fail') authoredPlayer.current.play('failure');
        if (['cast', 'spell_fail', 'move', 'death'].includes(event.t)) stopMove(event.fighter);
        if (event.t === 'move' && event.path?.length > 1 && fighter?.hp > 0) {
          let remaining = event.path.length - 1;
          const step = () => { authoredPlayer.current.play('step'); if (--remaining <= 0) stopMove(event.fighter); };
          if (remaining > 1) moves.current.set(fighter.id, setInterval(step, 130));
          step();
        }
        continue;
      }
      const actor = assets.actors[getActorId(assets, fighter || {}, appearances[fighter?.team])];
      if (['cast', 'spell_fail', 'move', 'death'].includes(event.t)) stopMove(event.fighter);
      play(criticalSound(event, assets));
      if (!fighter) continue;
      let direction = directions.current.get(fighter.id) || { suffix: 'R', mirror: fighter.team === 'B' };
      if (event.t === 'cast') {
        direction = facing(event.from, event.target, direction);
        directions.current.set(fighter.id, direction);
        play(castFallbackSound(event, spellsOf(fighter)[event.spell], actor, assets, direction));
      }
      if (event.t === 'move' && event.path?.length > 1 && fighter.hp > 0) {
        const cues = movementSounds(actor, fighter, assets);
        const steps = event.path.length - 1;
        let index = 0;
        const step = () => {
          direction = facing(event.path[index], event.path[index + 1], direction);
          directions.current.set(fighter.id, direction);
          play(cues[index % cues.length]);
          if (++index >= steps) stopMove(fighter.id);
        };
        if (steps > 1) moves.current.set(fighter.id, setInterval(step, 130));
        step();
      }
    }
    // A frame's immutable events are consumed once; hovers and stats refreshes
    // must never repeat sounds. A new manifest can supply missing metadata.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, scene, assets, player, scope, original]);

  useEffect(() => {
    const jobs = moves.current;
    return () => {
      for (const timer of jobs.values()) clearInterval(timer);
      jobs.clear();
      player?.stopScope(scope);
    };
  }, [player, scope]);
  useEffect(() => { const sound = authoredPlayer.current; return () => sound.close(); }, []);
  return scope;
}
