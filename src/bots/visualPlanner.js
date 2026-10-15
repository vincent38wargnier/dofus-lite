import { utilityDecide, createUtilitySession } from './utilityBrain';
import { maisonWeightsFor } from './maison';
import { PLAN_KINDS, FLOW_WEIGHTS } from './visualGraph';
import { maisonSettingsErrors } from './maisonStages';

function planWeights(view, config) {
  const errors = maisonSettingsErrors(config.pipeline);
  if (errors.length) throw new Error(errors[0]);
  const weights={...(config.base==='cortex'?{}:maisonWeightsFor(view.you.classId,view.enemy?.classId))};
  for(const [key,value] of Object.entries(config.weights||{})){
    const definition=FLOW_WEIGHTS.find(w=>w.key===key);
    if(!definition||!Number.isFinite(value)||value<0||value>definition.max)throw new Error(`Réglage IA invalide : ${key}.`);
    weights[key]=value;
  }
  return weights;
}

export function maisonPipeline(view, api, config = {}, inspect) {
  if (!Object.hasOwn(PLAN_KINDS,config.kind||'auto') || ['advance','retreat'].includes(config.kind)) throw new Error('Type de pipeline Maison invalide.');
  const diagnostics = typeof inspect === 'function' ? {} : null;
  const session = createUtilitySession(view,api,planWeights(view,config),{ kind:config.kind, spellKey:config.spellKey, pipeline:config.pipeline, diagnostics });
  return { step(id) {
    const result = session.step(id);
    if (id === 'choose' && diagnostics) inspect(diagnostics);
    return result;
  } };
}

// Shared by visual and JavaScript AIs. Never receives the private match state.
export function visualPlan(view, api, config = {}, inspect) {
  const kind=config.kind||'auto';
  if(!Object.keys(PLAN_KINDS).includes(kind))throw new Error('Action visuelle inconnue.');
  const weights=planWeights(view,config);
  const diagnostics=typeof inspect==='function'?{}:null;
  let action;
  if(kind==='advance'||kind==='retreat'){
    const visible=(view.enemies||[]).filter(e=>e.hp>0&&!e.hidden&&!e.carriedBy);
    const targets=kind==='advance'&&visible.some(e=>!e.isSummon)?visible.filter(e=>!e.isSummon):visible;
    const target=[...targets].sort((a,b)=>api.dist(view.you.pos,a.pos)-api.dist(view.you.pos,b.pos))[0];
    const proposed=target&&(kind==='advance'?api.moveToward(target.pos):api.moveAway(target.pos));
    action=proposed&&api.canMove(proposed.to).ok?proposed:api.endTurn();
    if(diagnostics)Object.assign(diagnostics,{selected:action,candidates:[],target:target?{id:target.id,name:target.name}:null,explanation:kind==='advance'?'Chemin vers un adversaire visible, priorité aux non-invoqués.':'Éloignement de l’ennemi visible le plus proche. Les autres menaces ne sont pas optimisées par ce bloc.'});
    if(api.rememberDecision)api.rememberDecision(action);
  }else action=utilityDecide(view,api,weights,{kind,spellKey:config.spellKey,pipeline:config.pipeline,diagnostics});
  if(diagnostics)inspect(diagnostics);
  return action;
}
