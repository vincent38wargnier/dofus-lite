import { useEffect, useRef, useState } from 'react';
import { castAnimation, facing, resolveAnimation } from './retroAnimation';

// Only an action involving this fighter can replace its current gesture. In
// particular, an opponent's action must not restart it or cancel its timer.
export default function useFighterAnimation(fighter, events, frame, actor, assets) {
  const [motion, setMotion] = useState(() => ({
    pose: 'static', direction: { suffix: 'R', mirror: fighter.team === 'B' },
    restart: 0, position: null,
  }));
  const current = useRef(motion);
  const timer = useRef();
  const walkTimer = useRef();
  const previous = useRef({ frame: -1, hp: fighter.hp, pos: fighter.pos });

  useEffect(() => {
    const update = patch => {
      current.current = { ...current.current, ...patch };
      setMotion(current.current);
    };
    const cast = events?.find(e => e.t === 'cast' && e.fighter === fighter.id && castAnimation(e, assets) !== null);
    const move = events?.find(e => e.t === 'move' && e.fighter === fighter.id && e.path?.length > 1);
    const damaged = events?.some(e => e.t === 'damage' && e.target === fighter.id);
    const died = fighter.hp <= 0 && previous.current.hp > 0;
    const rewind = frame < previous.current.frame;
    const displaced = previous.current.pos.x !== fighter.pos.x || previous.current.pos.y !== fighter.pos.y;
    previous.current = { frame, hp: fighter.hp, pos: fighter.pos };
    if (!(cast || move || damaged || died || rewind || displaced)) return;

    clearInterval(walkTimer.current);
    // Being pushed or teleported does not turn a sprite in the original client.
    update({ position: null });
    if (!(cast || move || damaged || died || rewind)) return;
    clearTimeout(timer.current);
    let direction = current.current.direction;
    if (cast) direction = facing(cast.from, cast.target, direction);
    const pose = fighter.hp <= 0 ? 'die' : cast ? castAnimation(cast, assets)
      : damaged ? 'hit' : 'static';
    update({ pose, direction, restart: current.current.restart + 1 });

    if (move && !cast && fighter.hp > 0) {
      const path = move.path;
      let step = 0;
      update({ pose: 'walk', position: path[0], direction: facing(path[0], path[1], direction) });
      walkTimer.current = setInterval(() => {
        step += 1;
        if (step >= path.length - 1) {
          clearInterval(walkTimer.current);
          update({ pose: 'static', position: null });
        } else {
          update({ position: path[step], direction: facing(path[step], path[step + 1], current.current.direction) });
        }
      }, 130);
    } else if (pose !== 'static' && pose !== 'die') {
      const label = resolveAnimation(actor, pose, direction.suffix);
      const duration = actor?.durations?.[label] || (pose === 'hit' ? 600 : 1100);
      timer.current = setTimeout(() => update({ pose: 'static' }), Math.max(350, duration));
    }
    // Frame events are immutable during a combat step; hovers don't replay them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, fighter.id, actor, assets]);
  useEffect(() => () => {
    clearTimeout(timer.current);
    clearInterval(walkTimer.current);
  }, []);
  return motion;
}
