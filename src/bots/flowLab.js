import { compileBot } from './compile';
import { runMatchAsync } from '../arena/runner';

export const TRACE_LIMIT=180;
export function actionLabel(action,view) {
  if(!action)return 'Aucune action';
  const pos=action.target||action.to;
  const target=pos&&[view.you,...(view.allies||[]),...(view.enemies||[])].find(f=>!f.hidden&&f.pos.x===pos.x&&f.pos.y===pos.y);
  if(action.type==='CAST')return `${view.you.spells.find(s=>s.key===action.spell)?.name||action.spell} → ${target?.name||`case ${pos.x}, ${pos.y}`}`;
  if(action.type==='MOVE')return `Déplacement → ${pos.x}, ${pos.y}`;
  return action.type==='PASS'?'Fin de tour':action.text||action.type;
}
// Real referee, fresh functions for both sides, mirrored seats and equal RNG
// seeds within each pair. Only the bot's public view enters the debugger.
export async function runFlowLab({code,opponentCode,mine,opponent,seed=12000,mapId='arene',count=1}, {signal,onProgress,onGame,yieldControl}={}) {
  if(!Number.isSafeInteger(seed)||seed<0||seed>2147483647)throw new Error('Graine : entier entre 0 et 2 147 483 647.');
  if(![1,6].includes(count))throw new Error('Choisissez 1 ou 6 combats.');
  const games=[];
  for(let i=0;i<count;i++){
    if(signal?.aborted)throw new DOMException('Simulation annulée','AbortError');
    const side=i%2===0?'A':'B', other=side==='A'?'B':'A', entries=[], decide=compileBot(code), rival=compileBot(opponentCode);
    let totalDecisions=0;
    const tracked=(view,api)=>{
      totalDecisions++; if(entries.length>=TRACE_LIMIT)return decide(view,api);
      const entry={turn:view.turn,fighter:view.you.name,view,steps:[],plans:[]};
      api.flowTrace=step=>entry.steps.push(step);
      api.flowInspect=plan=>entry.plans.push(plan);
      // Builtin Maison calls the identical planner, with diagnostics enabled.
      api.maison=()=>api.plan({base:'maison',kind:'auto',weights:{}},api.flowInspect);
      try {entry.action=decide(view,api);return entry.action;}
      catch(e){entry.error=e.message;throw e;}
      finally{entries.push(entry);}
    };
    const config={bots:{[side]:{name:mine.name,decide:tracked},[other]:{name:opponent.name,decide:rival}},
      classes:{[side]:mine.classId,[other]:opponent.classId},loadouts:{[side]:mine.loadout,[other]:opponent.loadout},
      seed:seed+Math.floor(i/2),mapId:count===1?mapId:['arene','muraille','canyon'][Math.floor(i/2)],collectFrames:false};
    const match=await runMatchAsync(config,{signal,yieldControl,onProgress:p=>onProgress?.({game:i+1,count,...p})});
    const s=match.stats[side], o=match.stats[other];
    const game={index:i,side,seed:config.seed,mapId:config.mapId,turns:match.turns,endReason:match.endReason,
      outcome:match.winner===side?'win':match.winner===null?'draw':'loss',stats:s,opponentStats:o,entries,totalDecisions,
      remainingHp:match.finalState.fighters[side]?.hp||0,opponentHp:match.finalState.fighters[other]?.hp||0,
      events:match.events.filter(e=>e.t==='invalid'||e.t==='bot_error'||e.t==='forfeit_turn')};
    games.push(game);onGame?.(game);
  }
  return games;
}
